import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,mkdirSync,copyFileSync,rmSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const root=fileURLToPath(new URL('../../../../',import.meta.url));
const [mode,entry,cosmoEntry]=process.argv.slice(2);
if(mode==='case'){
 const {default:S}=await import(pathToFileURL(resolve(entry)));
 const {isVolatile}=await import(pathToFileURL(resolve(cosmoEntry)));
const groups=[];
const check=(id,f)=>{f();groups.push(id)};
check('real-default-static-prototype',()=>{assert.equal(typeof S,'function');assert.equal(S.name,'Schema');assert.equal(S.length,1);assert.equal(S.prototype instanceof Function,true);assert.equal(typeof S.ValidationError,'function');});
check('call-construct-identity',()=>{const s=S.string();assert.equal(s('abc'),'abc');assert.equal(Object.getPrototypeOf(new s('abc')),s.prototype);assert.equal(s instanceof S,true);assert.equal(s[Symbol.for('schemastery')],true);assert.equal(S.from(s),s);});
check('from-constructor-constant',()=>{assert.equal(S.from(String).type,'string');assert.equal(S.from(Number).type,'number');assert.equal(S.from(true)(true),true);assert.equal(S.from('x')('x'),'x');});
check('string-range-pattern-errors',()=>{const s=S.string().min(2).max(4).pattern(/^a/);assert.equal(s('abc'),'abc');assert.throws(()=>s('bcd'),S.ValidationError);assert.throws(()=>s('a'),S.ValidationError);});
check('number-default-range-step',()=>{assert.equal(S.number().default(4)(),4);assert.equal(S.number().min(0).max(10).step(2)(6),6);assert.throws(()=>S.number().step(2)(3),S.ValidationError);});
check('object-default-required-path',()=>{const s=S.object({a:S.string().required(),b:S.number().default(2)});assert.deepEqual(s({a:'ok'}),{a:'ok',b:2});const options={path:['root']};assert.throws(()=>s({},options),e=>e instanceof S.ValidationError && e.options.path.join('.')==='root.a');});
check('default-clone-isolation',()=>{const s=S.object({x:S.array(Number)}).default({x:[1]});const a=s();a.x.push(2);assert.deepEqual(s(),{x:[1]});});
check('array-tuple-dict',()=>{assert.deepEqual(S.array(Number)([1,2]),[1,2]);assert.deepEqual(S.tuple([String,Number])(['x',2]),['x',2]);assert.deepEqual(S.dict(Number)({a:1}),{a:1});});
check('union-intersect',()=>{assert.equal(S.union([String,Number])(2),2);assert.deepEqual(S.intersect([S.object({a:Number}),S.object({b:String})])({a:1,b:'x'}),{a:1,b:'x'});});
check('transform-adapted-default',()=>{assert.deepEqual(S.resolve(3,S.transform(Number,x=>x*2),{}),[6,6]);assert.deepEqual(S.resolve(3,S.transform(Number,x=>x*2,true),{}),[6]);S.extend('baseline-adapted-undefined',()=>[3]);S.extend('baseline-adapted-null',()=>[3,null]);const callback=x=>x===null?'null':x*10;assert.deepEqual(S.resolve(7,S.transform(S({type:'baseline-adapted-undefined'}),callback),{}),[30,70]);assert.deepEqual(S.resolve(7,S.transform(S({type:'baseline-adapted-null'}),callback),{}),[30,'null']);});
check('lazy-recursive',()=>{let s;s=S.lazy(()=>S.object({name:String,children:S.array(s).default([])}));assert.deepEqual(s({name:'a',children:[{name:'b'}]}),{name:'a',children:[{name:'b',children:[]}]});});
check('standard-schema-error-options',()=>{const s=S.object({a:S.string().required()});assert.deepEqual(s['~standard'].validate({a:'x'}),{value:{a:'x'}});const result=s['~standard'].validate({a:2});assert.equal(result.issues.length,1);assert.deepEqual(result.issues[0].path,['a']);});
check('validation-error-symbol-path',()=>{const options={path:['a',2,Symbol('x')]};const e=new S.ValidationError('bad',options);assert.equal(S.ValidationError.is(e),true);assert.equal(e.options,options);assert.equal(e.name,'ValidationError');assert.equal(e instanceof TypeError,true);assert.match(e.message,/a\[2\]/);});
check('formatting-meta-builders',()=>{assert.equal(S.array(String).toString(),'string[]');assert.equal(S.object({a:S.string().required()}).toString(),'{ a: string }');const s=S.number().role('slider',{x:1}).description('number').hidden();assert.equal(s.meta.role,'slider');assert.equal(s.meta.hidden,true);});
check('i18n-tree',()=>{const s=S.object({a:String}).i18n({ja:{$description:'外側',a:'内側'}});assert.equal(s.meta.description.ja,'外側');assert.equal(s.dict.a.meta.description.ja,'内側');});
check('simplify-object-default',()=>{const s=S.object({a:S.number().default(2),b:String});assert.deepEqual(s.simplify({a:2,b:'x'}),{b:'x'});});
check('serialize-shared-refs-roundtrip',()=>{const shared=S.string();const s=S.object({a:shared,b:shared});const serialized=JSON.parse(JSON.stringify(s));const restored=S(serialized);assert.equal(restored.dict.a,restored.dict.b);assert.deepEqual(restored({a:'x',b:'y'}),{a:'x',b:'y'});assert.equal(globalThis.__schemastery_refs__,undefined);});
check('serialized-callback-real-function',()=>{const s=S({type:'transform',inner:S.number(),callback:'x => x + 1'});assert.equal(s(4),5);assert.equal(typeof s.callback,'function');const broken=S({type:'transform',inner:S.number(),callback:'malformed )'});assert.equal(broken.callback,'malformed )');assert.throws(()=>broken(4));const serializable=S.transform(Number,x=>x+1);const restored=S(JSON.parse(JSON.stringify(serializable)));assert.equal(restored(4),5);const hidden=2;const closure=S.transform(Number,x=>x+hidden);assert.equal(closure(4),6);const restoredClosure=S(JSON.parse(JSON.stringify(closure)));assert.throws(()=>restoredClosure(4),e=>e instanceof ReferenceError && /hidden/.test(e.message));});
check('volatile-real-value-fixed-object-path',()=>{const s=S.object({a:S.number().volatile()});const result=s({a:2});assert.equal(isVolatile(result.a),true);assert.equal(result.a.get(),2);assert.throws(()=>S.array(S.number().volatile())([2]),S.ValidationError);});
check('autofix-ignore',()=>{const s=S.object({a:Number,b:String});const value={a:'bad',b:'ok'};assert.deepEqual(s(value,{autofix:true}),{b:'ok'});assert.equal(S.number()('ignored',{ignore:()=>true}),'ignored');});
check('date-regexp-binary',()=>{assert.equal(+S.date()('2020-01-01T00:00:00Z'),1577836800000);assert.equal(S.regExp('i')('abc').flags,'i');assert.deepEqual([...new Uint8Array(S.arrayBuffer('hex')('ff00'))],[255,0]);});
check('extend-real-resolver',()=>{S.extend('baseline-custom',(data,schema,options)=>[data+schema.meta.add,options]);const s=S({type:'baseline-custom',meta:{add:3}});assert.equal(s(4),7);});
check('primitive-factories-any-never-const-boolean',()=>{const value={a:1};assert.equal(S.any()(value),value);assert.equal(S.never()(null),null);assert.throws(()=>S.never()(1),S.ValidationError);assert.equal(S.const('x')('x'),'x');assert.throws(()=>S.const('x')('y'),S.ValidationError);assert.equal(S.boolean()(false),false);assert.throws(()=>S.boolean()(0),S.ValidationError);});
check('natural-percent-bitset',()=>{assert.equal(S.natural()(2),2);assert.throws(()=>S.natural()(-1),S.ValidationError);assert.throws(()=>S.natural()(0.5),S.ValidationError);assert.equal(S.percent()(0.5),0.5);assert.throws(()=>S.percent()(2),S.ValidationError);assert.equal(S.bitset({a:1,b:2})(['a','b']),3);assert.equal(S.bitset({a:1})(1),1);assert.equal(S.bitset({a:1})(['b']),0);});
check('function-and-instance-classifiers',()=>{const f=x=>x+1;assert.equal(S.function()(f),f);assert.throws(()=>S.function()(1),S.ValidationError);class Item{}const value=new Item;assert.equal(S.is(Item)(value),value);assert.equal(S.is('Item')(value),value);assert.throws(()=>S.is(Item)({}),S.ValidationError);});
check('remaining-metadata-and-mutable-builders',()=>{const s=S.string().required(false).hidden(false).loose(false).link('url').comment('c').disabled().collapse().deprecated().experimental().extra('max',4);assert.equal(s.meta.link,'url');assert.equal(s.meta.comment,'c');assert.equal(s.meta.disabled,true);assert.equal(s.meta.collapse,true);assert.equal(s.meta.badges.length,2);assert.equal(s.meta.max,4);const o=S.object({a:String});assert.equal(o.set('b',S.number()),o);assert.deepEqual(o({a:'x',b:1}),{a:'x',b:1});const tuple=S.tuple([String]);assert.equal(tuple.push(S.number()),tuple);assert.deepEqual(tuple(['x',1]),['x',1]);});
const restoredDate=S(JSON.parse(JSON.stringify(S.date())))('2020-01-01T00:00:00Z').toISOString();
assert.equal(restoredDate,'2020-01-01T00:00:00.000Z');
const surface=object=>Reflect.ownKeys(object).map(key=>{
 const d=Object.getOwnPropertyDescriptor(object,key);
 return {key:typeof key==='symbol'?String(key):key,enumerable:d.enumerable,configurable:d.configurable,
  writable:d.writable,valueType:typeof d.value,
  ...(typeof d.value==='function'?{name:d.value.name,length:d.value.length}:{}),
  get:typeof d.get,set:typeof d.set};
});
console.log(JSON.stringify({groups,restoredDate,staticSurface:surface(S),prototypeSurface:surface(S.prototype)}));
}else{
 const [runtimeDir,compiler]=process.argv.slice(2),ts=(await import(pathToFileURL(resolve(compiler)))).default;
 assert.equal(ts.version,'6.0.3');
 const schema=join(root,'test/fixtures/schemastery-declarations'),cosmo=join(root,'test/fixtures/cosmokit-package');
 const provenance=JSON.parse(readFileSync(join(schema,'provenance.json'),'utf8'));
 for(const [file,hash] of Object.entries(provenance.fixtures))assert.equal(createHash('sha256').update(readFileSync(join(schema,file))).digest('hex'),hash);
 const cp=JSON.parse(readFileSync(join(cosmo,'provenance.json'),'utf8'));
 const dir=mkdtempSync(join(tmpdir(),'mithril-schema-sdk-oracle-'));
 try{
  const pkg=join(dir,'node_modules/@deepseek-ai/cosmokit');mkdirSync(pkg,{recursive:true});
  for(const [file,hash] of Object.entries(cp.emitted_javascript_sha256)){
   assert.equal(createHash('sha256').update(readFileSync(join(cosmo,file))).digest('hex'),hash);copyFileSync(join(cosmo,file),join(pkg,file));
  }
  writeFileSync(join(pkg,'package.json'),JSON.stringify({type:'module',exports:'./index.js'}));
  const original=join(dir,'original.mjs');
  const emitted=ts.transpileModule(readFileSync(join(schema,'original-index.ts'),'utf8'),{fileName:'index.ts',compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext},reportDiagnostics:true});
  assert.deepEqual(emitted.diagnostics,[]);writeFileSync(original,emitted.outputText);
  const metadata=JSON.parse(readFileSync(runtimeDir+'.json','utf8'));
  assert.deepEqual(metadata.exports,['default']);
  const module=metadata['module-files'].cosmokit;assert(module,'own CosmoKit module');
  function run(label,source,dependency){
   const r=spawnSync(process.execPath,[fileURLToPath(import.meta.url),'case',source,dependency],{encoding:'utf8',timeout:30000});
   assert.equal(r.status,0,label+': '+r.stdout+r.stderr);return JSON.parse(r.stdout);
  }
  const expected=run('original',original,join(pkg,'index.js'));
  const actual=run('candidate',join(runtimeDir,'index.mjs'),join(runtimeDir,module));
  assert.deepEqual(actual,expected);assert.equal(actual.groups.length,26);
  console.log('Schema SDK: paired original/candidate 26 runtime groups and serialized Date; real default value and own CosmoKit dependency closure. Both targets execute under Node; whole-Harness/browser parity remains unverified.');
 }finally{rmSync(dir,{recursive:true,force:true});}
}
