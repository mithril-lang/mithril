import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
const[candidate,compiler,typeRoots,controls]=process.argv.slice(2),ts=(await import(pathToFileURL(resolve(compiler)))).default;
assert.equal(ts.version,'6.0.3');
const fixture=fileURLToPath(new URL('../../../fixtures/cordis-declarations/',import.meta.url));
const provenance=JSON.parse(readFileSync(join(fixture,'program-provenance.json'),'utf8'));
const parse=(text,name)=>ts.createSourceFile(name,text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
const source=name=>{const bytes=readFileSync(join(fixture,'program',name+'.d.ts'));assert.equal(createHash('sha256').update(bytes).digest('hex'),provenance.outputs[name+'.d.ts'].sha256);return parse(bytes.toString(),name+'.d.ts');};
const events=source('events'),registry=source('registry'),eventNames=new Set(['Parameters','ReturnType','ThisType','DispatchMode','EventOptions','Hook','Events']);
const eventLeaves=events.statements.filter(n=>eventNames.has(n.name?.text)),injectLeaves=registry.statements.filter(n=>ts.isTypeAliasDeclaration(n)&&['Inject','InjectKey'].includes(n.name.text));
const plugin=registry.statements.find(n=>ts.isModuleDeclaration(n)&&n.name.text==='Plugin');
const pluginLeaves=plugin.body.statements.filter(n=>['Base','Transform','Function','Constructor','Object'].includes(n.name?.text));
const dispatch=events.statements.find(n=>ts.isModuleDeclaration(n)).body.statements[0];
const named=n=>ts.isComputedPropertyName(n)?{computed:n.expression.getText().replace(/\s+/g,'')}:n.text;
function fingerprint(n){
 if(!n)return null;if(ts.isParenthesizedTypeNode(n))return fingerprint(n.type);
 if(ts.isIdentifier(n))return{identifier:n.text};if(ts.isStringLiteral(n)||ts.isNumericLiteral(n))return{kind:n.kind,text:n.text};
 if(ts.isInterfaceDeclaration(n))return{kind:n.kind,name:n.name.text,params:(n.typeParameters||[]).map(fingerprint),heritage:(n.heritageClauses||[]).map(fingerprint),members:n.members.map(fingerprint)};
 if(ts.isPropertySignature(n)||ts.isMethodSignature(n))return{kind:n.kind,name:named(n.name),readonly:!!n.modifiers?.some(m=>m.kind===ts.SyntaxKind.ReadonlyKeyword),optional:!!n.questionToken,params:n.parameters?.map(fingerprint),generics:n.typeParameters?.map(fingerprint),type:fingerprint(n.type)};
 if(ts.isModuleDeclaration(n))return{kind:n.kind,name:n.name.text,children:n.body.statements.filter(n=>!ts.isExportDeclaration(n)).map(fingerprint)};
 const children=[];ts.forEachChild(n,c=>{if(![ts.SyntaxKind.ExportKeyword,ts.SyntaxKind.DeclareKeyword].includes(c.kind))children.push(fingerprint(c));});return{kind:n.kind,children};
}
const expected=[...eventLeaves,...injectLeaves,plugin,dispatch].map(fingerprint);
expected.at(-2).children=pluginLeaves.map(fingerprint);expected.at(-1).name='DispatchContract';
const actual=parse(readFileSync(candidate,'utf8'),'candidate.d.mts').statements.filter(n=>!ts.isExportDeclaration(n));
assert.equal(actual.length,11);assert.deepEqual(actual.map(fingerprint),expected);
assert.equal(pluginLeaves.length,5);assert.equal(dispatch.members.length,12);
const dir=mkdtempSync(join(tmpdir(),'mithril-interface-consumers-'));
try{
 const external=name=>JSON.stringify(join(fixture,'program',name+'.js'));
 // Imports/module identity are pending compiler work, not fabricated local declarations.
 const adapter=`import {Context} from ${external('context')};\nimport {Fiber,FiberState} from ${external('fiber')};\nimport {Service} from ${external('service')};\nimport {symbols} from ${external('utils')};\nimport type {Dict,Promisify} from ${JSON.stringify(resolve(fixture,'../cosmokit-declarations/index.js'))};\nimport type {StandardSchemaV1} from ${JSON.stringify(join(fixture,'standard-schema/index.js'))};\n`;
 const originalText=[...eventLeaves,...injectLeaves].map(n=>n.getText()).join('\n')+'\nexport declare namespace Plugin {\n'+pluginLeaves.map(n=>n.getText()).join('\n')+'\n}\n'+dispatch.getText().replace('interface Context','export interface DispatchContract');
 const reference=join(dir,'original.d.mts'),adapted=join(dir,'candidate.d.mts'),generic=join(dir,'controls.d.mts');
 writeFileSync(reference,adapter+originalText);writeFileSync(adapted,adapter+readFileSync(candidate,'utf8'));writeFileSync(generic,adapter+readFileSync(controls,'utf8'));
 const positive=[
 ['inherited options','declare const h:api.Hook;const p:boolean|undefined=h.prepend;const g:boolean|undefined=h.global;const c:Context=h.ctx;h.callback(1,2);'],
 ['explicit receiver inference','type Receiver=api.ThisType<api.Events["internal/config"]>;declare const fiber:Fiber;const receiver:Receiver=fiber;'],
 ['receiver excluded from parameters','const args:api.Parameters<api.Events["internal/config"]>=[{},()=>42];'],
 ['event return inference','const value:api.ReturnType<api.Events["internal/set"]>=true;'],
 ['receiver invocation','declare const events:api.Events;declare const fiber:Fiber;events["internal/config"].call(fiber,{},()=>42);'],
 ['dispatch overloads','declare const d:api.DispatchContract;declare const fiber:Fiber;d.emit("internal/config",{},()=>42);d.emit(fiber,"internal/config",{},()=>42);d.parallel("internal/plugin",fiber);d.parallel(fiber,"internal/plugin",fiber);'],
 ['dispatch listener receiver','declare const d:api.DispatchContract;d.on("internal/config",function(config,next){const fiber:Fiber=this;return next();});'],
 ['function plugin interface','const plugin:api.Plugin.Function<{x:number}>=(ctx,config)=>{const c:Context=ctx;const x:number=config.x;};declare const c:Context;plugin(c,{x:1});plugin.name="leaf";plugin.inject=["logger"];'],
 ['constructor plugin interface','class P{constructor(ctx:Context,config:{x:number}){}}const plugin:api.Plugin.Constructor<{x:number}>=P;declare const c:Context;new plugin(c,{x:1});'],
 ['object plugin interface','const plugin:api.Plugin.Object<{x:number}>={apply(ctx,config){const c:Context=ctx;const x:number=config.x;}};'],
 ['transform and metadata','const t:api.Plugin.Transform<string,number>={schema:true,Config:Number};const b:api.Plugin.Base={provide:["leaf"],intercept:{logger:true}};'],
 ['mapped dependency config','const a:api.Inject<{one:{x:number},two:boolean}>={one:{x:1},two:true};const b:api.Inject<{one:number}>=["one"];'],
 ['computed configured service key','const key:api.InjectKey="leafService";'],
 ];
 const negative=[
 ['inherited option wrong type','declare const h:api.Hook;h.prepend=1;'],
 ['wrong receiver','const receiver:api.ThisType<api.Events["internal/config"]>={};'],
 ['receiver is not ordinary argument','declare const fiber:Fiber;const args:api.Parameters<api.Events["internal/config"]>=[fiber,{},()=>42];'],
 ['wrong return','const value:api.ReturnType<api.Events["internal/set"]>="wrong";'],
 ['wrong event thisArg','declare const events:api.Events;events["internal/config"].call({},1,()=>42);'],
 ['wrong event argument','declare const d:api.DispatchContract;d.emit("internal/plugin",1);'],
 ['wrong dispatch receiver','declare const d:api.DispatchContract;d.emit({},"internal/config",1,()=>42);'],
 ['wrong function plugin config','declare const c:Context;declare const plugin:api.Plugin.Function<{x:number}>;plugin(c,{x:"bad"});'],
 ['wrong constructor plugin config','declare const c:Context;declare const plugin:api.Plugin.Constructor<{x:number}>;new plugin(c,{x:"bad"});'],
 ['wrong object plugin config','declare const c:Context;declare const plugin:api.Plugin.Object<{x:number}>;plugin.apply(c,{x:"bad"});'],
 ['inherited metadata wrong type','declare const plugin:api.Plugin.Function;plugin.provide=1;'],
 ['wrong dependency config','const d:api.Inject<{one:number}>={one:"wrong"};'],
 ['non-service computed key','const key:api.InjectKey="root";'],
 ];
 const genericCases=[
 ['computed methods',true,'declare const x:api.ComputedMethods;const s:string=x[symbols.invoke]("x");const n:number=x[symbols.invoke](1);'],
 ['computed methods wrong argument',false,'declare const x:api.ComputedMethods;x[symbols.invoke](true);'],
 ['call overloads',true,'declare const x:api.CallableOverloads;const s:string=x("x");const n:number=x(1);'],
 ['call overloads wrong argument',false,'declare const x:api.CallableOverloads;x(true);'],
 ['construct overloads',true,'declare const x:api.ConstructOverloads;const s:string=new x("x");const n:number=new x(1);'],
 ['construct overloads wrong argument',false,'declare const x:api.ConstructOverloads;new x(true);'],
 ['computed interface key',true,'declare const x:api.SymbolMap;const token:symbol=x[symbols.isolate]["one"];'],
 ['computed interface wrong value',false,'declare const x:api.SymbolMap;x[symbols.isolate]["one"]=1;'],
 ['explicit receiver predicate',true,'declare const value:{check:api.ReceiverGuard};if(value.check()){const h:api.Hook=value;const c:Context=h.ctx;}'],
 ];
 const groups=[],files=[];
 const consumer=(variant,entry,name,body,ok)=>{const file=join(dir,variant+'-'+files.length+'.ts');writeFileSync(file,`import * as api from ${JSON.stringify(entry.replace(/\.d\.mts$/,'.mjs'))};\n${adapter}\ndeclare module ${external('context')} {interface Context {leafService:Service<{x:number}>;}}\n${body}\n`);files.push(file);return{variant,file,name,ok};};
 for(const[ok,cases]of[[true,positive],[false,negative]])for(const[name,body]of cases)groups.push({paired:true,cases:[consumer('original',reference,name,body,ok),consumer('candidate',adapted,name,body,ok)]});
 for(const[name,ok,body]of genericCases)groups.push({paired:false,cases:[consumer('generic',generic,name,body,ok)]});
 const program=ts.createProgram(files,{strict:true,noEmit:true,skipLibCheck:false,target:ts.ScriptTarget.ES2024,module:ts.ModuleKind.ESNext,moduleResolution:ts.ModuleResolutionKind.Bundler,allowImportingTsExtensions:true,types:['node'],typeRoots:[resolve(typeRoots)],paths:{'@deepseek-ai/cosmokit':[resolve(fixture,'../cosmokit-declarations/index.d.ts')],'@standard-schema/spec':[join(fixture,'standard-schema/index.d.ts')]}});
 const diagnostics=ts.getPreEmitDiagnostics(program),negativeFiles=new Set(groups.flatMap(g=>g.cases.filter(c=>!c.ok).map(c=>c.file)));
 assert.deepEqual(diagnostics.filter(d=>!d.file||!negativeFiles.has(d.file.fileName)).map(d=>({code:d.code,file:d.file?.fileName,message:ts.flattenDiagnosticMessageText(d.messageText,' ')})),[]);
 for(const group of groups){const codes=c=>diagnostics.filter(d=>d.file?.fileName===c.file).map(d=>d.code).sort((a,b)=>a-b);for(const c of group.cases.filter(c=>!c.ok))assert(codes(c).length,c.name);if(group.paired)assert.deepEqual(codes(group.cases[1]),codes(group.cases[0]),group.cases[0].name);}
 const checker=program.getTypeChecker(),surface=file=>checker.getExportsOfModule(checker.getSymbolAtLocation(program.getSourceFile(file))).map(s=>({name:s.name,value:!!(s.flags&ts.SymbolFlags.Value),type:!!(s.flags&ts.SymbolFlags.Type)})).sort((a,b)=>a.name.localeCompare(b.name));
 assert.deepEqual(surface(adapted),surface(reference));assert.equal(surface(adapted).length,11);assert.equal(surface(adapted).filter(s=>s.value).length,0);
 console.log(`Interface signature oracle:7 complete Events leaves/2 Inject leaves/5 complete Plugin interfaces/12 original Context dispatch methods;exact11public names/zero runtime values;13positive13negative paired strict consumers and9generic groups per actual CLI target. Pinned external import/symbol identity adapters; complete module merging/import/augmentation graph remains pending.`);
}finally{rmSync(dir,{recursive:true,force:true});}
