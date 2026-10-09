import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
const [sdk,core,schema,compiler,typeRoots]=process.argv.slice(2);
const ts=(await import(pathToFileURL(resolve(compiler)))).default;
assert.equal(ts.version,'6.0.3');
const root=fileURLToPath(new URL('../../../../',import.meta.url)),fixtures=join(root,'test/fixtures'),leaves=join(fixtures,'loader-leaves');
const provenance=JSON.parse(readFileSync(join(leaves,'provenance.json'),'utf8'));
for(const [file,hash]of Object.entries(provenance.fixtures))assert.equal(createHash('sha256').update(readFileSync(join(leaves,file))).digest('hex'),hash);
const metadata=JSON.parse(readFileSync(sdk+'.json','utf8')),coreMetadata=JSON.parse(readFileSync(core+'.json','utf8'));
const parse=file=>ts.createSourceFile(file,readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
function shape(n){
 if(!n)return null;
 if(ts.isParenthesizedTypeNode(n))return shape(n.type);
 if(ts.isIdentifier(n)||ts.isStringLiteral(n)||ts.isNumericLiteral(n))return{text:n.text};
 const children=[];ts.forEachChild(n,c=>{if(![ts.SyntaxKind.ExportKeyword,ts.SyntaxKind.DeclareKeyword].includes(c.kind))children.push(shape(c));});
 return{kind:n.kind,children};
}
const declarations=sf=>sf.statements.filter(n=>!ts.isImportDeclaration(n)&&!ts.isExportDeclaration(n));
for(const [name,count]of [['utils',4],['diff',1]]){
 const original=declarations(parse(join(leaves,'original-'+name+'.d.ts')));
 const candidate=declarations(parse(join(sdk,metadata['module-files']['loader.'+name].replace(/\.mjs$/,'.d.mts'))));
 assert.equal(original.length,count);assert.deepEqual(candidate.map(shape),original.map(shape),'complete original '+name+' declarations');
}
const positive=[
 ['evaluate context','const x:any=evaluate({a:1},"a+1");'],
 ['interpolate value','const x:any=interpolate({},[{__jsExpr:"1"}]);'],
 ['serialized expression','const x:JsExpr={__jsExpr:"a"};'],
 ['predicate narrowing','declare const x:unknown;if(isJsExpr(x)){const s:string=x.__jsExpr;}'],
 ['raw comparator','const x:boolean=equalExceptVolatile({}, {}, undefined);'],
 ['real Cordis Config','declare const s:Plugin.Runtime["Config"];const x:boolean=equalExceptVolatile({}, {}, s);'],
 ['real Schema object','const s=S.object({value:S.number(),volatile:S.string().volatile()});const x:boolean=equalExceptVolatile({}, {}, s);'],
 ['real Schema defaults','const s=S.object({value:S.number()}).default({value:2});equalExceptVolatile(undefined,{},s);'],
];
const negative=[
 ['context primitive','evaluate(1,"a");'],
 ['expression nonstring','evaluate({},1);'],
 ['evaluate arity','evaluate({});'],
 ['interpolate arity','interpolate({});'],
 ['expression field','const x:JsExpr={__jsExpr:1};'],
 ['narrowed field','declare const x:unknown;if(isJsExpr(x)){const n:number=x.__jsExpr;}'],
 ['schema primitive','equalExceptVolatile({}, {}, 42);'],
 ['schema malformed','equalExceptVolatile({}, {}, {type:"object"});'],
 ['comparator result','const x:string=equalExceptVolatile({}, {}, undefined);'],
 ['comparator arity','equalExceptVolatile({}, {});'],
];
const dir=mkdtempSync(join(tmpdir(),'mithril-loader-leaf-types-'));
try{
 const reference=join(dir,'original.d.mts');
 for(const name of ['utils','diff'])writeFileSync(join(dir,'original-'+name+'.d.mts'),readFileSync(join(leaves,'original-'+name+'.d.ts')));
 writeFileSync(reference,['utils','diff'].map(n=>'export * from "./original-'+n+'.mjs";').join('\n'));
 const options={strict:true,noEmit:true,skipLibCheck:false,target:ts.ScriptTarget.ES2024,module:ts.ModuleKind.ESNext,moduleResolution:ts.ModuleResolutionKind.Bundler,allowImportingTsExtensions:true,esModuleInterop:true,types:['node'],typeRoots:[resolve(typeRoots)],baseUrl:root,ignoreDeprecations:'6.0'};
 function check(variant,entry){
  const groups=[];
  for(const [category,cases]of [['positive',positive],['negative',negative]])for(const [name,body]of cases){
   const file=join(dir,variant+'-'+groups.length+'.mts');
   writeFileSync(file,'import {evaluate,interpolate,isJsExpr,equalExceptVolatile,type JsExpr} from '+JSON.stringify(entry.replace(/\.d\.mts$/,'.mjs'))+';\nimport type {Plugin} from "@deepseek-ai/cordis";import S from "@deepseek-ai/schemastery";\n'+body);
   groups.push({category,name,file});
  }
  const paths=variant==='original'?{'@deepseek-ai/cordis':[join(fixtures,'cordis-declarations/program/index.d.ts')],'@deepseek-ai/cosmokit':[join(fixtures,'cosmokit-declarations/index.d.ts')],'@deepseek-ai/schemastery':[join(fixtures,'schemastery-declarations/index.d.ts')]}:{'@deepseek-ai/cordis':[join(core,'index.d.mts')],'@deepseek-ai/cosmokit':[join(core,coreMetadata['module-files'].cosmokit.replace(/\.mjs$/,'.d.mts'))],'@deepseek-ai/schemastery':[join(schema,'index.d.mts')]};
  paths['@standard-schema/spec']=[join(fixtures,'cordis-declarations/standard-schema/index.d.ts')];
  const program=ts.createProgram(groups.map(g=>g.file),{...options,paths}),diagnostics=ts.getPreEmitDiagnostics(program),negativeFiles=new Set(groups.filter(g=>g.category==='negative').map(g=>g.file));
  assert.deepEqual(diagnostics.filter(d=>!d.file||!negativeFiles.has(d.file.fileName)).map(d=>({file:d.file?.fileName,code:d.code,text:ts.flattenDiagnosticMessageText(d.messageText,' ')})),[],variant+' positive/library diagnostics');
  if(variant==='candidate')assert(!program.getSourceFiles().some(sf=>sf.fileName.startsWith(fixtures)&&!sf.fileName.startsWith(join(fixtures,'cordis-declarations/standard-schema'))),'candidate used original library declarations');
  const checker=program.getTypeChecker(),sf=program.getSourceFile(entry),surface=checker.getExportsOfModule(checker.getSymbolAtLocation(sf)).map(s=>s.name).sort();
  assert.deepEqual(surface,['JsExpr','equalExceptVolatile','evaluate','interpolate','isJsExpr']);
  return groups.filter(g=>g.category==='negative').map(g=>{const errors=diagnostics.filter(d=>d.file?.fileName===g.file).map(d=>({code:d.code,text:ts.flattenDiagnosticMessageText(d.messageText,' ')}));assert(errors.length,g.name+' must refuse');return{name:g.name,errors};});
 }
 assert.deepEqual(check('candidate',join(sdk,'index.d.mts')),check('original',reference));
 console.log(`Loader leaves types: all 4 utils/1 diff original declarations; independent full Cordis/CosmoKit/Schema programs; ${positive.length} positive/${negative.length} negative consumers and exact refusal diagnostics.`);
}finally{rmSync(dir,{recursive:true,force:true});}
