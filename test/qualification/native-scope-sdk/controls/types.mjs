import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
const [compiler,typeRoots,candidate]=process.argv.slice(2);
const ts=(await import(pathToFileURL(resolve(compiler)))).default;assert.equal(ts.version,'6.0.3');
const repo=fileURLToPath(new URL('../../../../',import.meta.url));
const fixture=join(repo,'test/fixtures/scope-declarations');
const proof=JSON.parse(readFileSync(join(fixture,'provenance.json'),'utf8'));
const hash=file=>createHash('sha256').update(readFileSync(file)).digest('hex');
for(const[file,sha]of Object.entries(proof.fixtures))assert.equal(hash(join(fixture,file)),sha);
for(const[file,sha]of Object.entries(proof.mithrilSources))assert.equal(hash(join(repo,'examples',file)),sha);
const emission=JSON.parse(readFileSync(join(fixture,'emission.json'),'utf8'));assert.equal(emission.typescript,'6.0.3');assert.deepEqual(emission.diagnostics,[]);
for(const[file,sha]of Object.entries(emission.sourceHashes))assert.equal(hash(join(repo,'test/fixtures/scope-core','original-'+file.split('/').at(-1))),sha);
const metadata=JSON.parse(readFileSync(candidate+'.log','utf8'));
const parse=file=>ts.createSourceFile(file,readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
function shape(n){
 if(ts.isParenthesizedTypeNode(n))return shape(n.type);
 if(ts.isIdentifier(n)||ts.isStringLiteral(n)||ts.isNumericLiteral(n))return{text:n.text};
 const children=[];ts.forEachChild(n,c=>{if(![ts.SyntaxKind.ExportKeyword,ts.SyntaxKind.DeclareKeyword].includes(c.kind))children.push(shape(c))});
 return{kind:n.kind,children};
}
const declarations=sf=>sf.statements.filter(n=>!ts.isImportDeclaration(n)&&!ts.isExportDeclaration(n));
for(const[leaf,count]of [['index',14],['store',5]]){
 const original=declarations(parse(join(fixture,leaf+'.d.ts'))),actual=declarations(parse(join(candidate,metadata['module-files']['scope.'+leaf])));
 assert.equal(original.length,count);assert.deepEqual(actual.map(shape),original.map(shape),'all original Scope declarations, including private readonly modifiers and unique-symbol brand');
}
const cases=[
 ['key and parents','const key:A.ScopeKey={};const p:A.ScopeKey|undefined=A.scopeParentOf(key);const keys:A.ScopeKey[]=A.scopeChainOf(key);const b:A.ScopeParentBinding=A.bindScopeParent(key,{});b.rebind({});',[]],
 ['scope lifecycle','const scope:A.Scope=A.createScope(new Context(),{},{parent:{}});const ctx:Context=scope.ctx;const d:Promise<void>=scope.dispose();const r:Promise<void>|void=scope.rawDispose();',[]],
 ['scope inference','const key:A.ScopeKey|undefined=A.scopeOf(new Context());',[]],
 ['opaque carrier equality','const subject={value:1};const c=A.scopeTarget(subject,{});type Equal<X,Y>=(<T>()=>T extends X?1:2) extends (<T>()=>T extends Y?1:2)?true:false;type Assert<T extends true>=T;type Check=Assert<Equal<typeof c,A.Scoped<typeof subject>>>;',[]],
 ['carrier narrowing','declare const unknownValue:unknown;if(A.isScopeCarrier(unknownValue)){const c:A.Scoped<object>=unknownValue}const k:A.ScopeKey|undefined=A.carrierKeyOf(unknownValue);',[]],
 ['named table','const t=new A.NamedEntries<number>(name=>new Error(name));const undo:()=>void=t.insert("a",1);const v:number|undefined=t.get("a");const has:boolean=t.has("a");const ks:IterableIterator<string>=t.keys();const es:IterableIterator<[string,number]>=t.entries();const vs:IterableIterator<number>=t.values();',[]],
 ['anonymous table','const t=new A.AnonymousEntries<string>();const undo:()=>void=t.append("x");const vs:IterableIterator<string>=t.values();const empty:boolean=t.isEmpty();',[]],
 ['generic layers','class Layer implements A.ScopeLayer{readonly named=new A.NamedEntries<number>(n=>new Error(n));isEmpty(){return this.named.isEmpty()}}const s=new A.ScopedLayers(key=>new Layer(),()=>{});const l:Layer=s.global;const optional:Layer|undefined=s.peek({});const chain:Layer[]=s.chainLayers({});const merged:Map<string,number>=s.merge({},l=>l.named);const undo:()=>void=s.effect(new Context(),l=>l.named.insert("a",1),{label:"registry",notify:false});',[]],
 ['inherited table interface','const named:A.ScopeLayer=new A.NamedEntries<number>(n=>new Error(n));const anonymous:A.ScopeLayer=new A.AnonymousEntries<number>();',[]],
 ['original writable options','const options:A.CreateScopeOptions={};options.parent={};const scope:A.Scope=A.createScope(new Context(),{});scope.ctx=new Context();',[]],
 ['non-object key','A.createScope(new Context(),1);',[2345]],
 ['non-object subject','A.scopeTarget("x",{});',[2345]],
 ['forge opaque carrier','const c:A.Scoped<object>={};',[2322]],
 ['opaque subject is hidden','A.scopeTarget({value:1},{}).value;',[2339]],
 ['wrong named value','new A.NamedEntries<number>(n=>new Error(n)).insert("x","bad");',[2345]],
 ['wrong duplicate diagnostic','new A.NamedEntries<number>(n=>n);',[2322]],
 ['wrong anonymous value','new A.AnonymousEntries<string>().append(1);',[2345]],
 ['invalid layer constraint','new A.ScopedLayers(()=>({}),()=>{});',[2741]],
 ['readonly global','const s=new A.ScopedLayers(()=>({isEmpty:()=>true}),()=>{});s.global={isEmpty:()=>true};',[2540]],
 ['private named data','new A.NamedEntries<number>(n=>new Error(n)).data;',[2341]],
 ['private anonymous data','new A.AnonymousEntries<number>().data;',[2341]],
 ['private duplicate diagnostic','new A.NamedEntries<number>(n=>new Error(n)).duplicateError;',[2341]],
 ['private scoped map','new A.ScopedLayers(()=>({isEmpty:()=>true}),()=>{}).scoped;',[2341]],
 ['private factory','new A.ScopedLayers(()=>({isEmpty:()=>true}),()=>{}).createLayer;',[2341]],
 ['private callback','new A.ScopedLayers(()=>({isEmpty:()=>true}),()=>{}).onChange;',[2341]],
 ['missing effect label','new A.ScopedLayers(()=>({isEmpty:()=>true}),()=>{}).effect(new Context(),()=>()=>{},{});',[2345]],
 ['wrong notification type','new A.ScopedLayers(()=>({isEmpty:()=>true}),()=>{}).effect(new Context(),()=>()=>{},{label:"x",notify:"yes"});',[2322]],
 ['private brand cannot be imported','import {ScopedBrand} from "@qualification/scope";',[2459]],
];
const dir=mkdtempSync(join(tmpdir(),'mithril-scope-type-consumers-'));
const options={target:ts.ScriptTarget.ES2024,module:ts.ModuleKind.ESNext,moduleResolution:ts.ModuleResolutionKind.Bundler,allowImportingTsExtensions:true,noEmit:true,strict:true,skipLibCheck:false,typeRoots:[resolve(typeRoots)],types:['node']};
try{
 const files=cases.map((_,i)=>join(dir,'consumer-'+i+'.mts'));
 const prefix='import * as A from "@qualification/scope";import {Context} from "@deepseek-ai/cordis";';
 const originalMapping={'@qualification/scope':join(fixture,'index.d.ts'),'@deepseek-ai/cordis':join(repo,'test/fixtures/cordis-declarations/program/index.d.ts'),'@deepseek-ai/cosmokit':join(repo,'test/fixtures/cosmokit-declarations/index.d.ts'),'@standard-schema/spec':join(repo,'test/fixtures/cordis-declarations/standard-schema/index.d.ts')};
 const candidateMapping={...originalMapping,'@qualification/scope':join(candidate,metadata['module-files']['scope.index'])};
 for(const[name,id]of [['@deepseek-ai/cordis','cordis.index'],['@deepseek-ai/cosmokit','cosmokit'],['@standard-schema/spec','standard.schema']])candidateMapping[name]=join(candidate,metadata['module-files'][id]);
 function check(mapping){
  const host=ts.createCompilerHost(options),read=host.readFile,exists=host.fileExists;
  host.readFile=file=>files.includes(file)?prefix+cases[files.indexOf(file)][1]:read(file);
  host.fileExists=file=>files.includes(file)||exists(file);
  host.resolveModuleNames=(names,source)=>names.map(name=>mapping[name]?{resolvedFileName:mapping[name],extension:ts.Extension.Dts,isExternalLibraryImport:true}:ts.resolveModuleName(name,source,options,host).resolvedModule);
  const program=ts.createProgram(files,options,host),groups=files.map(()=>[]);
  for(const d of ts.getPreEmitDiagnostics(program)){const i=files.indexOf(d.file?.fileName);assert(i>=0,'Dependency diagnostic: '+ts.flattenDiagnosticMessageText(d.messageText,' '));groups[i].push(d.code)}
  const checker=program.getTypeChecker(),root=program.getSourceFile(mapping['@qualification/scope']);
  const surface=checker.getExportsOfModule(checker.getSymbolAtLocation(root)).map(s=>{const v=s.flags&ts.SymbolFlags.Alias?checker.getAliasedSymbol(s):s;return{name:s.name,type:!!(v.flags&ts.SymbolFlags.Type),value:!!(v.flags&ts.SymbolFlags.Value),namespace:!!(v.flags&ts.SymbolFlags.Namespace)}}).sort((a,b)=>a.name.localeCompare(b.name));
  return{diagnostics:groups.map(g=>g.sort((a,b)=>a-b)),surface};
 }
 const original=check(originalMapping);assert.deepEqual(original.diagnostics,cases.map(c=>c[2]),'original diagnostic baseline');assert.deepEqual(check(candidateMapping),original,'independent complete Scope type and value spaces');
 const wrapper=check({...candidateMapping,'@qualification/scope':join(candidate,'index.d.mts')});
 assert.deepEqual(wrapper.surface,original.surface);assert.deepEqual(wrapper.diagnostics.slice(0,-1),original.diagnostics.slice(0,-1));assert.deepEqual(wrapper.diagnostics.at(-1),[2305],'generic program barrel does not declare private ScopedBrand; package types use actual Scope source module for lexical parity');
 console.log('Scope SDK types: all 19 original declarations, 10 positive/18 negative strict original-paired groups, exact diagnostic codes, 11 runtime values/9 types; own canonical Cordis graph, unique-symbol opacity and all four private readonly fields preserved.');
}finally{rmSync(dir,{recursive:true,force:true})}
