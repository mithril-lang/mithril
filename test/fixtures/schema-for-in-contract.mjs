import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {join} from 'node:path';
import {reference} from './schema-for-in-reference.mjs';
const sha=x=>createHash('sha256').update(x).digest('hex'),dir=process.argv[2];
const provenance=JSON.parse(readFileSync(new URL('./schema-for-in-provenance.json',import.meta.url)));
const original=readFileSync(new URL('./schemastery-declarations/original-index.ts',import.meta.url),'utf8');
assert.equal(sha(original),'a6647b515659cf439b701fa9f9574c9c310ce3872d26a13a81e9fa4d02ba10ad');
assert.equal(provenance.original_sha256,sha(original));assert.equal(provenance.loops.length,8);
for(const loop of provenance.loops){assert.equal(original.slice(loop.start,loop.end),loop.source);assert.equal(sha(loop.source),loop.sha256)}
let groups=0;const group=f=>{f();groups++};
const capture=f=>{try{return{value:f()}}catch(e){return{error:e instanceof Error?e.name:e}}};
for(const target of ['js','js-browser']){
 const {instantiateMithrilNative}=await import(pathToFileURL(join(dir,'schema-'+target+'.mjs')));
 const factories=[instantiateMithrilNative,reference],start=groups;
 const helpers={isNullable:v=>v==null,Schema:{resolve:k=>[k]},property:(obj,k,s)=>s?s(obj[k]):obj[k]};
 group(()=>{const traces=[];for(const make of factories){const log=[],getRef=x=>{log.push(x);return x==null?x:'ref:'+x},valueMap=(o,f)=>Object.fromEntries(Object.entries(o).map(([k,v])=>[k,f(v)])),refs=Object.assign(Object.create({p:{inner:'parent'}}),{a:{sKey:'key',inner:'inner',list:['one','two'],dict:{x:'three'}},b:{list:null,dict:false}});const value=make(helpers).refs(refs,getRef,valueMap);traces.push([{own:Object.entries(value),parent:value.p},log])}assert.deepEqual(...traces)});
 group(()=>{for(const messages of [{en:'hello',ja:{$description:'説明'},zh:{$desc:'描述'},none:null,empty:{$description:'',$desc:'fallback'}},Object.assign(Object.create({inherited:'parent'}),{en:7}),null])assert.deepEqual(instantiateMithrilNative(helpers).mergeDesc(messages),reference(helpers).mergeDesc(messages))});
 group(()=>{for(const type of ['object','dict']){const traces=[];for(const make of factories){const log=[],simplify=v=>{log.push(v);return v==='null'?null:v+'!'},ctx={type,dict:{a:{simplify},b:{simplify}},inner:{simplify}},value=Object.assign(Object.create({inherited:'parent'}),{a:'first',b:'null',c:'missing'});traces.push([make(helpers).simplify.call(ctx,value),log])}assert.deepEqual(...traces)}});
 group(()=>{for(const data of [0,1,3,7,-1]){const bits=Object.assign(Object.create({parent:4}),{zero:0,one:1,two:2,text:'4'});assert.deepEqual(instantiateMithrilNative(helpers).bitset(data,bits),reference(helpers).bitset(data,bits))}});
 group(()=>{for(const strict of [false,true]){const traces=[];for(const make of factories){const log=[],data=Object.assign(Object.create({parent:4}),{a:1,skip:2,b:3}),h={...helpers,Schema:{resolve(k,s,o){log.push(['resolve',k,s,o]);if(k==='skip')throw 'bad';return [k.toUpperCase()]}},property(o,k,s,opts){log.push(['property',k,s,opts]);return o[k]*2}};const result=capture(()=>make(h).dict(data,'key-schema','options',strict,'inner'));traces.push([result,Object.entries(data),log])}assert.deepEqual(...traces)}});
 group(()=>{const traces=[];for(const make of factories){const data=Object.assign(Object.create({p:2}),{x:1,own:4}),result=Object.assign(Object.create({x:9}),{own:8});const out=make(helpers).merge(data,result);traces.push([Object.entries(out),out.x,out.p])}assert.deepEqual(...traces)});
 group(()=>{const traces=[];for(const make of factories){const log=[],dict=Object.assign(Object.create({p:x=>x}),{present:x=>null,missing:x=>null,value:x=>42}),data={present:undefined,p:5},h={...helpers,property(o,k,s,opts){log.push([k,opts]);return s(o[k])}};traces.push([make(h).object(dict,data,'options'),log])}assert.deepEqual(...traces)});
 group(()=>{const traces=[];for(const make of factories){const source=Object.assign(Object.create({p:4}),{a:1,b:'2',c:NaN,d:Infinity}),args=[{},source],schema={bits:{initial:8}};traces.push(make(helpers).factoryBits(args,1,schema))}assert.deepEqual(...traces)});
 group(()=>{for(const name of ['mergeDesc','bitset','factoryBits']){const traces=[];for(const make of factories){const log=[],source=new Proxy({a:1,b:2},{ownKeys(o){log.push('keys');return Reflect.ownKeys(o)},getOwnPropertyDescriptor(o,k){log.push(['descriptor',k]);return Reflect.getOwnPropertyDescriptor(o,k)},get(o,k){log.push(['get',k]);return Reflect.get(o,k)}}),x=make(helpers);traces.push([name==='mergeDesc'?x.mergeDesc(source):name==='bitset'?x.bitset(3,source):x.factoryBits([source],0,{bits:{}}),log])}assert.deepEqual(...traces)}});
 console.log(`Schema original eight for-in nodes actual ${target} CLI: ${groups-start} paired observation groups passed; helpers explicit.`);
}
assert.equal(groups,18);
console.log('Schema loop qualification: 18 paired observation groups; original loop nodes only, not whole Schema runtime/default API.');
