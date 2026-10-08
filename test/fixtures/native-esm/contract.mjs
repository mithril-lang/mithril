import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {pathToFileURL} from 'node:url';
const dir=process.argv[2];
let groups=0;
const group=async f=>{await f();groups++};
async function load(files,entry='index.mjs'){
 const trace=[],context=vm.createContext({record:x=>trace.push(x)}),cache=new Map();
 const module=name=>{
  if(cache.has(name))return cache.get(name);
  assert.ok(Object.hasOwn(files,name),'unknown static file '+name);
  const result=new vm.SourceTextModule(files[name],{context,identifier:name});cache.set(name,result);return result;
 };
 const root=module(entry);
 await root.link((specifier,referrer)=>{assert.match(specifier,/^\.\/[A-Za-z0-9_-]+\.mjs$/);return module(path.posix.join(path.posix.dirname(referrer.identifier),specifier))});
 await root.evaluate();return {api:root.namespace,trace,context,cache};
}
const original=Object.fromEntries(['a.mjs','b.mjs','index.mjs'].map(k=>[k,fs.readFileSync(new URL('./original/'+k,import.meta.url),'utf8')]));
const files=name=>JSON.parse(fs.readFileSync(path.join(dir,name+'.json'),'utf8')).files;
const normalize=x=>JSON.parse(JSON.stringify(x));
const shape=f=>[f.name,f.length,Reflect.ownKeys(f).map(String),Object.getPrototypeOf(f.prototype)?.constructor.name];
await group(async()=>{const a=await load(files('cycle')),b=await load(original);assert.deepEqual(Object.keys(a.api),Object.keys(b.api));assert.deepEqual(a.trace,b.trace);assert.deepEqual(a.trace,['b','a']);assert.equal(a.api.b,7);assert.equal(a.api.readA(),7)});
await group(async()=>{const a=await load(files('cycle')),b=await load(original);for(const x of [a,b]){assert.equal(x.api.count,1);assert.equal(x.api.forwardA,1);assert.equal(x.api.defaultA(),1);assert.equal(x.api.inc(),2);assert.equal(x.api.count,2);assert.equal(x.api.forwardA,2);assert.equal(x.api.getA(),2);assert.equal(x.api.defaultA(undefined),2);assert.equal(x.api.defaultA(9),9);assert.equal(x.api.snapshot,1);assert.equal(x.api.inc(),3);assert.equal(x.api.forwardA,3)}});
await group(async()=>{const a=await load(files('cycle')),b=await load(original);for(const name of ['readA','readB','getA','inc','defaultA'])assert.deepEqual(shape(a.api[name]),shape(b.api[name]));assert.equal(a.api.defaultA.length,0);assert.equal(a.api.defaultA.name,'defaultA');assert.equal(new a.api.readA() instanceof a.api.readA,true);assert.equal(a.api.readA.call(null),7)});
await group(async()=>{const a=await load(files('cycle')),b=await load(original);for(const x of [a,b]){assert.equal(Object.getPrototypeOf(x.api),null);assert.equal(Object.isExtensible(x.api),false);assert.equal(Object.prototype.toString.call(x.api),'[object Module]');const d=Object.getOwnPropertyDescriptor(x.api,'count');assert.deepEqual([d.writable,d.enumerable,d.configurable],[true,true,false]);assert.throws(()=>x.api.count=5,TypeError);assert.equal(Reflect.set(x.api,'count',5),false);assert.equal(Reflect.deleteProperty(x.api,'count'),false);x.api.inc();assert.equal(Object.getOwnPropertyDescriptor(x.api,'count').value,2)}});
await group(async()=>{const a=await load(files('cycle')),b=await load(original);for(const x of [a,b]){assert.equal(x.api.A.name,'A');assert.equal(x.api.A.length,0);assert.equal(new x.api.A().read(),7);assert.throws(()=>x.api.A(),e=>e.name==='TypeError');assert.equal(x.api.A.prototype.read.name,'read');assert.throws(()=>new x.api.A.prototype.read(),e=>e.name==='TypeError')}});
await group(async()=>{const a=await load(files('ordered'));assert.deepEqual(a.trace,['side','entry']);assert.equal(a.api.value,9)});
const failing=async(file,oracle)=>{let a,b;try{await load(files(file))}catch(e){a=[e.name,e.message]}try{await load(oracle)}catch(e){b=[e.name,e.message]}assert.ok(a);assert.deepEqual(a,b);return a};
await group(async()=>{const result=await failing('tdz',{...original,'b.mjs':"import {readA,count} from './a.mjs'; export const b=count;export function readB(){return b}export function getA(){return count}export {count as forwardA};export function defaultA(value=count){return value};"});assert.deepEqual(result,['ReferenceError',"Cannot access 'count' before initialization"])});
await group(async()=>{const oracle={...original,'b.mjs':"import {A,readA,count} from './a.mjs';export const b=class B extends A {};export function readB(){return b}export function getA(){return count}export {count as forwardA};export function defaultA(value=count){return value};"};assert.deepEqual(await failing('class-tdz',oracle),['ReferenceError',"Cannot access 'A' before initialization"])});
await group(async()=>{assert.deepEqual(await failing('throw',{...original,'b.mjs':"import {readA,count} from './a.mjs';throw new Error('source initialization failure');export const b=readA();export function readB(){return b}export function getA(){return count}export {count as forwardA};export function defaultA(value=count){return value};"}),['Error','source initialization failure'])});
await group(async()=>{const a=await load(files('reverse')),b=await load({...original,'index.mjs':"export * from './b.mjs';export * from './a.mjs';"});assert.deepEqual(a.trace,b.trace);assert.deepEqual(a.trace,['a','b']);assert.equal(a.api.b,7);assert.equal(a.api.forwardA,1)});
await group(async()=>{const a=await load(files('cycle'));const b=a.cache.get('module-1.mjs').namespace;assert.equal(b.readB,a.api.readB);assert.equal(b.defaultA,a.api.defaultA);a.api.inc();assert.equal(b.forwardA,2);assert.equal(b.getA(),2)});
await group(async()=>{const custom=files('ordered');let calls=0;const globals={};Object.defineProperty(globals,'record',{get(){calls++;return x=>x}});custom['host-globals.mjs']='export const globals=globalThis.external;';const context=vm.createContext({external:globals});const cache=new Map();const build=k=>{if(cache.has(k))return cache.get(k);const m=new vm.SourceTextModule(custom[k],{context,identifier:k});cache.set(k,m);return m};const m=build('index.mjs');await m.link((s,r)=>build(path.posix.join(path.posix.dirname(r.identifier),s)));assert.equal(calls,0);await m.evaluate();assert.equal(calls,2)});
await group(async()=>{const expected={...original,'a.mjs':original['a.mjs'].replace('return 7','return (0,Math.max)(7,1)'),'b.mjs':original['b.mjs'].replace("const mark=globalThis.record('b');",'')};const a=await load(files('host-hoist')),b=await load(expected);assert.equal(a.api.b,b.api.b);assert.equal(a.api.b,7);assert.deepEqual(a.trace,b.trace);assert.deepEqual(a.trace,['a']);});
const starsOriginal={
 'a.mjs':"export let value=7;export function inc(){return value=value+1}export default 3;export const shadow=1;",
 'b.mjs':"import {value} from './a.mjs';export {value};export default 4;export const shadow=2;",
 'c.mjs':"import {default as firstDefault} from './a.mjs';export {firstDefault as defaultCopy};",
 'index.mjs':"export * from './a.mjs';export * from './b.mjs';export * from './c.mjs';"
};
await group(async()=>{const a=await load(files('stars')),b=await load(starsOriginal);assert.deepEqual(Object.keys(a.api),Object.keys(b.api));assert.deepEqual(Object.keys(a.api),['defaultCopy','inc','value']);assert.deepEqual([...JSON.parse(fs.readFileSync(path.join(dir,'stars.json'),'utf8')).exports].sort(),Object.keys(a.api));assert.equal('shadow' in a.api,false);assert.equal('default' in a.api,false)});
await group(async()=>{const a=await load(files('stars')),b=await load(starsOriginal);for(const x of [a,b]){assert.equal(x.api.value,7);assert.equal(x.api.inc(),8);assert.equal(x.api.value,8);const source=x.cache.get(x===a?'module-1.mjs':'b.mjs').namespace;assert.equal(source.value,8);assert.equal(source.shadow,2);assert.equal(source.default,4)}});
await group(async()=>{const a=await load(files('stars')),b=await load(starsOriginal);assert.equal(a.api.defaultCopy,b.api.defaultCopy);assert.equal(a.api.defaultCopy,3);assert.equal(a.cache.get('module-0.mjs').namespace.default,3)});
// Actual native Node import of the real CLI outputs (rather than only VM linking).
for(const target of ['js','js-browser']){
 const old=Object.getOwnPropertyDescriptor(globalThis,'record'),trace=[];
 try{
  Object.defineProperty(globalThis,'record',{value:x=>trace.push(x),configurable:true});
  const m=await import(pathToFileURL(path.join(dir,'cycle-'+target,'index.mjs')));
  assert.deepEqual(trace,['b','a']);assert.equal(m.b,7);assert.equal(m.inc(),2);assert.equal(m.forwardA,2);assert.equal(m.getA(),2);assert.equal(m.defaultA(),2);assert.equal(m.snapshot,1);assert.equal(new m.A().read(),7);groups++;
 }finally{if(old)Object.defineProperty(globalThis,'record',old);else delete globalThis.record;}
}
assert.equal(groups,18);
console.log('Native multi-file ESM: 18 cycle/live binding/hoisting/TDZ/namespace/order/native CLI groups; complete original reference graphs compared. Core SCC source not yet ported.');
