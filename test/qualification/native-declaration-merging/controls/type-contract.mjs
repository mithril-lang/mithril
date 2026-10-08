import assert from 'node:assert/strict';import{readFileSync,writeFileSync,mkdtempSync,rmSync}from'node:fs';import{resolve,join,dirname}from'node:path';import{pathToFileURL,fileURLToPath}from'node:url';import{tmpdir}from'node:os';import{createHash}from'node:crypto';
const[candidate,compiler,typeRoots,controls,runtime,metadata]=process.argv.slice(2),ts=(await import(pathToFileURL(resolve(compiler)))).default;assert.equal(ts.version,'6.0.3');
const fixture=fileURLToPath(new URL('../../../fixtures/cordis-declarations/',import.meta.url)),provenance=JSON.parse(readFileSync(join(fixture,'program-provenance.json'),'utf8'));
const parse=(text,name)=>ts.createSourceFile(name,text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
const source=name=>{const bytes=readFileSync(join(fixture,'program',name+'.d.ts'));assert.equal(createHash('sha256').update(bytes).digest('hex'),provenance.outputs[name+'.d.ts'].sha256);return parse(bytes.toString(),name+'.d.ts');};
const service=source('service'),utils=source('utils'),logger=source('logger'),registry=source('registry'),fiber=source('fiber'),context=source('context');
const leaves=sf=>sf.statements.filter(n=>!ts.isImportDeclaration(n)&&!ts.isExportDeclaration(n));
const serviceLeaves=[...leaves(service),...leaves(utils)],loggerLeaves=leaves(logger).filter(n=>!ts.isEnumDeclaration(n)&&!(ts.isModuleDeclaration(n)&&ts.isStringLiteral(n.name))),registryLeaves=registry.statements.filter(n=>['Inject','InjectKey','Plugin'].includes(n.name?.text)),errorLeaves=fiber.statements.filter(n=>n.name?.text==='CordisError');
const contextLeaves=context.statements.filter(n=>n.name?.text==='Context'),injectKey=registry.statements.find(n=>ts.isTypeAliasDeclaration(n)&&n.name.text==='InjectKey');
const observerText=`declare namespace ContextProbe {\n${injectKey.getText().replace(/^export /,'')}\n${contextLeaves.map(n=>n.getText().replace(/^export declare /,'export ')).join('\n')}\nexport {};\n}\nexport type ContextProbeType=ContextProbe.Context;\nexport type ContextProbeConstructor=typeof ContextProbe.Context;\n`;
const observerLeaves=parse(observerText,'observer.d.mts').statements;
const named=n=>ts.isComputedPropertyName(n)?{computed:n.expression.getText().replace(/\s+/g,'')}:n.text;
const modifiers=n=>(n.modifiers||[]).filter(m=>![ts.SyntaxKind.ExportKeyword,ts.SyntaxKind.DeclareKeyword,ts.SyntaxKind.PublicKeyword].includes(m.kind)).map(m=>m.kind);
function fingerprint(n){
 if(!n)return null;if(ts.isParenthesizedTypeNode(n))return fingerprint(n.type);
 if(ts.isImportTypeNode(n)){assert.equal(n.argument.literal.text,'./fiber.ts');assert.equal(n.qualifier.text,'Disposable');return fingerprint(ts.factory.createTypeReferenceNode('ImportedDisposable',n.typeArguments));}
 if(ts.isTypeReferenceNode(n)&&ts.isQualifiedName(n.typeName)&&n.typeName.left.text==='globalThis'&&n.typeName.right.text==='Function')return fingerprint(ts.factory.createTypeReferenceNode('GlobalFunction',n.typeArguments));
 if(ts.isIdentifier(n))return{identifier:n.text};if(ts.isStringLiteral(n)||ts.isNumericLiteral(n))return{kind:n.kind,text:n.text};
 if(ts.isModuleDeclaration(n))return{kind:n.kind,name:n.name.text,members:n.body.statements.filter(n=>!ts.isExportDeclaration(n)).map(fingerprint)};
 if(ts.isClassDeclaration(n)||ts.isInterfaceDeclaration(n))return{kind:n.kind,name:n.name.text,modifiers:modifiers(n),generics:(n.typeParameters||[]).map(fingerprint),heritage:(n.heritageClauses||[]).map(fingerprint),members:n.members.map(fingerprint)};
 if(ts.isPropertyDeclaration(n)||ts.isPropertySignature(n))return{kind:n.kind,name:named(n.name),modifiers:modifiers(n),optional:!!n.questionToken,type:fingerprint(n.type)};
 if(ts.isMethodDeclaration(n)||ts.isMethodSignature(n)||ts.isGetAccessorDeclaration(n)||ts.isConstructorDeclaration(n)||ts.isFunctionDeclaration(n))return{kind:n.kind,name:n.name?named(n.name):null,modifiers:modifiers(n),optional:!!n.questionToken,generics:(n.typeParameters||[]).map(fingerprint),params:n.parameters.map(fingerprint),type:fingerprint(n.type)};
 const children=[];ts.forEachChild(n,c=>{if(![ts.SyntaxKind.ExportKeyword,ts.SyntaxKind.DeclareKeyword].includes(c.kind))children.push(fingerprint(c));});return{kind:n.kind,children};
}
const expected=[...serviceLeaves,...loggerLeaves,...registryLeaves,...errorLeaves,...observerLeaves],emitted=parse(readFileSync(candidate,'utf8'),'candidate.d.mts').statements.filter(n=>!ts.isExportDeclaration(n));assert.equal(expected.length,40);assert.deepEqual(emitted.map(fingerprint),expected.map(fingerprint));assert.equal(loggerLeaves.length,15);assert.equal(registryLeaves.length,6);assert.equal(contextLeaves.length,2);
const dir=mkdtempSync(join(tmpdir(),'mithril-merge-consumers-'));
try{
 const external=name=>JSON.stringify(join(fixture,'program',name+'.js'));
 const adapter=`import {Context} from ${external('context')};\nimport {Fiber} from ${external('fiber')};\nimport type {Disposable as ImportedDisposable} from ${external('fiber')};\nimport {EventsService} from ${external('events')};\nimport {ReflectService} from ${external('reflect')};\nimport {RegistryService} from ${external('registry')};\nimport type {Dict} from ${JSON.stringify(resolve(fixture,'../cosmokit-declarations/index.js'))};\nimport type {StandardSchemaV1} from ${JSON.stringify(join(fixture,'standard-schema/index.js'))};\ntype GlobalFunction=globalThis.Function;\n`;
 const reference=join(dir,'original.d.mts'),adapted=join(dir,'candidate.d.mts'),generic=join(dir,'controls.d.mts');
 // Reference uses the actual original Service/Utils module bindings. The other
 // complete selected forms preserve their original source with shared imports.
 writeFileSync(reference,adapter+`import {Service} from ${external('service')};\nimport {DisposableList,symbols} from ${external('utils')};\nexport * from ${external('service')};\nexport * from ${external('utils')};\n`+[...loggerLeaves,...registryLeaves,...errorLeaves].map(n=>n.getText().replaceAll('import("./fiber.ts").Disposable','ImportedDisposable')).join('\n')+'\n'+observerText);
 writeFileSync(adapted,adapter+readFileSync(candidate,'utf8'));writeFileSync(generic,adapter+readFileSync(controls,'utf8'));
 const positive=[
 ['Logger merged options and methods','declare const ctx:Context;const s=new api.LoggerService(ctx);const l=new api.Logger({name:"leaf",meta:{level:1}},s);const name:string=l.name;const level:number|undefined=l.level;l.info("value",1);l.warn("x");'],
 ['Logger twice inherited interfaces','declare const logger:api.Logger;logger.name="leaf";logger.meta={args:[]};logger.error("x");logger.debug("x");'],
 ['callable LoggerService class','declare const ctx:Context;const s=new api.LoggerService(ctx);const l:api.Logger=s("leaf");s.info("x");'],
 ['LoggerService namespace before class','const config:api.LoggerService.Intercept={name:"leaf",level:1};'],
 ['Logger static signatures','declare const exporter:api.Exporter;declare const message:api.Message;const c:string=api.Logger.color(exporter,1,"x");const n:number=api.Logger.code("leaf",false);const s:string=api.Logger.format(exporter,message);'],
 ['Logger exporter import-type adapter','declare const ctx:Context;const s=new api.LoggerService(ctx);const d:ImportedDisposable<Promise<void>>=s.exporter({export(message){const m:api.Message=message;}});'],
 ['Inject type and callable decorator','const deps:api.Inject<{__OWN_SERVICE__:{x:number}}>={__OWN_SERVICE__:{x:1}};const decorate=api.Inject("__OWN_SERVICE__",{x:1});'],
 ['Inject runtime namespace','const deps:Dict=api.Inject.resolve(["logger"],{});'],
 ['Plugin alias and function namespace','const p:api.Plugin<{x:number}>=(ctx,config)=>{const c:Context=ctx;const x:number=config.x;};const f:api.Plugin.Function<{x:number}>=(ctx,config)=>{const x:number=config.x;};'],
 ['Plugin alias and constructor namespace','class P{constructor(ctx:Context,config:{x:number}){}}const p:api.Plugin<{x:number}>=P;const C:api.Plugin.Constructor<{x:number}>=P;'],
 ['Plugin object and complete Runtime','const p:api.Plugin.Object<{x:number}>={apply(ctx,config){const x:number=config.x;}};const r:api.Plugin.Runtime={fibers:new api.DisposableList<Fiber>(),callback:()=>42};'],
 ['CordisError class and Code namespace','const code:api.CordisError.Code="INACTIVE_EFFECT";const e=new api.CordisError(code);const msg:"cannot create effect on inactive context"=api.CordisError.Code.INACTIVE_EFFECT;const err:Error=e;'],
 ['observed Context class interface this','declare const C:api.ContextProbeConstructor;const ctx=new C();const root:api.ContextProbeType=ctx.root;const child:api.ContextProbeType=ctx.extend({leaf:1});ctx.intercept("untyped",{});'],
 ['observed Context constructor predicate','declare const C:api.ContextProbeConstructor;declare const x:unknown;if(C.is(x)){const ctx:api.ContextProbeType=x;}'],
 ];
 const negative=[
 ['Logger inherited options wrong type','declare const l:api.Logger;l.name=1;'],
 ['Logger private identity','declare const l:api.Logger;l.service;'],
 ['Logger private method','declare const l:api.Logger;l._method;'],
 ['LoggerService inherited methods wrong result','declare const s:api.LoggerService;const n:number=s.info("x");'],
 ['LoggerService callable argument','declare const s:api.LoggerService;s(1);'],
 ['LoggerService private identity','declare const s:api.LoggerService;s._resolveConfig;'],
 ['LoggerService namespace config','const c:api.LoggerService.Intercept={level:"bad"};'],
 ['wrong Inject config','api.Inject("__OWN_SERVICE__",{x:"bad"});'],
 ['wrong Inject service','api.Inject("root",{});'],
 ['wrong Inject normalize input','api.Inject.resolve(1);'],
 ['Plugin config failure','const p:api.Plugin<{x:number}>={apply(ctx:Context,config:{x:string}){}};'],
 ['Plugin Runtime wrong callback','const r:api.Plugin.Runtime={fibers:new api.DisposableList<Fiber>(),callback:1};'],
 ['invalid CordisError code','new api.CordisError("OTHER");'],
 ['readonly Code message','api.CordisError.Code.INACTIVE_EFFECT="wrong";'],
 ['observed Context unique symbols','declare const C:api.ContextProbeConstructor;const token:typeof C.filter=C.isolate;'],
 ['observed Context static readonly','declare const C:api.ContextProbeConstructor;C.filter=Symbol();'],
 ];
 const genericCases=[
 ['merged generic defaults',true,'declare const x:api.GenericMergeType;const s:string=x.x;const n:number=x.y;'],
 ['merged generic extra default',true,'declare const x:api.GenericMergeArgs<boolean,string>;const b:boolean=x.x;const s:string=x.y;'],
 ['merged generic wrong fields',false,'const x:api.GenericMergeType={x:1,y:"bad"};'],
 ['identical repeated property',true,'const x:api.IdenticalType={x:"same"};'],
 ['callable constructor merge',true,'declare const C:api.CallableClassConstructor;const a:ReturnType<typeof C>=new C();const b:InstanceType<typeof C>=C();'],
 ['callable constructor private brand',false,'declare const C:api.CallableClassConstructor;C().brand;'],
 ['getter and interface property',true,'declare const x:api.GetterMergeType;const n:number=x.x;'],
 ['getter retains read-only access',false,'declare const x:api.GetterMergeType;x.x=1;'],
 ['const and type-only namespace',true,'const item:api.TypeOnlyConstItem="x";'],
 ['private namespace own constructor',true,'declare const C:api.PrivateCtorA;const a:api.PrivateA=new C();'],
 ['private namespace other constructor',false,'declare const C:api.PrivateCtorB;const a:api.PrivateA=new C();'],
 ['private namespace nominal identity',false,'declare const a:api.PrivateA;const b:api.PrivateB=a;'],
 ['namespace private aliases separated',true,'const a:api.LexicalA="x";const b:api.LexicalB=1;'],
 ['namespace private aliases wrong',false,'const a:api.LexicalA=1;const b:api.LexicalB="x";'],
 ['nested namespace ancestor ownership',true,'const a:api.NestedA="x";const b:api.NestedB=1;'],
 ['nested namespace ancestor wrong',false,'const a:api.NestedA=1;const b:api.NestedB="x";'],
 ['qualified public private shadow',true,'const local:api.QualifiedLocal=1;const publicValue:api.QualifiedPublic={x:1};'],
 ['qualified public shadow wrong type',false,'const publicValue:api.QualifiedPublic=1;'],
 ['inherited private base ownership',true,'declare const D:api.DerivedConstructor;declare const C:api.ChildConstructor;const token:typeof D.copy=C.copy;'],
 ];
 const groups=[],files=[];
 const consumer=(variant,entry,name,body,ok)=>{const file=join(dir,variant+'-'+files.length+'.ts');const own=variant==='original'?'originalQualifiedService':'candidateQualifiedService';writeFileSync(file,`import * as api from ${JSON.stringify(entry.replace(/\.d\.mts$/,'.mjs'))};\n${adapter}\n${variant==='generic'?'':`declare module ${external('context')} {interface Context {${own}:api.Service<{x:number}>;}}`}\n${body.replaceAll('__OWN_SERVICE__',own)}\n`);files.push(file);return{variant,file,name,ok};};
 for(const[ok,cases]of[[true,positive],[false,negative]])for(const[name,body]of cases)groups.push({paired:true,cases:[consumer('original',reference,name,body,ok),consumer('candidate',adapted,name,body,ok)]});
 for(const[name,ok,body]of genericCases)groups.push({paired:false,cases:[consumer('generic',generic,name,body,ok)]});
 const program=ts.createProgram(files,{strict:true,noEmit:true,skipLibCheck:false,target:ts.ScriptTarget.ES2024,module:ts.ModuleKind.ESNext,moduleResolution:ts.ModuleResolutionKind.Bundler,allowImportingTsExtensions:true,types:['node'],typeRoots:[resolve(typeRoots)],paths:{'@deepseek-ai/cosmokit':[resolve(fixture,'../cosmokit-declarations/index.d.ts')],'@standard-schema/spec':[join(fixture,'standard-schema/index.d.ts')]}});
 const diagnostics=ts.getPreEmitDiagnostics(program),negativeFiles=new Set(groups.flatMap(g=>g.cases.filter(c=>!c.ok).map(c=>c.file)));
 assert.deepEqual(diagnostics.filter(d=>!d.file||!negativeFiles.has(d.file.fileName)).map(d=>({code:d.code,file:d.file?.fileName,message:ts.flattenDiagnosticMessageText(d.messageText,' ')})),[]);
 for(const group of groups){const codes=c=>diagnostics.filter(d=>d.file?.fileName===c.file).map(d=>d.code).sort((a,b)=>a-b);for(const c of group.cases.filter(c=>!c.ok))assert(codes(c).length,c.name);if(group.paired)assert.deepEqual(codes(group.cases[1]),codes(group.cases[0]),group.cases[0].name);}
 const checker=program.getTypeChecker(),surface=file=>checker.getExportsOfModule(checker.getSymbolAtLocation(program.getSourceFile(file))).map(s=>{const x=s.flags&ts.SymbolFlags.Alias?checker.getAliasedSymbol(s):s;return{name:s.name,value:!!(x.flags&ts.SymbolFlags.Value),type:!!(x.flags&ts.SymbolFlags.Type)}}).sort((a,b)=>a.name.localeCompare(b.name));
 assert.deepEqual(surface(adapted),surface(reference));const publicSurface=surface(adapted);assert.equal(publicSurface.length,30);assert.equal(publicSurface.filter(s=>s.value).length,19);assert.equal(publicSurface.filter(s=>s.type).length,17);
 const meta=JSON.parse(readFileSync(metadata,'utf8')),actual=await import(pathToFileURL(resolve(runtime))),{Context:ActualContext}=await import(pathToFileURL(join(dirname(resolve(runtime)),meta['module-files']['cordis.context']))),original=await import(new URL('../../../fixtures/cordis-core/index.mjs',import.meta.url));
 const runtimeNames=publicSurface.filter(s=>s.value).map(s=>s.name).sort();assert.deepEqual(Object.keys(actual).sort(),runtimeNames);const selector=await import(pathToFileURL(join(dirname(resolve(runtime)),meta['module-files']['cordis.merge_selectors']))),nativeFiber=await import(pathToFileURL(join(dirname(resolve(runtime)),meta['module-files']['cordis.fiber']))),nativeRegistry=await import(pathToFileURL(join(dirname(resolve(runtime)),meta['module-files']['cordis.registry'])));assert.equal(selector.CordisError,nativeFiber.CordisError);assert.equal(selector.Inject,nativeRegistry.Inject);
 async function contract(api,Context){const out=[];out.push(api.Inject.resolve(['logger'],{}));const err=new api.CordisError('INACTIVE_EFFECT');out.push(err instanceof Error,err.code,err.message,api.CordisError.Code);const ctx=new Context();ctx.logger.error=()=>{};const logs=[];const cleanup=ctx.logger.exporter({colors:false,export(message){logs.push([message.name,message.type,message.args]);}});const logger=ctx.logger('merge-qualified');logger.info('value %s','x');out.push(logger instanceof api.Logger,ctx.logger instanceof api.LoggerService,logger.name,logs);await cleanup();await ctx.fiber.dispose();return out;}
 assert.deepEqual(await contract(actual,ActualContext),await contract(Object.fromEntries(runtimeNames.map(n=>[n,original[n]])),original.Context));
 console.log(`Declaration merge oracle:40 source forms including complete15 Logger forms except enum/augmentation,complete Inject/Plugin and CordisError groups,Context class/interface observation;exact30names/19values/17types;${positive.length}positive/${negative.length}negative paired strict groups and${genericCases.length}additional groups per actual CLI target;genuine16-module runtime/root/selector identity and logger-owner/error/inject comparisons. Explicit external Context/import/global type and observer adapters;full independent module/augmentation/enum graph pending.`);
}finally{rmSync(dir,{recursive:true,force:true});}
