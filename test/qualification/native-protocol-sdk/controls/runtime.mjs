import assert from 'node:assert/strict';import{mkdtempSync,rmSync,realpathSync,readFileSync}from'node:fs';import{join,resolve}from'node:path';import{pathToFileURL}from'node:url';import{tmpdir}from'node:os';import{runInNewContext}from'node:vm';import{toolchain,originalRuntime}from'./support.mjs';
const[compiler,sdk]=process.argv.slice(2),ts=await toolchain(resolve(compiler)),candidateDir=resolve(sdk),metadata=JSON.parse(readFileSync(candidateDir+'.log','utf8')),dir=realpathSync(mkdtempSync(join(tmpdir(),'protocol-runtime-')));try{originalRuntime(join(dir,'original'),ts);
 const original=await import(pathToFileURL(join(dir,"original/index.mjs"))),candidate=await import(pathToFileURL(join(candidateDir,"index.mjs")));
 const originalCordis=await import(pathToFileURL(join(dir,"original/node_modules/@deepseek-ai/cordis/index.mjs"))),candidateCordis=await import(pathToFileURL(join(candidateDir,metadata["module-files"].cordis)));
 assert.deepEqual(Object.keys(candidate).sort(),Object.keys(original).sort());assert.equal(Object.keys(candidate).length,13);
 const shape=o=>Reflect.ownKeys(o).map(key=>{const d=Object.getOwnPropertyDescriptor(o,key);return{key:typeof key==='symbol'?String(key):key,enumerable:d.enumerable,configurable:d.configurable,writable:d.writable,value:typeof d.value==='function'?{name:d.value.name,length:d.value.length}:typeof d.value,get:d.get&&{name:d.get.name,length:d.get.length},set:d.set&&{name:d.set.name,length:d.set.length}}});
 for(const name of Object.keys(original)){if(typeof original[name]==='function'){assert.deepEqual(shape(candidate[name]),shape(original[name]));if(original[name].prototype)assert.deepEqual(shape(candidate[name].prototype),shape(original[name].prototype));}else assert.equal(candidate[name],original[name]);}
 const outcome=fn=>{try{return{value:fn()}}catch(e){return{error:{name:e.name,message:e.message}}}};
 function cases(api,cordis){const groups=[];
  for(const text of ['x','X_$-a.b','.','..','','a/b','a:b','a b','🌏'])groups.push(outcome(()=>api.isTypertRemoteSegment(text)));
  const makers=[()=>null,()=>true,()=>0,()=>-0,()=>NaN,()=>Infinity,()=>undefined,()=>1n,()=>({a:[1,'x',null]}),()=>{const x={};x.self=x;return x},()=>{const x={a:1};return{x,y:x}},()=>Object.assign(Object.create(null),{a:1}),()=>new Date(),()=>{const a=[];a.length=1;return a},()=>Object.defineProperty({},'a',{value:1}),()=>({[Symbol('x')]:1}),()=>runInNewContext('({a:1})'),()=>runInNewContext('[1]')];
  for(const make of makers)for(const name of ['isRemoteJsonValue','isRemoteUplinkItem'])groups.push(outcome(()=>api[name](make())));
  for(const value of [undefined,null,1,{}, {isDSHRemoteError:true,code:'D'}])groups.push(outcome(()=>api.remoteErrorOf(value)===value));
  const remote=new api.RemoteError('D','message',{x:1},{cause:'cause'});assert.ok(remote instanceof Error);assert.equal(remote.cause,'cause');assert.equal(api.remoteErrorOf(remote),remote);groups.push([remote.name,remote.message,remote.code,remote.details,remote.cause,remote.isDSHRemoteError]);
  let releases=0;const payload={a:1},owned=api.typertOwnedValue(payload,()=>{releases++});assert.equal(owned.value,payload);assert.ok(api.isTypertOwnedValue(owned));owned[Symbol.dispose]();owned[Symbol.dispose]();assert.equal(releases,1);groups.push(shape(owned));
  const releaseError=new Error('release');let calls=0;const failing=api.typertOwnedValue(null,()=>{calls++;throw releaseError});assert.throws(()=>failing[Symbol.dispose](),e=>e===releaseError);assert.doesNotThrow(()=>failing[Symbol.dispose]());assert.equal(calls,1);groups.push('release-once-even-on-error');
  for(const value of [null,1,{}, {[api.TYPERT_OWNED_VALUE]:true},Object.create({[api.TYPERT_OWNED_VALUE]:true})])groups.push(api.isTypertOwnedValue(value));
  class Service{method(){}}const instance=new Service(),initializers=[],context={kind:'method',name:'method',private:false,static:false,addInitializer(fn){initializers.push(fn)}};
  api.Remote(()=>{},context);initializers[0].call(instance);initializers[0].call(instance);const methods=api.remoteMethods(instance);assert.equal(methods.length,1);assert.deepEqual(methods[0],{method:'method',invocation:{kind:'direct'}});methods[0].method='mutated';assert.equal(api.remoteMethods(instance)[0].method,'method');groups.push(api.remoteMethods(instance));
  class Stream{run(){}}const stream=new Stream(),pending=[];api.Remote({mode:'stream'})(()=>{},{...context,name:'run',addInitializer(fn){pending.push(fn)}});pending[0].call(stream);groups.push(api.remoteMethods(stream));
  for(const modifier of [{private:true},{static:true},{name:Symbol('x')}])groups.push(outcome(()=>api.Remote(()=>{},{...context,...modifier})));
  for(const option of ['', '.', {mode:'stream',extra:true},{mode:'bad'},null])groups.push(outcome(()=>api.Remote(option)));
  const initializers2=[];api.Remote('other')(()=>{},{...context,addInitializer(fn){initializers2.push(fn)}});groups.push(outcome(()=>initializers2[0].call(instance)));
  const ctx=new cordis.Context();groups.push([ctx.invocation===undefined]); // Accessor is installed by binding below.
  const service={ctx},binding=api.bindTypertRemote(service,'remote',{namespace:'wire'});assert.equal(binding.service,service);assert.ok(Object.isFrozen(binding));assert.equal(ctx.invocation,undefined);groups.push([binding.serviceKey,binding.namespace]);
  class RemoteService extends api.TypertRemoteService{constructor(ctx){super(ctx,'service',{namespace:'wire'})}}
  const registered=new RemoteService(ctx);assert.equal(registered.typertRemote.service,registered);groups.push([registered.typertRemote.serviceKey,registered.typertRemote.namespace]);
  return groups;
 }
 const expected=cases(original,originalCordis),actual=cases(candidate,candidateCordis);assert.deepEqual(actual,expected);
 assert.equal(actual.length,72);console.log('Protocol runtime: 72 full-source original-paired groups, canonical complete own Cordis, exact 13-value surface, shared owned-value symbol, lossless JSON/cross-realm policy, decorators and structural remote-error identity; Node execution only.');
}finally{rmSync(dir,{recursive:true,force:true})}
