import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath,pathToFileURL} from 'node:url';
const [candidate,compiler,typeRoots]=process.argv.slice(2);
const ts=(await import(pathToFileURL(resolve(compiler)))).default;
assert.equal(ts.version,'6.0.3');
const original=fileURLToPath(new URL('../original.d.mts',import.meta.url));
const options={strict:true,noEmit:true,skipLibCheck:false,target:ts.ScriptTarget.ESNext,module:ts.ModuleKind.ESNext,moduleResolution:ts.ModuleResolutionKind.Bundler,typeRoots:[resolve(typeRoots)],types:[]};
const positives=[
 'let x: A.StringMap<number>={a:1}; x.b=2; const y:number=x.a;',
 'const x:A.NumberMap={0:1}; const y:number=x[0];',
 'let x:A.SymbolMap={}; x[Symbol.for("probe")]=true;',
 'let x:A.MixedMap={known:1,0:2,label:"ok"}; const y:number=x[0];',
 'const x:A.Inline={entry:{value:1}}; const y:number=x.entry.value;',
 'let x:A.Augmented={value:1,extra:true}; const y:number=x.value;',
 'let x:A.KeyNamed={key:"ok",extra:"ok"}; x.more="ok";',
 'const x:A.StringMap={arbitrary:1}; const y:unknown=x.arbitrary;',
];
const negatives=[
 'let x:A.StringMap<number>={bad:"string"};',
 'let x:A.NumberMap={0:1}; x[0]=2;',
 'let x:A.NumberMap={0:"bad"};',
 'let x:A.SymbolMap={}; x[Symbol.for("probe")]=1;',
 'let x:A.MixedMap={known:1,0:"bad"};',
 'let x:A.Inline={entry:{value:"bad"}};',
 'let x:A.Inline={}; x.entry={value:1};',
 'let x:A.Augmented={value:"bad"};',
 'let x:A.KeyNamed={key:1};',
];
const dir=mkdtempSync(join(tmpdir(),'mithril-index-consumers-'));
try{
 function diagnostics(entry){
  const files=[...positives,...negatives].map((body,index)=>{
   const file=join(dir,`consumer-${index}.mts`);
   writeFileSync(file,`import type * as A from ${JSON.stringify(resolve(entry))};\n${body}\n`);
   return file;
  });
  const result=files.map(()=>[]);
  for(const d of ts.getPreEmitDiagnostics(ts.createProgram(files,options))){
   const index=files.indexOf(d.file?.fileName);
   assert(index>=0,ts.flattenDiagnosticMessageText(d.messageText,' '));
   result[index].push(d.code);
  }
  return result.map(codes=>codes.sort());
 }
 const expected=diagnostics(original),actual=diagnostics(candidate);
 for(let index=0;index<expected.length;index++){
  if(index<positives.length)assert.deepEqual(expected[index],[]);
  else assert(expected[index].length);
  assert.deepEqual(actual[index],expected[index]);
 }
 console.log('Index strict consumers: 8 positive/9 negative original-paired cases, exact rejection codes, no skipLibCheck.');
}finally{rmSync(dir,{recursive:true,force:true})}
