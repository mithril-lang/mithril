import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {join} from 'node:path';
const dir=process.argv[2];let groups=0;
const group=async fn=>{await fn();groups++};
function reference({key,mark}){return{object:{
 before:mark('before'),[key()](){return this},after:mark('after'),
 get(receiver,error){return[this,receiver,error,arguments.length,new.target]},
 set(value,receiver,error){return[this,value,receiver,error,arguments.length,new.target]},
 defaults(value=arguments.length,...tail){return[value,tail,arguments.length,this,new.target]},
 inherit(...args){return super.value(...args)},
 lexical(){return()=>[this,arguments.length,new.target,super.value()]},
 async async(){return await super.value()},
 *generate(){return yield this},
 async *asyncGenerate(){return yield await this},
 flow(value){try{return value}finally{mark('finally')}},
}}}
for(const target of ['js','js-browser']){
 const {instantiateMithrilNative}=await import(pathToFileURL(join(dir,target+'.mjs')));
 const factories=[instantiateMithrilNative,reference],grants={key:()=>Symbol.for('computed'),mark:x=>x};
 const api=instantiateMithrilNative(grants).object,ref=reference(grants).object;
 const start=groups;
 await group(()=>{assert.deepEqual(Reflect.ownKeys(api),Reflect.ownKeys(ref));assert.equal(Object.getPrototypeOf(api),Object.prototype);for(const key of Reflect.ownKeys(ref)){const a=Object.getOwnPropertyDescriptor(api,key),b=Object.getOwnPropertyDescriptor(ref,key);assert.deepEqual([a.writable,a.enumerable,a.configurable],[b.writable,b.enumerable,b.configurable]);if(typeof b.value==='function'){assert.equal(a.value.name,b.value.name);assert.equal(a.value.length,b.value.length);assert.deepEqual(Reflect.ownKeys(a.value),Reflect.ownKeys(b.value));assert.equal(Object.getPrototypeOf(a.value),Object.getPrototypeOf(b.value));assert.throws(()=>Reflect.construct(a.value,[]),TypeError)}else assert.equal(a.value,b.value)}});
 await group(()=>{const events=[];for(const factory of factories){const log=[],object=factory({key:()=>{log.push('key');return 'computed'},mark:x=>{log.push(x);return x}}).object;assert.equal(object.computed(),object);events.push(log)}assert.deepEqual(events[0],events[1]);assert.deepEqual(events[0],['before','key','after'])});
 await group(()=>{for(const key of ['__proto__',Symbol('description'),Symbol(''),Symbol()]){for(const factory of factories){const object=factory({...grants,key:()=>key}).object;assert.equal(Object.getPrototypeOf(object),Object.prototype);assert.equal(Object.hasOwn(object,key),true);assert.equal(object[key](),object);assert.equal(object[key].name,typeof key==='symbol'?(key.description===undefined?'':'['+key.description+']'):key)}}});
 await group(()=>{for(const object of [api,ref]){const receiver={},arg={},error={};assert.deepEqual(object.get.call(receiver,arg,error),[receiver,arg,error,2,undefined]);assert.deepEqual(object.set.call(receiver,8,arg,error),[receiver,8,arg,error,3,undefined]);assert.deepEqual(object.get.call(undefined),[undefined,undefined,undefined,0,undefined]);assert.equal(Object.hasOwn(object.get,'prototype'),false)}});
 await group(()=>{for(const object of [api,ref]){const receiver={};assert.equal(object.defaults.length,0);assert.deepEqual(object.defaults.call(receiver,undefined,2,3),[3,[2,3],3,receiver,undefined]);assert.deepEqual(object.defaults.call(receiver),[0,[],0,receiver,undefined])}});
 await group(()=>{for(const object of [api,ref]){const receiver={token:{}},base={value(...args){return[this.token,args]}};Object.setPrototypeOf(object,base);const extracted=object.inherit;assert.deepEqual(extracted.call(receiver,1,2),[receiver.token,[1,2]]);Object.setPrototypeOf(object,{value(...args){return['changed',this,args]}});assert.deepEqual(extracted.call(receiver,3),['changed',receiver,[3]])}});
 await group(()=>{for(const object of [api,ref]){const receiver={token:{}},base={value(){return this.token}};Object.setPrototypeOf(object,base);const arrow=object.lexical.call(receiver,1,2);assert.deepEqual(arrow.call({}),[receiver,2,undefined,receiver.token]);Object.setPrototypeOf(object,{value(){return 8}});assert.deepEqual(arrow(),[receiver,2,undefined,8]);assert.throws(()=>new arrow(),TypeError)}});
 await group(async()=>{for(const object of [api,ref]){const receiver={token:{}},sentinel={};Object.setPrototypeOf(object,{value(){return Promise.resolve(this.token)}});assert.equal(await object.async.call(receiver),receiver.token);Object.setPrototypeOf(object,{value(){throw sentinel}});await assert.rejects(object.async.call(receiver),e=>e===sentinel)}});
 await group(()=>{for(const object of [api,ref]){const receiver={},it=object.generate.call(receiver);assert.deepEqual(it.next(),{value:receiver,done:false});assert.deepEqual(it.next(7),{value:7,done:true});assert.deepEqual(it.next(),{value:undefined,done:true})}});
 await group(async()=>{for(const object of [api,ref]){const receiver={},it=object.asyncGenerate.call(receiver);assert.deepEqual(await it.next(),{value:receiver,done:false});assert.deepEqual(await it.next(9),{value:9,done:true})}});
 await group(()=>{for(const factory of factories){const log=[],object=factory({...grants,mark:x=>log.push(x)}).object;log.length=0;assert.equal(object.flow(8),8);assert.deepEqual(log,['finally']);const sentinel={},throws=factory({...grants,mark:x=>{if(x==='finally')throw sentinel}}).object;assert.throws(()=>throws.flow(9),e=>e===sentinel)}});
 await group(()=>{for(const factory of factories){const sentinel={};assert.throws(()=>factory({...grants,key:()=>{throw sentinel}}),e=>e===sentinel);assert.throws(()=>factory({...grants,mark:()=>{throw sentinel}}),e=>e===sentinel)}});
 console.log(`Native object methods actual ${target} CLI: ${groups-start} paired runtime groups passed.`);
}
assert.equal(groups,24);
console.log('Native object methods: 24 paired runtime groups; method syntax/home objects/shape/receiver and coroutine controls in Node only.');
