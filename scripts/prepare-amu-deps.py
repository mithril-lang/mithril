"""Materialize every public Amu lock pin, including commits outside branch tips.

Amu still verifies the lock, dependency paths and each checkout's HEAD. This
preparation uses full Git histories and never changes the lock or compiler.
"""
import argparse, hashlib, pathlib, re, subprocess
p=argparse.ArgumentParser()
p.add_argument('--amu-root',required=True,type=pathlib.Path)
p.add_argument('--gitlibs',required=True,type=pathlib.Path)
a=p.parse_args()
lock=(a.amu_root/'deps-lock.edn').read_text()
digest=re.search(r':lock/deps-digest "([0-9a-f]{64})"',lock)
if not digest or hashlib.sha256((a.amu_root/'deps.edn').read_bytes()).hexdigest()!=digest[1]:raise ValueError('Amu dependency lock is stale')
entries=re.findall(r':coordinate "([^"\n]+)"\s+:git-url "([^"\n]+)"\s+:git-sha "([0-9a-f]{40})"',lock)
if not entries or len(entries)!=lock.count(':coordinate '):raise ValueError('unsupported lock entry shape')
for coordinate,url,sha in entries:
    if not re.fullmatch(r'io\.github\.kotoba-lang/[a-z0-9-]+',coordinate) or not re.fullmatch(r'https://github\.com/kotoba-lang/[a-z0-9-]+\.git',url):raise ValueError('unexpected dependency owner')
    path=a.gitlibs/'libs'/coordinate/sha
    if path.exists():raise ValueError('use a fresh dependency directory: '+str(path))
    path.mkdir(parents=True)
    def git(*args):return subprocess.run(['git','-C',str(path),*args],check=True,text=True,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=180).stdout.strip()
    git('init','--quiet')
    git('fetch','--quiet',url,sha)
    git('checkout','--quiet','--detach',sha)
    if git('rev-parse','HEAD')!=sha:raise ValueError('dependency revision mismatch')
print('Materialized '+str(len(entries))+' exact public lock pins without JVM or shallow fetch')
