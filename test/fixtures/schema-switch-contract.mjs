import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {join} from 'node:path';
import {reference} from './schema-switch-reference.mjs';
const dir=process.argv[2],sha=x=>createHash('sha256').update(x).digest('hex');
const original=readFileSync(new URL('./schemastery-declarations/original-index.ts',import.meta.url),'utf8'),p=JSON.parse(readFileSync(new URL('./schema-switch-provenance.json',import.meta.url)));
assert.equal(sha(original),'a6647b515659cf439b701fa9f9574c9c310ce3872d26a13a81e9fa4d02ba10ad');assert.equal(p.original_sha256,sha(original));assert.equal(p.switches.length,2);for(const n of p.switches){assert.equal(original.slice(n.start,n.end),n.source);assert.equal(sha(n.source),n.sha256)}
let groups=0;
for(const target of ['js','js-browser']){
 const {instantiateMithrilNative}=await import(pathToFileURL(join(dir,'schema-switch-'+target+'.mjs'))),factories=[instantiateMithrilNative,reference];
 // Separate helper state for each original/candidate observation.
 for(const source of [String,Number,Boolean,Function,()=>{},class Other{}]){const traces=[];for(const make of factories){const log=[],Schema=Object.fromEntries(['string','number','boolean','function','is'].map(name=>[name,(...args)=>{log.push([name,...args]);return{required(){log.push('required');return name}}}]));traces.push([make({Schema,valueMap:()=>{},String,Number,Boolean,Function}).from(source),log])}assert.deepEqual(...traces);groups++}
 for(const key of ['sKey','inner','list','dict','bits','callback','constructor','other']){const traces=[];for(const make of factories){const log=[],Schema={string(){log.push('string');return 'string-schema'},from:v=>{log.push(['from',v]);return 'schema:'+v}},args=[key==='list'?[1,2]:key==='dict'?{a:1,b:2}:key==='bits'?Object.assign(Object.create({p:4}),{a:1,b:'skip',nan:NaN}):key==='callback'?function callback(){return 42}:key==='constructor'?function Constructor(){}:undefined],schema={};const api=make({Schema,valueMap:(o,f)=>Object.fromEntries(Object.entries(o).map(([k,v])=>[k,f(v)])),String,Number,Boolean,Function});const out=api.factory(key,schema,args,0);assert.equal(out,schema);let value=schema[key];if(typeof value==='function'){assert.equal(value,args[0]);value={name:value.name,toJSON:value.toJSON(),toJSONName:value.toJSON.name,...Object.fromEntries(['enumerable','writable','configurable'].map(k=>[k,Object.getOwnPropertyDescriptor(value,'toJSON')[k]]))}}traces.push([Object.fromEntries(Object.entries(schema).map(([k,v])=>[k,k===key?value:v])),log])}assert.deepEqual(...traces);groups++}
 for(const key of ['callback','constructor']){for(const make of factories){const fn=()=>42,existing=()=> 'existing';fn.toJSON=existing;const api=make({Schema:{},valueMap:()=>{},String,Number,Boolean,Function});api.factory(key,{},[fn],0);assert.equal(fn.toJSON,existing)}groups++}
 for(const make of factories){const api=make({Schema:{},valueMap:()=>{},String,Number,Boolean,Function});const schema={};assert.equal(api.factory('constructor',schema,[7],0),schema);assert.equal(schema.constructor,7)}groups++;
 console.log(`Schema original switches actual ${target} CLI: 17 paired observation groups passed; helpers explicit.`);
}
assert.equal(groups,34);
console.log('Schema switches: both exact original nodes / 34 paired observation groups; not full Schema/default value runtime.');
