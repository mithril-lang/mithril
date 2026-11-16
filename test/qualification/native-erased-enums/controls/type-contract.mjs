import assert from'node:assert/strict';import{readFileSync,writeFileSync,mkdtempSync,rmSync}from'node:fs';import{resolve,join,dirname}from'node:path';import{pathToFileURL,fileURLToPath}from'node:url';import{tmpdir}from'node:os';import{createHash}from'node:crypto';
const[entry,compiler,typeRoots,metadata,runtime,generic]=process.argv.slice(2),ts=(await import(pathToFileURL(resolve(compiler)))).default;assert.equal(ts.version,'6.0.3');const fixture=fileURLToPath(new URL('../../../fixtures/cordis-declarations/',import.meta.url)),meta=JSON.parse(readFileSync(metadata,'utf8')),provenance=JSON.parse(readFileSync(join(fixture,'program-provenance.json'),'utf8')),parse=(s,n)=>ts.createSourceFile(n,s,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
const generated=parse(readFileSync(join(dirname(entry),meta['module-files']['cordis.enum_constants']),'utf8'),'enums.d.mts').statements.filter(ts.isEnumDeclaration);
const fingerprint=n=>({name:n.name.text,const:n.modifiers.some(m=>m.kind===ts.SyntaxKind.ConstKeyword),members:n.members.map(m=>({name:m.name.text,value:m.initializer.getText()}))});
for(const[file,name]of[['logger','LoggerLevel'],['fiber','FiberState']]){const b=readFileSync(join(fixture,'program',file+'.d.ts'));assert.equal(createHash('sha256').update(b).digest('hex'),provenance.outputs[file+'.d.ts'].sha256);const original=parse(b.toString(),file+'.d.ts').statements.find(n=>ts.isEnumDeclaration(n)&&n.name.text===name);assert.deepEqual(fingerprint(generated.find(n=>n.name.text===name)),fingerprint(original));}
const dir=mkdtempSync(join(tmpdir(),'mithril-enum-consumers-'));
try{
 const reference=join(dir,'reference.d.mts');writeFileSync(reference,`export * from ${JSON.stringify(join(fixture,'program/context.js'))};export type {Service} from ${JSON.stringify(join(fixture,'program/service.js'))};export {LoggerLevel} from ${JSON.stringify(join(fixture,'program/logger.js'))};export {FiberState} from ${JSON.stringify(join(fixture,'program/fiber.js'))};`);
 const genericReference=join(dir,'generic-reference.d.mts');writeFileSync(genericReference,`export * from './reference.mjs';declare class TypeErrorProbe extends TypeError {}declare class ErrorProbe extends Error {}export type TypeErrorConstructor=typeof TypeErrorProbe;export type ErrorConstructor=typeof ErrorProbe;export declare const enum StringState {READY="ready",DONE="done"}import * as Own from './reference.mjs';export type QualifiedActive=Own.FiberState.ACTIVE;export type ImportedActive=import('./reference.mjs').FiberState.ACTIVE;export type RootEnumQuery=typeof Own.FiberState;export type ImportedActiveQuery=typeof import('./reference.mjs').FiberState.ACTIVE;`);
 const cases=[
 ['numeric enum type',true,'const e:api.LoggerLevel=api.LoggerLevel.INFO;const zero:api.LoggerLevel.ERROR=0;'],
 ['fiber complete constants',true,'const a:api.FiberState.ACTIVE=2;const u:api.FiberState.UNLOADING=5;'],
 ['constant typeof query',true,'type E=typeof api.LoggerLevel;declare const obj:E;const a:api.LoggerLevel.ERROR=obj.ERROR;'],
 ['numeric enum union',true,'declare const e:api.LoggerLevel;const n:0|1|2|3=e;'],
 ['same member identity',true,'const a:api.FiberState.ACTIVE=api.FiberState.ACTIVE;'],
 ['wrong numeric member',false,'const a:api.LoggerLevel.ERROR=1;'],
 ['outside closed enum',false,'const e:api.LoggerLevel=4;'],
 ['foreign enum nominal identity',false,'const a:api.LoggerLevel.ERROR=api.FiberState.PENDING;'],
 ['missing member',false,'api.FiberState.NO_SUCH_MEMBER;'],
 ['enum object cannot execute',false,'const object=api.LoggerLevel;'],
 ['enum is not constructible',false,'new api.LoggerLevel();'],
 ['readonly enum member',false,'api.FiberState.ACTIVE=1;'],
 ];
 const scoped=[
 ['structured TypeError constructor',true,'declare const C:api.TypeErrorConstructor;const e:TypeError=new C("bad");const m:string=e.message;'],
 ['structured Error constructor',true,'declare const C:api.ErrorConstructor;const e:Error=new C("bad");const m:string=e.message;'],
 ['wrong host constructor parameter',false,'declare const C:api.TypeErrorConstructor;new C(1);'],
 ['inherited Error field',false,'declare const C:api.ErrorConstructor;const e=new C();const n:number=e.message;'],
 ['qualified enum member type',true,'const a:api.QualifiedActive=api.FiberState.ACTIVE;'],
 ['inline imported enum member type',true,'const a:api.ImportedActive=api.FiberState.ACTIVE;'],
 ['qualified and inline value queries',true,'declare const obj:api.RootEnumQuery;const a:api.FiberState.ACTIVE=obj.ACTIVE;const b:api.ImportedActiveQuery=a;'],
 ['wrong inline enum member',false,'const a:api.ImportedActive=api.FiberState.FAILED;'],
 ['string const enum identity',true,'const a:api.StringState=api.StringState.READY;const b:api.StringState.READY=a;'],
 ['string literal not enum member identity',false,'const a:api.StringState="ready";'],
 ['wrong string enum member',false,'const a:api.StringState.READY=api.StringState.DONE;'],
 ];
 const paths=Object.fromEntries(['context','events','logger','reflect','registry','fiber','utils','service'].map(n=>['@augmentation/'+n,[join(fixture,'program',n+'.d.ts')]]));paths['@deepseek-ai/cosmokit']=[resolve(fixture,'../cosmokit-declarations/index.d.ts')];paths['@standard-schema/spec']=[join(fixture,'standard-schema/index.d.ts')];
 const options={strict:true,noEmit:true,skipLibCheck:false,target:ts.ScriptTarget.ES2024,module:ts.ModuleKind.ESNext,moduleResolution:ts.ModuleResolutionKind.Bundler,allowImportingTsExtensions:true,types:['node'],typeRoots:[resolve(typeRoots)],paths},files=[];
 for(const[scope,groups]of[['base',cases],['generic',scoped]])for(const[name,ok,body]of groups)for(const variant of ['original','candidate']){const root=scope==='base'?(variant==='original'?reference:entry):(variant==='original'?genericReference:generic),file=join(dir,variant+'-'+files.length+'.ts');writeFileSync(file,'import * as api from '+JSON.stringify(resolve(root).replace(/\.d\.mts$/,'.mjs'))+';\n'+body);files.push({file,name,ok,variant});}
 const p=ts.createProgram(files.map(x=>x.file),options),ds=ts.getPreEmitDiagnostics(p),negative=new Set(files.filter(x=>!x.ok).map(x=>x.file));assert.deepEqual(ds.filter(d=>!d.file||!negative.has(d.file.fileName)).map(d=>({file:d.file?.fileName,code:d.code,span:d.file?.text.slice(d.start,d.start+d.length),text:ts.flattenDiagnosticMessageText(d.messageText,' ')})),[]);
 for(const[name,ok]of [...cases,...scoped])if(!ok){const pair=files.filter(x=>x.name===name),codes=c=>ds.filter(d=>d.file?.fileName===c.file).map(d=>d.code).sort((a,b)=>a-b);assert(codes(pair[0]).length,name);assert.deepEqual(codes(pair[0]),codes(pair[1]),name);}
 const checker=p.getTypeChecker(),surface=file=>checker.getExportsOfModule(checker.getSymbolAtLocation(p.getSourceFile(resolve(file)))).map(s=>{const v=s.flags&ts.SymbolFlags.Alias?checker.getAliasedSymbol(s):s;return{name:s.name,type:!!(v.flags&ts.SymbolFlags.Type),value:!!(v.flags&ts.SymbolFlags.Value)}}).sort((a,b)=>a.name.localeCompare(b.name));assert.deepEqual(surface(entry),surface(reference));assert.equal(surface(entry).length,5);assert.equal(surface(entry).filter(s=>s.type).length,5);assert.equal(surface(entry).filter(s=>s.value).length,4);
 const consumer=join(dir,'constant-consumer.mts');writeFileSync(consumer,`import * as api from ${JSON.stringify(resolve(runtime))};export const constants=[api.LoggerLevel.ERROR,api.LoggerLevel.DEBUG,api.FiberState.ACTIVE,api.FiberState.UNLOADING];export const Context=api.Context;`);
 const output=join(dir,'emitted'),emit=ts.createProgram([consumer],{...options,noEmit:false,allowImportingTsExtensions:false,outDir:output});assert.deepEqual(ts.getPreEmitDiagnostics(emit).map(d=>ts.flattenDiagnosticMessageText(d.messageText,' ')),[]);assert.equal(emit.emit().emitSkipped,false);const result=await import(pathToFileURL(join(output,'constant-consumer.mjs'))),native=await import(pathToFileURL(resolve(runtime)));assert.deepEqual(result.constants,[0,3,2,5]);assert.equal(result.Context,native.Context);assert.deepEqual(Object.keys(native),['Context']);assert(!('LoggerLevel'in native)&&!('FiberState'in native));
 const emitted=readFileSync(join(output,'constant-consumer.mjs'),'utf8');const emittedAst=parse(emitted,'consumer.mjs');let enumAccesses=0;function visit(n){if(ts.isPropertyAccessExpression(n)&&ts.isIdentifier(n.expression)&&n.expression.text==='api'&&['LoggerLevel','FiberState'].includes(n.name.text))enumAccesses++;ts.forEachChild(n,visit);}visit(emittedAst);assert.equal(enumAccesses,0);
 console.log('Erased enum oracle:two hashed original const enums;23 original-paired strict groups;5types/4TSvalues/1actual runtime value;structured Error/TypeError heritage,nominal/member/string/inline queries and actual constant-consumer JS folding without enum runtime objects.');
}finally{rmSync(dir,{recursive:true,force:true});}
