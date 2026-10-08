import assert from'node:assert/strict';import fs from'node:fs';import vm from'node:vm';import path from'node:path';
const artifacts=JSON.parse(fs.readFileSync(path.join(process.argv[2],'artifacts.json'),'utf8'));let groups=0;
const reference={'??=':(o,k,v)=>o()[k()]??=v(),'||=':(o,k,v)=>o()[k()]||=v(),'&&=':(o,k,v)=>o()[k()]&&=v()};
const capture=f=>{try{return{value:f()}}catch(e){return{error:e.name,message:e.message}}};
for(const operator of Object.keys(reference)){
 const make=vm.runInThisContext('"use strict";'+artifacts[operator].replace('export function','function')+';instantiateMithrilNative');
 for(const initial of [undefined,null,false,0,-0,NaN,'',1,'x',{},Symbol('s'),1n]){
  const outcomes=[];for(const candidate of [false,true]){const log=[],state={x:initial},obj=new Proxy(state,{get(t,k,r){log.push('get:'+k);return Reflect.get(t,k,r)},set(t,k,v,r){log.push('set:'+k);return Reflect.set(t,k,v,r)}}),o=()=>{log.push('object');return obj},k=()=>{log.push('key');return'x'},v=()=>{log.push('value');return 7};const result=candidate?make({object:o,key:k,value:v}).value():reference[operator](o,k,v);outcomes.push([result,state.x,log])}assert.deepEqual(outcomes[1],outcomes[0]);groups++;
 }
 const sentinel={};for(const stage of ['object','key','get','value','set']){
  for(const candidate of [false,true]){const log=[],obj=new Proxy({x:operator==='&&='?1:null},{get(t,k){log.push('get');if(stage==='get')throw sentinel;return t[k]},set(t,k,v){log.push('set');if(stage==='set')throw sentinel;t[k]=v;return true}}),o=()=>{log.push('object');if(stage==='object')throw sentinel;return obj},k=()=>{log.push('key');if(stage==='key')throw sentinel;return'x'},v=()=>{log.push('value');if(stage==='value')throw sentinel;return 7};assert.throws(()=>candidate?make({object:o,key:k,value:v}).value():reference[operator](o,k,v),e=>e===sentinel)}groups++;
 }
 const traces=[];for(const candidate of [false,true]){const log=[],symbol=Symbol.for('logical:key'),state={[symbol]:operator==='&&='?1:undefined},obj=new Proxy(state,{get(t,k){log.push(['get',k]);return t[k]},set(t,k,v){log.push(['set',k]);t[k]=v;return true}}),o=()=>{log.push('object');return obj},k=()=>{log.push('key');return{[Symbol.toPrimitive](hint){log.push(['coerce',hint]);return symbol}}},v=()=>{log.push('value');return 8};const result=candidate?make({object:o,key:k,value:v}).value():reference[operator](o,k,v);traces.push([result,state[symbol],log])}assert.deepEqual(traces[1],traces[0]);assert.equal(traces[0][2].filter(x=>x==='object').length,1);assert.equal(traces[0][2].filter(x=>x==='key').length,1);groups++;
 for(const initial of [undefined,1]){const makeObject=()=>Object.defineProperty({},'x',{value:initial,writable:false});const a=capture(()=>reference[operator](makeObject,()=> 'x',()=>7)),b=capture(()=>make({object:makeObject,key:()=> 'x',value:()=>7}).value());assert.deepEqual(b,a);groups++}
}
assert.equal(groups,60);console.log('Native property logical assignment: 60 native reference groups; single LHS evaluation, short-circuit, setter/strict failures and thrown identity.');
