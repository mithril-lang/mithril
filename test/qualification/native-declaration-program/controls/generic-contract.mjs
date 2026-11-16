import assert from'node:assert/strict';import{writeFileSync,mkdtempSync,rmSync}from'node:fs';import{resolve,join}from'node:path';import{pathToFileURL,fileURLToPath}from'node:url';import{tmpdir}from'node:os';
const[entry,compiler,typeRoots]=process.argv.slice(2),ts=(await import(pathToFileURL(resolve(compiler)))).default,fixture=fileURLToPath(new URL('../../../fixtures/cordis-declarations/',import.meta.url)),dir=mkdtempSync(join(tmpdir(),'mithril-program-generic-'));
try{
 const cases=[
 ['constructor alias query keeps defining import scope',true,'const c:api.ConstCtorConfig=api.Service.config;'],
 ['constructor alias retains unique static brand',false,'const c:api.ConstCtorConfig=api.Service.init;'],
 ['real external type namespace and qualified inline import',true,'declare const a:api.SchemaIssue;const b:api.ImportedSchemaIssue=a;const msg:string=b.message;'],
 ['real external readonly issue field',false,'declare const a:api.SchemaIssue;a.message="changed";'],
 ['foreign base and defining-scope static query',true,'declare const C:api.DerivedServiceConstructor;const c:typeof api.Service.config=C.copy;const base:typeof api.Service.config=C.config;const key:api.InheritedConfig=c;declare const ctx:import("@qualification/context").Context;const s=new C(ctx,"leaf");const value:string=s[api.symbols.config];'],
 ['foreign inherited distinct static token',false,'const key:api.InheritedConfig=api.Service.init;'],
 ['foreign inherited protected field',false,'declare const C:api.DerivedServiceConstructor;declare const s:InstanceType<typeof C>;s.ctx;'],
 ['explicit named shadow and same-origin alias',true,'declare const x:api.ShadowedTracker<string>;const y:api.NamedService<string>=x;const z:api.Service<string>=y;'],
 ['qualified genuine global function type',true,'const f:api.GlobalFunction=()=>42;'],
 ['qualified global wrong type',false,'const f:api.GlobalFunction=1;'],
 ['namespace class and named alias identity',true,'declare const x:api.NamespaceService;const y:api.ImportedService=x;const c:api.NamespaceConfig=api.Service.config;const n:api.NamedConfig=c;const i:api.ImportedConfig=c;'],
 ['namespace wrong config brand',false,'const c:api.NamespaceConfig=api.Service.init;'],
 ['named wrong config brand',false,'const c:api.NamedConfig=api.Service.init;'],
 ['inline query wrong config brand',false,'const c:api.ImportedConfig=api.Service.init;'],
 ['namespace generic wrong config',false,'declare const x:api.NamespaceService;const n:number=x[api.symbols.config];'],
 ['inline namespaced type',true,'const c:api.ImportedLoggerIntercept={name:"leaf",level:1};'],
 ['inline namespaced wrong type',false,'const c:api.ImportedLoggerIntercept={level:"bad"};'],
 ['inline external disposer identity',true,'declare const x:api.ImportedDisposable;const y:import("@qualification/fiber").Disposable<Promise<void>>=x;'],
 ['inline external constructor query',true,'declare const C:api.ImportedFiberConstructor;type F=InstanceType<typeof C>;declare const f:F;const same:import("@qualification/fiber").Fiber=f;'],
 ];
 const files=cases.map(([name,ok,body],i)=>{const file=join(dir,'case-'+i+'.ts');writeFileSync(file,`import * as api from ${JSON.stringify(resolve(entry).replace(/\.d\.mts$/,'.mjs'))};\n${body}`);return{file,name,ok};}),program=ts.createProgram(files.map(x=>x.file),{strict:true,noEmit:true,skipLibCheck:false,target:ts.ScriptTarget.ES2024,module:ts.ModuleKind.ESNext,moduleResolution:ts.ModuleResolutionKind.Bundler,allowImportingTsExtensions:true,types:['node'],typeRoots:[resolve(typeRoots)],paths:{'@qualification/context':[join(fixture,'program/context.d.ts')],'@qualification/fiber':[join(fixture,'program/fiber.d.ts')],'@deepseek-ai/cosmokit':[resolve(fixture,'../cosmokit-declarations/index.d.ts')],'@standard-schema/spec':[join(fixture,'standard-schema/index.d.ts')]}}),diagnostics=ts.getPreEmitDiagnostics(program),negative=new Set(files.filter(x=>!x.ok).map(x=>x.file));assert.deepEqual(diagnostics.filter(d=>!d.file||!negative.has(d.file.fileName)).map(d=>({code:d.code,file:d.file?.fileName,text:ts.flattenDiagnosticMessageText(d.messageText,' ')})),[]);for(const x of files.filter(x=>!x.ok))assert(diagnostics.some(d=>d.file?.fileName===x.file),x.name);
 console.log('Generic declaration program:19 strict namespace/named alias/import-type/qualified import-query/unique-symbol/constructor groups per actual target.');
}finally{rmSync(dir,{recursive:true,force:true});}
