// Transpiled CosmoKit misc.ts baseline; copyright 2021-present Shigma.
// MIT license retained in COSMOKIT-LICENSE. See qualification source receipt.
const BASELINE_SOURCE="/** No-op callback returning `undefined` at runtime and `any` at type level. */\nexport function noop() { }\n/** Return true when a value is `null` or `undefined`. */\nexport function isNullable(value) {\n    return value === null || value === undefined;\n}\n/** Return true when a value is neither `null` nor `undefined`. */\nexport function isNonNullable(value) {\n    return !isNullable(value);\n}\n/** Return true for non-array object values. */\nexport function isPlainObject(data) {\n    return data && typeof data === 'object' && !Array.isArray(data);\n}\n/** Filter object entries and return a new object. */\nexport function filterKeys(object, filter) {\n    return Object.fromEntries(Object.entries(object).filter(([key, value]) => filter(key, value)));\n}\n/** Map object values while preserving the original key set. */\nexport function mapValues(object, transform) {\n    return Object.fromEntries(Object.entries(object).map(([key, value]) => [key, transform(value, key)]));\n}\n/** Alias for `mapValues`. */\nexport { mapValues as valueMap };\n/** Pick selected keys from an object, optionally including `undefined` values. */\nexport function pick(source, keys, forced) {\n    if (!keys)\n        return { ...source };\n    const result = {};\n    for (const key of keys) {\n        if (forced || source[key] !== undefined)\n            result[key] = source[key];\n    }\n    return result;\n}\n/** Omit selected keys from a shallow object copy. */\nexport function omit(source, keys) {\n    if (!keys)\n        return { ...source };\n    const result = { ...source };\n    for (const key of keys) {\n        Reflect.deleteProperty(result, key);\n    }\n    return result;\n}\n/** Define a non-enumerable writable property and return the object. */\nexport function defineProperty(object, key, value) {\n    return Object.defineProperty(object, key, { writable: true, value, enumerable: false });\n}\n";
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {pathToFileURL} from 'node:url';
async function verify(base,stage){
const cases=[];function pass(name){cases.push(name);}
assert.equal(base.valueMap,base.mapValues);assert.equal(base.mapValues.name,'mapValues');assert.equal(base.mapValues.length,2);pass('canonical alias identity and metadata');
const order=[],input=Object.create({inherited:1});input.a=3;input[2]=2;input[1]=1;
Object.defineProperty(input,'hidden',{value:4});Object.defineProperty(input,Symbol('s'),{enumerable:true,get(){throw Error('symbol must not be read')}});
const mapped=base.mapValues(input,function(value,key){assert.equal(this,undefined);assert.equal(arguments.length,2);order.push([key,value]);return value*10;});
assert.deepEqual(order,[['1',1],['2',2],['a',3]]);assert.deepEqual(mapped,{'1':10,'2':20,a:30});pass('enumerable own string keys and exact callback convention');
let events=[];const eager={get a(){events.push('get:a');return 1;},get b(){events.push('get:b');return 2;}};
assert.deepEqual(base.mapValues(eager,(v,k)=>{events.push('call:'+k);return v;}),{a:1,b:2});assert.deepEqual(events,['get:a','get:b','call:a','call:b']);pass('all getters read before callbacks');
events=[];const boom={};assert.throws(()=>base.mapValues({get a(){events.push('get:a');return 1;},get b(){events.push('get:b');throw boom;}},()=>{events.push('call');}),e=>e===boom);assert.deepEqual(events,['get:a','get:b']);pass('getter exception identity before any callback');
const mutable={a:1,b:2};const visited=[];assert.deepEqual(base.mapValues(mutable,(v,k)=>{visited.push([k,v]);mutable.b=99;delete mutable.a;mutable.c=3;return v;}),{a:1,b:2});assert.deepEqual(visited,[['a',1],['b',2]]);pass('entries snapshot survives callback mutation');
let calls=0;assert.throws(()=>base.mapValues({a:1,b:2,c:3},()=>{if(++calls===2)throw boom;return 0;}),e=>e===boom);assert.equal(calls,2);pass('callback throw identity and abort');
for(const value of [null,undefined]){calls=0;assert.throws(()=>base.mapValues(value,()=>{calls++;}),TypeError);assert.equal(calls,0);}pass('nullish source refused before callback');
assert.deepEqual(base.mapValues('ab',(v,k)=>k+v),{'0':'0a','1':'1b'});for(const v of [1,true,0n,Symbol('x')])assert.deepEqual(base.mapValues(v,()=>{throw boom;}),{});pass('native primitive Object.entries coercion');
for(const fn of [null,undefined,0,{},'x']){assert.deepEqual(base.mapValues({},fn),{});assert.throws(()=>base.mapValues({x:1},fn),TypeError);}pass('noncallable transform is lazy for empty sources');
const protoInput=Object.create(null);protoInput.__proto__='safe';const out=base.mapValues(protoInput,v=>v);assert.equal(Object.getPrototypeOf(out),Object.prototype);assert.deepEqual(Object.getOwnPropertyDescriptor(out,'__proto__'),{value:'safe',enumerable:true,configurable:true,writable:true});pass('fromEntries creates safe own __proto__ data property');
const objects=[{},Symbol('out'),undefined,Promise.resolve(1)];for(const value of objects)assert.equal(base.mapValues({a:1},()=>value).a,value);pass('opaque callback results and promises are not coerced or awaited');
const bound={};assert.deepEqual(base.mapValues({a:1},function(v,k){assert.equal(this,bound);return [v,k];}.bind(bound)),{a:[1,'a']});pass('bound callbacks retain receiver');
assert.deepEqual(base.mapValues(vm.runInNewContext('({a:1})'),v=>v),{a:1});pass('foreign realm source');
const r=Proxy.revocable({},{});r.revoke();assert.throws(()=>base.mapValues(r.proxy,v=>v),TypeError);pass('revoked proxy refusal');
const proxyEvents=[];const proxy=new Proxy({a:1,b:2},{ownKeys(t){proxyEvents.push('ownKeys');return Reflect.ownKeys(t);},getOwnPropertyDescriptor(t,k){proxyEvents.push('descriptor:'+String(k));return Reflect.getOwnPropertyDescriptor(t,k);},get(t,k,r){proxyEvents.push('get:'+String(k));return Reflect.get(t,k,r);}});assert.deepEqual(base.mapValues(proxy,(v,k)=>{proxyEvents.push('call:'+k);return v;}),{a:1,b:2});assert.deepEqual(proxyEvents,['ownKeys','descriptor:a','get:a','descriptor:b','get:b','call:a','call:b']);pass('proxy key descriptor get order');
const constructed=Reflect.construct(base.mapValues,[{a:1},v=>v]);assert.deepEqual(constructed,{a:1});assert.equal(Object.getPrototypeOf(constructed),Object.prototype);assert.equal(constructed instanceof base.mapValues,false);pass('constructor returns the constructed mapping object');
const saved={entries:Object.getOwnPropertyDescriptor(Object,'entries'),fromEntries:Object.getOwnPropertyDescriptor(Object,'fromEntries'),map:Object.getOwnPropertyDescriptor(Array.prototype,'map')};
let resolution=[];
try {
 Object.defineProperty(Object,'fromEntries',{configurable:true,get(){resolution.push('lookup:fromEntries');return function(pairs){assert.equal(this,Object);resolution.push('invoke:fromEntries');return saved.fromEntries.value(pairs);};}});
 Object.defineProperty(Object,'entries',{configurable:true,get(){resolution.push('lookup:entries');return function(value){assert.equal(this,Object);resolution.push('invoke:entries');return saved.entries.value(value);};}});
 Object.defineProperty(Array.prototype,'map',{configurable:true,get(){resolution.push('lookup:map');return function(fn){resolution.push('invoke:map');return saved.map.value.call(this,fn);};}});
 assert.deepEqual(base.mapValues({get a(){resolution.push('get:a');return 1;}},(v,k)=>{resolution.push('call:'+k);return v;}),{a:1});
 assert.deepEqual(resolution,['lookup:fromEntries','lookup:entries','invoke:entries','get:a','lookup:map','invoke:map','call:a','invoke:fromEntries']);
} finally {Object.defineProperty(Object,'entries',saved.entries);Object.defineProperty(Object,'fromEntries',saved.fromEntries);Object.defineProperty(Array.prototype,'map',saved.map);}
pass('dynamic builtin lookup and receiver order');
let replacedCalled=false;
try {assert.deepEqual(base.mapValues({a:1},v=>{Object.fromEntries=()=>{replacedCalled=true;return 99;};return v;}),{a:1});assert.equal(replacedCalled,false);}finally{Object.defineProperty(Object,'fromEntries',saved.fromEntries);}
pass('fromEntries reference captured before callbacks');
const custom=[];try {
 Object.entries=function(o){assert.equal(this,Object);assert.equal(o,input);return {map(fn){custom.push('custom-map');const pair=fn(['k',7]);assert.deepEqual(pair,['k',8]);return [['z',pair[1]]];}};};
 Object.fromEntries=function(pairs){assert.equal(this,Object);assert.deepEqual(pairs,[['z',8]]);return boom;};
 assert.equal(base.mapValues(input,(v,k)=>{assert.equal(k,'k');return v+1;}),boom);assert.deepEqual(custom,['custom-map']);
}finally{Object.defineProperty(Object,'entries',saved.entries);Object.defineProperty(Object,'fromEntries',saved.fromEntries);}
pass('custom entries map and fromEntries results remain observable');
let repeated=0;for(let i=0;i<2000;i++){assert.deepEqual(base.mapValues({a:i},v=>v),{a:i});repeated++;}
pass('ordinary repeated calls');

try {
 Object.entries=()=>({map(fn){assert.equal(fn.length,1);assert.equal(fn.name,'');assert.equal(Object.hasOwn(fn,'prototype'),false);assert.throws(()=>Reflect.construct(fn,[]),TypeError);return [fn(['a',1])];}});
 assert.deepEqual(base.mapValues({},v=>v),{a:1});
} finally {Object.defineProperty(Object,'entries',saved.entries);}
pass('custom map observes anonymous nonconstructible one-argument callback');
const iteratorEvents=[];
try {
 const entry={ [Symbol.iterator](){iteratorEvents.push('iterate');let i=0;return {next(){iteratorEvents.push('next:'+i);return {done:false,value:i++===0?'a':7};},return(){iteratorEvents.push('close');return {};}};}};
 Object.entries=()=>({map(fn){return [fn(entry)];}});
 assert.deepEqual(base.mapValues({},(v,k)=>{iteratorEvents.push('callback');assert.equal(k,'a');return v;}),{a:7});
 assert.deepEqual(iteratorEvents,['iterate','next:0','next:1','close','callback']);
} finally {Object.defineProperty(Object,'entries',saved.entries);}
pass('entry destructuring uses iterator and closes before transform');
let closeCalls=0, transformCalls=0;
try {
 const entry={ [Symbol.iterator](){let i=0;return {next(){return {done:false,value:i++===0?'a':7};},return(){closeCalls++;throw boom;}};}};
 Object.entries=()=>({map(fn){return [fn(entry)];}});
 assert.throws(()=>base.mapValues({},()=>{transformCalls++;}),e=>e===boom);
 assert.equal(closeCalls,1);assert.equal(transformCalls,0);
} finally {Object.defineProperty(Object,'entries',saved.entries);}
pass('iterator close exception retains identity and precedes callback');
const keyEvents=[], rawKey={ [Symbol.toPrimitive](hint){keyEvents.push('coerce:'+hint);return 'raw';}};
try {
 Object.entries=()=>({map(fn){return [fn([rawKey,7])];}});
 assert.deepEqual(base.mapValues({},(v,k)=>{keyEvents.push('callback');assert.equal(k,rawKey);return v;}),{raw:7});
 assert.deepEqual(keyEvents,['callback','coerce:string']);
} finally {Object.defineProperty(Object,'entries',saved.entries);}
pass('custom entry key is opaque until fromEntries property coercion');
assert.equal(cases.length,24);
return {passed:true,cases:cases.length,contracts:cases,builtin_resolution_order:resolution,proxy_order:proxyEvents,repeated_calls:repeated,stage};
}
const baseline=await import('data:text/javascript;base64,'+Buffer.from(BASELINE_SOURCE).toString('base64'));
const artifact=await import(pathToFileURL(process.argv[2]));
const candidate=artifact.instantiateMithrilNative({get Object(){return globalThis.Object;}});
const results=[await verify(baseline,'actual transpiled baseline'),await verify(candidate,'Mithril native JS candidate')];
function liveBindingDuringLookup(api){
 const original=globalThis.Object;
 const descriptor=original.getOwnPropertyDescriptor(original,'fromEntries');
 const events=[];
 const replacement={entries(value){assert.equal(this,replacement);events.push('entries:replacement');return original.entries(value);}};
 try{
  original.defineProperty(original,'fromEntries',{configurable:true,get(){
   events.push('lookup:fromEntries');globalThis.Object=replacement;
   return function(pairs){assert.equal(this,original);events.push('fromEntries:original');return descriptor.value(pairs);};
  }});
  assert.deepEqual(api.mapValues({a:1},v=>v),{a:1});
  assert.deepEqual(events,['lookup:fromEntries','entries:replacement','fromEntries:original']);
 }finally{globalThis.Object=original;original.defineProperty(original,'fromEntries',descriptor);}
}
liveBindingDuringLookup(baseline);liveBindingDuringLookup(candidate);
console.log(JSON.stringify({paired:true,results,additional_paired_case:'live global binding replacement during fromEntries lookup'}));
