import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import * as reference from './reference.mjs';
const dir=process.argv[2],fixture=new URL('./',import.meta.url);
const original=readFileSync(new URL('original-events.mjs',fixture),'utf8'),provenance=JSON.parse(readFileSync(new URL('provenance.json',fixture),'utf8'));
assert.equal(createHash('sha256').update(original).digest('hex'),provenance.original_program_emit_sha256);
const start=original.indexOf('    on(name, listener, options) {'),body=original.slice(start,original.indexOf('\n    }',start)+6);
assert.ok(readFileSync(new URL('reference.mjs',fixture),'utf8').includes(body));
let groups=0;
async function run(m){
 const trace=[],check=async(name,f)=>{await f();trace.push(name);};
 await check('default closure observes actual assigned parameter',()=>{const [v,r,read,write]=m.closure(1);assert.deepEqual([v,r],[2,2]);assert.equal(write(13),13);assert.equal(read(),13);});
 await check('native arguments length independent of reassignment',()=>{assert.equal(m.closure()[4],0);assert.equal(m.closure(1)[4],1);assert.equal(m.closure(1,undefined,undefined,4)[4],4);});
 await check('supplied closures preserve call identity',()=>{const read=()=>29,write=v=>v;const out=m.closure(1,read,write);assert.deepEqual(out.slice(0,2),[2,29]);assert.equal(out[2],read);assert.equal(out[3],write);});
 await check('default parameter assignment order',()=>{assert.deepEqual(m.defaultWrite(),[3,3]);assert.deepEqual(m.defaultWrite(8),[3,3]);assert.deepEqual(m.defaultWrite(8,9),[8,9]);assert.deepEqual(m.defaultWrite(undefined,9),[1,9]);});
 await check('native parameter self TDZ',()=>{assert.throws(()=>m.tdz(),e=>e instanceof ReferenceError);assert.equal(m.tdz(4),4);});
 await check('body shadow separate from default scope',()=>assert.deepEqual(m.shadow(3),[9,3]));
 await check('arrow pattern mutable native bindings',()=>assert.deepEqual(m.arrowPattern([2,3]),[3,7]));
 await check('arrow defaults capture native binding',()=>assert.equal(m.arrowDefault(),4));
 await check('async own await writes after resume',async()=>{let release;const pending=new Promise(r=>release=r),task=m.asyncSet(pending);release(7);assert.equal(await task,7);const thrown={async:true};await assert.rejects(m.asyncSet(Promise.reject(thrown)),e=>e===thrown);});
 await check('generator own yield assignment',()=>{const g=m.generatorSet(2);assert.deepEqual(g.next(),{value:2,done:false});assert.deepEqual(g.next(8),{value:8,done:true});const h=m.generatorSet(3),thrown={gen:true};h.next();assert.throws(()=>h.throw(thrown),e=>e===thrown);});
 await check('async generator await and resume binding',async()=>{const g=m.asyncGeneratorSet(Promise.resolve(4));assert.deepEqual(await g.next(),{value:4,done:false});assert.deepEqual(await g.next(9),{value:9,done:true});});
 await check('constructor default closure shares parameter',()=>{const b=new m.Box(2);assert.equal(b.value,5);assert.equal(b.read(),5);assert.deepEqual(b.update(1),[6,6]);});
 await check('genuine object method parameter assignment',()=>{assert.deepEqual(m.object.update(2),[8,8]);assert.throws(()=>new m.object.update(1),e=>e instanceof TypeError);});
 await check('module function parameter assignment',()=>assert.deepEqual(m.moduleWrite(2),[11,11]));
 await check('function shapes retained',()=>{for(const [n,length] of [['closure',1],['defaultWrite',0],['tdz',0],['shadow',1],['moduleWrite',1]]){assert.equal(m[n].name,n);assert.equal(m[n].length,length);}assert.equal(m.EventsOnFixture.prototype.on.length,3);});
 function event(options,bailResult,stage){
  const effects=[],thrown={event:true},listener=()=>{},bound=()=>{},hooks=Object.create(null),ctx={fiber:{assertActive(){effects.push('active');if(stage==='active')throw thrown;}},reflect:{bind(v){assert.equal(v,listener);effects.push('bind');if(stage==='bind')throw thrown;return bound;}}};
  const e=new m.EventsOnFixture(ctx,hooks);e.bail=function(c,label,name,cb,o){assert.equal(this,e);assert.equal(c,ctx);assert.equal(label,'internal/listener');assert.equal(name,'hello');assert.equal(cb,bound);effects.push(['bail',o]);if(stage==='bail')throw thrown;return bailResult;};
  e.register=function(label,list,cb,o){assert.equal(this,e);assert.equal(label,'ctx.on("hello")');assert.equal(list,hooks.hello);assert.equal(cb,bound);effects.push(['register',o]);if(stage==='register')throw thrown;return 'dispose';};
  if(stage)assert.throws(()=>e.on('hello',listener,options),x=>x===thrown);
  else assert.equal(e.on('hello',listener,options),bailResult||'dispose');
  return {effects,hooks};
 }
 await check('original on parameter normalization and bound replacement',()=>{for(const o of [undefined,true,false,0,'x',()=>{},null,{prepend:true}]){const r=event(o);const actual=r.effects[2][1];if(typeof o==='object')assert.equal(actual,o);else assert.deepEqual(actual,{prepend:o});assert.equal(r.effects[3][1],actual);assert.equal(r.hooks.hello.length,0);}});
 await check('original on early bail skips registration',()=>{const result={bail:true},r=event(false,result);assert.deepEqual(Object.keys(r.hooks),[]);assert.equal(r.effects.length,3);});
 await check('original on exact stage thrown identity',()=>{for(const stage of ['active','bind','bail','register'])event(true,undefined,stage);});
 await check('original on symbol name and existing hook reference',()=>{const key=Symbol('key'),hooks={[key]:[]},ctx={fiber:{assertActive(){}},reflect:{bind:v=>v}},e=new m.EventsOnFixture(ctx,hooks);e.bail=()=>undefined;e.register=(label,list)=>{assert.equal(label,'ctx.on(Symbol(key))');assert.equal(list,hooks[key]);return list;};assert.equal(e.on(key,()=>{},{}),hooks[key]);});
 return trace;
}
for(const target of ['js','js-browser']){
 for(const profile of ['factory','native-esm']){
  const m=profile==='factory'?(await import(pathToFileURL(join(dir,target+'.mjs')))).instantiateMithrilNative({JSON}):await import(pathToFileURL(join(dir,target+'-esm','index.mjs')));
  const actual=await run(m),expected=await run(reference);assert.deepEqual(actual,expected);groups+=actual.length;
  console.log(`Mutable native parameters actual ${target} ${profile} CLI: ${actual.length} paired groups; defaults/TDZ/closures/coroutines/methods/complete original Events.on body.`);
 }
}
assert.equal(groups,76);
console.log('Mutable native parameters: 76 paired groups; original on body only, not complete Events/core/browser lifecycle.');
