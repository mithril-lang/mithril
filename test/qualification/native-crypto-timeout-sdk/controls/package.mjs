import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,mkdtempSync,rmSync,realpathSync,copyFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {toolchain,fixture} from './support.mjs';
import {cases} from './cases.mjs';
const [compiler,pkg,mode,versionFlag,sdk,typed]=process.argv.slice(2),ts=await toolchain(resolve(compiler));
assert.ok(['crypto','timeout'].includes(pkg));assert.ok(['original','candidate'].includes(mode));assert.ok(['true','false'].includes(versionFlag));
const differentVersion=versionFlag==='true',root=realpathSync(mkdtempSync(join(tmpdir(),'mithril-crypto-timeout-package-')));
const options={strict:true,noEmit:true,skipLibCheck:false,types:[],lib:['lib.es2024.d.ts','lib.dom.d.ts','lib.esnext.disposable.d.ts'],target:ts.ScriptTarget.ES2024,module:ts.ModuleKind.NodeNext,moduleResolution:ts.ModuleResolutionKind.NodeNext};
try{
 const installed=[],selves=[];
 for(const[side,version]of [['left','0.2.1-alpha.1'],['right',differentVersion?'0.2.1-alpha.2':'0.2.1-alpha.1']]){
  const packageDir=join(root,side,'node_modules/@qualification',pkg);mkdirSync(packageDir,{recursive:true});
  copyFileSync(mode==='original'?join(fixture,pkg+'.d.ts'):join(typed,'module-0.d.mts'),join(packageDir,'module-0.d.mts'));
  if(mode==='original'){
   writeFileSync(join(packageDir,'module-0.mjs'),ts.transpileModule(readFileSync(join(fixture,'original-'+pkg+'.ts'),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2024,module:ts.ModuleKind.ESNext}}).outputText);
   writeFileSync(join(packageDir,'index.mjs'),'export * from "./module-0.mjs";');
  }else for(const file of ['index.mjs','module-0.mjs'])copyFileSync(join(sdk,file),join(packageDir,file));
  writeFileSync(join(packageDir,'package.json'),JSON.stringify({name:'@qualification/'+pkg,version,type:'module',exports:{'.':{types:'./module-0.d.mts',default:'./index.mjs'}}}));
  writeFileSync(join(root,side,'reader.mts'),'export * from "@qualification/'+pkg+'";');
  const reader=join(root,side,'reader.mjs');writeFileSync(reader,'export * from "@qualification/'+pkg+'";');installed.push(await import(pathToFileURL(reader)));
  for(const[index,entry]of cases[pkg].filter(c=>c[2]).entries()){
   const self=join(packageDir,'self-'+index+'.mts');writeFileSync(self,'import * as A from "@qualification/'+pkg+'";'+entry[1]);selves.push(self);
  }
 }
 const consumer=join(root,'consumer.mts');
 writeFileSync(consumer,'import * as L from "./left/reader.mjs";import * as R from "./right/reader.mjs";'+(pkg==='crypto'?'declare const l:L.Uuid;const r:R.Uuid=l;':'declare const l:L.TimeoutReason;const r:R.TimeoutReason=l;declare const d:L.Deadline;const same:R.Deadline=d;declare const w:L.IdleWatchdog;const watchdog:R.IdleWatchdog=w;'));
 const program=ts.createProgram([consumer,...selves],options);
 assert.deepEqual(ts.getPreEmitDiagnostics(program).map(d=>({code:d.code,file:d.file?.fileName,message:ts.flattenDiagnosticMessageText(d.messageText,' ')})),[],'Real NodeNext self-reference and structural types across package versions');
 assert.deepEqual(Object.keys(installed[0]).sort(),Object.keys(installed[1]).sort());
 if(pkg==='crypto')for(const api of installed)assert.equal(api.bytesToBase64(new Uint8Array([0,255])),'AP8=');
 else{
  const [L,R]=installed,own=new L.TimeoutReason('D',10),other=new R.TimeoutReason('D',10);
  assert.equal(L.timeoutOf({reason:own}),own);assert.equal(L.timeoutOf({reason:other}),undefined);assert.equal(R.timeoutOf({reason:own}),undefined);assert.ok(own instanceof Error&&other instanceof Error);
 }
}finally{rmSync(root,{recursive:true,force:true})}
