import assert from'node:assert/strict';import{readFileSync,writeFileSync,mkdtempSync,rmSync}from'node:fs';import{resolve,join}from'node:path';import{pathToFileURL,fileURLToPath}from'node:url';import{tmpdir}from'node:os';import{createHash}from'node:crypto';
const[entry,compiler,typeRoots]=process.argv.slice(2),ts=(await import(pathToFileURL(resolve(compiler)))).default;assert.equal(ts.version,'6.0.3');const fixture=fileURLToPath(new URL('../../../fixtures/schemastery-declarations/',import.meta.url)),provenance=JSON.parse(readFileSync(join(fixture,'provenance.json'),'utf8'));for(const[file,hash]of Object.entries(provenance.fixtures))assert.equal(createHash('sha256').update(readFileSync(join(fixture,file))).digest('hex'),hash);
const parse=(text,name)=>ts.createSourceFile(name,text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS),original=parse(readFileSync(join(fixture,'original-index.ts'),'utf8'),'original.ts'),methods=[],tuples=[];function visit(n){if(ts.isInterfaceDeclaration(n)&&n.name.text==='Static')for(const m of n.members)if(ts.isMethodSignature(m)&&['const','tuple','union','intersect'].includes(m.name.getText()))methods.push(m);if(ts.isTypeAliasDeclaration(n)&&['TupleS','TupleT'].includes(n.name.text))tuples.push(n);ts.forEachChild(n,visit)}visit(original);assert.equal(methods.length,4);assert.equal(tuples.length,2);
function shape(n){if(!n)return null;if(ts.isParenthesizedTypeNode(n))return shape(n.type);if(ts.isIdentifier(n)||ts.isStringLiteral(n))return{text:n.text};const children=[];ts.forEachChild(n,c=>{if(![ts.SyntaxKind.ExportKeyword,ts.SyntaxKind.DeclareKeyword].includes(c.kind))children.push(shape(c))});return{kind:n.kind,children}}
const generated=parse(readFileSync(entry,'utf8'),'candidate.d.mts'),statik=generated.statements.find(n=>ts.isInterfaceDeclaration(n)&&n.name.text==='Static');for(const m of methods)assert.deepEqual(shape(statik.members.find(n=>n.name?.text===m.name.text)),shape(m),'actual original const method '+m.name.text);
const dir=mkdtempSync(join(tmpdir(),'mithril-const-generics-'));try{
 const reference=join(dir,'reference.d.mts');writeFileSync(reference,`export type TypeS<X>=X;export type TypeT<X>=X;export type IntersectS<X>=X;export type IntersectT<X>=X;export type Schema<S=any,T=S>={input:S;output:T};\n`+tuples.map(n=>'export '+n.getText(original)).join('\n')+'\nexport interface Static{'+methods.map(n=>n.getText(original)).join('\n')+'}\n'+`
export type ConstFunction=<const T>(value:T)=>T;
export type PlainFunction=<T>(value:T)=>T;
export type FalseFunction=<T>(value:T)=>T;
export type ReadonlyConstrained=<const T extends readonly unknown[]>(value:T)=>T;
export type MutableConstrained=<const T extends unknown[]>(value:T)=>T;
export type DefaultFunction=<const T="fallback">(value?:T)=>T;
export type DependentDefaults=<const T,const U=T>(value:T,other?:U)=>[T,U];
export interface ConstCall{<const T>(value:T):T}
export interface ConstConstruct{new<const T>(value:T):{value:T}}
export type ConstructorType=new<const T>(value:T)=>{value:T};
declare const capture:unique symbol;export interface ConstComputed{[capture]<const T>(value:T):T}
declare class Box<const out T>{constructor(value:T);readonly value:T;capture<const U>(value:U):U;static staticCapture<const U>(value:U):U}
interface Box<T>{readonly extra?:T}
export type BoxConstructor=typeof Box;
declare function identity<const T>(value:T):T;
export type DeclaredFunction=typeof identity;
export {};
`);
 const positives=[
 ['source const string','declare const s:api.Static; const x:"x"=s.const("x").output;'],
 ['source const number','declare const s:api.Static;const x:42=s.const(42).input;'],
 ['source const object','declare const s:api.Static;const actual=s.const({tag:"x"}).output;const x:{readonly tag:"x"}=actual;'],
 ['source const nested','declare const s:api.Static;const actual=s.const(["x",{tag:42}]).output;const x:readonly ["x",{readonly tag:42}]=actual;'],
 ['source tuple inferred readonly','declare const s:api.Static;const actual=s.tuple(["x",42]).output;const x:["x"?,42?,...any[]]=actual;'],
 ['source tuple readonly variable','declare const s:api.Static;const x:["x"?,42?,...any[]]=s.tuple(["x",42] as const).input;'],
 ['source tuple empty','declare const s:api.Static;const x:any[]=s.tuple([]).output;'],
 ['source tuple widened variable','declare const s:api.Static;const v:string[]=["x"];const x:any[]=s.tuple(v).output;'],
 ['source union literal','declare const s:api.Static;const actual=s.union(["x","y"]).output;const x:"x"|"y"=actual;'],
 ['source intersect literal','declare const s:api.Static;const actual=s.intersect(["x","y"]).input;const x:"x"|"y"=actual;'],
 ['source union objects','declare const s:api.Static;const actual=s.union([{tag:"x"},{tag:"y"}]).output;const x:{readonly tag:"x"}|{readonly tag:"y"}=actual;'],
 ['source intersect numbers','declare const s:api.Static;const x:1|2=s.intersect([1,2]).output;'],
 ['const function literal','declare const f:api.ConstFunction;const actual=f({tag:"x"});const x:{readonly tag:"x"}=actual;'],
 ['plain function widens','declare const f:api.PlainFunction;const x:{tag:string}=f({tag:"x"});x.tag="y";'],
 ['false flag remains plain','declare const f:api.FalseFunction;const x:{tag:string}=f({tag:"x"});x.tag="y";'],
 ['readonly array constraint','declare const f:api.ReadonlyConstrained;const actual=f(["x",42]);const x:readonly ["x",42]=actual;'],
 ['mutable constraint inferred tuple','declare const f:api.MutableConstrained;const actual=f(["x",42]);const x:["x",42]=actual;actual[0]="x";actual.push(42);'],
 ['const default literal','declare const f:api.DefaultFunction;const actual=f();const x:"fallback"=actual;'],
 ['const default override','declare const f:api.DefaultFunction;const actual=f("chosen");const x:"chosen"=actual;'],
 ['dependent default','declare const f:api.DependentDefaults;const actual=f({tag:"x"});const x:[{readonly tag:"x"},{readonly tag:"x"}]=actual;'],
 ['dependent explicit other','declare const f:api.DependentDefaults;const actual=f("x",42);const x:["x",42]=actual;'],
 ['call signature','declare const f:api.ConstCall;const actual=f(["x",42]);const x:readonly ["x",42]=actual;'],
 ['construct signature','declare const C:api.ConstConstruct;const actual=new C({tag:"x"}).value;const x:"x"=actual.tag;'],
 ['constructor type','declare const C:api.ConstructorType;const actual=new C({tag:"x"}).value;const x:"x"=actual.tag;'],
 ['computed method','declare const o:api.ConstComputed;declare const k:keyof api.ConstComputed;const actual=o[k]({tag:"x"});const x:"x"=actual.tag;'],
 ['const class variance and merging','declare const C:api.BoxConstructor;const b=new C({tag:"x"});const x:"x"=b.value.tag;const y:{readonly tag:"x"}|undefined=b.extra;'],
 ['class instance method','declare const C:api.BoxConstructor;const b=new C(1);const actual=b.capture({tag:"x"});const x:"x"=actual.tag;'],
 ['class static method','declare const C:api.BoxConstructor;const actual=C.staticCapture({tag:"x"});const x:"x"=actual.tag;'],
 ['declared function','declare const f:api.DeclaredFunction;const actual=f({tag:"x"});const x:"x"=actual.tag;'],
 ['explicit generic overrides inference','declare const f:api.ConstFunction;const x:{tag:string}=f<{tag:string}>({tag:"x"});x.tag="y";'],
 ];
 const negatives=[
 ['source const literal mismatch','declare const s:api.Static;const x:"y"=s.const("x").output;'],
 ['source const readonly mutation','declare const s:api.Static;s.const({tag:"x"}).output.tag="x";'],
 ['source tuple input constraint','declare const s:api.Static;s.tuple(42);'],
 ['source tuple position','declare const s:api.Static;const x:[42?,"x"?,...any[]]=s.tuple(["x",42]).output;'],
 ['source union literal mismatch','declare const s:api.Static;const x:"z"=s.union(["x","y"]).output;'],
 ['source intersect literal mismatch','declare const s:api.Static;const x:3=s.intersect([1,2]).output;'],
 ['source union readonly object','declare const s:api.Static;s.union([{tag:"x"}]).output.tag="x";'],
 ['plain function loses literal','declare const f:api.PlainFunction;const actual=f({tag:"x"});const x:{tag:"x"}=actual;'],
 ['false flag loses literal','declare const f:api.FalseFunction;const actual=f({tag:"x"});const x:{tag:"x"}=actual;'],
 ['const function readonly','declare const f:api.ConstFunction;f({tag:"x"}).tag="x";'],
 ['readonly constraint wrong','declare const f:api.ReadonlyConstrained;f(42);'],
 ['readonly inferred tuple immutable','declare const f:api.ReadonlyConstrained;f(["x",42]).push("x");'],
 ['mutable inferred tuple limits values','declare const f:api.MutableConstrained;const actual=f(["x",42]);actual.push(7);'],
 ['default wrong literal','declare const f:api.DefaultFunction;const actual=f();const x:"wrong"=actual;'],
 ['dependent default readonly','declare const f:api.DependentDefaults;f({tag:"x"})[1].tag="x";'],
 ['call signature readonly','declare const f:api.ConstCall;f({tag:"x"}).tag="x";'],
 ['construct signature readonly','declare const C:api.ConstConstruct;new C({tag:"x"}).value.tag="x";'],
 ['constructor type readonly','declare const C:api.ConstructorType;new C({tag:"x"}).value.tag="x";'],
 ['computed method readonly','declare const o:api.ConstComputed;declare const k:keyof api.ConstComputed;o[k]({tag:"x"}).tag="x";'],
 ['class const readonly','declare const C:api.BoxConstructor;new C({tag:"x"}).value.tag="x";'],
 ['class value readonly','declare const C:api.BoxConstructor;new C("x").value="x";'],
 ['class static readonly','declare const C:api.BoxConstructor;C.staticCapture({tag:"x"}).tag="x";'],
 ['declared function readonly','declare const f:api.DeclaredFunction;f({tag:"x"}).tag="x";'],
 ];
 const groups=[];for(const[category,cases]of[['positive',positives],['negative',negatives]])for(const[name,body]of cases)for(const variant of ['original','candidate']){const file=join(dir,variant+'-'+groups.length+'.ts');writeFileSync(file,'import * as api from '+JSON.stringify(resolve(variant==='original'?reference:entry).replace(/\.d\.mts$/,'.mjs'))+';\n'+body);groups.push({category,name,variant,file})}
 const program=ts.createProgram(groups.map(g=>g.file),{strict:true,noEmit:true,skipLibCheck:false,target:ts.ScriptTarget.ES2024,module:ts.ModuleKind.ESNext,moduleResolution:ts.ModuleResolutionKind.Bundler,allowImportingTsExtensions:true,types:['node'],typeRoots:[resolve(typeRoots)]}),diagnostics=ts.getPreEmitDiagnostics(program),negative=new Set(groups.filter(g=>g.category==='negative').map(g=>g.file));assert.deepEqual(diagnostics.filter(d=>!d.file||!negative.has(d.file.fileName)).map(d=>({file:d.file?.fileName,code:d.code,text:ts.flattenDiagnosticMessageText(d.messageText,' ')})),[]);
 for(const[name]of negatives){const pair=groups.filter(g=>g.name===name),codes=g=>diagnostics.filter(d=>d.file?.fileName===g.file).map(d=>d.code).sort((a,b)=>a-b);assert(codes(pair[0]).length,name);assert.deepEqual(codes(pair[0]),codes(pair[1]),name)}
 const checker=program.getTypeChecker(),surface=file=>checker.getExportsOfModule(checker.getSymbolAtLocation(program.getSourceFile(resolve(file)))).map(s=>{const target=s.flags&ts.SymbolFlags.Alias?checker.getAliasedSymbol(s):s;return{name:s.name,type:!!(target.flags&ts.SymbolFlags.Type),value:!!(target.flags&ts.SymbolFlags.Value)}}).sort((a,b)=>a.name.localeCompare(b.name));assert.deepEqual(surface(entry),surface(reference));assert.equal(surface(entry).length,21);assert(surface(entry).every(s=>s.type&&!s.value));
 console.log(`Const generic oracle:4 hashed original Schemastery const/tuple/union/intersect signatures with explicit Schema/Type/Intersect observation helpers;${positives.length}positive/${negatives.length}negative/${positives.length+negatives.length} original-paired strict groups;21types/zero runtime values;function/method/call/construct/class/computed/variance/merged inference and plain/default/constraint distinctions, not full Schema typing.`);
}finally{rmSync(dir,{recursive:true,force:true})}
