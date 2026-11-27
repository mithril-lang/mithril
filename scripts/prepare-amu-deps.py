"""Materialize Amu's monorepo lock pin and verify every locked library tree.

Amu's deps-lock.edn (version 2) pins its libraries as lib/<id> trees of one
kotoba-lang/kotoba commit. Amu still verifies the lock, dependency paths, the
checkout's HEAD and each tree itself; this preparation fetches that one
checkout with full history up front and fails loudly on any disagreement. It
never changes the lock or compiler.
"""
import argparse, hashlib, pathlib, re, subprocess
p=argparse.ArgumentParser()
p.add_argument('--amu-root',required=True,type=pathlib.Path)
p.add_argument('--gitlibs',required=True,type=pathlib.Path)
a=p.parse_args()
lock=(a.amu_root/'deps-lock.edn').read_text()
if not re.search(r':lock/version 2\b',lock):raise ValueError('unsupported Amu dependency lock version (expected 2, the monorepo lock)')
digest=re.search(r':lock/deps-digest "([0-9a-f]{64})"',lock)
if not digest or hashlib.sha256((a.amu_root/'deps.edn').read_bytes()).hexdigest()!=digest[1]:raise ValueError('Amu dependency lock is stale')
entries=re.findall(r':coordinate "([^"\n]+)"\s+:git-repo "([^"\n]+)"\s+:git-url "([^"\n]+)"\s+:git-sha "([0-9a-f]{40})"\s+:git-subdir "([^"\n]+)"\s+:git-tree "([0-9a-f]{40})"',lock)
if not entries or len(entries)!=lock.count(':coordinate '):raise ValueError('unsupported lock entry shape')
repos={(repo,url,sha) for _,repo,url,sha,_,_ in entries}
if repos!={('io.github.kotoba-lang/kotoba','https://github.com/kotoba-lang/kotoba.git',next(iter(repos))[2])}:raise ValueError('Amu lock must pin kotoba-lang/kotoba at exactly one commit')
for coordinate,_,_,_,subdir,_ in entries:
    if not re.fullmatch(r'io\.github\.kotoba-lang/[a-z0-9-]+',coordinate) or not re.fullmatch(r'lib/[A-Za-z0-9._-]+',subdir):raise ValueError('unexpected dependency coordinate or subdirectory')
repo,url,sha=next(iter(repos))
path=a.gitlibs/'libs'/repo/sha
def git(*args):return subprocess.run(['git','-C',str(path),*args],check=True,text=True,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=600).stdout.strip()
if not path.exists():
    path.mkdir(parents=True)
    git('init','--quiet')
    git('fetch','--quiet',url,sha)
    git('checkout','--quiet','--detach',sha)
if git('rev-parse','HEAD')!=sha:raise ValueError('dependency revision mismatch')
for coordinate,_,_,_,subdir,tree in entries:
    if git('rev-parse','HEAD:'+subdir)!=tree:raise ValueError('dependency tree mismatch: '+coordinate+' '+subdir)
print('Materialized kotoba-lang/kotoba@'+sha[:12]+' and verified '+str(len(entries))+' locked library trees without JVM or shallow fetch')
