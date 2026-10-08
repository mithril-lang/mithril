import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {join} from 'node:path';
const dir=process.argv[2];let groups=0;
const group=async f=>{await f();groups++};
function reference({mark,object,key,Promise}){
 return {
  erase:function(object,key){return delete object[key]},
  eraseEvaluated:function(){return delete object()[key()]},
  collect:function(rows){const pairs=[];for(const[key,value]of rows)pairs.push([key,value]);return pairs},
  closures:function(rows){const pairs=[];for(const[key,value]of rows)pairs.push(()=>[key,value]);return pairs},
  first:function(rows){for(const[key,value]of rows)return[key,value]},
  empty:function(rows){for(const[]of rows)mark()},
  expression:function(rows){for(const[key,value]of rows)mark(key,value);return 42},
  generate:function*(rows){for(const[key,value]of rows)yield()=>[key,value]},
  control:function(rows,mode){for(const[key,value]of rows){try{if(mode==='continue')continue;else if(mode==='break')break;else throw value}finally{mark(key)}}return 42},
  cleanup:async(store,fiberStore,key,pending)=>{delete store[key];await Promise.allSettled(pending);delete fiberStore[key]},
 };
}
const grants={mark:()=>{},object:()=>{},key:()=>{},Promise};
const capture=f=>{try{return{value:f()}}catch(e){return e instanceof Error?{error:e.name,message:e.message}:{thrown:e}}};
function trackedRows(log,rows,opts={}){
 let index=0;return{[Symbol.iterator](){log.push('outer:iterator');return{
  next(){log.push('outer:next');return index<rows.length?{value:rows[index++],done:false}:{value:undefined,done:true}},
  return(){log.push('outer:return');if(opts.returnError)throw opts.returnError;return{value:undefined,done:true}},
 }}};
}
function row(log,values,opts={}){
 return{[Symbol.iterator](){log.push('inner:iterator');let i=0;return{
  next(){log.push('inner:next');if(opts.nextError)throw opts.nextError;return i<values.length?{value:values[i++],done:false}:{done:true}},
  return(){log.push('inner:return');if(opts.returnError)throw opts.returnError;return opts.primitiveReturn?0:{done:true}},
 }},get 0(){throw Error('must use iterator, not indices')},get 1(){throw Error('must use iterator, not indices')}};
}
for(const target of ['js','js-browser']){
 const {instantiateMithrilNative}=await import(pathToFileURL(join(dir,target+'.mjs')));
 const factories=[instantiateMithrilNative,reference],api=instantiateMithrilNative(grants),ref=reference(grants);
 const start=groups;
 await group(()=>{for(const x of [api,ref]){const proto={inherited:4},object=Object.assign(Object.create(proto),{own:3});assert.equal(x.erase(object,'own'),true);assert.equal(Object.hasOwn(object,'own'),false);assert.equal(x.erase(object,'absent'),true);assert.equal(x.erase(object,'inherited'),true);assert.equal(object.inherited,4);assert.equal(proto.inherited,4)}});
 await group(()=>{for(const x of [api,ref]){const key=Symbol('key'),object={[key]:1};assert.equal(x.erase(object,key),true);assert.equal(Object.hasOwn(object,key),false);let gets=0;Object.defineProperty(object,'value',{configurable:true,get(){gets++;throw Error('unread')}});assert.equal(x.erase(object,'value'),true);assert.equal(gets,0)}});
 await group(()=>{for(const make of [()=>Object.freeze({x:1}),()=>Object.defineProperty({},'x',{value:1}),()=>({})])assert.deepEqual(capture(()=>api.erase(make(),'x')),capture(()=>ref.erase(make(),'x')))});
 await group(()=>{for(const object of ['abc',7,true,1n,Symbol('s'),null,undefined])for(const key of ['0','length','missing'])assert.deepEqual(capture(()=>api.erase(object,key)),capture(()=>ref.erase(object,key)))});
 await group(()=>{for(const trap of [()=>false,()=>true]){const traces=[];for(const x of [api,ref]){const events=[],object=new Proxy({x:1},{deleteProperty(t,k){events.push(k);return trap()}});const result=capture(()=>x.erase(object,'x'));traces.push([result,events,Object.hasOwn(object,'x')])}assert.deepEqual(traces[0],traces[1])}});
 await group(()=>{for(const x of [api,ref]){const fixed=Object.freeze({x:1}),proxy=new Proxy(fixed,{deleteProperty:()=>true});assert.throws(()=>x.erase(proxy,'x'),TypeError);const sentinel={};assert.throws(()=>x.erase(new Proxy({},{deleteProperty(){throw sentinel}}),'x'),e=>e===sentinel)}});
 await group(()=>{const traces=[];for(const factory of factories){const events=[],symbol=Symbol.for('key'),object=new Proxy({[symbol]:1},{deleteProperty(t,k){events.push(['delete',k]);return Reflect.deleteProperty(t,k)}}),key={[Symbol.toPrimitive](hint){events.push(['coerce',hint]);return symbol}};const x=factory({...grants,object:()=>{events.push('object');return object},key:()=>{events.push('key');return key}});assert.equal(x.eraseEvaluated(),true);traces.push(events)}assert.deepEqual(traces[0],traces[1]);assert.deepEqual(traces[0],['object','key',['coerce','string'],['delete',Symbol.for('key')]])});
 await group(()=>{for(const factory of factories){const events=[],sentinel={},x=factory({...grants,object:()=>{events.push('object');throw sentinel},key:()=>{events.push('key');return 'x'}});assert.throws(()=>x.eraseEvaluated(),e=>e===sentinel);assert.deepEqual(events,['object'])}});
 await group(()=>{const traces=[];for(const factory of factories){const events=[],x=factory({...grants,object:()=>{events.push('object');return null},key:()=>{events.push('key');return{[Symbol.toPrimitive](){events.push('coerce');return 'x'}}}});traces.push([capture(()=>x.eraseEvaluated()),events])}assert.deepEqual(traces[0],traces[1])});
 await group(()=>{const sentinel={};for(const x of [api,ref]){const key={[Symbol.toPrimitive](){throw sentinel}};assert.throws(()=>x.erase({},key),e=>e===sentinel)}});
 await group(()=>{const rows=[[1,2,3],[],[4],['𠮷','a'],'𠮷a'];assert.deepEqual(api.collect(rows),ref.collect(rows));assert.deepEqual(api.collect(rows),[[1,2],[undefined,undefined],[4,undefined],['𠮷','a'],['𠮷','a']])});
 await group(()=>{const traces=[];for(const x of [api,ref]){const log=[],rows=trackedRows(log,[row(log,[1,2,3])]);const value=x.collect(rows);traces.push([value,log])}assert.deepEqual(traces[0],traces[1]);assert.deepEqual(traces[0][1],['outer:iterator','outer:next','inner:iterator','inner:next','inner:next','inner:return','outer:next'])});
 await group(()=>{for(const x of [api,ref]){const values=[{},{}],fns=x.closures(values.map((v,i)=>[v,i]));assert.equal(fns.length,2);assert.deepEqual(fns[0](),[values[0],0]);assert.deepEqual(fns[1](),[values[1],1]);assert.throws(()=>new fns[0](),TypeError)}});
 await group(()=>{const traces=[];for(const x of [api,ref]){const log=[],value=x.first(trackedRows(log,[row(log,[1,2]),row(log,[3,4])]));traces.push([value,log])}assert.deepEqual(traces[0],traces[1]);assert.deepEqual(traces[0][1],['outer:iterator','outer:next','inner:iterator','inner:next','inner:next','inner:return','outer:return'])});
 await group(()=>{const traces=[];for(const factory of factories){const log=[],x=factory({...grants,mark:()=>log.push('body')});x.empty(trackedRows(log,[row(log,[1,2])]));traces.push(log)}assert.deepEqual(traces[0],traces[1]);assert.deepEqual(traces[0],['outer:iterator','outer:next','inner:iterator','inner:return','body','outer:next'])});
 await group(()=>{for(const mode of ['continue','break','throw']){const traces=[];for(const factory of factories){const log=[],x=factory({...grants,mark:k=>log.push(['finally',k])}),rows=trackedRows(log,[[1,'first'],[2,'second']]);traces.push([capture(()=>x.control(rows,mode)),log])}assert.deepEqual(traces[0],traces[1]);if(mode==='continue')assert.equal(traces[0][1].includes('outer:return'),false);else assert.equal(traces[0][1].at(-1),'outer:return')}});
 await group(()=>{for(const opts of [{nextError:'next-failure'},{returnError:'inner-close-failure'},{primitiveReturn:true}]){const traces=[];for(const x of [api,ref]){const log=[];traces.push([capture(()=>x.collect(trackedRows(log,[row(log,[1,2],opts)]))),log])}assert.deepEqual(traces[0],traces[1]);assert.equal(traces[0][1].at(-1),'outer:return')}});
 await group(()=>{for(const value of [null,undefined,3,{},false]){const traces=[];for(const x of [api,ref]){const log=[];traces.push([capture(()=>x.collect(trackedRows(log,[value]))),log])}assert.deepEqual(traces[0],traces[1]);assert.equal(traces[0][1].at(-1),'outer:return')}});
 await group(()=>{for(const factory of factories){const log=[],sentinel={},closeError={},x=factory({...grants,mark:()=>{throw sentinel}});assert.throws(()=>x.control(trackedRows(log,[[1,2]],{returnError:closeError}),'break'),e=>e===sentinel);assert.equal(log.at(-1),'outer:return')}});
 await group(()=>{for(const x of [api,ref]){const log=[],iterator=x.generate(trackedRows(log,[row(log,[1,2]),row(log,[3,4])]));assert.deepEqual(log,[]);const first=iterator.next();assert.equal(first.done,false);assert.deepEqual(first.value(),[1,2]);assert.equal(log.at(-1),'inner:return');const second=iterator.next();assert.deepEqual(first.value(),[1,2]);assert.deepEqual(second.value(),[3,4]);assert.deepEqual(iterator.return(8),{value:8,done:true});assert.equal(log.at(-1),'outer:return');assert.deepEqual(first.value(),[1,2])}});
 await group(()=>{for(const x of [api,ref]){const log=[],iterator=x.generate(trackedRows(log,[[1,2]])),sentinel={};iterator.next();assert.throws(()=>iterator.throw(sentinel),e=>e===sentinel);assert.equal(log.at(-1),'outer:return')}});
 await group(()=>{const traces=[];for(const factory of factories){const log=[],x=factory({...grants,mark:(...args)=>log.push(args)});const result=x.expression(trackedRows(log,[row(log,[1,2])]));traces.push([result,log])}assert.deepEqual(traces[0],traces[1]);assert.equal(traces[0][0],42)});
 await group(async()=>{for(const x of [api,ref]){const key=Symbol('service'),store={[key]:1},fiberStore={[key]:2};let resolve;const pending=new Promise(r=>resolve=r),p=x.cleanup(store,fiberStore,key,[pending,Promise.reject('dependent-failure')]);assert.equal(Object.hasOwn(store,key),false);assert.equal(Object.hasOwn(fiberStore,key),true);await Promise.resolve();assert.equal(Object.hasOwn(fiberStore,key),true);resolve();assert.equal(await p,undefined);assert.equal(Object.hasOwn(fiberStore,key),false)}});
 await group(async()=>{for(const x of [api,ref]){const store=Object.freeze({x:1}),fiberStore={x:2};await assert.rejects(x.cleanup(store,fiberStore,'x',[]),TypeError);assert.equal(fiberStore.x,2);const writable={x:1},fixedFiber=Object.freeze({x:2});await assert.rejects(x.cleanup(writable,fixedFiber,'x',[]),TypeError);assert.equal(Object.hasOwn(writable,'x'),false);assert.equal(fixedFiber.x,2)}});
 console.log(`Native reflect binding/delete actual ${target} CLI: ${groups-start} paired runtime groups passed.`);
}
assert.equal(groups,48);
console.log('Native reflect binding/delete: 48 paired runtime groups; Node execution of both CLI targets, not complete reflect or browser-host proof.');
