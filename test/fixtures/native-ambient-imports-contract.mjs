import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
const [file,mode]=process.argv.slice(2);
globalThis.__mithril_native_grants=17;
globalThis.__mithril_esm_globals=23;
const additional=["__mithril_package_grants","__mithril_package_public","__mithril_package_factory_0","instantiateMithrilNative","instantiateMithrilNativePackage"];
additional.forEach((name,i)=>{globalThis[name]=29+i;});
const module=await import(pathToFileURL(file));
const owner={is:(a,b)=>Object.is(a,b)};
const ambient=['Date','isNaN','__mithril_native_grants','__mithril_esm_globals',...additional];
const grants=mode==='explicit-package'?Object.fromEntries([['Object',owner],...ambient.map(name=>[name,globalThis[name]])]):{Object:owner};
const api=['esm','library'].includes(mode)?module:mode==='explicit-package'?module.instantiateMithrilNativePackage(grants):module.instantiateMithrilNative(grants);
if(mode==='standalone')assert.equal(module.instantiateMithrilNative.name,'instantiateMithrilNative');
if(mode==='explicit-package')assert.equal(module.instantiateMithrilNativePackage.name,'instantiateMithrilNativePackage');
const original=value=>[new Date(value),isNaN(+new Date(value)),__mithril_native_grants,__mithril_esm_globals,__mithril_package_grants,__mithril_package_public,__mithril_package_factory_0,instantiateMithrilNative,instantiateMithrilNativePackage];
const restore=callback=>new Function('return ('+callback.toString()+')')();
const callback=api.make(),restored=restore(callback),oracleRestored=restore(original);
for(const input of ['2020-01-01T00:00:00Z','invalid-date',0,8640000000000000]){
 for(const candidate of [callback,restored]){
  const actual=candidate(input),expected=oracleRestored(input);
  assert.equal(actual[0] instanceof Date,true);
  assert.ok(Object.is(+actual[0],+expected[0]));
  assert.deepEqual(actual.slice(1),expected.slice(1));
 }
}
assert.equal(api.make.name,'make');assert.equal(api.make.length,0);
assert.equal(api.granted()(NaN),true);
assert.throws(()=>restore(api.granted())(NaN),ReferenceError);
const date=Object.getOwnPropertyDescriptor(globalThis,'Date');
const isNaNDescriptor=Object.getOwnPropertyDescriptor(globalThis,'isNaN');
try{
 const reads=[];
 class Replacement extends date.value {}
 Object.defineProperty(globalThis,'Date',{configurable:true,get(){reads.push('Date');return Replacement;}});
 Object.defineProperty(globalThis,'isNaN',{configurable:true,get(){reads.push('isNaN');return isNaNDescriptor.value;}});
 const expected=oracleRestored(123);const expectedReads=reads.splice(0);
 for(const candidate of [callback,restored]){
  assert.deepEqual(candidate(123),expected);
  assert.deepEqual(reads.splice(0),expectedReads);
 }
 delete globalThis.Date;
 for(const candidate of [original,oracleRestored,callback,restored])assert.throws(()=>candidate(0),ReferenceError);
}finally{
 Object.defineProperty(globalThis,'Date',date);Object.defineProperty(globalThis,'isNaN',isNaNDescriptor);
 delete globalThis.__mithril_native_grants;delete globalThis.__mithril_esm_globals;
 additional.forEach(name=>{delete globalThis[name];});
}
if(mode==='standalone'){
 for(const grants of [{}, {Object:owner,Date},Object.create({Object:owner})])assert.throws(()=>module.instantiateMithrilNative(grants),/host-grant-mismatch/);
}
console.log(mode+': real serialized callbacks, live ambient getter order/rebinding/deletion, reserved-prefix globals and unrecoverable injected closure passed');
