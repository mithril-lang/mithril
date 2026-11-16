import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,rmSync,realpathSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {toolchain,fixture} from './support.mjs';
const [compiler,cryptoSdk,timeoutSdk]=process.argv.slice(2),ts=await toolchain(resolve(compiler));
const dir=realpathSync(mkdtempSync(join(tmpdir(),'mithril-crypto-timeout-runtime-')));
try{
 const erase=(text)=>ts.transpileModule(text,{compilerOptions:{target:ts.ScriptTarget.ES2024,module:ts.ModuleKind.ESNext}}).outputText;
 for(const pkg of ['crypto','timeout'])writeFileSync(join(dir,pkg+'.mjs'),erase(readFileSync(join(fixture,'original-'+pkg+'.ts'),'utf8')));
 const originalCrypto=await import(pathToFileURL(join(dir,'crypto.mjs'))),actualCrypto=await import(pathToFileURL(resolve(cryptoSdk,'index.mjs')));
 const originalTimeout=await import(pathToFileURL(join(dir,'timeout.mjs'))),actualTimeout=await import(pathToFileURL(resolve(timeoutSdk,'index.mjs')));
 const shape=object=>Reflect.ownKeys(object).map(key=>{const d=Object.getOwnPropertyDescriptor(object,key);return{key:typeof key==='symbol'?String(key):key,enumerable:d.enumerable,configurable:d.configurable,writable:d.writable,value:typeof d.value==='function'?{name:d.value.name,length:d.value.length}:typeof d.value,get:d.get&&{name:d.get.name,length:d.get.length},set:d.set&&{name:d.set.name,length:d.set.length}}});
 for(const[a,b]of [[originalCrypto,actualCrypto],[originalTimeout,actualTimeout]]){assert.deepEqual(Object.keys(b).sort(),Object.keys(a).sort());for(const name of Object.keys(a)){if(typeof a[name]==='function'){assert.deepEqual(shape(b[name]),shape(a[name]));if(a[name].prototype)assert.deepEqual(shape(b[name].prototype),shape(a[name].prototype));}else assert.equal(a[name],b[name]);}}
 for(const api of [originalTimeout,actualTimeout]){assert.equal(Object.getPrototypeOf(api.TimeoutReason.prototype),Error.prototype);const reason=new api.TimeoutReason('D',10);assert.deepEqual(Reflect.ownKeys(reason),['stack','message','code','timeoutMs','name']);}
let cryptoGroups=0;
for(const length of [0,1,2,3,255,32767,32768,32769,65537,262144]){const bytes=Uint8Array.from({length},(_,i)=>(i*17)&255);assert.equal(actualCrypto.bytesToBase64(bytes),originalCrypto.bytesToBase64(bytes));assert.equal(actualCrypto.bytesToBase64(bytes),Buffer.from(bytes).toString('base64'));cryptoGroups++;}
const descriptor=Object.getOwnPropertyDescriptor(globalThis,'crypto');
try{for(const value of [0,255,0x55,0xaa]){const results=[];for(const api of [originalCrypto,actualCrypto]){let calls=0;const stub={getRandomValues(bytes){assert.equal(this,stub);assert.equal(bytes.length,16);bytes.fill(value);calls++;return bytes}};Object.defineProperty(globalThis,'crypto',{configurable:true,value:stub});const uuid=api.randomUUID();assert.equal(calls,1);assert.match(uuid,/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);results.push(uuid)}assert.equal(...results);cryptoGroups++;}}finally{Object.defineProperty(globalThis,'crypto',descriptor)}
async function timeoutCases(api){
 const results=[];const outcome=fn=>{try{return{value:fn()}}catch(e){return{error:{name:e.name,message:e.message}}}};
 for(const requested of [undefined,1,20,200,0,-1,NaN,Infinity])results.push(outcome(()=>api.clampTimeout(requested,30,100,'limit')));
 for(const [def,max]of [[0,100],[NaN,100],[30,NaN],[30,0]])results.push(outcome(()=>api.clampTimeout(undefined,def,max)));
 const nativeSet=globalThis.setTimeout,nativeClear=globalThis.clearTimeout;let now=0,id=0;const timers=new Map();
 globalThis.setTimeout=(fn,delay)=>{const key=++id;timers.set(key,{fn,at:now+delay});return key};globalThis.clearTimeout=key=>timers.delete(key);
 const advance=ms=>{now+=ms;for(const[key,timer]of [...timers])if(timer.at<=now){timers.delete(key);timer.fn()}};
 try{
  for(const delay of [NaN,Infinity,api.MAX_TIMER_DELAY_MS+1])results.push(outcome(()=>api.deadline(undefined,delay,'D')));
  for(const delay of [-1,0]){const upstream=new AbortController(),d=api.deadline(upstream.signal,delay,'D');assert.equal(d.signal,upstream.signal);assert.equal(timers.size,0);d[Symbol.dispose]();results.push(['no-timer',delay]);}
  const d=api.deadline(undefined,10,'D');assert.equal(d.signal.aborted,false);advance(10);assert.equal(d.signal.aborted,true);const reason=api.timeoutOf(d.signal,'D');assert.ok(reason instanceof api.TimeoutReason);assert.equal(api.timeoutOf(d.signal,'X'),undefined);results.push([reason.name,reason.message,reason.code,reason.timeoutMs]);d[Symbol.dispose]();
  const upstream=new AbortController(),race=api.deadline(upstream.signal,10,'D');upstream.abort('upstream');advance(10);assert.equal(race.signal.reason,'upstream');assert.equal(api.timeoutOf(race.signal),undefined);race[Symbol.dispose]();results.push('upstream-first');
  const canceled=api.deadline(undefined,10,'D');canceled[Symbol.dispose]();advance(10);assert.equal(canceled.signal.aborted,false);results.push('disposed-deadline');
  for(const delay of [0,-1,NaN,Infinity,api.MAX_TIMER_DELAY_MS+1])results.push(outcome(()=>api.idleWatchdog(undefined,delay,'I')));
  const idle=api.idleWatchdog(undefined,10,'I');idle.pulse();assert.equal(timers.size,0);let resolve;const pending=idle.next({next:()=>new Promise(r=>{resolve=r})});assert.equal(timers.size,1);const concurrent=await idle.next({next:async()=>({done:true,value:undefined})}).then(()=>null,e=>e.message);results.push(concurrent);advance(6);idle.pulse();advance(6);assert.equal(idle.signal.aborted,false);resolve({done:false,value:7});results.push(await pending);assert.equal(timers.size,0);advance(100);assert.equal(idle.signal.aborted,false);idle[Symbol.dispose]();idle[Symbol.dispose]();results.push(await idle.next({next:async()=>({done:true})}).then(()=>null,e=>e.message));
  const timed=api.idleWatchdog(undefined,10,'I');let finish;const demand=timed.next({next:()=>new Promise(r=>{finish=r})});advance(10);const idleReason=api.timeoutOf(timed.signal);results.push([idleReason.name,idleReason.message,idleReason.code,idleReason.timeoutMs]);finish({done:true,value:undefined});await demand;timed[Symbol.dispose]();assert.equal(timers.size,0);
  const failure=api.idleWatchdog(undefined,10,'I');const sentinel=new Error('sentinel');assert.equal(await failure.next({next:async()=>{throw sentinel}}).then(()=>null,e=>e),sentinel);assert.equal(timers.size,0);failure[Symbol.dispose]();results.push('iterator-error-cleanup');
 }finally{globalThis.setTimeout=nativeSet;globalThis.clearTimeout=nativeClear}
 return results;
}
const original=await timeoutCases(originalTimeout),actual=await timeoutCases(actualTimeout);assert.deepEqual(actual,original);

 for(const mode of ['original','candidate'])for(const[pkg,leaf]of [['crypto','uuid'],['timeout','timeout']]){
  const entry=mode==='original'?join(dir,pkg+'.mjs'):resolve(pkg==='crypto'?cryptoSdk:timeoutSdk,'index.mjs');
  const text=erase(readFileSync(join(fixture,leaf+'.spec.ts'),'utf8')).replace(/import \{([^}]+)\} from 'vitest';/,'const {$1}=globalThis.cryptoTimeoutTests;').replaceAll("'../src/index.ts'",JSON.stringify(pathToFileURL(entry).href)).replaceAll("'@deepseek-ai/dsh-timeout'",JSON.stringify(pathToFileURL(entry).href));
  writeFileSync(join(dir,mode+'-'+pkg+'.mjs'),text);
 }
 const run=mode=>{const result=spawnSync(process.execPath,[fileURLToPath(new URL('upstream.mjs',import.meta.url)),join(dir,mode+'-crypto.mjs'),join(dir,mode+'-timeout.mjs')],{encoding:'utf8',timeout:120000,maxBuffer:4194304});assert.equal(result.status,0,result.stdout+result.stderr);return JSON.parse(result.stdout)};
 const upstreamOriginal=run('original'),upstreamActual=run('candidate');assert.deepEqual(upstreamActual,upstreamOriginal);assert.equal(upstreamActual.groups.length,30);
 console.log('Crypto/timeout runtime: '+cryptoGroups+' crypto and '+actual.length+' timeout original-paired groups, 30 unchanged upstream tests, complete function/class descriptors and genuine cancellation/timer/disposal semantics; Node execution only.');
}finally{rmSync(dir,{recursive:true,force:true})}
