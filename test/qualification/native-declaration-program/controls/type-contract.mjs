import assert from 'node:assert/strict';import{readFileSync,writeFileSync,mkdtempSync,rmSync}from'node:fs';import{resolve,join,dirname}from'node:path';import{pathToFileURL,fileURLToPath}from'node:url';import{tmpdir}from'node:os';import{createHash}from'node:crypto';
const[candidate,compiler,typeRoots,metadata,runtime,runtimeMetadata]=process.argv.slice(2),ts=(await import(pathToFileURL(resolve(compiler)))).default;assert.equal(ts.version,'6.0.3');
const fixture=fileURLToPath(new URL('../../../fixtures/cordis-declarations/',import.meta.url)),provenance=JSON.parse(readFileSync(join(fixture,'program-provenance.json'),'utf8')),meta=JSON.parse(readFileSync(metadata,'utf8'));
const parse=(text,name)=>ts.createSourceFile(name,text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
const source=name=>{const b=readFileSync(join(fixture,'program',name+'.d.ts'));assert.equal(createHash('sha256').update(b).digest('hex'),provenance.outputs[name+'.d.ts'].sha256);return parse(b.toString(),name+'.d.ts');};
const named=n=>ts.isComputedPropertyName(n)?{computed:n.expression.getText().replace(/\s+/g,'')}:n.text;
const modifiers=n=>(n.modifiers||[]).filter(m=>![ts.SyntaxKind.ExportKeyword,ts.SyntaxKind.DeclareKeyword,ts.SyntaxKind.PublicKeyword].includes(m.kind)).map(m=>m.kind);
function fingerprint(n){
 if(!n)return null;if(ts.isParenthesizedTypeNode(n))return fingerprint(n.type);
 if(ts.isImportTypeNode(n)){assert(['./fiber.ts','@qualification/fiber'].includes(n.argument.literal.text));assert.equal(n.qualifier.text,'Disposable');return fingerprint(ts.factory.createTypeReferenceNode('ImportedDisposable',n.typeArguments));}
 if(ts.isTypeReferenceNode(n)&&ts.isQualifiedName(n.typeName)&&n.typeName.left.text==='globalThis'&&n.typeName.right.text==='Function')return fingerprint(ts.factory.createTypeReferenceNode('GlobalFunction',n.typeArguments));
 if(ts.isIdentifier(n))return{identifier:n.text};if(ts.isStringLiteral(n)||ts.isNumericLiteral(n))return{kind:n.kind,text:n.text};
 if(ts.isModuleDeclaration(n))return{kind:n.kind,name:n.name.text,members:n.body.statements.filter(n=>!ts.isExportDeclaration(n)).map(fingerprint)};
 if(ts.isClassDeclaration(n)||ts.isInterfaceDeclaration(n))return{kind:n.kind,name:n.name.text,modifiers:modifiers(n),generics:(n.typeParameters||[]).map(fingerprint),heritage:(n.heritageClauses||[]).map(fingerprint),members:n.members.map(fingerprint)};
 if(ts.isPropertyDeclaration(n)||ts.isPropertySignature(n))return{kind:n.kind,name:named(n.name),modifiers:modifiers(n),optional:!!n.questionToken,type:fingerprint(n.type)};
 if(ts.isMethodDeclaration(n)||ts.isMethodSignature(n)||ts.isGetAccessorDeclaration(n)||ts.isConstructorDeclaration(n)||ts.isFunctionDeclaration(n))return{kind:n.kind,name:n.name?named(n.name):null,modifiers:modifiers(n),optional:!!n.questionToken,generics:(n.typeParameters||[]).map(fingerprint),params:n.parameters.map(fingerprint),type:fingerprint(n.type)};
 const children=[];ts.forEachChild(n,c=>{if(![ts.SyntaxKind.ExportKeyword,ts.SyntaxKind.DeclareKeyword].includes(c.kind))children.push(fingerprint(c));});return{kind:n.kind,children};
}
for(const name of ['service','utils','logger']){
 const original=source(name).statements.filter(n=>!ts.isImportDeclaration(n)&&!ts.isExportDeclaration(n)&&!ts.isEnumDeclaration(n)&&!(ts.isModuleDeclaration(n)&&ts.isStringLiteral(n.name)));
 const generated=parse(readFileSync(join(dirname(candidate),meta['module-files']['cordis.'+name]),'utf8'),name+'.d.mts').statements.filter(n=>!ts.isImportDeclaration(n)&&!ts.isExportDeclaration(n));
 assert.deepEqual(generated.map(fingerprint),original.map(fingerprint),name);
}
const dir=mkdtempSync(join(tmpdir(),'mithril-program-consumers-'));
try{
 const reference=join(dir,'original.d.mts');writeFileSync(reference,['service','utils'].map(n=>`export * from ${JSON.stringify(join(fixture,'program',n+'.js'))};`).join('\n')+`\nexport {LoggerType,LoggerMethod,Formatter,Message,Exporter,defaultFormatters,LoggerOptions,Logger,c16,c256,LoggerService} from ${JSON.stringify(join(fixture,'program/logger.js'))};\nexport type {Context} from ${JSON.stringify(join(fixture,'program/context.js'))};\n`);
 const positive=[
 ['module and barrel Service identity','import type {Service as Leaf} from "__SERVICE__";declare const s:Leaf<{x:number}>;const root:api.Service<{x:number}>=s;'],
 ['cyclic Utils Service config identity','const c:typeof api.Service.config=api.symbols.config;const i:typeof api.Service.init=api.symbols.init;'],
 ['external Context symbol identity','const f:typeof Context.filter=api.symbols.filter;const e:typeof Context.effect=api.symbols.effect;'],
 ['own config indexing','declare const s:api.Service<{x:number}>;const cfg:{x:number}=s[api.symbols.config];'],
 ['Service subclass and lifetime config','declare const ctx:Context;class S extends api.Service<{x:number}>{constructor(){super(ctx,"api");}read(){const c:Context=this.ctx;return this[api.symbols.resolveConfig]({x:1});}}'],
 ['covariance','declare const s:api.Service<{x:1}>;const wide:api.Service<{x:number}>=s;'],
 ['weak list nominal exported class','const list=new api.DisposableList<object>();const d:()=>boolean=list.push({});for(const x of list){const obj:object=x;}'],
 ['original utils inference','declare const ctx:Context;const x:{value:1}=api.getTraceable(ctx,{value:1 as const});const n:number=api.composeError(info=>info.offset);'],
 ['Logger class interfaces and inherited methods','declare const ctx:Context;const s=new api.LoggerService(ctx);const logger:api.Logger=s("leaf");logger.info("x");const name:string=logger.name;'],
 ['Logger namespace','const c:api.LoggerService.Intercept={name:"leaf",level:1};'],
 ['original inline Disposable type','declare const ctx:Context;const d:import("@qualification/fiber").Disposable<Promise<void>>=new api.LoggerService(ctx).exporter({export(message){const m:api.Message=message;}});'],
 ['type-only export preserves constructor queries','type C=typeof api.Context;declare const C:C;const ctx:api.Context=new C();'],
 ['barrel and Utils symbols alias identity','import {symbols as Leaf} from "__UTILS__";const c:typeof api.Service.config=Leaf.config;const t:typeof Leaf.tracker=api.symbols.tracker;'],
 ];
 const negative=[
 ['distinct symbols across real modules','const key:typeof api.Service.config=api.symbols.init;'],
 ['wrong inherited config type','declare const s:api.Service<{x:number}>;s[api.symbols.resolveConfig]({x:"bad"});'],
 ['protected field','declare const s:api.Service;s.ctx;'],
 ['abstract constructor','declare const ctx:Context;new api.Service(ctx,"api");'],
 ['private list class','declare const list:api.DisposableList<object>;list.weak;'],
 ['list readonly getter','declare const list:api.DisposableList<object>;list.length=1;'],
 ['weak key constraint','new api.DisposableList<number>();'],
 ['invalid Logger call','declare const s:api.LoggerService;s(1);'],
 ['Logger private brand','declare const l:api.Logger;l.service;'],
 ['Logger method returns void','declare const l:api.Logger;const n:number=l.info("x");'],
 ['Logger namespace invalid config','const c:api.LoggerService.Intercept={level:"bad"};'],
 ['type-only exported class cannot run','new api.Context();'],
 ['external unique symbol differs','const token:typeof Context.filter=api.symbols.isolate;'],
 ];
 const cases=[],files=[];
 for(const[ok,groups]of[[true,positive],[false,negative]])for(const[name,body]of groups)for(const variant of ['original','candidate']){
  const root=variant==='original'?reference:candidate,leaf=n=>variant==='original'?join(fixture,'program',n+'.js'):join(dirname(candidate),meta['module-files']['cordis.'+n].replace(/\.d\.mts$/,'.mjs'));
  const file=join(dir,variant+'-'+files.length+'.ts');writeFileSync(file,`import * as api from ${JSON.stringify(root.replace(/\.d\.mts$/,'.mjs'))};\nimport {Context} from ${JSON.stringify(join(fixture,'program/context.js'))};\n${body.replaceAll('__SERVICE__',leaf('service')).replaceAll('__UTILS__',leaf('utils'))}\n`);cases.push({file,name,variant,ok});files.push(file);
 }
 const program=ts.createProgram(files,{strict:true,noEmit:true,skipLibCheck:false,target:ts.ScriptTarget.ES2024,module:ts.ModuleKind.ESNext,moduleResolution:ts.ModuleResolutionKind.Bundler,allowImportingTsExtensions:true,types:['node'],typeRoots:[resolve(typeRoots)],paths:{'@qualification/context':[join(fixture,'program/context.d.ts')],'@qualification/fiber':[join(fixture,'program/fiber.d.ts')],'@deepseek-ai/cosmokit':[resolve(fixture,'../cosmokit-declarations/index.d.ts')],'@standard-schema/spec':[join(fixture,'standard-schema/index.d.ts')]}}),diagnostics=ts.getPreEmitDiagnostics(program);
 const negativeFiles=new Set(cases.filter(x=>!x.ok).map(x=>x.file));assert.deepEqual(diagnostics.filter(d=>!d.file||!negativeFiles.has(d.file.fileName)).map(d=>({file:d.file?.fileName,code:d.code,message:ts.flattenDiagnosticMessageText(d.messageText,' ')})),[]);
 for(const[name]of negative){const pair=cases.filter(c=>c.name===name),codes=c=>diagnostics.filter(d=>d.file?.fileName===c.file).map(d=>d.code).sort((a,b)=>a-b);assert(codes(pair[0]).length,name);assert.deepEqual(codes(pair[0]),codes(pair[1]),name);}
 const checker=program.getTypeChecker(),surface=file=>checker.getExportsOfModule(checker.getSymbolAtLocation(program.getSourceFile(file))).map(s=>{const b=s.flags&ts.SymbolFlags.Alias?checker.getAliasedSymbol(s):s;return{name:s.name,type:!!(b.flags&ts.SymbolFlags.Type),value:!!(b.flags&ts.SymbolFlags.Value)}}).sort((a,b)=>a.name.localeCompare(b.name));assert.deepEqual(surface(candidate),surface(reference));assert.equal(surface(candidate).length,25);assert.equal(surface(candidate).filter(x=>x.type).length,12);assert.equal(surface(candidate).filter(x=>x.value).length,18);
 const runtimeMeta=JSON.parse(readFileSync(runtimeMetadata,'utf8')),actual=await import(pathToFileURL(resolve(runtime))),original=await import(new URL('../../../fixtures/cordis-core/index.mjs',import.meta.url));assert.deepEqual(Object.keys(actual).sort(),meta.exports);assert.equal(meta.exports.length,17);
 for(const name of ['service','utils','logger'])assert.equal(meta['module-files']['cordis.'+name].replace(/\.d\.mts$/,'.mjs'),runtimeMeta['module-files']['cordis.'+name]);
 if(meta['module-files']['cordis.index']!=='index.d.mts'){
  assert.equal(meta['module-files']['cordis.index'].replace(/\.d\.mts$/,'.mjs'),runtimeMeta['module-files']['qualification.barrel']);
  const barrel=await import(pathToFileURL(join(dirname(resolve(runtime)),runtimeMeta['module-files']['qualification.barrel'])));for(const name of meta.exports)assert.equal(actual[name],barrel[name]);
 }
 for(const key of ['init','check','config','invoke','extend','tracker','resolveConfig'])assert.equal(actual.Service[key],actual.symbols[key]);
 const ctxModule=await import(pathToFileURL(join(dirname(resolve(runtime)),runtimeMeta['module-files']['cordis.context'])));
 async function contract(api,C){const ctx=new C();ctx.logger.error=()=>{};class S extends api.Service{constructor(){super(ctx,'api');}}const s=new S();const out=[s.name,s instanceof api.Service,s.ctx===ctx,s[api.symbols.resolveConfig]({x:1},{y:2})];const logs=[],cleanup=ctx.logger.exporter({colors:false,export(m){logs.push([m.name,m.type,m.args]);}});const logger=ctx.logger('program');logger.info('x %s','y');out.push(logger instanceof api.Logger,ctx.logger instanceof api.LoggerService,logs);await cleanup();await ctx.fiber.dispose();out.push(ctx.reflect.get('api',false)===undefined);return out;}
 assert.deepEqual(await contract(actual,ctxModule.Context),await contract(original,original.Context));
 console.log(`Declaration program oracle:4 actual module files,29 original declaration structures,13positive/13negative paired strict groups per CLI target;25names/12types/18TS value bindings including erased type-only Context/17actual runtime values;cyclic Utils/index/Service imports,own symbol brands,real Logger inline import,leaf/barrel and runtime file identities and original-paired owner/logging behavior. Context/Fiber remain explicit pinned external qualification imports;complete nine-module augmentation/enum graph and full Harness equivalence pending.`);
}finally{rmSync(dir,{recursive:true,force:true});}
