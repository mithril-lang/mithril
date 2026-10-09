import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,rmSync}from'node:fs';
import {resolve,join}from'node:path';
import {pathToFileURL,fileURLToPath}from'node:url';
import {tmpdir}from'node:os';
const[entry,profile,compiler,typeRoots]=process.argv.slice(2),ts=(await import(pathToFileURL(resolve(compiler)))).default;
assert.equal(ts.version,'6.0.3');
const fixtures=fileURLToPath(new URL('../../../fixtures/global-declarations/',import.meta.url));
const positive=[
 ['left','declare const v:api.Left;const x:string=v.value;'],
 ['right','declare const v:api.Right;const x:string=v.value;'],
 ['implicit namespace','declare const v:GlobalModel.Model<string>;const x:api.Left=v;'],
 ['nested ambient','declare const v:GlobalModel.Nested.Owner<string>;const x:api.Left=v;'],
 ['other owner','declare const v:GlobalModel.OtherModel<string>;const x:api.Right=v;'],
 ['interface','declare const v:GlobalModel<string>;const x:api.Left=v.left;const y:api.Right=v.right;'],
 ...profile==='program'?[
 ['imported helper','const x:api.Dependency={seed:"x"};'],
 ['global inline dependency','const x:api.Inline={inline:"x"};'],
 ]:[]
];
const negative=[
 ['private nominal owner','declare const r:api.Right;const x:api.Left=r;'],
 ['reverse private owner','declare const l:api.Left;const x:api.Right=l;'],
 ['private not structural','const x:api.Left={value:"x"};'],
 ['private key invisible','type X=GlobalModel.Key;'],
 ['private class invisible','type X=GlobalModel.Hidden<string>;'],
 ['private module invisible','type X=api.Hidden<string>;'],
 ['private member invisible','declare const x:api.Left;x.brand;'],
 ['wrong generic arity','type X=GlobalModel.Model<string,number>;'],
 ['wrong property','declare const x:GlobalModel<string>;const y:number=x.left.value;'],
 ...profile==='program'?[
 ['imported helper checks type','const x:api.Dependency={seed:42};'],
 ['inline helper checks type','const x:api.Inline={inline:42};'],
 ]:[]
];
const dir=mkdtempSync(join(tmpdir(),'mithril-global-mechanics-'));
try{
 function check(variant,target){
  const groups=[];
  for(const[category,cases]of[['positive',positive],['negative',negative]])for(const[name,body]of cases){const file=join(dir,variant+'-'+groups.length+'.ts');writeFileSync(file,'import type * as api from '+JSON.stringify(resolve(target).replace(/\.d\.mts$/,'.mjs'))+';\n'+body);groups.push({file,category,name});}
  const program=ts.createProgram(groups.map(g=>g.file),{strict:true,noEmit:true,skipLibCheck:false,target:ts.ScriptTarget.ES2024,module:ts.ModuleKind.ESNext,moduleResolution:ts.ModuleResolutionKind.Bundler,allowImportingTsExtensions:true,types:['node'],typeRoots:[resolve(typeRoots)]});
  const diagnostics=ts.getPreEmitDiagnostics(program),neg=new Set(groups.filter(g=>g.category==='negative').map(g=>g.file));
  assert.deepEqual(diagnostics.filter(d=>!d.file||!neg.has(d.file.fileName)).map(d=>({file:d.file?.fileName,code:d.code,text:ts.flattenDiagnosticMessageText(d.messageText,' ')})),[],variant);
  if(variant==='candidate')assert(!program.getSourceFiles().some(s=>s.fileName.startsWith(fixtures)));
  const checker=program.getTypeChecker(),at=program.getSourceFile(resolve(target)),global=checker.resolveName('GlobalModel',at,ts.SymbolFlags.Type,false);
  const props=checker.getPropertiesOfType(checker.getDeclaredTypeOfSymbol(global));assert.equal(props.length,4);assert.equal(props.filter(p=>p.escapedName.startsWith('__@')).length,2,'distinct same-spelling source-private computed symbols');
  return Object.fromEntries(groups.filter(g=>g.category==='negative').map(g=>{const codes=diagnostics.filter(d=>d.file?.fileName===g.file).map(d=>d.code).sort((a,b)=>a-b);assert(codes.length,g.name);return[g.name,codes]}));
 }
 assert.deepEqual(check('candidate',entry),check('original',join(fixtures,profile==='program'?'entry.d.ts':'legacy.d.ts')));
 console.log(`Global mechanics ${profile}: ${positive.length} positive/${negative.length} negative independent-program paired groups; source-private nominal/computed owners, implicit namespace visibility${profile==='program'?', imported and global-only inline type dependencies':''}.`);
}finally{rmSync(dir,{recursive:true,force:true});}
