import assert from'node:assert/strict';import{readFileSync,writeFileSync,mkdtempSync,rmSync}from'node:fs';import{resolve,join}from'node:path';import{pathToFileURL,fileURLToPath}from'node:url';import{tmpdir}from'node:os';import{createHash}from'node:crypto';
const[entry,compiler,typeRoots]=process.argv.slice(2),ts=(await import(pathToFileURL(resolve(compiler)))).default;assert.equal(ts.version,'6.0.3');const fixture=fileURLToPath(new URL('../../../fixtures/schemastery-declarations/',import.meta.url)),provenance=JSON.parse(readFileSync(join(fixture,'provenance.json'),'utf8'));for(const[file,hash]of Object.entries(provenance.fixtures))assert.equal(createHash('sha256').update(readFileSync(join(fixture,file))).digest('hex'),hash);
const parse=(text,name)=>ts.createSourceFile(name,text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS),original=parse(readFileSync(join(fixture,'original-index.ts'),'utf8'),'original.ts'),aliases=[];function visit(n){if(ts.isTypeAliasDeclaration(n)&&['TupleS','TupleT'].includes(n.name.text))aliases.push(n);ts.forEachChild(n,visit)}visit(original);assert.equal(aliases.length,2);
function shape(n){if(!n)return null;if(ts.isParenthesizedTypeNode(n))return shape(n.type);if(ts.isIdentifier(n))return{identifier:n.text};if(ts.isTypeAliasDeclaration(n))return{kind:n.kind,name:n.name.text,params:(n.typeParameters||[]).map(shape),type:shape(n.type)};const children=[];ts.forEachChild(n,c=>{if(![ts.SyntaxKind.ExportKeyword,ts.SyntaxKind.DeclareKeyword].includes(c.kind))children.push(shape(c))});return{kind:n.kind,children}}
const generated=parse(readFileSync(entry,'utf8'),'candidate.d.mts');for(const a of aliases)assert.deepEqual(shape(generated.statements.find(n=>ts.isTypeAliasDeclaration(n)&&n.name.text===a.name.text)),shape(a),a.name.text+' actual original tuple structure');
const dir=mkdtempSync(join(tmpdir(),'mithril-variadic-tuples-'));try{
 const reference=join(dir,'reference.d.mts');writeFileSync(reference,'export type TypeS<X>=X;export type TypeT<X>=X;\n'+aliases.map(n=>'export '+n.getText(original)).join('\n')+`\nexport type OptionalThenArray=[number?,...string[]];export type ArrayThenRequired=[...string[],number];export type GenericThenOptional<T extends unknown[]>=[...T,number?];export type Concat<T extends unknown[],U extends unknown[]>=[...T,...U];export type NamedRest=[head:number,...tail:string[]];export type FixedThenOptional=[...[number],string?];export type ReadonlySpread=[...readonly string[]];export type UnionArrays=[...(number[]|string[])];export type RestCall=<T extends unknown[]>(...args:[number,...T])=>T;`);
 const positives=[
 ['source TupleS empty','const a:api.TupleS<readonly [string,number]>=[];'],
 ['source TupleS full','const a:api.TupleS<readonly [string,number]>=["x",1];'],
 ['source TupleT optional','const a:api.TupleT<readonly [string,number]>=["x"];'],
 ['source recursive third item','const a:api.TupleS<[string,number,boolean]>=["x",1,true];'],
 ['source optional position','const a:api.TupleT<[string,number]>=[undefined,1];'],
 ['source array fallback','const a:api.TupleS<string[]>=[1,true,"x"];'],
 ['optional then array empty','const a:api.OptionalThenArray=[];'],
 ['optional then array values','const a:api.OptionalThenArray=[1,"x","y"];'],
 ['required tail after array','const a:api.ArrayThenRequired=["x",1];const b:api.ArrayThenRequired=[1];'],
 ['generic optional tail','const a:api.GenericThenOptional<[string]>=["x"];const b:api.GenericThenOptional<[string]>=["x",1];'],
 ['generic optional instantiated array','const a:api.GenericThenOptional<string[]>=["x",1];'],
 ['multiple generic spreads','const a:api.Concat<[string],[number,boolean]>=["x",1,true];'],
 ['generic array concatenation','const a:api.Concat<[number],string[]>=[1,"x"];'],
 ['named rest','const a:api.NamedRest=[1];const b:api.NamedRest=[1,"x"];'],
 ['fixed spread optional tail','const a:api.FixedThenOptional=[1];const b:api.FixedThenOptional=[1,"x"];'],
 ['readonly spread mutable result','const a:api.ReadonlySpread=["x"];a.push("y");'],
 ['union arrays','const a:api.UnionArrays=[1,2];const b:api.UnionArrays=["x"];'],
 ['generic rest call result','declare const f:api.RestCall;const a:[string,boolean]=f<[string,boolean]>(1,"x",true);'],
 ];
 const negatives=[
 ['source first item','const a:api.TupleS<[string,number]>=[1];'],
 ['source second item','const a:api.TupleT<[string,number]>=["x","wrong"];'],
 ['source recursive third item wrong','const a:api.TupleS<[string,number,boolean]>=["x",1,"wrong"];'],
 ['source input constraint','type A=api.TupleS<number>;'],
 ['optional prefix wrong','const a:api.OptionalThenArray=["x"];'],
 ['array tail wrong','const a:api.ArrayThenRequired=["x"];'],
 ['array tail missing','const a:api.ArrayThenRequired=[];'],
 ['generic optional tail wrong','const a:api.GenericThenOptional<[string]>=["x","wrong"];'],
 ['concat item wrong','const a:api.Concat<[string],[number]>=[1,2];'],
 ['concat missing','const a:api.Concat<[string],[number]>=[];'],
 ['named rest wrong','const a:api.NamedRest=[1,2];'],
 ['fixed required prefix','const a:api.FixedThenOptional=[];'],
 ['readonly spread wrong','const a:api.ReadonlySpread=[1];'],
 ['union rest mixed array','const a:api.UnionArrays=[1,"x"];'],
 ['rest call missing','declare const f:api.RestCall;f<[string,boolean]>(1);'],
 ['rest call wrong prefix','declare const f:api.RestCall;f<[string]>("wrong","x");'],
 ];
 const groups=[];for(const[category,cases]of[['positive',positives],['negative',negatives]])for(const[name,body]of cases)for(const variant of ['original','candidate']){const file=join(dir,variant+'-'+groups.length+'.ts');writeFileSync(file,'import * as api from '+JSON.stringify(resolve(variant==='original'?reference:entry).replace(/\.d\.mts$/,'.mjs'))+';\n'+body);groups.push({category,name,variant,file})}
 const program=ts.createProgram(groups.map(g=>g.file),{strict:true,noEmit:true,skipLibCheck:false,target:ts.ScriptTarget.ES2024,module:ts.ModuleKind.ESNext,moduleResolution:ts.ModuleResolutionKind.Bundler,allowImportingTsExtensions:true,types:['node'],typeRoots:[resolve(typeRoots)]}),diagnostics=ts.getPreEmitDiagnostics(program),negative=new Set(groups.filter(g=>g.category==='negative').map(g=>g.file));assert.deepEqual(diagnostics.filter(d=>!d.file||!negative.has(d.file.fileName)).map(d=>({file:d.file?.fileName,code:d.code,text:ts.flattenDiagnosticMessageText(d.messageText,' ')})),[]);
 for(const[name]of negatives){const pair=groups.filter(g=>g.name===name),codes=g=>diagnostics.filter(d=>d.file?.fileName===g.file).map(d=>d.code).sort((a,b)=>a-b);assert(codes(pair[0]).length,name);assert.deepEqual(codes(pair[0]),codes(pair[1]),name)}
 const checker=program.getTypeChecker(),surface=file=>checker.getExportsOfModule(checker.getSymbolAtLocation(program.getSourceFile(resolve(file)))).map(s=>{const target=s.flags&ts.SymbolFlags.Alias?checker.getAliasedSymbol(s):s;return{name:s.name,type:!!(target.flags&ts.SymbolFlags.Type),value:!!(target.flags&ts.SymbolFlags.Value)}}).sort((a,b)=>a.name.localeCompare(b.name));assert.deepEqual(surface(entry),surface(reference));assert.equal(surface(entry).length,13);assert(surface(entry).every(s=>s.type&&!s.value));
 console.log('Variadic tuple oracle:2 hashed original Schemastery tuple templates with explicit identity TypeS/TypeT observation helpers;34 original-paired strict groups;13types/zero runtime values;optional/array/generic/named/readonly/union rest and recursive inference, not full Schemastery typing.');
}finally{rmSync(dir,{recursive:true,force:true})}
