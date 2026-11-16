import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {join} from 'node:path';
const original={
 readArgs:function(first,second){return [arguments,arguments,first]},
 mutate:function(first,second){first=91;arguments[1]=92;return [arguments,first,second]},
 defaulted:function(first=arguments[1],...tail){return [arguments,first,tail]},
 arrow:function(outer){return ignored=>arguments},
 nested:function(outer){return function(inner){return arguments}},
 generator:function*(first,second){return [arguments,arguments,first]},
 asyncFn:async function(first,second){return [arguments,arguments,first]},
 asyncGenerator:async function*(first,second){return [arguments,arguments,first]},
};
function snapshot(a){
 assert.equal(Object.prototype.toString.call(a),'[object Arguments]');
 assert.equal(Object.getPrototypeOf(a),Object.prototype);
 assert.equal(Array.isArray(a),false);
 assert.throws(()=>a.callee,TypeError);
 const callee=Object.getOwnPropertyDescriptor(a,'callee');
 assert.equal(callee.get,callee.set);
 assert.equal(callee.configurable,false);
 assert.equal(callee.enumerable,false);
 const length=Object.getOwnPropertyDescriptor(a,'length');
 assert.deepEqual({w:length.writable,e:length.enumerable,c:length.configurable},{w:true,e:false,c:true});
 const iterator=Object.getOwnPropertyDescriptor(a,Symbol.iterator);
 assert.equal(iterator.value,Array.prototype.values);
 assert.deepEqual({w:iterator.writable,e:iterator.enumerable,c:iterator.configurable},{w:true,e:false,c:true});
 return {length:a.length,keys:Reflect.ownKeys(a).map(x=>typeof x==='symbol'?x.description:x),values:Array.from(a),descriptors:Object.keys(a).map(k=>Object.getOwnPropertyDescriptor(a,k))};
}
async function observe(api){
 const result=[];
 for(const args of [[],[undefined,7,8],[3,4,5]]){
  const r=api.readArgs(...args);assert.equal(r[0],r[1]);result.push([snapshot(r[0]),r[2]]);
  const m=api.mutate(...args);result.push([snapshot(m[0]),m[1],m[2]]);
  const d=api.defaulted(...args);result.push([snapshot(d[0]),d[1],d[2]]);
  const arrow=api.arrow(...args);const captured=arrow(99);assert.equal(captured,arrow(98));result.push(snapshot(captured));
  result.push(snapshot(api.nested(...args)(9,10)));
  const generator=api.generator(...args).next();assert.equal(generator.done,true);assert.equal(generator.value[0],generator.value[1]);result.push(snapshot(generator.value[0]));
  const asyncResult=await api.asyncFn(...args);assert.equal(asyncResult[0],asyncResult[1]);result.push(snapshot(asyncResult[0]));
  const asyncGenerator=await api.asyncGenerator(...args).next();assert.equal(asyncGenerator.done,true);assert.equal(asyncGenerator.value[0],asyncGenerator.value[1]);result.push(snapshot(asyncGenerator.value[0]));
 }
 return result;
}
const baseline=await observe(original);
for(const target of ['js','js-browser']){
 const module=await import(pathToFileURL(join(process.argv[2],target+'.mjs')));
 const candidate=module.instantiateMithrilNative({});
 assert.deepEqual(await observe(candidate),baseline);
 for(const name of Object.keys(original))assert.equal(candidate[name].length,original[name].length);
 console.log(`Native arguments object ${target}: 24 original-paired groups, identity/descriptors/strict aliasing/defaults/lexical arrows/nested functions/coroutine owners; Node execution only.`);
}
