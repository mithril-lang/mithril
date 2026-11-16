import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,cpSync} from 'node:fs';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
const dir=process.argv[2],fixture=new URL('./',import.meta.url);
const original=readFileSync(new URL('original-registry.mjs',fixture),'utf8');
const provenance=JSON.parse(readFileSync(new URL('provenance.json',fixture),'utf8'));
assert.equal(createHash('sha256').update(original).digest('hex'),provenance.original_program_emit_sha256);
const normalize=s=>s.replace(/\/\*[\s\S]*?\*\//g,'').replace(/globalThis\./g,'').replace(/\s/g,'');
const extracted=original.slice(original.indexOf('(function (Inject)'),original.indexOf('})(Inject || (Inject = {}));')+'})(Inject || (Inject = {}));'.length);
const reference=readFileSync(new URL('reference-a.mjs',fixture),'utf8');
assert.ok(normalize(reference).includes(normalize(extracted)),'complete original namespace IIFE body retained');
let groups=0;
async function run(directory,entry,force){
 const trace=[],symbols={checkProto:Symbol('checkProto')},failure={sentinel:true};
 Object.assign(globalThis,{symbols,failure,force,record:(label,value)=>trace.push([label,typeof value,value.name,value.length]),candidate:()=>{trace.push(['candidate']);return undefined;}});
 const m=await import(pathToFileURL(join(directory,entry)));
 const check=(label,f)=>{f();trace.push([label]);};
 check('hoisted cyclic identity',()=>{assert.equal(m.before,m.early);assert.equal(m.invoked,m.early);assert.equal(m.early.name,'Inject');assert.equal(m.early.length,0);assert.ok(Object.hasOwn(m.early,'prototype'));});
 check('initial namespace fallback and live alias',()=>{assert.equal(m.Inject,m.alias);assert.equal(m.Inject,m.read());assert.equal(typeof m.Inject,force?'object':'function');assert.equal(m.early(),m.Inject);assert.equal(Object.getPrototypeOf(m.Inject),force?Object.prototype:Function.prototype);});
 const initial=m.Inject,resolve=initial.resolve;
 check('resolve native function shape',()=>{assert.equal(resolve.name,'resolve');assert.equal(resolve.length,1);assert.ok(Object.hasOwn(resolve,'prototype'));assert.deepEqual(Object.getOwnPropertyDescriptor(initial,'resolve'),{value:resolve,writable:true,enumerable:true,configurable:true});});
 check('falsy and null prototype defaults',()=>{for(const x of [undefined,null,false,0,'']){const r=resolve(x);assert.equal(Object.getPrototypeOf(r),null);assert.deepEqual(Object.keys(r),[]);}assert.notEqual(resolve(),resolve());});
 check('array native iteration coercion',()=>{const s=Symbol('service');const r=resolve(['a','a',s,'__proto__']);assert.equal(r.a,null);assert.equal(r[s],null);assert.equal(r.__proto__,null);assert.equal(Object.getPrototypeOf(r),null);});
 check('own object normalization',()=>{const r=resolve({a:undefined,b:null,c:0,d:false,e:''});assert.deepEqual({...r},{a:null,b:null,c:0,d:false,e:''});});
 check('inherited branded metadata',()=>{const p={base:3,shadow:8};Object.defineProperty(p,symbols.checkProto,{value:true});const c=Object.create(p);c.shadow=undefined;c.own=2;assert.deepEqual({...resolve(c)},{base:3,shadow:null,own:2});const unbranded=Object.create({hidden:4});unbranded.own=1;assert.deepEqual({...resolve(unbranded)},{own:1});});
 check('explicit result and native property semantics',()=>{const result={kept:9};assert.equal(resolve({new:2},result),result);assert.deepEqual(result,{kept:9,new:2});const thrown={get:true};assert.throws(()=>resolve({get x(){throw thrown;}}),e=>e===thrown);assert.throws(()=>resolve({x:1},Object.freeze({})),e=>e instanceof TypeError);});
 check('native resolve abrupt iteration',()=>{const thrown={iter:true};const array=[];array[Symbol.iterator]=()=>({next(){throw thrown;}});assert.throws(()=>resolve(array),e=>e===thrown);});
 check('recursive function binding updates',()=>{const saved=m.early, replacement=function replacement(){return this;};assert.equal(m.set(replacement),replacement);assert.equal(m.Inject,replacement);assert.equal(m.alias,replacement);assert.equal(saved(),replacement);assert.equal(m.call(),undefined);});
 check('closure write and live exports',()=>{const write=m.setter(),value={marker:1};assert.equal(write(value),value);assert.equal(m.Inject,value);assert.equal(m.alias,value);assert.equal(m.read(),value);assert.throws(()=>m.call(),e=>e instanceof TypeError);});
 check('self declaration assignment',()=>{const value=function updated(){};assert.equal(m.early(value),value);assert.equal(m.Inject,value);assert.equal(m.alias,value);assert.equal(m.early(),value);assert.equal(m.selfReplace(value),value);assert.equal(m.snapshot(value)(),value);});
 check('RHS abrupt completion preserves binding',()=>{const before=m.Inject;assert.throws(()=>m.throwSet(),e=>e===failure);assert.equal(m.Inject,before);globalThis.candidate=()=>{throw failure;};assert.throws(()=>m.setFromHost(),e=>e===failure);assert.equal(m.Inject,before);});
 check('RHS evaluated once then assignment',()=>{let count=0;const value={count:true};globalThis.candidate=()=>{count++;return value;};assert.equal(m.setFromHost(),value);assert.equal(count,1);assert.equal(m.Inject,value);assert.equal(m.alias,value);});
 check('fallback reaugmentation and descriptors',()=>{m.set(undefined);assert.equal(m.attach(),undefined);assert.equal(typeof m.Inject,'object');assert.equal(m.alias,m.Inject);assert.equal(typeof m.Inject.resolve,'function');assert.deepEqual({...m.Inject.resolve(['again'])},{again:null});});
 check('truthy namespace branch retains identity',()=>{const prior=m.Inject;m.attach();assert.equal(m.Inject,prior);assert.equal(Object.keys(prior).join(','),'resolve');m.set(m.early);m.attach();assert.equal(m.Inject,m.early);assert.equal(m.early(),m.early);});
 return trace;
}
for(const target of ['js','js-browser']){
 const artifact=JSON.parse(readFileSync(join(dir,target+'.json'),'utf8'));
 for(const force of [false,true]){
  const generated=join(dir,target+'-'+force),oracle=join(dir,target+'-reference-'+force);mkdirSync(generated);mkdirSync(oracle);
  for(const [name,source] of Object.entries(artifact.files))writeFileSync(join(generated,name),source);
  for(const n of ['reference-a.mjs','reference-b.mjs'])cpSync(new URL(n,fixture),join(oracle,n));
  const actual=await run(generated,'index.mjs',force),expected=await run(oracle,'reference-a.mjs',force);
  // Include original cycle namespace observation exports in oracle public namespace.
  assert.deepEqual(actual,expected);groups+=16;
 }
 console.log(`Mutable function namespace actual ${target} CLI: 32 paired groups; hoisted cycles/live aliases/assignment/recursive reads/native namespace fallback and complete original resolve body.`);
}
assert.equal(groups,64);
console.log('Mutable function namespace: 64 paired runtime groups; Inject decorator and whole core lifecycle remain unported.');
