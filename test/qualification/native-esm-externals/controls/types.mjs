import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
const [out,compiler,typeRoots]=process.argv.slice(2);
const ts=(await import(pathToFileURL(resolve(compiler)))).default;
assert.equal(ts.version,'6.0.3');
writeFileSync(join(out,'original.d.mts'),'export {count,inc,default} from "fixture.external";');
const options={strict:true,noEmit:true,skipLibCheck:false,target:ts.ScriptTarget.ESNext,module:ts.ModuleKind.NodeNext,moduleResolution:ts.ModuleResolutionKind.NodeNext,types:['node'],typeRoots:[resolve(typeRoots)]};
const cases=[
 ['positive','import value,{count,inc} from ENTRY;const n:number=count;const tag:"external"=value.tag;inc();',true],
 ['count type','import {count} from ENTRY;const bad:string=count;',false],
 ['default type','import value from ENTRY;const bad:"other"=value.tag;',false],
 ['call signature','import {inc} from ENTRY;inc(1);',false],
 ['readonly import','import {count} from ENTRY;count=2;',false],
];
for(const [label,body,positive] of cases){
 const results=[];
 for(const entry of ['original.mjs','index.mjs']){
  const file=join(out,'consumer.mts');writeFileSync(file,body.replace('ENTRY',JSON.stringify('./'+entry)));
  const diagnostics=ts.getPreEmitDiagnostics(ts.createProgram([file],options));
  if(positive)assert.deepEqual(diagnostics.map(d=>ts.flattenDiagnosticMessageText(d.messageText,'\n')),[],label);
  else assert(diagnostics.length>0,label+' must be refused');
  results.push(diagnostics.map(d=>({code:d.code,message:ts.flattenDiagnosticMessageText(d.messageText,'\n')})));
 }
 assert.deepEqual(results[1],results[0],label+' original/native mismatch');
}
console.log('External type facade: strict paired positive and four negative consumers preserve external default/named types, call signature and readonly imported binding.');
