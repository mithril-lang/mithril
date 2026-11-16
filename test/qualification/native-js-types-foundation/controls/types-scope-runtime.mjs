import assert from 'node:assert/strict';import {pathToFileURL} from 'node:url';const api=(await import(pathToFileURL(process.argv[2]).href)).instantiateMithrilNative({});
const captured=api.capture(1,2,3);assert.equal(captured(),3);assert.equal(captured(1,2,3,4,5),3);assert.equal(captured.name,'');assert.equal(captured.length,0);assert.throws(()=>Reflect.construct(captured,[]),TypeError);
const inside=api.nested(1,2);assert.equal(inside.name,'inner');assert.equal(inside.length,1);assert.equal(inside(0,1,2,3)(),4);assert.equal(inside()(),0);assert.equal(inside(1)(0,1,2),1);
assert.equal(api.defaultCount.length,0);assert.equal(api.defaultCount(),0);assert.equal(api.defaultCount(undefined),1);assert.equal(api.defaultCount(undefined,1),2);const opaque={};assert.equal(api.defaultCount(opaque),opaque);
console.log('Native arguments Let scope: 3 runtime boundary groups passed.');
