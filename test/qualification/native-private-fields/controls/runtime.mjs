import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {format} from 'node:util';
if(process.argv[2]==='case'){
 const tests=[];let suite='';
 function it(name,body){tests.push({name:suite+'/'+name,body})}
 it.each=rows=>(name,body)=>{for(const row of rows){const args=Array.isArray(row)?row:[row];it(format(name,...args),()=>body(...args))}};
 const expect=value=>{
  const methods={
   toBe:x=>assert.equal(value,x),toEqual:x=>assert.deepEqual(value,x),toStrictEqual:x=>assert.deepEqual(value,x),
   toBeUndefined:()=>assert.equal(value,undefined),toBeNull:()=>assert.equal(value,null),toContain:x=>assert.ok(value.includes(x)),
   toBeGreaterThan:x=>assert.ok(value>x),toBeGreaterThanOrEqual:x=>assert.ok(value>=x),toBeLessThan:x=>assert.ok(value<x),
   toThrow:x=>assert.throws(value,error=>x instanceof RegExp?x.test(error.message):typeof x==='string'?error.message.includes(x):typeof x==='function'?error instanceof x:x instanceof Error?error===x:true),
   toHaveBeenCalled:()=>assert.ok(value.mock.calls.length),toHaveBeenCalledTimes:x=>assert.equal(value.mock.calls.length,x),
   toHaveBeenCalledExactlyOnceWith:(...xs)=>{assert.equal(value.mock.calls.length,1);assert.deepEqual(value.mock.calls[0],xs)},
   toHaveBeenLastCalledWith:(...xs)=>assert.deepEqual(value.mock.calls.at(-1),xs),
  };
  methods.not={toBe:x=>assert.notEqual(value,x),toEqual:x=>assert.notDeepEqual(value,x),toThrow:()=>assert.doesNotThrow(value),toHaveBeenCalled:()=>assert.equal(value.mock.calls.length,0)};
  return methods;
 };
 globalThis.valuesTest={describe(name,body){const prior=suite;suite+='/'+name;body();suite=prior},it,expect,vi:{spyOn(object,key){const descriptor=Object.getOwnPropertyDescriptor(object,key),original=object[key];function spy(...args){spy.mock.calls.push(args);return original.apply(this,args)}spy.mock={calls:[]};spy.mockRestore=()=>Object.defineProperty(object,key,descriptor);Object.defineProperty(object,key,{...descriptor,value:spy});return spy}}};
 await import(pathToFileURL(resolve(process.argv[3])));await import(pathToFileURL(resolve(process.argv[4])));
 const groups=[];for(const test of tests){try{await test.body()}catch(error){throw new Error(test.name,{cause:error})}groups.push(test.name)}
 const api=await import(pathToFileURL(resolve(process.argv[5])));
 const shape=object=>Reflect.ownKeys(object).filter(k=>k!=='prototype').map(key=>{const d=Object.getOwnPropertyDescriptor(object,key);return{key:typeof key==='symbol'?String(key):key,enumerable:d.enumerable,configurable:d.configurable,writable:d.writable,value:typeof d.value==='function'?{name:d.value.name,length:d.value.length}:typeof d.value,get:d.get&&{name:d.get.name,length:d.get.length},set:d.set&&{name:d.set.name,length:d.set.length}}});
 console.log(JSON.stringify({groups,surface:Object.keys(api).sort().map(name=>({name,shape:shape(api[name]),prototype:api[name].prototype?shape(api[name].prototype):null}))}));
}else{
 const [candidate,compiler]=process.argv.slice(2),repo=fileURLToPath(new URL('../../../../',import.meta.url)),fixture=join(repo,'test/fixtures/values-core');
 const proof=JSON.parse(readFileSync(join(fixture,'provenance.json'),'utf8'));
 for(const[file,sha]of Object.entries(proof.fixtures)){const bytes=readFileSync(join(fixture,file));assert.equal(createHash('sha256').update(bytes).digest('hex'),sha);if(proof.originalGitBlobs[file])assert.equal(createHash('sha1').update(Buffer.from('blob '+bytes.length+'\0')).update(bytes).digest('hex'),proof.originalGitBlobs[file])}
 for(const[file,sha]of Object.entries(proof.mithrilSources))assert.equal(createHash('sha256').update(readFileSync(join(repo,'examples',file))).digest('hex'),sha);
 const dir=mkdtempSync(join(tmpdir(),'mithril-values-oracle-'));
 try{
  const ts=(await import(pathToFileURL(resolve(compiler)))).default;assert.equal(ts.version,'6.0.3');
  const erase=(text,file)=>ts.transpileModule(text,{fileName:file,compilerOptions:{target:ts.ScriptTarget.ES2024,module:ts.ModuleKind.ESNext}}).outputText;
  for(const leaf of ['index','partial-json'])writeFileSync(join(dir,leaf+'.mjs'),erase(readFileSync(join(fixture,'original-'+leaf+'.ts'),'utf8'),leaf+'.ts').replaceAll("'./index.ts'","'./index.mjs'").replaceAll("'./partial-json.ts'","'./partial-json.mjs'"));
  for(const mode of ['original','candidate']){
   const entry=mode==='original'?join(dir,'index.mjs'):join(resolve(candidate),'index.mjs');
   for(const leaf of ['partial-json','weak-map-with-values'])writeFileSync(join(dir,mode+'-'+leaf+'.mjs'),erase(readFileSync(join(fixture,leaf+'.spec.ts'),'utf8'),leaf+'.spec.ts').replace(/import \{([^}]+)\} from 'vitest';/,'const {$1}=globalThis.valuesTest;').replaceAll("'../src/index.ts'",JSON.stringify(pathToFileURL(entry).href)));
  }
  const run=mode=>{const result=spawnSync(process.execPath,[fileURLToPath(import.meta.url),'case',join(dir,mode+'-partial-json.mjs'),join(dir,mode+'-weak-map-with-values.mjs'),mode==='original'?join(dir,'index.mjs'):join(resolve(candidate),'index.mjs')],{encoding:'utf8',timeout:120000,maxBuffer:4194304});assert.equal(result.status,0,result.stdout+result.stderr);return JSON.parse(result.stdout)};
  const original=run('original'),actual=run('candidate');assert.deepEqual(actual,original);
  console.log('Values core runtime: '+actual.groups.length+' unchanged upstream groups paired against the complete two-file own runtime cycle and all seven original exports; Node execution only.');
 }finally{rmSync(dir,{recursive:true,force:true})}
}
