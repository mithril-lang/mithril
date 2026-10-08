import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {instantiate as reference} from './core-prerequisites/reference.mjs';
const provenance=JSON.parse(fs.readFileSync(new URL('./core-prerequisites/provenance.json',import.meta.url),'utf8'));
for(const [file,sha] of Object.entries(provenance.hashes))assert.equal(createHash('sha256').update(fs.readFileSync(new URL('./core-prerequisites/'+file,import.meta.url))).digest('hex'),sha);
const originalFiber=fs.readFileSync(new URL('./core-prerequisites/original-fiber.mjs',import.meta.url),'utf8');
const originalDispose=/function runDisposable\(dispose\) \{([\s\S]*?)\n\}/.exec(originalFiber)[1];
const originalName=/get name\(\) \{([\s\S]*?)\n    \}/.exec(originalFiber)[1];
const normalizeBody=s=>s.replace(/\s+/g,'');
const shapeReference=reference({});
assert.equal(normalizeBody(shapeReference.runDisposable.toString().split('{')[1].slice(0,-1)),normalizeBody(originalDispose.replaceAll('effectInertia','inertia')));
const fixtureGetter=Object.getOwnPropertyDescriptor(shapeReference.FiberNameFixture.prototype,'name').get.toString();
assert.equal(normalizeBody(fixtureGetter.slice(fixtureGetter.indexOf('{')+1,-1)),normalizeBody(originalName));
const directory=process.argv[2];let groups=0;
const group=async f=>{await f();groups++};
const observe=f=>{try{return{value:f()}}catch(e){return{error:e.name}}};
const descriptor=f=>[f.name,f.length,Reflect.ownKeys(f).map(String),Object.getOwnPropertyDescriptor(f,'prototype')?.writable];
function grants(log){return {
 callee:()=>{log.push('callee');return function(...args){log.push(['call',this===undefined,args]);return args}},
 arg:name=>{log.push(['arg',name]);return name},
 spread:name=>{log.push(['spread',name]);let i=0;return{[Symbol.iterator](){log.push(['iterator',name]);return{next(){log.push(['next',name,i]);return i<2?{value:name+(i++),done:false}:{done:true}},return(){log.push(['close',name]);return{done:true}}}}}},
 body:()=>{log.push('body');return undefined},condition:()=>{log.push('condition');return false},result:()=>{log.push('result');return 'result'},
 record:x=>log.push(x),object:()=>({}),key:()=> 'callback',iterator:[],
};}
async function runPair(build,method,configure=()=>{}){
 const results=[];for(const make of [reference,build]){const log=[],g=grants(log);configure(g,log);const api=make(g);results.push({result:observe(()=>api[method]()),log})}assert.deepEqual(results[1],results[0]);return results[1];
}
for(const target of ['js','js-browser']){
 const {instantiateMithrilNative:build}=await import(pathToFileURL(path.join(directory,target+'.mjs')));const start=groups;
 await group(()=>{const a=build(grants([])),b=reference(grants([]));assert.deepEqual(Object.keys(a),Object.keys(b));for(const name of Object.keys(a))assert.deepEqual(descriptor(a[name]),descriptor(b[name]));assert.deepEqual(descriptor(Object.getOwnPropertyDescriptor(a.FiberNameFixture.prototype,'name').get),descriptor(Object.getOwnPropertyDescriptor(b.FiberNameFixture.prototype,'name').get))});
 await group(async()=>{const r=await runPair(build,'callSpread');assert.deepEqual(r.result.value,['first','one0','one1','middle','two0','two1','last']);assert.deepEqual(r.log.at(-1),['call',true,r.result.value])});
 await group(async()=>{for(const method of ['optional','optionalSpread','optionalPropertyValue'])for(const value of [null,undefined]){const r=await runPair(build,method,(g,log)=>{g.callee=()=>{log.push('callee');return value};g.object=()=>{log.push('object');return{get callback(){log.push('get');return value}}};g.key=()=>{log.push('key');return 'callback'}});assert.equal(r.result.value,undefined);assert.equal(r.log.some(x=>Array.isArray(x)&&['arg','spread'].includes(x[0])),false)}});
 await group(async()=>{for(const value of [false,0,'',{},Symbol('callee')])for(const method of ['callSpread','optional','optionalSpread']){const r=await runPair(build,method,(g,log)=>{g.callee=()=>{log.push('callee');return value}});assert.equal(r.result.error,'TypeError');assert.equal(r.log.some(x=>Array.isArray(x)&&x[0]==='arg'),true)}});
 await group(async()=>{const r=await runPair(build,'optionalPropertyValue',(g,log)=>{g.object=()=>{log.push('object');return{get callback(){log.push('get');return function(x){log.push(['call',this===undefined,x]);return x}}}};g.key=()=>{log.push('key');return 'callback'}});assert.deepEqual(r.log,['object','key','get',['arg','first'],['call',true,'first']])});
 await group(async()=>{for(const method of ['optionalPropertyValue'])for(const value of [null,undefined]){const r=await runPair(build,method,(g,log)=>{g.object=()=>{log.push('object');return value}});assert.equal(r.result.error,'TypeError');assert.equal(r.log.some(x=>Array.isArray(x)&&x[0]==='arg'),false)}});
 await group(async()=>{for(const stage of ['callee','first','one','iterator','next','middle','two','last'])for(const make of [reference,build]){const log=[],g=grants(log),error={stage};const savedArg=g.arg,savedSpread=g.spread;g.callee=stage==='callee'?()=>{throw error}:g.callee;g.arg=x=>{if(x===stage)throw error;return savedArg(x)};g.spread=x=>{if(x===stage)throw error;if(x==='one'&&['iterator','next'].includes(stage))return{[Symbol.iterator](){if(stage==='iterator')throw error;return{next(){throw error}}}};return savedSpread(x)};assert.throws(()=>make(g).callSpread(),e=>e===error)}});
 await group(async()=>{
  for(const method of ['callSpread','optionalSpread'])for(const stage of ['iterator','next','done','value']){
   const r=await runPair(build,method,(g,log)=>{
    g.spread=name=>{
     log.push(['spread',name]);
     return {[Symbol.iterator](){
      log.push('iterator');if(stage==='iterator')throw Error('iterator');
      return {
       next(){
        log.push('next');if(stage==='next')throw Error('next');
        return {
         get done(){log.push('done');if(stage==='done')throw Error('done');return false},
         get value(){log.push('value');throw Error('value')}
        };
       },
       return(){log.push('close');return {done:true}}
      };
     }};
    };
   });
   assert.equal(r.result.error,'Error');assert.equal(r.log.includes('close'),false);
  }
 });
 await group(async()=>{for(const value of [null,undefined,3,{},false]){const r=await runPair(build,'callSpread',(g,log)=>{g.spread=()=>{log.push('spread');return value}});assert.equal(r.result.error,'TypeError')}});
 await group(async()=>{for(const make of [reference,build]){const log=[],g=grants(log),error={};g.callee=()=>function(){throw error};assert.throws(()=>make(g).callSpread(),e=>e===error);g.callee=()=>new Proxy(function(){},{apply(t,receiver,args){assert.equal(receiver,undefined);assert.equal(args.length,7);return 42}});assert.equal(make(g).optionalSpread(),42)}});
 await group(async()=>{for(const method of ['doLoop','expressionLoop']){const r=await runPair(build,method);assert.deepEqual(r.log,['body','condition','result']);assert.equal(r.result.value,'result')}});
 await group(async()=>{for(const method of ['doLoop','expressionLoop']){const r=await runPair(build,method,(g,log)=>{let i=0;g.condition=()=>{log.push(['condition',i]);return i++<2}});assert.equal(r.log.filter(x=>x==='body').length,3)}});
 await group(async()=>{for(const tokens of [['continue','break'],['return'],['break'],['continue',null,'break']]){const r=await runPair(build,'finallyLoop',(g,log)=>{let i=0;g.body=()=>{log.push(['body',i]);return tokens[i++]};g.condition=()=>{log.push('condition');return true}});assert.equal(r.log.filter(x=>x==='finally').length,tokens.length);assert.equal(r.log.filter(x=>x==='condition').length,tokens.length-1);assert.equal(r.result.value,tokens.at(-1)==='return'?'return':'result')}});
 await group(async()=>{const r=await runPair(build,'returnLoop',(g,log)=>{g.body=()=>{log.push('body');return 42}});assert.deepEqual(r,{result:{value:42},log:['body']})});
 await group(async()=>{
  const r=await runPair(build,'outerClose',(g,log)=>{
   g.iterator={
    [Symbol.iterator](){
     log.push('iterator');
     return {
      next(){log.push('next');return {value:9,done:false}},
      return(){log.push('close');return {done:true}}
     };
    }
   };
  });
  assert.deepEqual(r,{result:{value:9},log:['iterator','next','close']});
 });
 await group(async()=>{for(const method of ['doLoop','finallyLoop'])for(const stage of ['body','condition','result','finally']){const values=[];for(const make of [reference,build]){const log=[],g=grants(log),error={};g.record=x=>{log.push(x);if(stage==='finally')throw error};const saved=g[stage];if(saved)g[stage]=()=>{log.push(stage);throw error};try{make(g)[method]();values.push({log,thrown:false})}catch(e){assert.equal(e,error);values.push({log,thrown:true})}}assert.deepEqual(values[1],values[0])}});
 await group(async()=>{for(const value of [null,3,{},Symbol('v'),{[Symbol.toPrimitive](){throw Error('must not coerce')}}]){const r=await runPair(build,'voidCall',(g,log)=>{g.body=()=>{log.push('body');return value}});assert.equal(r.result.value,undefined);assert.deepEqual(r.log,['body'])}});
 await group(async()=>{for(const make of [reference,build]){const log=[],g=grants(log),error={};g.body=()=>{throw error};assert.throws(()=>make(g).voidCall(),e=>e===error);let settled=false;g.body=()=>new Promise(()=>{settled=true});assert.equal(make(g).voidCall(),undefined);assert.equal(settled,true)}});
 await group(async()=>{for(const make of [reference,build]){const g=grants([]),error={};for(const value of [undefined,null,0,false,'',Promise.resolve(42)]){let calls=0,checks=0;const dispose=()=>{calls++;return 9};const inertia=new WeakMap([[dispose,()=>{checks++;return value}]]);const result=make(g).runDisposable(dispose,inertia);assert.equal(result,value??9);assert.equal(calls,1);assert.equal(checks,1)}const dispose=()=>9;const map=new WeakMap([[dispose,undefined]]);assert.equal(make(g).runDisposable(dispose,map),9);map.set(dispose,()=>{throw error});assert.throws(()=>make(g).runDisposable(dispose,map),e=>e===error);let receiver='unset';map.set(dispose,function(){receiver=this;return 0});assert.equal(make(g).runDisposable(dispose,map),0);assert.equal(receiver,undefined)}});
 await group(async()=>{const values=[];for(const make of [reference,build]){const log=[],api=make(grants(log)),proto=api.FiberNameFixture.prototype;const root=Object.create(proto);root.parent={fiber:root};const child=Object.create(proto);child.parent={fiber:root};root.runtime={get name(){log.push('rootName');return ''}};child.runtime={get name(){log.push('childName');return 'named'}};assert.equal(child.name,'named');assert.deepEqual(log,['childName','childName']);child.runtime=undefined;root.runtime={name:'parent'};assert.equal(child.name,'root');const middle=Object.create(proto);middle.parent={fiber:root};middle.runtime={name:'parent'};child.parent={fiber:middle};assert.equal(child.name,'parent');middle.runtime=undefined;root.runtime=undefined;assert.equal(child.name,'root');values.push(log)}assert.deepEqual(values[1],values[0])});
 await group(async()=>{for(const make of [reference,build]){const log=[],g=grants(log),api=make(g),proto=api.FiberNameFixture.prototype,root=Object.create(proto);root.parent={fiber:root};let reads=0;Object.defineProperty(root,'runtime',{get(){reads++;return undefined}});assert.equal(root.name,'root');assert.equal(reads,1);const error={};Object.defineProperty(root.parent,'fiber',{get(){throw error}});assert.throws(()=>root.name,e=>e===error)}});
 await group(async()=>{const values=[];for(const make of [reference,build]){const log=[],g=grants(log);let i=0;g.body=()=>{log.push('body');return Promise.resolve().then(()=>log.push('body-done'))};g.condition=()=>{log.push('condition');return Promise.resolve(i++<1)};g.result=()=>{log.push('result');return Promise.resolve(7)};const promise=make(g).asyncLoop();assert.deepEqual(log,['body']);const value=await promise;values.push({log,value})}assert.deepEqual(values[1],values[0]);assert.equal(values[1].value,7)});
 await group(async()=>{for(const make of [reference,build])for(const stage of ['body','condition','result']){const log=[],g=grants(log),error={};g[stage]=()=>Promise.reject(error);await assert.rejects(make(g).asyncLoop(),e=>e===error)}});
 await group(async()=>{const values=[];for(const make of [reference,build]){const log=[],g=grants(log);g.body=()=>{log.push('body');return 'B'};g.condition=()=>{log.push('condition');return 'C'};g.result=()=>{log.push('result');return 'R'};const gen=make(g).generatorLoop();assert.deepEqual(log,[]);const steps=[gen.next(),gen.next('bodyResume'),gen.next(true),gen.next(),gen.next(false),gen.next('final')];values.push({log,steps})}assert.deepEqual(values[1],values[0]);assert.deepEqual(values[1].steps.at(-1),{value:'final',done:true})});
 await group(async()=>{for(const make of [reference,build]){const log=[],g=grants(log),error={},gen=make(g).generatorLoop();gen.next();assert.throws(()=>gen.throw(error),e=>e===error);assert.deepEqual(log,['body']);const second=make(g).generatorLoop();second.next();assert.deepEqual(second.return(9),{value:9,done:true});assert.equal(log.includes('condition'),false)}});
 await group(async()=>{for(const value of [null,undefined])for(const make of [reference,build]){const log=[],g=grants(log);g.callee=()=>{log.push('callee');return Promise.resolve(value)};assert.equal(await make(g).asyncOptionalSpread(),undefined);assert.deepEqual(log,['callee'])}});
 await group(async()=>{const values=[];for(const make of [reference,build]){const log=[],g=grants(log);g.callee=()=>{log.push('callee');return Promise.resolve(function(...args){log.push(['call',this===undefined]);return args})};g.arg=()=>{log.push('arg');return Promise.resolve(1)};g.spread=()=>{log.push('spread');return Promise.resolve([2,3])};values.push({value:await make(g).asyncOptionalSpread(),log})}assert.deepEqual(values[1],values[0]);assert.deepEqual(values[1].value,[1,2,3])});
 await group(async()=>{for(const make of [reference,build])for(const stage of ['callee','arg','spread']){const g=grants([]),error={};g[stage]=()=>Promise.reject(error);await assert.rejects(make(g).asyncOptionalSpread(),e=>e===error)}});
 await group(async()=>{for(const make of [reference,build]){const log=[],g=grants(log),gen=make(g).yieldOptionalSpread();assert.deepEqual(log,[]);const fn=gen.next().value;assert.equal(typeof fn,'function');assert.deepEqual(gen.next(null),{value:undefined,done:true});assert.deepEqual(log,['callee']);const second=make(g).yieldOptionalSpread();second.next();assert.deepEqual(second.next((...args)=>args),{value:'first',done:false});assert.equal(typeof second.next(1).value[Symbol.iterator],'function');assert.deepEqual(second.next([2,3]),{value:[1,2,3],done:true})}});
 await group(async()=>{
  for(const make of [reference,build])for(const method of ['callSpread','optional','optionalSpread','optionalPropertyValue','doLoop','voidCall']){
   const log=[],g=grants(log);
   for(const name of ['callee','arg','spread','object','key','body','condition','result']){
    const original=g[name];
    g[name]=function(...args){assert.equal(this,undefined,name+' grant receiver');return original(...args)};
   }
   make(g)[method]();
  }
 });
 await group(async()=>{
  const values=[];
  for(const make of [reference,build]){
   const log=[],g=grants(log);let i=0;
   g.body=()=>{log.push('body');return Promise.resolve(i)};
   g.condition=()=>{log.push('condition');return Promise.resolve(i++<1)};
   g.result=()=>{log.push('result');return Promise.resolve(7)};
   const gen=make(g).asyncGeneratorLoop(),a=gen.next(),b=gen.next(),c=gen.next();
   values.push({steps:await Promise.all([a,b,c]),log});
  }
  assert.deepEqual(values[1],values[0]);assert.deepEqual(values[1].steps,[{value:0,done:false},{value:1,done:false},{value:7,done:true}]);
 });
 await group(async()=>{
  for(const make of [reference,build]){
   const log=[],g=grants(log);let finish;
   g.body=()=>{log.push('body');return new Promise(resolve=>finish=resolve)};
   const gen=make(g).asyncGeneratorLoop(),pending=gen.next(),closing=gen.return(9);
   assert.deepEqual(log,['body']);finish(4);
   assert.deepEqual(await pending,{value:4,done:false});assert.deepEqual(await closing,{value:9,done:true});assert.deepEqual(log,['body']);
   g.body=()=>Promise.resolve(1);const error={},second=make(g).asyncGeneratorLoop();await second.next();await assert.rejects(second.throw(error),e=>e===error);assert.equal(log.includes('condition'),false);
  }
 });
 console.log(`Core native prerequisites actual ${target} CLI: ${groups-start} paired runtime groups; native spread/optional value calls, do/while/void, coroutine contexts and extracted Fiber bodies passed.`);
}
assert.equal(groups,64);
console.log('Core native prerequisites: 64 paired runtime groups; extracted getter/disposal bodies only, not whole core SCC/browser/native/Q9 integration.');
