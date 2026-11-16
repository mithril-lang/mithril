import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,mkdtempSync,rmSync,copyFileSync,realpathSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const [compiler,sdk,typed,typeRoots]=process.argv.slice(2),ts=(await import(pathToFileURL(resolve(compiler)))).default;
assert.equal(ts.version,'6.0.3');
const repo=fileURLToPath(new URL('../../../../',import.meta.url)),fixture=join(repo,'test/fixtures/values-core');
const proof=JSON.parse(readFileSync(join(fixture,'provenance.json'),'utf8'));
for(const[file,sha]of Object.entries(proof.fixtures)){const bytes=readFileSync(join(fixture,file));assert.equal(createHash('sha256').update(bytes).digest('hex'),sha);if(proof.originalGitBlobs[file])assert.equal(createHash('sha1').update(Buffer.from('blob '+bytes.length+'\0')).update(bytes).digest('hex'),proof.originalGitBlobs[file]);}
for(const[file,sha]of Object.entries(proof.mithrilSources))assert.equal(createHash('sha256').update(readFileSync(join(repo,'examples',file))).digest('hex'),sha);
const metadata=JSON.parse(readFileSync(typed+'.log','utf8'));
assert.deepEqual(metadata['type-exports'].sort(),['JsonValue','LengthReadOptions','PartialArguments','WeakMapWithValues'].sort());
const original=join(fixture,'index.d.ts'),candidate=join(typed,metadata['module-files']['values.index']);
const source=(file)=>ts.createSourceFile(file,readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
function shape(node){if(ts.isParenthesizedTypeNode(node))return shape(node.type);if(ts.isPrivateIdentifier(node))return{privateIdentifier:node.text};if(ts.isIdentifier(node)||ts.isStringLiteral(node))return{text:node.text};const children=[];ts.forEachChild(node,child=>{if(![ts.SyntaxKind.ExportKeyword,ts.SyntaxKind.DeclareKeyword].includes(child.kind))children.push(shape(child))});return{kind:node.kind,children}}
let count=0;for(const[a,b]of [['index.d.ts','module-0.d.mts'],['partial-json.d.ts','module-1.d.mts']]){const statements=file=>source(file).statements.filter(node=>!ts.isImportDeclaration(node)&&!ts.isExportDeclaration(node));const x=statements(join(fixture,a)),y=statements(join(typed,b));assert.deepEqual(y.map(shape),x.map(shape));count+=x.length}assert.equal(count,9);
const cases=[
 ['JSON recursive','const v:A.JsonValue={a:[1,null,true,"x"]};',true],
 ['snapshot generic','const source={name:"x"};const v:typeof source|undefined=A.snapshotJsonValue(source);',true],
 ['freeze generic preserves original mutable types','const v=A.deepFreeze({a:1});v.a=2;',true],
 ['weak map','const w=new A.WeakMapWithValues<object,{name:string}>();const key={};const same:typeof w=w.set(key,{name:"x"});const x:{name:string}|undefined=w.get(key);const values:ReadonlySet<{name:string}>=w.values;',true],
 ['streaming fields','const p=new A.PartialArguments();p.append("{}");const text:string|undefined=p.text("a");const length:number|undefined=p.stringLength("a",{step:2,offset:1});const keys:readonly string[]=p.keys();const complete:boolean=p.complete("a");',true],
 ['static construction','const a:A.PartialArguments=A.PartialArguments.fromText("{}");const b:A.PartialArguments=A.PartialArguments.fromObject({a:1});const empty:A.PartialArguments=A.PartialArguments.EMPTY;',true],
 ['JSON function','const bad:A.JsonValue=()=>1;',false],
 ['JSON undefined','const bad:A.JsonValue=undefined;',false],
 ['assertNever closed union','A.assertNever("unexpected");',false],
 ['boolean validation is not a type predicate','declare const v:unknown;if(A.isJsonValue(v)){const value:A.JsonValue=v;}',false],
 ['weak key','new A.WeakMapWithValues<string,number>();',false],
 ['weak value','new A.WeakMapWithValues<object,number>().set({},"x");',false],
 ['readonly live values','const w=new A.WeakMapWithValues<object,number>();w.values=new Set<number>();',false],
 ['readonly set methods','new A.WeakMapWithValues<object,number>().values.add(1);',false],
 ['named private member','new A.WeakMapWithValues<object,number>().keys;',false],
 ['private parser field','new A.PartialArguments().chunks;',false],
 ['readonly static empty','A.PartialArguments.EMPTY=new A.PartialArguments();',false],
 ['readonly keys','A.PartialArguments.EMPTY.keys().push("x");',false],
 ['wrong append','new A.PartialArguments().append(1);',false],
 ['wrong options','new A.PartialArguments().stringLength("a",{step:"x"});',false],
 ['readonly option','const v:A.LengthReadOptions={};v.step=1;',false],
 ['forged public view','declare const v:Pick<A.PartialArguments,keyof A.PartialArguments>;const p:A.PartialArguments=v;',false],
];
const dir=realpathSync(mkdtempSync(join(tmpdir(),'values-types-probe-')));try{
 const files=cases.map((_,i)=>join(dir,'consumer-'+i+'.mts')),options={strict:true,noEmit:true,skipLibCheck:false,types:[],allowImportingTsExtensions:true,target:ts.ScriptTarget.ES2024,module:ts.ModuleKind.NodeNext,moduleResolution:ts.ModuleResolutionKind.NodeNext};
 function check(root){const host=ts.createCompilerHost(options),read=host.readFile,exists=host.fileExists;host.readFile=file=>files.includes(file)?'import * as A from "@qualification/values";'+cases[files.indexOf(file)][1]:read(file);host.fileExists=file=>files.includes(file)||exists(file);host.resolveModuleNames=(names,file)=>names.map(n=>n==='@qualification/values'?{resolvedFileName:root,extension:root.endsWith('.mts')?ts.Extension.Dmts:ts.Extension.Dts,isExternalLibraryImport:true}:ts.resolveModuleName(n,file,options,host).resolvedModule);const program=ts.createProgram(files,options,host),groups=files.map(()=>[]);for(const d of ts.getPreEmitDiagnostics(program)){const i=files.indexOf(d.file?.fileName);assert(i>=0,ts.flattenDiagnosticMessageText(d.messageText,' '));groups[i].push(d.code)}const checker=program.getTypeChecker(),sf=program.getSourceFile(root),surface=checker.getExportsOfModule(checker.getSymbolAtLocation(sf)).map(s=>{const target=s.flags&ts.SymbolFlags.Alias?checker.getAliasedSymbol(s):s;return{name:s.name,type:!!(target.flags&ts.SymbolFlags.Type),value:!!(target.flags&ts.SymbolFlags.Value)}}).sort((a,b)=>a.name.localeCompare(b.name));return{groups,surface}}
 const expected=check(original);for(let i=0;i<cases.length;i++)assert.equal(expected.groups[i].length===0,cases[i][2],cases[i][0]);assert.deepEqual(check(candidate),expected);

 // Re-emit complete pinned original sources; TypeScript is an oracle only.
 for(const leaf of ['index','partial-json'])copyFileSync(join(fixture,'original-'+leaf+'.ts'),join(dir,leaf+'.ts'));
 const emissionOptions={strict:true,noImplicitAny:true,skipLibCheck:false,declaration:true,emitDeclarationOnly:true,allowImportingTsExtensions:true,rewriteRelativeImportExtensions:true,typeRoots:[resolve(typeRoots)],types:['node'],target:ts.ScriptTarget.ES2024,module:ts.ModuleKind.ESNext,moduleResolution:ts.ModuleResolutionKind.Bundler};
 const emission=ts.createProgram(['index','partial-json'].map(n=>join(dir,n+'.ts')),emissionOptions);
 assert.deepEqual(ts.getPreEmitDiagnostics(emission),[],'Complete original strict emission');const emitted=[];
 const result=emission.emit(undefined,(file,text)=>emitted.push([file,text]));assert.equal(result.emitSkipped,false);assert.deepEqual(result.diagnostics,[]);assert.equal(emitted.length,2);
 for(const[file,text]of emitted)assert.equal(text,readFileSync(join(fixture,file.split('/').at(-1)),'utf8'));
 // Real NodeNext package resolution, with both declaration modules retained.
 for(const mode of ['original','candidate'])for(const differentVersion of [false,true]){
  const root=join(dir,mode+'-'+differentVersion);mkdirSync(root,{recursive:true});
  for(const[side,version]of [['left','0.2.1-alpha.1'],['right',differentVersion?'0.2.1-alpha.2':'0.2.1-alpha.1']]){
   const pkg=join(root,side,'node_modules/@qualification/values');mkdirSync(pkg,{recursive:true});
   for(const[from,to]of mode==='original'?[['index.d.ts','index.d.ts'],['partial-json.d.ts','partial-json.d.ts']]:[['module-0.d.mts','module-0.d.mts'],['module-1.d.mts','module-1.d.mts']])copyFileSync(join(mode==='original'?fixture:typed,from),join(pkg,to));
   if(mode==='candidate')for(const file of ['index.mjs','module-0.mjs','module-1.mjs'])copyFileSync(join(sdk,file),join(pkg,file));
   writeFileSync(join(pkg,'package.json'),JSON.stringify({name:'@qualification/values',version,type:'module',exports:{'.':{types:mode==='original'?'./index.d.ts':'./module-0.d.mts',default:'./index.mjs'}}}));
   writeFileSync(join(root,side,'reader.mts'),'export * from "@qualification/values";');
   if(mode==='candidate'){const reader=join(root,side,'reader.mjs');writeFileSync(reader,'export * from "@qualification/values";');const api=await import(pathToFileURL(reader));assert.deepEqual(Object.keys(api).sort(),expected.surface.filter(s=>s.value).map(s=>s.name).sort());const args=api.PartialArguments.fromText('{"a":"x"}');assert.equal(args.text('a'),'x');const w=new api.WeakMapWithValues();const key={};assert.equal(w.set(key,1).get(key),1);}
  }
  const consumer=join(root,'consumer.mts');writeFileSync(consumer,'import * as L from "./left/reader.mjs";import * as R from "./right/reader.mjs";declare const p:L.PartialArguments;const same:R.PartialArguments=p;declare const w:L.WeakMapWithValues<object,number>;const sameMap:R.WeakMapWithValues<object,number>=w;');
  const program=ts.createProgram([consumer],options),diagnostics=ts.getPreEmitDiagnostics(program);assert.ok(diagnostics.every(d=>d.file?.fileName===consumer));assert.deepEqual(diagnostics.map(d=>d.code),differentVersion?[2322,2322]:[]);
 }

 // Independent runtime probes cover all five JSON helpers as well as the unchanged parser/map tests.
 for(const leaf of ['index','partial-json'])writeFileSync(join(dir,leaf+'.mjs'),ts.transpileModule(readFileSync(join(fixture,'original-'+leaf+'.ts'),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2024,module:ts.ModuleKind.ESNext}}).outputText.replaceAll("'./index.ts'","'./index.mjs'").replaceAll("'./partial-json.ts'","'./partial-json.mjs'"));
 const originalApi=await import(pathToFileURL(join(dir,'index.mjs'))),actualApi=await import(pathToFileURL(resolve(sdk,'index.mjs')));
 const factories=[()=>null,()=>true,()=>'',()=>0,()=>-0,()=>NaN,()=>Infinity,()=>undefined,()=>1n,()=>Symbol('x'),()=>()=>1,()=>({a:[1,null,'x']}),()=>Object.assign(Object.create(null),{x:1}),()=>new Date(0),()=>new Number(1),()=>new Map(),()=>new Set(),()=>{const a=[];a.length=1;return a},()=>Object.assign([],{x:1}),()=>Object.defineProperty({},'x',{value:1}),()=>({[Symbol('x')]:1}),()=>{const a={};a.self=a;return a},()=>{const a={x:1};return{a,b:a}},()=>Object.create({x:1}),()=>JSON.parse('{"__proto__":{"x":1}}')];
 const outcome=fn=>{try{return{value:fn()}}catch(error){return{error:{name:error.name,message:error.message}}}};
 let utilityGroups=0;
 for(const make of factories)for(const name of ['snapshotJsonValue','isJsonValue']){assert.deepEqual(outcome(()=>actualApi[name](make())),outcome(()=>originalApi[name](make())));utilityGroups++;}
 for(const context of [undefined,'phase',''])for(const value of [undefined,null,{a:1},1n]){assert.deepEqual(outcome(()=>actualApi.assertNever(value,context)),outcome(()=>originalApi.assertNever(value,context)));utilityGroups++;}
 for(const[a,b]of [[{a:[1,null]},{a:[1,null]}],[{a:1},{a:2}],[[],{}],[NaN,NaN],[0,-0],[null,{}],[{a:1,b:2},{b:2,a:1}],[{a:undefined},{}]]){assert.deepEqual(actualApi.deepEqualJson(a,b),originalApi.deepEqualJson(a,b));utilityGroups++;}
 for(const api of [originalApi,actualApi]){const a={a:{b:[1]}};assert.equal(api.deepFreeze(a),a);assert.ok(Object.isFrozen(a)&&Object.isFrozen(a.a)&&Object.isFrozen(a.a.b));const cyclic={};cyclic.self=cyclic;assert.equal(api.deepFreeze(cyclic),cyclic);assert.ok(Object.isFrozen(cyclic));const child={x:1},shared={a:child,b:child};assert.equal(api.deepFreeze(shared),shared);assert.ok(Object.isFrozen(child));const detached=api.snapshotJsonValue({a:child,b:child});assert.notEqual(detached.a,child);assert.notEqual(detached.a,detached.b);assert.equal(Object.getPrototypeOf(api.snapshotJsonValue(JSON.parse('{"__proto__":{"x":1}}'))),Object.prototype);}
 utilityGroups+=5;
 console.log('Values JSON helpers: '+utilityGroups+' original-paired groups, including lossy values, cycles, shared aliases, safe __proto__, freezing, and exact assertion failures.');

 // Isolate #private nominality: ordinary private properties cannot mask a missing marker.
 const privateNode=source(join(typed,'module-1.d.mts')).statements.find(n=>ts.isClassDeclaration(n)&&n.name.text==='PartialArguments').members.find(n=>ts.isPrivateIdentifier(n.name));assert.equal(privateNode.getText(),'#private;');const marker=join(dir,'marker.d.mts');writeFileSync(marker,`export declare class A {${privateNode.getText()}} export declare class B {${privateNode.getText()}} export declare class Public {}`);
 const markerConsumer=join(dir,'marker-consumer.mts');writeFileSync(markerConsumer,'import {A,B,Public} from "./marker.mjs";declare const a:A;declare const b:B;declare const p:Public;const same:A=a;const wrong:A=b;const forged:A=p;');
 const markerProgram=ts.createProgram([markerConsumer],options);assert.deepEqual(ts.getPreEmitDiagnostics(markerProgram).map(d=>d.code),[2322,2741]);
 console.log('Values SDK: all 9 original declarations, 6 positive/16 negative strict paired consumers; complete original strict re-emission; same-version nominal identity and distinct-version rejection under real NodeNext; isolated genuine #private nominality; Node execution only.');

}finally{rmSync(dir,{recursive:true,force:true})}
