import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {resolve,join,dirname} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
const [entry,compiler,typeRoots]=process.argv.slice(2),ts=(await import(pathToFileURL(resolve(compiler)))).default;
assert.equal(ts.version,'6.0.3');
const root=fileURLToPath(new URL('../../../../',import.meta.url)),fixtures=join(root,'test/fixtures'),schema=join(fixtures,'schemastery-declarations');
const provenance=JSON.parse(readFileSync(join(schema,'provenance.json'),'utf8'));
for(const [file,hash]of Object.entries(provenance.fixtures))assert.equal(createHash('sha256').update(readFileSync(join(schema,file))).digest('hex'),hash);
const parse=(file)=>ts.createSourceFile(file,readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
const original=parse(join(schema,'index.d.ts')),index=parse(resolve(entry));
const link=index.statements.find(ts.isExportDeclaration).moduleSpecifier.text;
const candidate=parse(resolve(dirname(entry),link.replace(/\.mjs$/,'.d.mts')));
// Only grammar-preserving emitter differences are normalized. Literal values,
// generic flags/defaults, signatures and declaration order remain observable.
function shape(n){
 if(!n)return null;
 if(ts.isParenthesizedTypeNode(n))return shape(n.type);
 if(ts.isIdentifier(n)||ts.isStringLiteral(n)||ts.isNumericLiteral(n))return{text:n.text};
 const children=[];ts.forEachChild(n,c=>{if(![ts.SyntaxKind.ExportKeyword,ts.SyntaxKind.DeclareKeyword].includes(c.kind))children.push(shape(c));});
 return{kind:n.kind,children};
}
const globals=sf=>sf.statements.filter(n=>ts.isModuleDeclaration(n)&&(n.flags&ts.NodeFlags.GlobalAugmentation));
assert.equal(globals(original).length,1);assert.deepEqual(globals(candidate).map(shape),globals(original).map(shape),'complete original global declaration syntax');
const privateNodes=sf=>sf.statements.filter(n=>!ts.isImportDeclaration(n)&&!ts.isExportDeclaration(n)&&!ts.isExportAssignment(n)&&!globals(sf).includes(n));
assert.deepEqual(privateNodes(candidate).map(shape),privateNodes(original).map(shape),'all seven original private declaration nodes');
const imports=sf=>sf.statements.filter(ts.isImportDeclaration).flatMap(n=>n.importClause.namedBindings.elements.map(e=>({name:e.name.text,source:e.propertyName?.text??e.name.text,type:!!(e.isTypeOnly||n.importClause.isTypeOnly)})));
assert.deepEqual(imports(candidate),imports(original));
const namespace=globals(candidate)[0].body.statements.find(ts.isModuleDeclaration),iface=globals(candidate)[0].body.statements.find(ts.isInterfaceDeclaration);
assert.equal(namespace.body.statements.length,16);assert.equal(iface.members.length,42);
const positive=[
 ['real default value','import Default from ENTRY;const s=Default.string();const value:string=s(\"x\");'],
 ['module namespace default','import * as api from ENTRY;const same:typeof statik=api.default;'],
 ['default type','import type Default from ENTRY;declare const s:typeof Default;const x:string=s.string()("x");'],
 ['callable plain','declare const s:Schemastery<string>;const x:string=s("x");'],
 ['constructable plain','declare const C:Schemastery<string>;const x:string=new C("x");'],
 ['options','const x:Schemastery.Options={autofix:true,path:["x",1],ignore(data,s){return s.type==="any"}};'],
 ['meta default','const x:Schemastery.Meta<{tag:string}>={default:{},description:{en:"text"},badges:[{text:"a",type:"b"}],pattern:{source:"x",flags:"i"}};'],
 ['standard schema','declare const s:Schemastery<string>;const x:1=s["~standard"].version;const y:string=s["~standard"].vendor;'],
 ['required defined','const x:string=statik.string().required()("x");'],
 ['required false','const x:string=statik.string().required(false)("x");'],
 ['volatile missing','const x:string|undefined=statik.string().volatile()().get();'],
 ['volatile defined','const x:string=statik.string().required().volatile()().get();'],
 ['volatile required order','const x:string=statik.string().volatile().required()().get();'],
 ['volatile required false','const x:string|undefined=statik.string().volatile().required(false)().get();'],
 ['volatile default','const x:string=statik.string().volatile().default("fallback")().get();'],
 ['default','const x:string=statik.string().default("fallback")();'],
 ['const string','const x:"x"=statik.const("x")();'],
 ['const object','const x:{readonly tag:"x"}=statik.const({tag:"x"})();'],
 ['const nested','const x:readonly ["x",{readonly tag:42}]=statik.const(["x",{tag:42}])();'],
 ['number','const x:number=statik.number()(42);const y:number=statik.natural()(1);const z:number=statik.percent()(0.5);'],
 ['boolean','const x:boolean=statik.boolean()(true);'],
 ['date','const x:Date=statik.date()("2026-10-09");'],
 ['regexp','const x:RegExp=statik.regExp("i")("x");'],
 ['binary','const x:ArrayBufferLike=statik.arrayBuffer("hex")("ff");'],
 ['bitset','const x:number=statik.bitset({a:1,b:2})(["a"]);'],
 ['function','const x:(...args:any[])=>any=statik.function()(()=>1);'],
 ['is constructor','class Item{value=1}const x:Item=statik.is(Item)(new Item);'],
 ['is name','statik.is("Item")({});'],
 ['array','const x:string[]=statik.array(String)(["a"]);'],
 ['dict','const x:Record<string,number>=statik.dict(Number)({a:1});'],
 ['tuple','const x:[string?,number?,...any[]]=statik.tuple([String,Number])(["a",1]);'],
 ['union','const x:"a"|"b"=statik.union(["a","b"])("a");'],
 ['intersect','const x:Schemastery.IntersectT<{tag:"a"}>=undefined as never;statik.intersect([statik.object({tag:"a"})]);'],
 ['object','const x:{name:string;count:number}=statik.object({name:String,count:Number})({name:"a",count:1});'],
 ['transform','const x:number=statik.transform(String,v=>v.length)("a");'],
 ['lazy','const x:string=statik.lazy(()=>statik.string())("a");'],
 ['from string','const x:string=statik.from(String)("a");'],
 ['from literal','const x:"a"=statik.from("a" as const)("a");'],
 ['from schema','const x:number=statik.from(statik.number())(1);'],
 ['static call','const x:string=statik<string>({type:"string"})("a");'],
 ['static construct','const x:string=new statik<string>({type:"string"})("a");'],
 ['validation error','const e=new statik.ValidationError("x",{path:["a"]});const x:TypeError=e;if(statik.ValidationError.is(e)){const p:Schemastery.Options=e.options;}'],
 ['resolve','const x:[any,any?]=statik.resolve("a",statik.string(),{autofix:true});'],
 ['extend','statik.extend("custom",(data,s,o,strict)=>[data]);'],
 ['metadata builders','const x:string=statik.string().hidden().loose().role("r",{}).link("url").comment("c").description("d").disabled().collapse().deprecated().experimental().pattern(/x/).max(5).min(1).step(1)("a");'],
 ['set push','const x:string=statik.string().set("x",statik.any()).push(statik.any())("a");'],
 ['serialization type','const x:Schemastery<string>=statik.string().toJSON();const text:string=x.toString(true);'],
 ['i18n extra','const x:string=statik.string().i18n({en:"a"}).extra("max",4)("a");'],
 ['TypeS','const x:Schemastery.TypeS<typeof Number>=1;'],
 ['TypeT','const x:Schemastery.TypeT<typeof Boolean>=true;'],
 ['ObjectS','const x:Schemastery.ObjectS<{tag:typeof String}>={tag:null};'],
 ['ObjectT','const x:Schemastery.ObjectT<{tag:typeof String}>={tag:"a"};'],
 ['constructor helper','const x:Schemastery.Constructor<Date>=Date;'],
 ['never','const x:never=statik.never()();'],
 ];
const negative=[
 ['wrong input','statik.string()(42);'],
 ['wrong output','const x:number=statik.string()("a");'],
 ['construct wrong input','declare const C:Schemastery<string>;new C(42);'],
 ['const mismatch','const x:"b"=statik.const("a")();'],
 ['const readonly','statik.const({tag:"a"})().tag="a";'],
 ['volatile possibly missing','const x:string=statik.string().volatile()().get();'],
 ['volatile missing methods','statik.string().volatile()().toUpperCase();'],
 ['wrong default','statik.string().default(42);'],
 ['tuple invalid','statik.tuple(42);'],
 ['union mismatch','const x:"c"=statik.union(["a","b"])("a");'],
 ['array element','statik.array(String)([1]);'],
 ['object property','statik.object({tag:String})({tag:42});'],
 ['transform input','statik.transform(String,v=>v.length)(42);'],
 ['bitset key','statik.bitset({a:1})(["b"]);'],
 ['options path','const x:Schemastery.Options={path:[{}]};'],
 ['meta pattern','const x:Schemastery.Meta={pattern:{source:42}};'],
 ['extra key','statik.string().extra("missing",1);'],
 ['extra value','statik.string().extra("max","x");'],
 ['private key leak','const x=Schemastery.kSchema;'],
 ['private helper leak','type X=Schemastery.SchemaMode;'],
 ['nominal brand','const x:Schemastery<string>={};'],

 ];
const dir=mkdtempSync(join(tmpdir(),'mithril-global-contract-'));
try{
 const reference=join(dir,'reference.d.mts');writeFileSync(reference,'export {default} from '+JSON.stringify(join(schema,'index'))+';export {};\n');
 const options={strict:true,noEmit:true,skipLibCheck:false,target:ts.ScriptTarget.ES2024,module:ts.ModuleKind.ESNext,moduleResolution:ts.ModuleResolutionKind.Bundler,allowImportingTsExtensions:true,types:['node'],typeRoots:[resolve(typeRoots)]};
 function check(variant,target){
  const groups=[];
  for(const [category,cases]of [['positive',positive],['negative',negative]])for(const [name,body]of cases){
   const file=join(dir,variant+'-'+groups.length+'.ts');
   const path=JSON.stringify(resolve(target).replace(/\.d\.mts$/,'.mjs'));
   writeFileSync(file,'import DefaultAPI from '+path+';const statik=DefaultAPI;\n'+body.replaceAll('ENTRY',path));groups.push({file,category,name});
  }
  // Global declaration graphs must never share a TS program. The candidate has
  // no path to the original oracle, including through imported dependencies.
  const program=ts.createProgram(groups.map(g=>g.file),variant==='original'?{...options,baseUrl:root,ignoreDeprecations:'6.0',paths:{'@deepseek-ai/cosmokit':[join(fixtures,'cosmokit-declarations/index.d.ts')],'@standard-schema/spec':[join(fixtures,'cordis-declarations/standard-schema/index.d.ts')]}}:options);
  const diagnostics=ts.getPreEmitDiagnostics(program),negativeFiles=new Set(groups.filter(g=>g.category==='negative').map(g=>g.file));
  assert.deepEqual(diagnostics.filter(d=>!d.file||!negativeFiles.has(d.file.fileName)).map(d=>({file:d.file?.fileName,code:d.code,text:ts.flattenDiagnosticMessageText(d.messageText,' ')})),[],variant+' positive/library errors');
  if(variant==='candidate')assert(!program.getSourceFiles().some(sf=>sf.fileName.startsWith(fixtures)), 'candidate imported original oracle');
  const checker=program.getTypeChecker(),at=program.getSourceFile(resolve(target));
  const exports=checker.getExportsOfModule(checker.getSymbolAtLocation(at));assert.deepEqual(exports.map(s=>s.name),['default']);
  const globalSymbol=checker.resolveName('Schemastery',at,ts.SymbolFlags.Namespace|ts.SymbolFlags.Type,false);
  const surface=checker.getExportsOfModule(globalSymbol).map(s=>s.name).sort();assert.equal(surface.length,16);
  return {surface,codes:Object.fromEntries(groups.filter(g=>g.category==='negative').map(g=>{const codes=diagnostics.filter(d=>d.file?.fileName===g.file).map(d=>d.code).sort((a,b)=>a-b);assert(codes.length,g.name+' must refuse');return[g.name,codes];}))};
 }
 const expected=check('original',reference),actual=check('candidate',entry);assert.deepEqual(actual,expected);
 console.log(`Global Schemastery oracle: complete hashed original 16 namespace declarations/42 interface members/7 private declarations; independent original and candidate TS programs; ${positive.length} positive/${negative.length} negative groups; actual candidate CosmoKit/StandardSchema closure; actual default value imports; runtime executes under its separate source CLI contract.`);
}finally{rmSync(dir,{recursive:true,force:true});}
