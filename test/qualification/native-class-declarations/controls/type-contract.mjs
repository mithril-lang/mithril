import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {resolve,join,dirname} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
const [candidate,compiler,typeRoots,controls,runtime,metadata]=process.argv.slice(2);
const ts=(await import(pathToFileURL(resolve(compiler)))).default;
assert.equal(ts.version,'6.0.3');
const fixture=fileURLToPath(new URL('../../../fixtures/cordis-declarations/',import.meta.url));
const provenance=JSON.parse(readFileSync(join(fixture,'program-provenance.json'),'utf8'));
for(const file of ['service.d.ts','utils.d.ts'])assert.equal(createHash('sha256').update(readFileSync(join(fixture,'program',file))).digest('hex'),provenance.outputs[file].sha256);
const parse=(text,name)=>ts.createSourceFile(name,text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
const named=n=>ts.isComputedPropertyName(n)?{computed:n.expression.getText().replace(/\s+/g,'')}:n.text;
const modifiers=n=>(n.modifiers||[]).filter(m=>![ts.SyntaxKind.ExportKeyword,ts.SyntaxKind.DeclareKeyword,ts.SyntaxKind.PublicKeyword].includes(m.kind)).map(m=>m.kind);
// Compare every original declaration's structure, ignoring only parentheses/name quoting and import adapters.
function fingerprint(n){
 if(!n)return null;
 if(ts.isParenthesizedTypeNode(n))return fingerprint(n.type);
 if(ts.isIdentifier(n))return{identifier:n.text};
 if(ts.isStringLiteral(n)||ts.isNumericLiteral(n))return{kind:n.kind,text:n.text};
 if(ts.isClassDeclaration(n)||ts.isInterfaceDeclaration(n))return{kind:n.kind,name:n.name.text,modifiers:modifiers(n),generics:(n.typeParameters||[]).map(fingerprint),heritage:(n.heritageClauses||[]).map(fingerprint),members:n.members.map(fingerprint)};
 if(ts.isPropertyDeclaration(n)||ts.isPropertySignature(n))return{kind:n.kind,name:named(n.name),modifiers:modifiers(n),optional:!!n.questionToken,type:fingerprint(n.type)};
 if(ts.isMethodDeclaration(n)||ts.isMethodSignature(n)||ts.isGetAccessorDeclaration(n)||ts.isConstructorDeclaration(n)||ts.isFunctionDeclaration(n))return{kind:n.kind,name:n.name?named(n.name):null,modifiers:modifiers(n),optional:!!n.questionToken,generics:(n.typeParameters||[]).map(fingerprint),params:n.parameters.map(fingerprint),type:fingerprint(n.type)};
 const children=[];ts.forEachChild(n,child=>{children.push(fingerprint(child));});
 return{kind:n.kind,children};
}
const expectedStatements=['service','utils'].flatMap(name=>parse(readFileSync(join(fixture,'program',name+'.d.ts'),'utf8'),name+'.d.ts').statements).filter(n=>!ts.isImportDeclaration(n)&&!ts.isExportDeclaration(n));
const emittedStatements=parse(readFileSync(candidate,'utf8'),'candidate.d.mts').statements.filter(n=>!ts.isExportDeclaration(n));
assert.equal(expectedStatements.length,14);assert.deepEqual(emittedStatements.map(fingerprint),expectedStatements.map(fingerprint));
const dir=mkdtempSync(join(tmpdir(),'mithril-class-consumers-'));
try{
 const reference=join(dir,'original.d.mts'),adapted=join(dir,'candidate.d.mts'),generic=join(dir,'generic.d.mts');
 writeFileSync(reference,['service','utils'].map(name=>`export * from ${JSON.stringify(join(fixture,'program',name+'.js'))};`).join('\n'));
 // This shared external binding is explicit: candidate Context imports/augmentation are not implemented yet.
 const adapter=`import {Context} from ${JSON.stringify(join(fixture,'program/context.js'))};\n`;
 writeFileSync(adapted,adapter+readFileSync(candidate,'utf8'));
 writeFileSync(generic,adapter+readFileSync(controls,'utf8'));
 const positive=[
 ['abstract generic subclass',`declare const c:Context;class S extends api.Service<{x:number}>{constructor(){super(c,'api');}read(){const root:Context=this.ctx.root;return root;}merge(){const x:{x:number}=this[api.symbols.resolveConfig]({x:1},{x:2});return x;}}`],
 ['covariance','declare const narrow:api.Service<{x:1}>;const wide:api.Service<{x:number}>=narrow;'],
 ['default type parameter','declare const s:api.Service;const x:never=s[api.symbols.config];'],
 ['unique symbol aliases','const key:typeof api.Service.config=api.symbols.config;const init:typeof api.Service.init=api.symbols.init;const filter:typeof Context.filter=api.symbols.filter;'],
 ['protected computed subclass',`declare const c:Context;class S extends api.Service{constructor(){super(c,'api');}filter(c:Context){const b:boolean=this[api.symbols.filter](c);return b;}extend(){return this[api.symbols.extend]({x:1});}}`],
 ['object config inference','declare const s:api.Service<{x:number}>;const x:{x:number}=s[api.symbols.resolveConfig]();s[api.symbols.resolveConfig]({x:1});'],
 ['DisposableList object key','const list=new api.DisposableList<object>();const key={};const cleanup:()=>boolean=list.push(key);const n:number=list.length;const removed:boolean=list.delete(key);const all:object[]=list.clear();'],
 ['DisposableList weak symbol key','const list=new api.DisposableList<symbol>();list.push(Symbol());for(const value of list){const key:symbol=value;}'],
 ['traceable generic identity','declare const c:Context;const x:{value:1}=api.getTraceable(c,{value:1 as const});'],
 ['constructor type predicate','declare const x:unknown;if(api.isConstructor(x)){new x();}'],
 ['descriptor and error inference','declare const c:Context;const descriptor:TypedPropertyDescriptor<any>|undefined=api.getPropertyDescriptor(c,"root");const value:number=api.composeError(info=>{const err:Error=info.error;return info.offset;});'],
 ['Tracker interface','const t:api.Tracker={associate:"api",property:"ctx",noShadow:true};'],
 ['original protected computed bracket access','declare const s:api.Service;s[api.symbols.filter];'],
 ];
 const negative=[
 ['abstract construction',`declare const c:Context;new api.Service(c,'api');`],
 ['protected field','declare const s:api.Service;s.ctx;'],
 ['reverse covariance','declare const wide:api.Service<{x:number}>;const narrow:api.Service<{x:1}>=wide;'],
 ['wrong service config','declare const s:api.Service<{x:number}>;s[api.symbols.resolveConfig]({x:"bad"});'],
 ['private list field','declare const list:api.DisposableList<object>;list.map;'],
 ['getter write','declare const list:api.DisposableList<object>;list.length=2;'],
 ['static readonly symbol write','api.Service.config=Symbol();'],
 ['distinct unique symbols','const key:typeof api.Service.config=api.Service.init;'],
 ['private nominal identity','declare class Fake{private sn:number;private map:number;private weak:number;readonly length:number;push(value:object):()=>boolean;delete(value:object):boolean;clear():object[];[Symbol.iterator]():MapIterator<object>;}declare const fake:Fake;const list:api.DisposableList<object>=fake;'],
 ['weak key constraint','new api.DisposableList<number>();'],
 ['wrong list item','declare const list:api.DisposableList<{x:number}>;list.push({x:"bad"});'],
 ['class arity','type S=api.Service<string,number>;'],
 ['instance not static','api.Service.name="bad";'],
 ['required superclass constructor name','class Bad extends api.Service{constructor(c:Context){super(c);}}'],
 ];
 const genericCases=[
 ['polymorphic this',true,'declare const c:api.SelfChildType;const child:api.SelfChildType=c.self();const length:number=c.length;'],
 ['getter readonly',false,'declare const c:api.SelfChildType;c.length=2;'],
 ['private opaque identity',false,'declare const c:api.SelfClassType;c.brand;'],
 ['type-only constructor inheritance',true,'declare const C:api.SelfConstructor;class Child extends C{extra=1;}const child:Child=new Child().self();'],
 ['abstract constructor',false,'declare const C:api.AbstractConstructor;new C();'],
 ['abstract method obligation',false,'declare const C:api.AbstractConstructor;class Missing extends C{}'],
 ['private constructor',false,'declare const C:api.PrivateConstructor;new C();'],
 ['protected constructor',false,'declare const C:api.ProtectedConstructor;new C();'],
 ['protected super',true,'declare const C:api.ProtectedConstructor;class Child extends C{constructor(){super();}}new Child();'],
 ['method overload string',true,'declare const c:api.OverloadsType;const s:string=c.choose("x");const n:number=c.choose(1);'],
 ['method overload invalid',false,'declare const c:api.OverloadsType;c.choose(true);'],
 ['class contravariance',true,'declare const broad:api.InputType<{x:number}>;const narrow:api.InputType<{x:1}>=broad;'],
 ['class contravariance reverse',false,'declare const narrow:api.InputType<{x:1}>;const broad:api.InputType<{x:number}>=narrow;'],
 ['explicit invariance',false,'declare const narrow:api.InvariantType<{x:1}>;const broad:api.InvariantType<{x:number}>=narrow;'],
 ['interface polymorphic this',true,'interface Child extends api.InterfaceSelfType{extra:number;}declare const child:Child;const root:Child=child.root;'],
 ['class extends and implements',true,'declare const c:api.ImplementedType;const child:api.SelfChildType=c.self();const n:number=c.length;'],
 ['this predicate',true,'declare const c:api.GuardType;if(c.guard()){const ready:true=c.ready;}'],
 ['inherited unique static type query',true,'const key:api.InheritedConfig=api.Service.config;'],
 ['inherited distinct unique symbol',false,'const key:api.InheritedConfig=api.Service.init;'],
 ['direct const unique symbol',true,'declare const key:api.UniqueTokenType;const symbol:symbol=key;'],
 ['direct unique symbol brand',false,'const key:api.UniqueTokenType=Symbol();'],
 ];
 const groups=[],files=[];
 const consumer=(variant,entry,name,body,ok)=>{const file=join(dir,variant+'-'+files.length+'.ts');writeFileSync(file,`import * as api from ${JSON.stringify(entry.replace(/\.d\.mts$/,'.mjs'))};\nimport {Context} from ${JSON.stringify(join(fixture,'program/context.js'))};\n${body}\n`);files.push(file);return{variant,file,name,ok};};
 for(const[ok,cases]of[[true,positive],[false,negative]])for(const[name,body]of cases)groups.push({paired:true,cases:[consumer('original',reference,name,body,ok),consumer('candidate',adapted,name,body,ok)]});
 for(const[name,ok,body]of genericCases)groups.push({paired:false,cases:[consumer('generic',generic,name,body,ok)]});
 const program=ts.createProgram(files,{strict:true,noEmit:true,skipLibCheck:false,target:ts.ScriptTarget.ES2024,module:ts.ModuleKind.ESNext,moduleResolution:ts.ModuleResolutionKind.Bundler,allowImportingTsExtensions:true,types:['node'],typeRoots:[resolve(typeRoots)],paths:{'@deepseek-ai/cosmokit':[resolve(fixture,'../cosmokit-declarations/index.d.ts')],'@standard-schema/spec':[join(fixture,'standard-schema/index.d.ts')]}});
 const diagnostics=ts.getPreEmitDiagnostics(program),negativeFiles=new Set(groups.flatMap(g=>g.cases.filter(c=>!c.ok).map(c=>c.file)));
 const unexpected=diagnostics.filter(d=>!d.file||!negativeFiles.has(d.file.fileName));assert.deepEqual(unexpected.map(d=>({code:d.code,file:d.file?.fileName,message:ts.flattenDiagnosticMessageText(d.messageText,' ')})),[]);
 for(const group of groups){const codes=c=>diagnostics.filter(d=>d.file?.fileName===c.file).map(d=>d.code).sort((a,b)=>a-b);for(const c of group.cases.filter(c=>!c.ok))assert(codes(c).length,c.name);if(group.paired)assert.deepEqual(codes(group.cases[1]),codes(group.cases[0]),group.cases[0].name);}
 const checker=program.getTypeChecker(),surface=file=>checker.getExportsOfModule(checker.getSymbolAtLocation(program.getSourceFile(file))).map(s=>{const x=s.flags&ts.SymbolFlags.Alias?checker.getAliasedSymbol(s):s;return{name:s.name,value:!!(x.flags&ts.SymbolFlags.Value),type:!!(x.flags&ts.SymbolFlags.Type)}}).sort((a,b)=>a.name.localeCompare(b.name));assert.deepEqual(surface(adapted),surface(reference));const publicSurface=surface(reference);assert.equal(publicSurface.filter(s=>s.value).length,12);assert.equal(publicSurface.filter(s=>s.type).length,3);
 const meta=JSON.parse(readFileSync(metadata,'utf8')),actual=await import(pathToFileURL(resolve(runtime))),{Context:ActualContext}=await import(pathToFileURL(join(dirname(resolve(runtime)),meta['module-files']['cordis.context']))),original=await import(new URL('../../../fixtures/cordis-core/index.mjs',import.meta.url));
 const runtimeNames=publicSurface.filter(s=>s.value).map(s=>s.name).sort();assert.deepEqual(Object.keys(actual).sort(),runtimeNames);
 async function runtimeContract(api,Context){const out=[];out.push(Object.keys(api.Service).sort());for(const key of ['init','check','config','invoke','extend','tracker','resolveConfig'])assert.equal(api.Service[key],api.symbols[key]);for(const key of ['effect','filter','isolate','intercept'])assert.equal(api.symbols[key],Context[key]);out.push(api.Service.name,api.Service.length,api.DisposableList.name);const list=new api.DisposableList(),key={};const cleanup=list.push(key);out.push(list.length,[...list].length,list.delete(key),cleanup(),list.clear().length);const c=new Context();c.logger.error=()=>{};class S extends api.Service{constructor(){super(c,'api');}}const s=new S();assert.equal(s.ctx,c);out.push(s.name,s instanceof api.Service,s[api.symbols.resolveConfig]({x:1},{y:2}));await c.fiber.dispose();out.push(c.reflect.get('api',false)===undefined);return out;}
 const originalSubset=Object.fromEntries(runtimeNames.map(name=>[name,original[name]]));assert.deepEqual(await runtimeContract(actual,ActualContext),await runtimeContract(originalSubset,original.Context));
 console.log(`Class declaration oracle:14 original Service/Utils declaration structures (2classes/23members),13positive/14negative paired strict consumers,21generic class consumer groups,exact13publicnames/12values/3types;actual12-value native ESM CLI root and paired runtime ownership/list checks. Context import is a pinned shared qualification adapter; full Cordis type graph remains pending.`);
}finally{rmSync(dir,{recursive:true,force:true});}
