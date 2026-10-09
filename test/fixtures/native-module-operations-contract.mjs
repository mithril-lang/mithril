import assert from 'node:assert/strict';
import {realpathSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
const [file,mode]=process.argv.slice(2);
const dir=mkdtempSync(join(tmpdir(),'mithril-module-oracle-'));
const leaf='export const value=41;export const token={};export let count=0;export function bump(){count++}';
try{
 const original=join(dir,'original.mjs');
 writeFileSync(original,'export function meta(){return import.meta}export function nestedMeta(){return ()=>import.meta}export function load(source){return import(source)}export function loadWith(source,options){return import(source,options)}');
 for(const directory of [dir,dirname(file)]){
  writeFileSync(join(directory,'module-operation-leaf.mjs'),leaf);
  writeFileSync(join(directory,'module-operation-await.mjs'),'await new Promise(resolve=>setTimeout(resolve,5));export const ready=true;');
 }
 const candidateModule=await import(pathToFileURL(file));
 const candidate=mode==='standalone'?candidateModule.instantiateMithrilNative({}):mode==='explicit-package'?candidateModule.instantiateMithrilNativePackage({}):candidateModule;
 const reference=await import(pathToFileURL(original));
 const sourceFile=mode==='esm'?join(dirname(file),'module-0.mjs'):file;
 async function observe(api,owner){
  owner=realpathSync(owner);
  const meta=api.meta();assert.equal(meta,api.meta());assert.equal(meta,api.nestedMeta()());
  assert.equal(meta.url,pathToFileURL(owner).href);
  assert.equal(Object.getPrototypeOf(meta),null);
  assert.equal(meta.resolve('./module-operation-leaf.mjs'),pathToFileURL(join(dirname(owner),'module-operation-leaf.mjs')).href);
  for(const name of Reflect.ownKeys(meta)){const d=Object.getOwnPropertyDescriptor(meta,name);assert.equal(d.enumerable,true);assert.equal(d.configurable,true);assert.equal(d.writable,true);}
  const pending=api.load('./module-operation-leaf.mjs');assert(pending instanceof Promise);
  const module=await pending;assert.equal(module.value,41);assert.equal(module,await api.load('./module-operation-leaf.mjs'));
  assert.equal(module,await api.loadWith('./module-operation-leaf.mjs',undefined));
  assert.equal(module.token,(await api.load('./module-operation-leaf.mjs')).token);
  assert.equal(Object.getPrototypeOf(module),null);module.bump();assert.equal(module.count,1);assert.equal((await api.load('./module-operation-leaf.mjs')).count,1);
  assert.equal((await api.load('./module-operation-await.mjs')).ready,true);
  const order=[];const source={toString(){order.push('coerce');return './module-operation-leaf.mjs'}};
  const options={get with(){order.push('with');return {}}};
  assert.equal(await api.loadWith(source,options),module);
  const thrown={tag:'coercion-error'};const promise=api.load({toString(){throw thrown}});assert(promise instanceof Promise);await assert.rejects(promise,e=>e===thrown);
  await assert.rejects(api.load('./missing-module-operation.mjs'),e=>e.code==='ERR_MODULE_NOT_FOUND');
  await assert.rejects(api.load(Symbol('bad')),TypeError);
  await assert.rejects(api.loadWith('./module-operation-leaf.mjs',1),TypeError);
  const json=await api.loadWith('data:application/json,%7B%22value%22%3A7%7D',{with:{type:'json'}});assert.equal(json.default.value,7);
  assert.throws(()=>new Function('return ('+api.nestedMeta().toString()+')'),SyntaxError);
  return {order,metaKeys:Reflect.ownKeys(meta).map(String).sort(),namespaceKeys:Reflect.ownKeys(module).map(String).sort()};
 }
 assert.deepEqual(await observe(candidate,sourceFile),await observe(reference,original));
 console.log('Native module operations: original-paired actual URL/resolve/meta identity/descriptors, relative imports/cache/live namespace/TLA, coercion and attribute order, rejection identity, JSON attributes and meta callback restoration refusal. Node execution only.');
}finally{rmSync(dir,{recursive:true,force:true});}
