import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
const [dir,kind]=process.argv.slice(2);
const provenance=JSON.parse(readFileSync(new URL('./provenance.json',import.meta.url),'utf8'));
for(const [file,hash] of Object.entries(provenance.fixtures))assert.equal(createHash('sha256').update(readFileSync(new URL(file,import.meta.url))).digest('hex'),hash);
if(kind==='loader'){
 assert.equal(Object.hasOwn(globalThis,'createRequire'),false);
 const {ModuleLoader:reference}=await import('./original-internal.mjs');
 const {ModuleLoader:candidate}=await import(pathToFileURL(join(dir,'index.mjs')));
 assert.deepEqual(Object.keys(candidate),Object.keys(reference));
 for(const module of [candidate,reference]){
  assert.equal(module.fromInternal.name,'fromInternal');assert.equal(module.fromInternal.length,0);
  const d=Object.getOwnPropertyDescriptor(module,'fromInternal');assert(d.enumerable&&d.writable&&d.configurable);
 }
 const expected=reference.fromInternal(),actual=candidate.fromInternal();
 assert.equal(actual,expected);assert.equal(candidate.fromInternal(),actual);
 if(actual)assert.equal(actual.version,typeof actual.getOrCreateModuleJob==='function'?'v2':typeof actual.getModuleJobForImport==='function'?'v1':undefined);
 assert.equal(Object.hasOwn(globalThis,'createRequire'),false);
 console.log('Complete Loader internal source: real node:module import, original-paired available/fallback loader classification and cache identity; no injected createRequire global. Exposed='+process.execArgv.includes('--expose-internals'));
}else{
 const pkg=join(dir,'node_modules/fixture.external');mkdirSync(pkg,{recursive:true});
 writeFileSync(join(pkg,'package.json'),JSON.stringify({name:'fixture.external',type:'module',exports:{types:'./index.d.mts',default:'./index.mjs'}}));
 writeFileSync(join(pkg,'index.mjs'),'export let count=1;export function inc(){count++}export default {tag:"external"};');
 writeFileSync(join(pkg,'index.d.mts'),'export let count:number;export function inc():void;declare const value:{tag:"external"};export default value;');
 const original=join(dir,'original.mjs');writeFileSync(original,'export {count,inc,default} from "fixture.external";');
 const candidate=await import(pathToFileURL(join(dir,'index.mjs'))),reference=await import(pathToFileURL(original));
 assert.deepEqual(Object.keys(candidate),Object.keys(reference));
 assert.equal(candidate.inc,reference.inc);assert.equal(candidate.default,reference.default);
 candidate.inc();assert.equal(candidate.count,2);assert.equal(reference.count,2);
 reference.inc();assert.equal(candidate.count,3);
 console.log('Bare external package: actual Node resolution, default identity, named live bindings and shared cache match native reexports.');
}
