import assert from 'node:assert/strict';import{pathToFileURL}from'node:url';import{resolve}from'node:path';
const tests=[];const expect=value=>({toBe:x=>assert.equal(value,x),toEqual:x=>assert.deepEqual(value,x),toBeUndefined:()=>assert.equal(value,undefined),toMatchObject:x=>{for(const key of Reflect.ownKeys(x))assert.deepEqual(value[key],x[key])},toThrow:x=>assert.throws(value,e=>typeof x==='string'?e.message.includes(x):true),toHaveBeenCalledOnce:()=>assert.equal(value.mock.calls.length,1)});
// Runtime erasure cannot prove type assertions. The independent strict SDK
// programs qualify the projected event and listener types, including failures.
const typeAssertion={toExtend(){},toEqualTypeOf(){}};typeAssertion.not=typeAssertion;
const it=(name,body)=>tests.push({name,body});it.each=rows=>(name,body)=>rows.forEach((row,index)=>it(name+' ['+index+']',()=>body(...(Array.isArray(row)?row:[row]))));
globalThis.protocolTests={expect,expectTypeOf:()=>typeAssertion,describe(_name,body){body()},it,vi:{fn(){const fn=(...args)=>{fn.mock.calls.push(args)};fn.mock={calls:[]};return fn;}}};
try{for(const file of process.argv.slice(2))await import(pathToFileURL(resolve(file)));const groups=[];for(const test of tests){try{await test.body();groups.push(test.name)}catch(error){throw new Error(test.name,{cause:error})}}console.log(JSON.stringify({groups,typeAssertionsRuntimeEvidence:false}));}finally{delete globalThis.protocolTests;}
