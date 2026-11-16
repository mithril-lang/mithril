import assert from 'node:assert/strict';
import vm from 'node:vm';import {pathToFileURL} from 'node:url';
const required=['defineProperty','filterKeys','isNonNullable','isNullable','isPlainObject','mapValues','noop','omit','pick','valueMap'];
const lengths={noop:0,isNullable:1,isNonNullable:1,isPlainObject:1,filterKeys:2,mapValues:2,pick:3,omit:2,defineProperty:3};
async function verify(api,label){
 let count=0;const pass=()=>count++;
 assert.deepEqual(Object.keys(api).sort(),required);assert.equal(api.valueMap,api.mapValues);
 for(const [name,length] of Object.entries(lengths)){assert.equal(api[name].name,name);assert.equal(api[name].length,length);assert.equal(Object.hasOwn(api[name],'prototype'),true);}pass();
 assert.equal(api.noop(),undefined);assert.equal(api.noop(1,2),undefined);
 const instance=new api.noop();assert.equal(Object.getPrototypeOf(instance),api.noop.prototype);pass();
 for(const value of [null,undefined,false,true,0,-0,NaN,'',1,0n,Symbol('s'),()=>{},[],{},Promise.resolve(1)]){
 assert.equal(api.isNullable(value),value===null||value===undefined);assert.equal(api.isNonNullable(value),value!==null&&value!==undefined);
 assert.ok(Object.is(api.isPlainObject(value),value&&typeof value==='object'&&!Array.isArray(value)));}pass();
 let reads=0;const opaque=new Proxy({}, {get(){reads++;throw Error('opaque get')},getPrototypeOf(){reads++;throw Error('opaque proto')}});
 assert.equal(api.isPlainObject(opaque),true);assert.equal(api.isNullable(opaque),false);assert.equal(reads,0);
 const rev=Proxy.revocable({},{});rev.revoke();assert.throws(()=>api.isPlainObject(rev.proxy),TypeError);pass();
 assert.equal(api.isPlainObject(vm.runInNewContext('({})')),true);assert.equal(api.isPlainObject(new Date()),true);pass();
 const sym=Symbol('own'),source=Object.create({inherited:9});source.a=1;source.b=undefined;source[sym]=3;Object.defineProperty(source,'hidden',{value:4});
 for(const keys of [undefined,null,false,0,'']){const p=api.pick(source,keys);const o=api.omit(source,keys);assert.deepEqual(p,{a:1,b:undefined,[sym]:3});assert.deepEqual(o,p);assert.equal(Object.getPrototypeOf(p),Object.prototype);}pass();
 assert.deepEqual(api.pick(source,['a','b','inherited',sym]),{a:1,inherited:9,[sym]:3});assert.deepEqual(api.pick(source,['missing'],true),{missing:undefined});
 assert.deepEqual(api.omit(source,['a',sym]),{b:undefined});assert.deepEqual(source.a,1);pass();
 for(const v of [null,undefined]){assert.deepEqual(api.pick(v),{});assert.deepEqual(api.omit(v),{});assert.throws(()=>api.pick(v,['a']),TypeError);assert.deepEqual(api.pick(v,[],true),{});}
 assert.deepEqual(api.pick('ab'),{'0':'a','1':'b'});assert.deepEqual(api.omit('ab',['0']),{'1':'b'});pass();
 const event=[];let next=0;const getters={get a(){event.push('get');return ++next;}};
 assert.deepEqual(api.pick(getters,['a']),{a:2});assert.deepEqual(event,['get','get']);event.length=0;next=0;
 assert.deepEqual(api.pick(getters,['a'],true),{a:1});assert.deepEqual(event,['get']);pass();
 let coercions=0;const key={[Symbol.toPrimitive](){coercions++;return 'a'}};
 assert.deepEqual(api.pick({a:1},[key]),{a:1});assert.equal(coercions,3);coercions=0;
 assert.deepEqual(api.pick({a:1},[key],true),{a:1});assert.equal(coercions,2);pass();
 const prot={custom:true},protoSource=Object.create(null);protoSource.__proto__=prot;
 assert.equal(Object.getPrototypeOf(api.pick(protoSource,['__proto__'])),prot);
 const spread=api.pick(protoSource);assert.equal(Object.getPrototypeOf(spread),Object.prototype);assert.equal(Object.hasOwn(spread,'__proto__'),true);pass();
 const boom={};let closed=0;
 const iter={ [Symbol.iterator](){let used=false;return {next(){if(used)return {done:true};used=true;return {done:false,value:'a'}},return(){closed++;return {done:true}}}}};
 assert.throws(()=>api.pick({get a(){throw boom}},iter),e=>e===boom);assert.equal(closed,1);pass();
 closed=0;const throwingKey={[Symbol.toPrimitive](){throw boom}};
 const omitIter={*[Symbol.iterator](){try{yield throwingKey;yield 'b'}finally{closed++}}};assert.throws(()=>api.omit({a:1},omitIter),e=>e===boom);assert.equal(closed,1);pass();
 let snapshot=[];const spreadInput={get a(){snapshot.push('a');return 1},get b(){snapshot.push('b');return 2}};
 const omitKeys={*[Symbol.iterator](){snapshot.push('iterate');yield 'a'}};assert.deepEqual(api.omit(spreadInput,omitKeys),{b:2});assert.deepEqual(snapshot,['a','b','iterate']);pass();
 for(const noniter of [1,true,{}]){assert.throws(()=>api.pick({},noniter),TypeError);assert.throws(()=>api.omit({},noniter),TypeError);}pass();
 assert.deepEqual(api.filterKeys({a:1,b:2},function(k,v){assert.equal(this,undefined);assert.equal(arguments.length,2);return k==='b'&&v===2}),{b:2});
 assert.deepEqual(api.filterKeys({},null),{});assert.throws(()=>api.filterKeys({a:1},null),TypeError);pass();
 const filterEvents=[];assert.deepEqual(api.filterKeys({get a(){filterEvents.push('get:a');return 1},get b(){filterEvents.push('get:b');return 2}},(k,v)=>{filterEvents.push('call:'+k);return true}),{a:1,b:2});assert.deepEqual(filterEvents,['get:a','get:b','call:a','call:b']);pass();
 let calls=0;assert.throws(()=>api.filterKeys({a:1,b:2},()=>{calls++;throw boom}),e=>e===boom);assert.equal(calls,1);pass();
 const obj={};const k=Symbol('descriptor');assert.equal(api.defineProperty(obj,k,opaque),obj);assert.deepEqual(Object.getOwnPropertyDescriptor(obj,k),{value:opaque,writable:true,enumerable:false,configurable:false});
 assert.deepEqual(Object.keys(obj),[]);obj[k]=7;assert.equal(obj[k],7);assert.equal(Reflect.deleteProperty(obj,k),false);pass();
 assert.throws(()=>api.defineProperty(Object.freeze({}),'a',1),TypeError);for(const v of [null,undefined,1])assert.throws(()=>api.defineProperty(v,'x',1),TypeError);pass();
 const saved=Object.getOwnPropertyDescriptor(Array,'isArray'),log=[];
 try{Object.defineProperty(Array,'isArray',{configurable:true,get(){log.push('get');return function(x){assert.equal(this,Array);log.push('call');return x===opaque}}});assert.equal(api.isPlainObject(opaque),false);assert.equal(api.isPlainObject(0),0);assert.deepEqual(log,['get','call']);}finally{Object.defineProperty(Array,'isArray',saved)}pass();
 const ds=Object.getOwnPropertyDescriptor(Object,'defineProperty'),deflog=[];
 try{Object.defineProperty(Object,'defineProperty',{configurable:true,get(){deflog.push('get');return function(o,k,d){assert.equal(this,Object);deflog.push(Object.keys(d).join(','));assert.deepEqual(d,{writable:true,value:opaque,enumerable:false});return o}}});assert.equal(api.defineProperty(obj,'v',opaque),obj);assert.deepEqual(deflog,['get','writable,value,enumerable']);}finally{Reflect.defineProperty(Object,'defineProperty',ds)}pass();
 const original=globalThis.Reflect,reflectEvents=[];
 try{globalThis.Reflect={deleteProperty(o,k){assert.equal(this,globalThis.Reflect);reflectEvents.push(k);return original.deleteProperty(o,k)}};assert.deepEqual(api.omit({a:1,b:2},['a','b']),{});assert.deepEqual(reflectEvents,['a','b']);}finally{globalThis.Reflect=original}pass();
 const marker=Symbol('unchanged');for(let i=0;i<2000;i++){assert.deepEqual(api.pick({a:marker},['a']),{a:marker});assert.deepEqual(api.omit({a:marker},['a']),{});}pass();
 assert.equal(count,24);console.log(label+': 24 complete misc runtime contract groups passed');
}
const base=await import('./cosmokit-misc-baseline.mjs');await verify(base,'actual TypeScript baseline');
if(process.argv[2]){const m=await import(pathToFileURL(process.argv[2]).href);const api=m.instantiateMithrilNative({get Object(){return globalThis.Object},get Array(){return globalThis.Array},get Reflect(){return globalThis.Reflect}});await verify(api,'Mithril candidate');}
