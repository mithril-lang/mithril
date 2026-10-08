import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {join} from 'node:path';
const dir=process.argv[2];
let groups=0;
const group=async fn=>{await fn();groups++};
function reference(mark,Base){
 return {
  wait:async function(value){const answer=await mark(value);return [answer,this,arguments.length]},
  generate:function*(value){try{const resumed=yield value;return resumed}finally{mark('finally')}},
  delegate:function*(values){return yield* values},
  asyncGenerate:async function*(value){return yield await value},
  lexical:function(){return async()=>[await this,arguments.length,new.target]},
  computed:async function(key){return class extends (await Base){[await key](){return this}}},
  yieldKey:function*(){return class{[yield "key"](){return this}}},
  Methods:class Methods extends Base{
   async wait(){return await super.value()}
   *generate(){return yield this}
   static async *asyncGenerate(){return yield await this}
  },
 };
}
for(const target of ['js','js-browser']){
 const {instantiateMithrilNative}=await import(pathToFileURL(join(dir,target+'.mjs')));
 class Base{value(){return Promise.resolve(this.token)}}
 const api=instantiateMithrilNative({mark:x=>x,Base}),ref=reference(x=>x,Base);
 await group(async()=>{const receiver={},value={};for(const x of [api,ref]){const p=x.wait.call(receiver,value);assert.equal(Object.getPrototypeOf(p),Promise.prototype);assert.deepEqual(await p,[value,receiver,1]);for(const key of ['wait','generate','delegate','asyncGenerate'])assert.throws(()=>Reflect.construct(x[key],[]),TypeError)}});
 await group(async()=>{const traces=[];for(const factory of [instantiateMithrilNative,grants=>reference(grants.mark,grants.Base)]){const events=[],mark=v=>{events.push('mark');return v},x=factory({mark,Base}),value={get then(){events.push('get:then');return resolve=>{events.push('then');resolve(7)}}};const p=x.wait(value);events.push('called');p.then(()=>events.push('fulfilled'));await p;await Promise.resolve();traces.push(events)}assert.deepEqual(traces[0],traces[1]);assert.deepEqual(traces[0],['mark','get:then','called','then','fulfilled'])});
 await group(async()=>{const sentinel={};for(const factory of [instantiateMithrilNative,grants=>reference(grants.mark,grants.Base)]){const x=factory({mark:()=>{throw sentinel},Base});const p=x.wait(1);await assert.rejects(p,e=>e===sentinel);const value={get then(){throw sentinel}};const y=factory({mark:v=>v,Base});await assert.rejects(y.wait(value),e=>e===sentinel)}});
 await group(async()=>{for(const factory of [instantiateMithrilNative,grants=>reference(grants.mark,grants.Base)]){const events=[],x=factory({mark:v=>events.push(v),Base}),it=x.generate(1);assert.deepEqual(events,[]);assert.deepEqual(it.next(),{value:1,done:false});assert.deepEqual(events,[]);assert.deepEqual(it.next(9),{value:9,done:true});assert.deepEqual(events,['finally']);assert.deepEqual(it.next(),{value:undefined,done:true})}});
 await group(async()=>{for(const factory of [instantiateMithrilNative,grants=>reference(grants.mark,grants.Base)]){const events=[],x=factory({mark:v=>events.push(v),Base});const it=x.generate(1);it.next();assert.deepEqual(it.return(8),{value:8,done:true});assert.deepEqual(events,['finally']);const sentinel={},thrown=x.generate(2);thrown.next();assert.throws(()=>thrown.throw(sentinel),e=>e===sentinel);assert.deepEqual(events,['finally','finally']);const unborn=x.generate(3);assert.deepEqual(unborn.return(4),{value:4,done:true});assert.equal(events.length,2)}});
 await group(async()=>{const sentinel={};for(const factory of [instantiateMithrilNative,grants=>reference(grants.mark,grants.Base)]){const x=factory({mark:()=>{throw sentinel},Base}),it=x.generate(1);it.next();assert.throws(()=>it.return(2),e=>e===sentinel);assert.deepEqual(it.next(),{value:undefined,done:true})}});
 await group(async()=>{const logs=[];for(const x of [api,ref]){const log=[],iterable={[Symbol.iterator](){log.push('iterator');return{next(v){log.push(['next',v]);return {value:3,done:false}},return(v){log.push(['return',v]);return{value:v,done:true}}}}};const it=x.delegate(iterable);assert.deepEqual(log,[]);assert.deepEqual(it.next(),{value:3,done:false});assert.deepEqual(it.next(5),{value:3,done:false});assert.deepEqual(it.return(8),{value:8,done:true});logs.push(log)}assert.deepEqual(logs[0],logs[1])});
 await group(async()=>{for(const x of [api,ref]){const sentinel={},it=x.delegate({[Symbol.iterator](){return{next(){return{value:1,done:false}},throw(e){assert.equal(e,sentinel);return{value:6,done:true}}}}});it.next();assert.deepEqual(it.throw(sentinel),{value:6,done:true})}});
 await group(async()=>{for(const x of [api,ref]){let resolve;const p=new Promise(r=>resolve=r),it=x.asyncGenerate(p);const first=it.next(),second=it.next(7);let done=false;first.then(()=>done=true);await Promise.resolve();assert.equal(done,false);resolve(4);assert.deepEqual(await first,{value:4,done:false});assert.deepEqual(await second,{value:7,done:true})}});
 await group(async()=>{for(const x of [api,ref]){const sentinel={},it=x.asyncGenerate(Promise.reject(sentinel));await assert.rejects(it.next(),e=>e===sentinel);assert.deepEqual(await it.next(),{value:undefined,done:true})}});
 await group(async()=>{for(const x of [api,ref]){const receiver={},fn=x.lexical.call(receiver,1,2);assert.equal(fn.length,0);assert.equal(fn.name,'');assert.throws(()=>new fn(),TypeError);assert.deepEqual(await fn.call({},9),[receiver,2,undefined]);const arrow=new x.lexical(1);const result=await arrow();assert.equal(result[1],1);assert.equal(result[2],x.lexical);assert.equal(Object.getPrototypeOf(result[0]),x.lexical.prototype)}});
 await group(async()=>{for(const x of [api,ref]){const instance=new x.Methods();instance.token={};assert.equal(await instance.wait(),instance.token);const it=instance.generate();assert.deepEqual(it.next(),{value:instance,done:false});assert.deepEqual(it.next(3),{value:3,done:true});const ait=x.Methods.asyncGenerate();assert.deepEqual(await ait.next(),{value:x.Methods,done:false});assert.deepEqual(await ait.next(4),{value:4,done:true});for(const k of ['wait','generate']){const d=Object.getOwnPropertyDescriptor(x.Methods.prototype,k);assert.deepEqual([d.writable,d.enumerable,d.configurable],[true,false,true]);assert.throws(()=>new d.value(),TypeError)}}});
 await group(async()=>{for(const x of [api,ref]){const key=Symbol("key"),C=await x.computed(Promise.resolve(key)),instance=new C();assert.equal(instance[key](),instance);assert.equal(Object.getPrototypeOf(C),Base);const it=x.yieldKey();assert.deepEqual(it.next(),{value:"key",done:false});const final=it.next(key);assert.equal(final.done,true);const generated=new final.value();assert.equal(generated[key](),generated)}});
 console.log(`Native suspension actual ${target} CLI: 13 paired runtime groups passed.`);
}
assert.equal(groups,26);
console.log('Native suspension: 26 paired runtime groups; both CLI targets executed in Node, not browser-host proof.');
