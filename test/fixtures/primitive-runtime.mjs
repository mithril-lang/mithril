import assert from 'node:assert/strict';import {pathToFileURL} from 'node:url';
const api=(await import(pathToFileURL(process.argv[2]).href)).instantiateMithrilNative({});
const values=[undefined,null,false,0,-0,NaN,'',1,{},Symbol('s'),0n];
for(const a of values)for(const b of values){assert.equal(api.f0(a,b),a===b);assert.equal(api.f1(a),a!==undefined);assert.equal(api.f2(a),!a);assert.equal(api.f3(a),typeof a);assert.ok(Object.is(api.f4(a,b),a&&b));assert.ok(Object.is(api.f5(a,b),a||b));assert.ok(Object.is(api.f6(a,b),a??b));}
const o={};const data=api.f7(o);assert.equal(Object.getPrototypeOf(data),Object.prototype);assert.equal(Object.hasOwn(data,'__proto__'),true);assert.equal(data.__proto__,o);
const sym=Symbol('s');assert.deepEqual(api.f8({a:1,[sym]:2}),{a:1,[sym]:2});assert.deepEqual(api.f8(null),{});assert.deepEqual(api.f8('ab'),{'0':'a','1':'b'});
let log=[];const target={set x(v){log.push(v)}};assert.equal(api.f9(target,o),o);assert.deepEqual(log,[o]);assert.throws(()=>api.f9(Object.freeze({}),1),TypeError);
let iterations=0;const iterable={*[Symbol.iterator](){iterations++;yield 1;yield 2}};assert.equal(api.f10(iterable,o),o);assert.equal(iterations,1);assert.throws(()=>api.f10({},1),TypeError);
console.log('Native primitive runtime: strict comparison/raw logical values/spread/assignment/for-of checked.');
