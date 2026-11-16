import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
const tests=[];let suite='',afters=[];
const nativeSet=globalThis.setTimeout,nativeClear=globalThis.clearTimeout;let clock=null;
const restore=()=>{globalThis.setTimeout=nativeSet;globalThis.clearTimeout=nativeClear;clock=null;};
const globals=new Map();
const advance=ms=>{assert(clock,'Fake timers required');const target=clock.now+ms;let count=0;while(true){const due=[...clock.timers].filter(([,v])=>v.at<=target).sort((a,b)=>a[1].at-b[1].at||a[0]-b[0])[0];if(!due)break;assert(++count<10000);clock.now=due[1].at;clock.timers.delete(due[0]);due[1].fn();}clock.now=target;};
const matches=(actual,expected)=>{for(const key of Reflect.ownKeys(expected))assert.deepEqual(actual[key],expected[key]);};
const expect=value=>({
 toBe:x=>assert.equal(value,x),toEqual:x=>assert.deepEqual(value,x),toBeUndefined:()=>assert.equal(value,undefined),toBeInstanceOf:x=>assert.ok(value instanceof x),toMatch:x=>assert.match(value,x),toMatchObject:x=>matches(value,x),
 toThrow:x=>assert.throws(value,error=>x instanceof RegExp?x.test(error.message):typeof x==='string'?error.message.includes(x):true),
 not:{toThrow:()=>assert.doesNotThrow(value)},
 resolves:{toEqual:async x=>assert.deepEqual(await value,x)},
 rejects:{toBe:async x=>{await assert.rejects(value,error=>error===x)},toThrow:async x=>{await assert.rejects(value,error=>x instanceof RegExp?x.test(error.message):error.message.includes(x))}},
});
const vi={
 useFakeTimers(){restore();clock={now:0,id:0,timers:new Map()};globalThis.setTimeout=(fn,delay)=>{const id=++clock.id;clock.timers.set(id,{fn,at:clock.now+delay});return id};globalThis.clearTimeout=id=>clock.timers.delete(id)},useRealTimers:restore,
 advanceTimersByTime:advance,async advanceTimersByTimeAsync(ms){await Promise.resolve();advance(ms);await Promise.resolve();},
 stubGlobal(name,value){if(!globals.has(name))globals.set(name,Object.getOwnPropertyDescriptor(globalThis,name));Object.defineProperty(globalThis,name,{value,writable:true,configurable:true});},
 unstubAllGlobals(){for(const[name,descriptor]of globals){if(descriptor)Object.defineProperty(globalThis,name,descriptor);else delete globalThis[name]}globals.clear()},
 fn(){const queue=[];function fn(...args){fn.mock.calls.push(args);assert(queue.length,'Unexpected mock invocation');return queue.shift().apply(this,args)}fn.mock={calls:[]};fn.mockImplementationOnce=body=>{queue.push(body);return fn};return fn;},
};
globalThis.cryptoTimeoutTests={expect,vi,afterEach(body){afters.push(body)},describe(name,body){const previous=suite,previousAfters=afters;suite+='/'+name;afters=afters.slice();try{body()}finally{suite=previous;afters=previousAfters}},it(name,body){tests.push({name:suite+'/'+name,body,afters:afters.slice()})}};
try{for(const file of process.argv.slice(2))await import(pathToFileURL(resolve(file)));const groups=[];for(const test of tests){try{await test.body();groups.push(test.name)}catch(error){throw new Error(test.name,{cause:error})}finally{for(const hook of test.afters)await hook();vi.unstubAllGlobals();restore();}}console.log(JSON.stringify({groups}));}finally{vi.unstubAllGlobals();restore();delete globalThis.cryptoTimeoutTests;}
