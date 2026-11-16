import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {join} from 'node:path';
const dir=process.argv[2];let groups=0;
const group=async f=>{await f();groups++};
function reference({mark,object,wait}){return {
 collect:function(object){const out=[];for(const key in object)out.push(key);return out},
 closures:function(object){const out=[];for(const key in object)out.push(()=>[key,this]);return out},
 first:function(object){for(const key in object)return key},
 pairs:function(object){const out=[];for(const[a,b]in object)out.push([a,b]);return out},
 expression:function(object){return (()=>{for(const key in object)mark(key);return 42})()},
 evaluated:function(){for(const key in object())mark(key);return 42},
 generate:function*(object){for(const key in object)yield()=>key},
 asyncCollect:async function(object){const out=[];for(const key in object)out.push(await wait(key));return out},
 control:function(object,mode){for(const key in object){try{if(mode==='continue')continue;else if(mode==='break')break;else throw key}finally{mark(key)}}return 42},
}};
const grants={mark:()=>{},object:()=>{},wait:async key=>key};
const capture=f=>{try{return {value:f()}}catch(e){return e instanceof Error?{error:e.name,message:e.message}:{thrown:e}}};
for(const target of ['js','js-browser']){
 const {instantiateMithrilNative}=await import(pathToFileURL(join(dir,target+'.mjs')));
 const factories=[instantiateMithrilNative,reference],api=instantiateMithrilNative(grants),ref=reference(grants),start=groups;
 await group(()=>{const proto={z:1,2:2,shadow:3},obj=Object.assign(Object.create(proto),{10:10,1:1,b:2,a:1});Object.defineProperty(obj,'shadow',{value:4,enumerable:false});obj[Symbol('s')]=5;assert.deepEqual(api.collect(obj),ref.collect(obj));assert.deepEqual(api.collect(obj),['1','10','b','a','2','z'])});
 await group(()=>{for(const value of [null,undefined,0,NaN,true,1n,Symbol('s'),'ab𠮷',[],[1,,3]])assert.deepEqual(api.collect(value),ref.collect(value))});
 await group(()=>{for(const factory of factories){const obj={};Object.defineProperty(obj,'x',{enumerable:true,get(){throw Error('must not read values')}});assert.deepEqual(factory(grants).collect(obj),['x'])}});
 await group(()=>{const traces=[];for(const factory of factories){const log=[],proto={p:1},obj=new Proxy(Object.assign(Object.create(proto),{x:1,2:2}),{ownKeys(t){log.push('keys');return Reflect.ownKeys(t)},getOwnPropertyDescriptor(t,k){log.push(['descriptor',k]);return Reflect.getOwnPropertyDescriptor(t,k)},getPrototypeOf(t){log.push('prototype');return Reflect.getPrototypeOf(t)},get(){throw Error('unexpected get')}});traces.push([factory(grants).collect(obj),log])}assert.deepEqual(...traces)});
 await group(()=>{for(const trap of ['ownKeys','getOwnPropertyDescriptor','getPrototypeOf']){const traces=[];for(const factory of factories){const obj=new Proxy({a:1},{[trap](){throw 'sentinel'}});traces.push(capture(()=>factory(grants).collect(obj)))}assert.deepEqual(...traces)}});
 await group(()=>{const {proxy,revoke}=Proxy.revocable({},{});revoke();assert.deepEqual(capture(()=>api.collect(proxy)),capture(()=>ref.collect(proxy)))});
 await group(()=>{for(const mutation of ['add','delete','prototype','enumerable']){const traces=[];for(const factory of factories){const proto={p:1},obj=Object.assign(Object.create(proto),{a:1,b:2,c:3}),log=[];const x=factory({...grants,mark:key=>{log.push(key);if(key==='a'){if(mutation==='add')obj.newKey=4;if(mutation==='delete')delete obj.b;if(mutation==='prototype')Object.setPrototypeOf(obj,{q:1});if(mutation==='enumerable')Object.defineProperty(obj,'b',{enumerable:false})}}});traces.push([x.expression(obj),log])}assert.deepEqual(...traces)}});
 await group(()=>{const traces=[];for(const factory of factories){const log=[],x=factory({...grants,object:()=>{log.push('rhs');return {a:1,b:2}},mark:k=>log.push(k)});traces.push([x.evaluated(),log])}assert.deepEqual(...traces);assert.deepEqual(traces[0],[42,['rhs','a','b']])});
 await group(()=>{for(const factory of factories){const log=[],x=factory({...grants,object:()=>{log.push('rhs');throw 'sentinel'},mark:k=>log.push(k)});assert.deepEqual(capture(()=>x.evaluated()),{thrown:'sentinel'});assert.deepEqual(log,['rhs'])}});
 await group(()=>{for(const x of [api,ref]){const receiver={},fns=x.closures.call(receiver,{a:1,b:2});assert.deepEqual(fns.map(f=>f()),[['a',receiver],['b',receiver]]);assert.throws(()=>new fns[0](),TypeError)}});
 await group(()=>{for(const obj of [{a:1,b:2},{},null])assert.equal(api.first(obj),ref.first(obj))});
 await group(()=>{for(const obj of [{ab:1,c:2,'𠮷a':3},{}])assert.deepEqual(api.pairs(obj),ref.pairs(obj))});
 await group(()=>{for(const mode of ['continue','break','throw']){const traces=[];for(const factory of factories){const log=[],x=factory({...grants,mark:k=>log.push(k)});traces.push([capture(()=>x.control({a:1,b:2},mode)),log])}assert.deepEqual(...traces);assert.deepEqual(traces[0][1],mode==='continue'?['a','b']:['a'])}});
 await group(()=>{for(const factory of factories){const x=factory({...grants,mark(){throw 'finally'}});assert.deepEqual(capture(()=>x.control({a:1},'throw')),{thrown:'finally'})}});
 await group(()=>{for(const x of [api,ref]){const obj={a:1,b:2},g=x.generate(obj),first=g.next();assert.equal(first.value(),'a');delete obj.b;obj.c=3;assert.equal(g.next().done,true);assert.equal(first.value(),'a')}});
 await group(()=>{for(const x of [api,ref]){const g=x.generate({a:1,b:2}),a=g.next().value,b=g.next().value;assert.equal(a(),'a');assert.equal(b(),'b');assert.equal(g.return('done').value,'done');assert.equal(g.next().done,true)}});
 await group(async()=>{const traces=[];for(const factory of factories){const log=[],x=factory({...grants,wait:k=>{log.push(['wait',k]);return {then(resolve){log.push(['then',k]);resolve(k+'!')}}}});traces.push([await x.asyncCollect({a:1,b:2}),log])}assert.deepEqual(...traces)});
 await group(async()=>{for(const factory of factories){const log=[],x=factory({...grants,wait:k=>{log.push(k);return Promise.reject('sentinel')}});await assert.rejects(x.asyncCollect({a:1,b:2}),e=>e==='sentinel');assert.deepEqual(log,['a'])}});
 console.log(`Native for-in actual ${target} CLI: ${groups-start} paired runtime groups passed.`);
}
assert.equal(groups,36);
console.log('Native for-in: 36 paired runtime groups. Both CLI targets executed in Node; full Schema and browser-host parity remain separate.');
