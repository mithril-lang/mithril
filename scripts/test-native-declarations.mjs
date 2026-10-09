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
 // Independent qualifications keep their own bounded process and the same offline guards.
 const stages=[['native-js-declarations','compile-declarations.cljk'],
  ['native-class-declarations','compile.cljk'],
  ['native-interface-signatures','compile.cljk'],
  ['native-declaration-merging','compile.cljk'],
  ['native-declaration-program','compile.cljk'],
  ['native-module-augmentation','compile.cljk'],
  ['native-erased-enums','compile.cljk'],
  ['native-cordis-complete-types','compile.cljk'],
  ['native-variadic-tuples','compile.cljk'],
  ['native-const-generics','compile.cljk'],
  ['native-default-exports','compile.cljk'],
  ['native-mutable-declarations','compile.cljk'],
  ['native-global-declarations','compile.cljk'],
  ['native-schema-sdk','compile.cljk'],
  ['native-esm-externals','compile.cljk'],
  ['native-esm-namespaces','compile.cljk'],
  ['native-loader-leaves','compile.cljk'],
  ['native-loader-sdk','compile.cljk'],
  ['native-index-signatures','compile.cljk'],
  ['native-include-sdk','compile.cljk'],
  ['native-yaml-source','compile.cljk'],
  ['native-umd-declarations','compile.cljk'],
  ['native-runtime-only-declarations','compile.cljk'],
  ['native-exported-namespace','compile.cljk'],
  ['native-scope-core','compile.cljk'],
  ['native-scope-sdk','compile.cljk'],
  ['native-brand-sdk','compile.cljk'],
  ['native-private-fields','compile.cljk'],
  ['native-values-sdk','compile.cljk'],
  ['native-crypto-timeout-sdk','compile.cljk'],
  ['native-protocol-sdk','compile.cljk'],
  ['native-attachment-sdk','compile.cljk'],
  ['native-tagged-templates','compile.cljk'],
  ['native-declaration-symbol-spaces','compile.cljk'],
  ['native-declaration-composition','compile.cljk'],
 ];
 for(const [name,control] of stages){
  console.log(`Declaration qualification stage: ${name}`);
  const started=Date.now();
  const r=spawnSync(process.execPath,[engine,'--config',config,'-cp','src',`test/qualification/${name}/controls/${control}`],{cwd:root,stdio:'inherit',timeout:300000,env:{...process.env,TZ:'UTC',PATH:dir+delimiter+process.env.PATH,MITHRIL_DECLARATIONS_LAUNCHER:marker,MITHRIL_DECLARATIONS_ENGINE:engine,MITHRIL_DECLARATIONS_TYPESCRIPT:compiler,MITHRIL_DECLARATIONS_TYPE_ROOTS:typeRoots}});
  if(existsSync(marker))throw Error('Forbidden JVM/dependency launcher');
  if(r.error||r.status!==0)throw r.error||Error(`Native declaration qualification failed (${name}): ${r.status}`);
  console.log(`Declaration qualification stage passed: ${name} (${Date.now()-started}ms)`);
 }
 console.log('Mithril declaration AST admitted, full original strict type consumers and both runtime CLI targets verified; no JVM/source delegation.');
}finally{rmSync(dir,{recursive:true,force:true});}
