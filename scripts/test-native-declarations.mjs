import {spawnSync} from 'node:child_process';
import {existsSync,mkdtempSync,writeFileSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';import {resolve,join,delimiter} from 'node:path';import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url)),args=process.argv.slice(2);
if(args.length!==6||args[0]!=='--engine'||args[2]!=='--typescript'||args[4]!=='--type-roots')throw Error('usage: test-native-declarations --engine <nbb cli.js> --typescript <typescript.js> --type-roots <@types directory>');
const [engine,compiler,typeRoots]=[resolve(args[1]),resolve(args[3]),resolve(args[5])];for(const p of [engine,compiler,typeRoots])if(!existsSync(p))throw Error('Pinned toolchain not found');
if(JSON.parse(readFileSync(join(typeRoots,'node/package.json'),'utf8')).version!=='26.6.3')throw Error('Ambient Node type version drift');
const dir=mkdtempSync(join(tmpdir(),'mithril-declaration-tests-')),marker=join(dir,'launcher'),config=join(dir,'offline.edn');
try{
 writeFileSync(config,`{:paths [${JSON.stringify(join(root,'src'))}]}`);
 for(const n of ['java','javac','clojure','clj','bb'])writeFileSync(join(dir,n),'#!/bin/sh\n: > "$MITHRIL_DECLARATIONS_LAUNCHER"\nexit 97\n',{mode:0o755});
 const r=spawnSync(process.execPath,[engine,'--config',config,'test/qualification/native-js-declarations/controls/compile-declarations.cljk'],{cwd:root,stdio:'inherit',timeout:300000,env:{...process.env,TZ:'UTC',PATH:dir+delimiter+process.env.PATH,MITHRIL_DECLARATIONS_LAUNCHER:marker,MITHRIL_DECLARATIONS_ENGINE:engine,MITHRIL_DECLARATIONS_TYPESCRIPT:compiler,MITHRIL_DECLARATIONS_TYPE_ROOTS:typeRoots}});
 if(existsSync(marker))throw Error('Forbidden JVM/dependency launcher');if(r.error||r.status!==0)throw r.error||Error(`Native declaration qualification failed: ${r.status}`);
 console.log('Mithril declaration AST admitted, full original strict type consumers and both runtime CLI targets verified; no JVM/source delegation.');
}finally{rmSync(dir,{recursive:true,force:true});}
