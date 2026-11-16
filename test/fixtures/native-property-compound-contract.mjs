import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
const [file,mode]=process.argv.slice(2),module=await import(pathToFileURL(file)),api=mode==='standalone'?module.instantiateMithrilNative({}):mode==='explicit-package'?module.instantiateMithrilNativePackage({}):module;
const operators=['+=','-=','*=','/=','%=','**=','<<=','>>=','>>>=','&=','|=','^='];
const reference=operators.map(op=>new Function('object','key','value','"use strict"; return object()[key()] '+op+' value();'));
const capture=f=>{try{return{value:f()}}catch(e){return{error:e.name,message:e.message}}};
let groups=0;
{
 const target=mode;
 for(const [i,op]of operators.entries()){
  const functions=[reference[i],api['assign'+i]];
  for(const [left,right]of [[18,3],['a','b'],[18n,3n],[18n,3],[NaN,3],[-0,3],[18,0]]){
   const observations=functions.map(f=>{const o={x:left};return{...capture(()=>f(()=>o,()=> 'x',()=>right)),stored:o.x}});
   assert.deepEqual(observations[1],observations[0],target+op+' values');groups++;
  }
  const observe=f=>{
   const trace=[],symbol=Symbol.for('compound:key');let stored;
   const initial={[Symbol.toPrimitive](hint){trace.push(['left-coercion',hint]);return 18}};
   const state=Object.defineProperty({},symbol,{get(){trace.push('get');return initial},set(v){trace.push(['set',v]);stored=v}});
   const proxy=new Proxy(state,{get(t,k,r){trace.push(['proxy-get',k]);return Reflect.get(t,k,r)},set(t,k,v,r){trace.push(['proxy-set',k,v]);return Reflect.set(t,k,v,r)}});
   const object=()=>{trace.push('object');return proxy},key=()=>{trace.push('key');return{[Symbol.toPrimitive](hint){trace.push(['key-coercion',hint]);return symbol}}},value=()=>{trace.push('rhs');return 3};
   const result=f(object,key,value);
   assert.equal(trace.filter(x=>x==='object').length,1);assert.equal(trace.filter(x=>x==='key').length,1);assert.equal(trace.filter(x=>x==='get').length,1);
   return{result,stored,trace};
  };
  assert.deepEqual(observe(functions[1]),observe(functions[0]),target+op+' evaluation trace');groups++;
  for(const stage of ['object','key','key-coercion','get','rhs','left-coercion','set']){
   const observations=functions.map(f=>{
    const trace=[],sentinel=new Error('sentinel');const step=(name,v)=>{trace.push(name);if(name===stage)throw sentinel;return v};
    const lhs={[Symbol.toPrimitive](){return step('left-coercion',18)}};
    const object=Object.defineProperty({},'x',{get(){return step('get',lhs)},set(v){step('set',v)}});
    let caught;
    try{f(()=>step('object',object),()=>step('key',{[Symbol.toPrimitive](){return step('key-coercion','x')}}),()=>step('rhs',3))}catch(e){caught=e}
    assert.equal(caught,sentinel);return trace;
   });
   assert.deepEqual(observations[1],observations[0],target+op+' thrown identity/order '+stage);groups++;
  }
  for(const make of [()=>Object.freeze({x:18}),()=>null]){
   assert.deepEqual(capture(()=>functions[1](make,()=> 'x',()=>3)),capture(()=>functions[0](make,()=> 'x',()=>3)));groups++;
  }
 }
}
assert.equal(groups,204);
const originalAsync=async(object,key,value)=>object()[key()]+=await value();
const originalYield=function*(object,key,value){return object()[key()]+=yield value()};
function state(){
 const trace=[];let stored=18;
 const obj=Object.defineProperty({},'x',{get(){trace.push('get');return stored},set(value){trace.push(['set',value]);stored=value}});
 return{trace,obj,mutate(){stored=100},read(){return stored},object(){trace.push('object');return obj},key(){trace.push('key');return 'x'}};
}
{
 const observations=[];
 for(const f of [originalAsync,api.asyncAssign]){
  const s=state();let resume;
  const pending=f(s.object,s.key,()=>{s.trace.push('rhs');return new Promise(resolve=>resume=resolve)});
  assert.deepEqual(s.trace,['object','key','get','rhs']);s.mutate();resume(3);
  observations.push({value:await pending,stored:s.read(),trace:s.trace});
 }
 assert.deepEqual(observations[1],observations[0]);assert.equal(observations[0].value,21);groups++;
 for(const f of [originalAsync,api.asyncAssign]){
  const s=state(),sentinel=new Error('rejection');
  await assert.rejects(f(s.object,s.key,()=>{s.trace.push('rhs');return Promise.reject(sentinel)}),e=>e===sentinel);
  assert.deepEqual(s.trace,['object','key','get','rhs']);assert.equal(s.read(),18);
 }
 groups++;
 const yields=[];
 for(const f of [originalYield,api.yieldAssign]){
  const s=state(),iterator=f(s.object,s.key,()=>{s.trace.push('rhs');return 'rhs'});
  assert.deepEqual(iterator.next(),{value:'rhs',done:false});s.mutate();
  yields.push({result:iterator.next(3),stored:s.read(),trace:s.trace});
 }
 assert.deepEqual(yields[1],yields[0]);assert.equal(yields[0].stored,21);groups++;
 for(const f of [originalYield,api.yieldAssign]){
  const s=state(),sentinel=new Error('throw'),iterator=f(s.object,s.key,()=> 'rhs');iterator.next();
  assert.throws(()=>iterator.throw(sentinel),e=>e===sentinel);assert.equal(s.read(),18);assert.deepEqual(s.trace,['object','key','get']);
 }
 groups++;
}
assert.equal(groups,208);
console.log('Native property compound '+mode+': 208 original-operation groups; twelve operators, single reference evaluation, coercion/proxy/accessor/strict/throw identity and await/yield retention.');
