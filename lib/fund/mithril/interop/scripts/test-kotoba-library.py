"""Verify a locked Kotoba module with a JVM-free compiler and native guest execution."""
import argparse, json, os, pathlib, platform, re, subprocess, tempfile
from mithril_interop.cli import strict_json
from mithril_interop.plugins import dispatch
p=argparse.ArgumentParser()
p.add_argument('--amu-root',type=pathlib.Path,required=True)
p.add_argument('--source-root',type=pathlib.Path,required=True)
p.add_argument('--library-id',required=True)
p.add_argument('--member',required=True)
p.add_argument('--arguments',default='{}')
p.add_argument('--invoke',action='store_true')
a=p.parse_args()
if not re.fullmatch(r'fund\.mithril\.lib\.[a-z0-9.]+',a.library_id) or not re.fullmatch(r'[a-z0-9-]+',a.member):raise ValueError('invalid ID/member')
args=strict_json(a.arguments)
if not isinstance(args,dict):raise ValueError('arguments must be an object')
target={'Darwin':'aarch64-macos','Linux':'x86_64-linux'}[platform.system()]
with tempfile.TemporaryDirectory(prefix='mithril-kotoba-library-') as tmp:
    root=pathlib.Path(tmp); shadow=root/'shadow';shadow.mkdir();marker=root/'jvm-invoked'
    for name in ['java','javac','clojure','clj']:
        f=shadow/name;f.write_text('#!/bin/sh\ntouch "'+str(marker)+'"\nexit 99\n');f.chmod(0o755)
    env=dict(os.environ,PATH=str(shadow)+os.pathsep+os.environ['PATH'])
    def run(*cmd,extra=None):
        result=subprocess.run([str(x) for x in cmd],env=dict(env,**(extra or {})),cwd=a.amu_root,text=True,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=180)
        if result.returncode:raise RuntimeError(result.stdout+'\n'+result.stderr)
        return result.stdout
    entry=root/'entry.kotoba'
    entry.write_text('(ns demo.library (:require ['+a.library_id+' :as lib]) (:export [main emit]))\n(defn emit [] :string (lib/request '+json.dumps(a.member)+' '+json.dumps(json.dumps(args,separators=(',',':')))+'))\n(defn main [] :i64 1)\n')
    amu=a.amu_root/'bin/amu';lock=root/'modules.edn';blocks=root/'blocks';exe=root/'entry.kexe';binary=root/'entry.bin'
    run('node',amu,'module-lock',entry,'--source-path',a.source_root,'--blocks',blocks,'--output',lock,'--jvm-free')
    run('node',amu,'compile','--module-lock',lock,'--blocks',blocks,'--target',target,'--output',exe,'--jvm-free')
    report=run('node',amu,'extract-native',exe,'--symbol','emit','--output',binary)
    offset=re.search(r':(?:entry-offset|offset)\s+(\d+)',report)
    if not offset:raise RuntimeError('native entry offset missing: '+report)
    loader=root/'loader';run('cc','-std=c11','-O2',a.amu_root/'tools/kexe_loader.c','-o',loader)
    output=run(loader,binary,offset[1],'0','aarch64' if target.startswith('aarch64') else 'x86_64','-',extra={'KEXE_STRUCTURED_REPORT':'1','KEXE_ARG_TYPES':'','KEXE_RESULT_TYPE':'string'})
    result=re.search(r':result-utf8-hex\s+"([a-fA-F0-9]*)"',output)
    if ':status :ok' not in output or not result:raise RuntimeError('native string result missing: '+output)
    envelope=strict_json(bytes.fromhex(result[1]).decode())
    expected={'operation':'library-call','libraryId':a.library_id,'member':a.member,'arguments':args}
    if envelope!=expected or marker.exists():raise RuntimeError('native envelope or JVM-free evidence failed')
    if a.invoke:
        receipt=dispatch(envelope)
        if a.member=='link16-loopback' and receipt.get('binaryReadBack') is not True:raise RuntimeError('UDP read-back failed')
    print(json.dumps({'libraryId':a.library_id,'member':a.member,'moduleLock':True,'nativeGuest':True,'jvmInvoked':False,'hostInvoked':a.invoke,'target':target}))
