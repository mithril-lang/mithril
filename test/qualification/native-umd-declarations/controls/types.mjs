import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const [single,program,runtime,compiler]=process.argv.slice(2),ts=(await import(pathToFileURL(resolve(compiler)))).default;
assert.equal(ts.version,'6.0.3');
const fixture=fileURLToPath(new URL('../../../fixtures/umd-declarations/index.d.mts',import.meta.url));
const provenance=JSON.parse(readFileSync(new URL('../../../fixtures/umd-declarations/provenance.json',import.meta.url),'utf8'));
assert.equal(createHash('sha256').update(readFileSync(fixture)).digest('hex'),provenance.fixtures['index.d.mts']);
const cases=[
 ['script values','const n:number=jsyaml.bump();const c:number=jsyaml.count;',false,false,[]],
 ['script types','const x:jsyaml.Options={label:"x"};',false,false,[]],
 ['module gated','export {};const n:number=jsyaml.bump();',true,false,[2686]],
 ['module enabled','export {};const n:number=jsyaml.bump();const x:jsyaml.Options={label:"x"};',true,true,[]],
 ['named imports','import {bump,count,type Options} from ENTRY;const n:number=bump()+count;const x:Options={label:"x"};',true,false,[]],
 ['namespace imports','import * as yaml from ENTRY;const n:number=yaml.bump();const x:yaml.Options={label:"x"};',true,false,[]],
 ['missing member','const n=jsyaml.absent;',false,false,[2339]],
 ['bad options','const x:jsyaml.Options={label:42};',false,false,[2322]],
 ['wrong result','const x:string=jsyaml.bump();',false,false,[2322]],
 ['namespace assignment','jsyaml={};',false,false,[2632]],
];
const dir=mkdtempSync(join(tmpdir(),'mithril-umd-types-'));
try{
 function diagnostics(entry,body,isModule,allow,index){
  const file=join(dir,`consumer-${index}.${isModule?'mts':'ts'}`);
  writeFileSync(file,body.replaceAll('ENTRY',JSON.stringify(pathToFileURL(resolve(entry)).pathname.replace(/\.d\.mts$/,'.mjs'))));
  const p=ts.createProgram([file,resolve(entry)],{strict:true,skipLibCheck:false,noEmit:true,types:[],target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.NodeNext,moduleResolution:ts.ModuleResolutionKind.NodeNext,moduleDetection:ts.ModuleDetectionKind.Legacy,allowUmdGlobalAccess:allow});
  const ds=ts.getPreEmitDiagnostics(p);
  return ds.map(d=>d.code).sort((a,b)=>a-b);
 }
 for(const candidate of [single,program])for(const [i,[name,body,module,allow,expected]]of cases.entries()){
  const original=diagnostics(fixture,body,module,allow,`original-${i}`);
  assert.deepEqual(original,expected,`original ${name}`);
  assert.deepEqual(diagnostics(candidate,body,module,allow,`candidate-${i}`),original,`candidate ${name}`);
 }
 const before=Object.getOwnPropertyDescriptor(globalThis,'jsyaml');
 const sdk=await import(pathToFileURL(resolve(runtime)));
 assert.equal(sdk.count,0);assert.equal(sdk.bump(),1);assert.equal(sdk.count,1);
 assert.deepEqual(Object.getOwnPropertyDescriptor(globalThis,'jsyaml'),before,'UMD types must not install runtime globals');
 console.log('UMD types: 5 positive/5 negative strict original-paired consumers for single and program artifacts; conditional global access, type/value namespaces and exact diagnostics; no skipLibCheck.');
}finally{rmSync(dir,{recursive:true,force:true});}
