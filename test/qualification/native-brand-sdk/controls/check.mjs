import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,mkdtempSync,rmSync,copyFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const [compiler,sdk,typed]=process.argv.slice(2),ts=(await import(pathToFileURL(resolve(compiler)))).default;
assert.equal(ts.version,'6.0.3');
const repo=fileURLToPath(new URL('../../../../',import.meta.url)),fixture=join(repo,'test/fixtures/brand-sdk');
const proof=JSON.parse(readFileSync(join(fixture,'provenance.json'),'utf8'));
for(const[file,sha]of Object.entries(proof.fixtures)){const data=readFileSync(join(fixture,file));assert.equal(createHash('sha256').update(data).digest('hex'),sha);if(proof.originalGitBlobs[file])assert.equal(createHash('sha1').update(Buffer.from('blob '+data.length+'\0')).update(data).digest('hex'),proof.originalGitBlobs[file])}
for(const[file,sha]of Object.entries(proof.mithrilSources))assert.equal(createHash('sha256').update(readFileSync(join(repo,'examples',file))).digest('hex'),sha);
const dir=mkdtempSync(join(tmpdir(),'mithril-brand-controls-'));
try{
 const originalFile=join(dir,'original.mjs');
 writeFileSync(originalFile,ts.transpileModule(readFileSync(join(fixture,'original-index.ts'),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2024,module:ts.ModuleKind.ESNext}}).outputText);
 const original=await import(pathToFileURL(originalFile)),actual=await import(pathToFileURL(resolve(sdk,'index.mjs')));
 assert.deepEqual(Object.keys(actual).sort(),Object.keys(original).sort());
 const values=[undefined,null,false,true,'','SessionId','🌏',0,-0,1,-1,NaN,Infinity,-Infinity,1n,Symbol('id'),{},[],new Number(1),new String('id')];
 const proxy=new Proxy({}, {get(){throw Error('unexpected property access')},getPrototypeOf(){throw Error('unexpected prototype access')}});values.push(proxy);
 let runtimeGroups=0;
 for(const name of ['brandString','brandNumber']){
  const descriptor=fn=>({name:fn.name,length:fn.length,keys:Reflect.ownKeys(fn),prototype:Reflect.ownKeys(fn.prototype)});
  assert.deepEqual(descriptor(actual[name]),descriptor(original[name]));
  for(const value of values){assert.ok(Object.is(original[name](value),value));assert.ok(Object.is(actual[name](value),value));runtimeGroups++}
 }
 // Execute the unchanged upstream test body; its type assertion is covered by
 // the independent strict programs below, not treated as a runtime assertion.
 let upstream=0;globalThis.brandTests={describe(_name,body){body()},it(_name,body){body();upstream++},expect(v){return{toBe(w){assert.equal(v,w)}}},expectTypeOf(){return{toEqualTypeOf(){}}}};
 const upstreamFile=join(dir,'upstream.mjs');writeFileSync(upstreamFile,ts.transpileModule(readFileSync(join(fixture,'brand.spec.ts'),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2024,module:ts.ModuleKind.ESNext}}).outputText.replace(/import \{([^}]+)\} from 'vitest';/,'const {$1}=globalThis.brandTests;').replaceAll("'../src/index.ts'",JSON.stringify(pathToFileURL(resolve(sdk,'index.mjs')).href)));
 await import(pathToFileURL(upstreamFile));assert.equal(upstream,1);
 const originalTypes=join(fixture,'index.d.ts'),metadata=JSON.parse(readFileSync(typed+'.log','utf8')),candidateTypes=join(typed,metadata['module-files']['brand.index']);
 const emissionOptions={strict:true,noImplicitAny:true,types:[],target:ts.ScriptTarget.ES2024,module:ts.ModuleKind.ESNext,moduleResolution:ts.ModuleResolutionKind.Bundler,declaration:true,emitDeclarationOnly:true};
 const emission=ts.createProgram([join(fixture,'original-index.ts')],emissionOptions);
 assert.deepEqual(ts.getPreEmitDiagnostics(emission),[],'Original complete source strict emission');
 const emitted=[];const result=emission.emit(undefined,(file,bytes)=>emitted.push({file,bytes}));assert.equal(result.emitSkipped,false);assert.deepEqual(result.diagnostics,[]);assert.equal(emitted.length,1);assert.equal(emitted[0].bytes,readFileSync(originalTypes,'utf8'));
 const parse=file=>ts.createSourceFile(file,readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
 function shape(n){if(ts.isParenthesizedTypeNode(n))return shape(n.type);if(ts.isIdentifier(n)||ts.isStringLiteral(n))return{text:n.text};const children=[];ts.forEachChild(n,c=>{if(![ts.SyntaxKind.ExportKeyword,ts.SyntaxKind.DeclareKeyword].includes(c.kind))children.push(shape(c))});return{kind:n.kind,children}}
 const decls=sf=>sf.statements.filter(n=>!ts.isExportDeclaration(n));assert.equal(decls(parse(originalTypes)).length,5);assert.deepEqual(decls(parse(candidateTypes)).map(shape),decls(parse(originalTypes)).map(shape),'all five original Brand declarations including private unique symbol');
 const cases=[
  ['string','type Id=A.Branded<"SessionId">;const id:Id=A.brandString<Id>("session");const text:string=id;',[]],
  ['number','type Ordinal=A.BrandedNumber<"EventOrdinal">;const n:Ordinal=A.brandNumber<Ordinal>(7);const plain:number=n;',[]],
  ['already branded','type Id=A.Branded<"Id">;declare const id:Id;const same:Id=A.brandString<Id>(id);',[]],
  ['inferred constraints','const a:A.Branded<string>=A.brandString("x");const b:A.BrandedNumber<string>=A.brandNumber(1);',[]],
  ['numeric equality','type Ordinal=A.BrandedNumber<"EventOrdinal">;const n=A.brandNumber<Ordinal>(7);type Equal<X,Y>=(<T>()=>T extends X?1:2) extends (<T>()=>T extends Y?1:2)?true:false;type Assert<T extends true>=T;type Exact=Assert<Equal<typeof n,Ordinal>>;',[]],
  ['plain string','const id:A.Branded<"Id">="x";',[2322]],
  ['plain number','const n:A.BrandedNumber<"Seq">=1;',[2322]],
  ['different string brands','declare const a:A.Branded<"SessionId">;const b:A.Branded<"ToolCallId">=a;',[2322]],
  ['different number brands','declare const a:A.BrandedNumber<"EventSeq">;const b:A.BrandedNumber<"LogOffset">=a;',[2322]],
  ['number to string helper','A.brandString(1);',[2345]],
  ['string to number helper','A.brandNumber("x");',[2345]],
  ['invalid tag','type Bad=A.Branded<42>;',[2344]],
  ['wrong helper constraint','A.brandString<A.BrandedNumber<"Seq">>("x");',[2344]],
  ['private brand','import {BRAND} from "@qualification/brand";',[2724]],
 ];
 const options={strict:true,noEmit:true,skipLibCheck:false,types:[],target:ts.ScriptTarget.ES2024,module:ts.ModuleKind.NodeNext,moduleResolution:ts.ModuleResolutionKind.NodeNext};
 const files=cases.map((_,i)=>join(dir,'consumer-'+i+'.mts'));
 function check(root){
  const host=ts.createCompilerHost(options),read=host.readFile,exists=host.fileExists;
  host.readFile=file=>files.includes(file)?'import * as A from "@qualification/brand";'+cases[files.indexOf(file)][1]:read(file);host.fileExists=file=>files.includes(file)||exists(file);
  host.resolveModuleNames=(names,file)=>names.map(n=>n==='@qualification/brand'?{resolvedFileName:root,extension:root.endsWith('.mts')?ts.Extension.Dmts:ts.Extension.Dts,isExternalLibraryImport:true}:ts.resolveModuleName(n,file,options,host).resolvedModule);
  const program=ts.createProgram(files,options,host),groups=files.map(()=>[]);for(const d of ts.getPreEmitDiagnostics(program)){const i=files.indexOf(d.file?.fileName);assert(i>=0,ts.flattenDiagnosticMessageText(d.messageText,' '));groups[i].push(d.code)}
  const checker=program.getTypeChecker(),sf=program.getSourceFile(root),surface=checker.getExportsOfModule(checker.getSymbolAtLocation(sf)).map(s=>({name:s.name,type:!!(s.flags&ts.SymbolFlags.Type),value:!!(s.flags&ts.SymbolFlags.Value)})).sort((a,b)=>a.name.localeCompare(b.name));return{groups,surface};
 }
 const expected=check(originalTypes);assert.deepEqual(expected.groups,cases.map(c=>c[2]));assert.deepEqual(check(candidateTypes),expected);
 // Real NodeNext duplicate installs must share nominal identities at the same
 // package name/version, and remain separate when the version differs.
 for(const mode of ['original','candidate'])for(const differentVersion of [false,true]){
  const root=join(dir,mode+'-'+differentVersion);mkdirSync(root,{recursive:true});const readers=[];
  for(const[side,version]of [['left','0.2.1-alpha.1'],['right',differentVersion?'0.2.1-alpha.2':'0.2.1-alpha.1']]){
   const packageDir=join(root,side,'node_modules/@qualification/brand');mkdirSync(packageDir,{recursive:true});copyFileSync(mode==='original'?originalTypes:candidateTypes,join(packageDir,'index.d.mts'));copyFileSync(mode==='original'?originalFile:resolve(sdk,'module-0.mjs'),join(packageDir,'index.mjs'));writeFileSync(join(packageDir,'package.json'),JSON.stringify({name:'@qualification/brand',version,type:'module',exports:{'.':{types:'./index.d.mts',default:'./index.mjs'}}}));const reader=join(root,side,'reader.mts');writeFileSync(reader,'export * from "@qualification/brand";');readers.push(reader);
   const runtimeReader=join(root,side,'reader.mjs');writeFileSync(runtimeReader,'export * from "@qualification/brand";');const installed=await import(pathToFileURL(runtimeReader));assert.deepEqual(Object.keys(installed).sort(),Object.keys(original).sort());for(const name of ['brandString','brandNumber'])for(const value of values)assert.ok(Object.is(installed[name](value),value));
  }
  const consumer=join(root,'consumer.mts');writeFileSync(consumer,'import * as L from "./left/reader.mjs";import * as R from "./right/reader.mjs";declare const left:L.Branded<"SessionId">;declare const right:R.BrandedNumber<"EventOrdinal">;const same:R.Branded<"SessionId">=left;const sameNumber:L.BrandedNumber<"EventOrdinal">=right;');const program=ts.createProgram([consumer],options),diagnostics=ts.getPreEmitDiagnostics(program);assert.ok(diagnostics.every(d=>d.file?.fileName===consumer));assert.deepEqual(diagnostics.map(d=>d.code),differentVersion?[2322,2322]:[]);
 }
 console.log('Brand SDK: all 5 original declarations, 5 positive/9 negative strict paired consumers, '+runtimeGroups+' identity-preserving runtime pairs and 1 unchanged upstream test; same-version duplicate-install nominal identities and distinct-version rejection under real NodeNext resolution; no runtime state, both CLI labels under Node.');
}finally{delete globalThis.brandTests;rmSync(dir,{recursive:true,force:true})}
