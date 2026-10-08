import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {resolve,join,dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const [entry,compiler,typeRoots,metadata,runtime]=process.argv.slice(2);
const ts=(await import(pathToFileURL(resolve(compiler)))).default;assert.equal(ts.version,'6.0.3');
const fixture=fileURLToPath(new URL('../../../fixtures/cordis-declarations/',import.meta.url));
const provenance=JSON.parse(readFileSync(join(fixture,'program-provenance.json'),'utf8'));
for(const[file,sha]of Object.entries(provenance.fixture_hashes))assert.equal(createHash('sha256').update(readFileSync(join(fixture,file))).digest('hex'),sha,file);
const meta=JSON.parse(readFileSync(metadata,'utf8')),reference=join(fixture,'program/index.d.ts');
const originalPath=name=>join(fixture,'program',name+'.d.ts');
const candidatePath=name=>join(dirname(resolve(entry)),meta['module-files']['cordis.'+name]);
const augmentation=variant=>`declare module ${JSON.stringify(variant==='original'?originalPath('context').replace('.d.ts','.ts'):candidatePath('context').replace('.d.mts','.mjs'))} {interface Context {demo:{run():number};}} declare module ${JSON.stringify(variant==='original'?originalPath('events').replace('.d.ts','.ts'):candidatePath('events').replace('.d.mts','.mjs'))} {interface Events {'demo/event':(value:number)=>void;}}`;
const options={strict:true,noEmit:true,skipLibCheck:false,target:ts.ScriptTarget.ES2024,module:ts.ModuleKind.ESNext,moduleResolution:ts.ModuleResolutionKind.Bundler,allowImportingTsExtensions:true,types:['node'],typeRoots:[resolve(typeRoots)],paths:{'@deepseek-ai/cosmokit':[resolve(fixture,'../cosmokit-declarations/index.d.ts')],'@standard-schema/spec':[join(fixture,'standard-schema/index.d.ts')]}};
const parse=(text,name)=>ts.createSourceFile(name,text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
const moduleName=s=>s.startsWith('./')?('cordis.'+s.slice(2).replace(/\.(ts|js)$/, '')):s==='@deepseek-ai/cosmokit'?'cosmokit':s==='@standard-schema/spec'?'standard.schema':s;
const reverse=Object.fromEntries(Object.entries(meta['module-files']).map(([name,file])=>['./'+file.replace(/\.d\.mts$/,'.mjs'),name]));
const modifierKinds=n=>(n.modifiers||[]).filter(m=>![ts.SyntaxKind.ExportKeyword,ts.SyntaxKind.DeclareKeyword,ts.SyntaxKind.PublicKeyword].includes(m.kind)).map(m=>m.kind);
const named=n=>ts.isComputedPropertyName(n)?{computed:n.expression.getText().replace(/\s+/g,'')}:n.text;
function fingerprint(n){
 if(!n)return null;if(ts.isParenthesizedTypeNode(n))return fingerprint(n.type);
 if(ts.isIdentifier(n))return{identifier:n.text};if(ts.isStringLiteral(n)||ts.isNumericLiteral(n))return{kind:n.kind,text:n.text};
 if(ts.isImportTypeNode(n))return{kind:n.kind,module:reverse[n.argument.literal.text]||moduleName(n.argument.literal.text),query:n.isTypeOf,name:n.qualifier?.getText(),args:(n.typeArguments||[]).map(fingerprint)};
 if(ts.isVariableDeclaration(n))return{kind:n.kind,name:n.name.text,type:fingerprint(n.type||ts.factory.createLiteralTypeNode(n.initializer))};
 if(ts.isModuleDeclaration(n))return{kind:n.kind,name:ts.isStringLiteral(n.name)?reverse[n.name.text]||moduleName(n.name.text):n.name.text,members:n.body.statements.filter(n=>!ts.isExportDeclaration(n)).map(fingerprint)};
 if(ts.isClassDeclaration(n)||ts.isInterfaceDeclaration(n))return{kind:n.kind,name:n.name.text,modifiers:modifierKinds(n),generics:(n.typeParameters||[]).map(fingerprint),heritage:(n.heritageClauses||[]).map(fingerprint),members:n.members.map(fingerprint)};
 if(ts.isPropertyDeclaration(n)||ts.isPropertySignature(n))return{kind:n.kind,name:named(n.name),modifiers:modifierKinds(n),optional:!!n.questionToken,type:fingerprint(n.type)};
 if(ts.isMethodDeclaration(n)||ts.isMethodSignature(n)||ts.isGetAccessorDeclaration(n)||ts.isConstructorDeclaration(n)||ts.isFunctionDeclaration(n))return{kind:n.kind,name:n.name?named(n.name):null,modifiers:modifierKinds(n),optional:!!n.questionToken,generics:(n.typeParameters||[]).map(fingerprint),params:n.parameters.map(fingerprint),type:fingerprint(n.type)};
 const children=[];ts.forEachChild(n,c=>{if(![ts.SyntaxKind.ExportKeyword,ts.SyntaxKind.DeclareKeyword].includes(c.kind))children.push(fingerprint(c));});return{kind:n.kind,children};
}
const shape=sf=>sf.statements.filter(n=>!ts.isImportDeclaration(n)&&!ts.isExportDeclaration(n)&&!(ts.isModuleDeclaration(n)&&ts.isStringLiteral(n.name))).map(fingerprint);
const augmentationShape=sf=>sf.statements.filter(n=>ts.isModuleDeclaration(n)&&ts.isStringLiteral(n.name)).map(fingerprint);
const links=sf=>sf.statements.filter(n=>ts.isImportDeclaration(n)||ts.isExportDeclaration(n)).filter(n=>n.moduleSpecifier).map(n=>({kind:n.kind,module:reverse[n.moduleSpecifier.text]||moduleName(n.moduleSpecifier.text),typeOnly:ts.isImportDeclaration(n)?!!n.importClause?.isTypeOnly:!!n.isTypeOnly,names:ts.isImportDeclaration(n)?n.importClause?.namedBindings.elements.map(e=>({source:e.propertyName?.text||e.name.text,target:e.name.text}))||null:n.exportClause?.elements.map(e=>({source:e.propertyName?.text||e.name.text,target:e.name.text}))||null}));
for(const name of ['context','events','fiber','logger','reflect','registry','service','utils','index']){
 const bytes=readFileSync(originalPath(name));assert.equal(createHash('sha256').update(bytes).digest('hex'),provenance.outputs[name+'.d.ts'].sha256);
 const original=parse(bytes.toString(),name+'.d.ts'),candidate=parse(readFileSync(candidatePath(name),'utf8'),name+'.d.mts');assert.deepEqual(shape(candidate),shape(original),name+' full original structure');assert.deepEqual(links(candidate),links(original),name+' full import/reexport graph');assert.deepEqual(augmentationShape(candidate),augmentationShape(original),name+' original augmentation structure');
}
assert.equal(createHash('sha256').update(readFileSync(resolve(fixture,'../cosmokit-declarations/index.d.ts'))).digest('hex'),provenance.external_types.cosmokit);
for(const[name,file]of [['cosmokit',resolve(fixture,'../cosmokit-declarations/index.d.ts')],['standard.schema',join(fixture,'standard-schema/index.d.ts')]]){const original=name==='cosmokit'?['array','types','misc','string','time','volatile'].flatMap(n=>shape(parse(readFileSync(join(dirname(file),n+'.d.ts'),'utf8'),n+'.d.ts'))):shape(parse(readFileSync(file,'utf8'),name+'.d.ts'));assert.deepEqual(shape(parse(readFileSync(join(dirname(resolve(entry)),meta['module-files'][name]),'utf8'),name+'.d.mts')),original,name+' complete dependency forms');}
const positives = [
  ['class/interface/built-in augmentation', `const c=new api.Context();c.on('internal/plugin',fiber=>{const f:api.Fiber=fiber;});c.provide('api',1);c.plugin(()=>{});c.effect(()=>()=>{});c.logger('test').info('hello');c.reflect.get('api');c.registry.size;const f:api.Fiber=c.fiber;`],
  ['Context polymorphic this', 'class Child extends api.Context{extra=1;}const c=new Child();const root:Child=c.root;const child:Child=c.extend({a:1});'],
  ['unique symbols', 'declare const c:api.Context;const isolate:Record<string,symbol>=c[api.symbols.isolate];const key:typeof api.Context.effect=api.Context.effect;'],
  ['abstract generic service subclass', `class S extends api.Service<{x:number}>{constructor(c:api.Context){super(c,'api');}read(){return this.ctx.root;}merge(){return this[api.symbols.resolveConfig]({x:1},{x:2});}}`],
  ['Fiber asynchronous methods', 'declare const f:api.Fiber;const p:Promise<api.Fiber>=f.await();f.restart();f.dispose();'],
  ['plugin callback required config', 'declare const c:api.Context;const p=(c:api.Context,v:{x:number})=>{};c.plugin(p,{x:1});'],
  ['plugin callback optional config', 'declare const c:api.Context;const p=(c:api.Context,v?:{x:number})=>{};c.plugin(p);c.plugin(p,{x:1});'],
  ['plugin constructor config', 'declare const c:api.Context;class P{constructor(c:api.Context,v:{x:number}){}}c.plugin(P,{x:1});'],
  ['plugin object config', 'declare const c:api.Context;const p={apply(c:api.Context,v:{x:number}){}};c.plugin(p,{x:1});'],
  ['external Context/Events augmentation', variant=>`${augmentation(variant)}declare const c:api.Context;const n:number=c.demo.run();c.on('demo/event',v=>{const x:number=v;});c.emit('demo/event',3);`],
  ['const enum contracts', 'const a:api.FiberState=api.FiberState.ACTIVE;const b:api.LoggerLevel=api.LoggerLevel.INFO;'],
  ['volatile type-only reexports', 'type V=api.Volatile<{x:number}>;type S=api.VolatileSnapshot<{x:{y:1}}>;declare const v:V;const n:number=v.get().x;'],
  ['class/namespace merging', `const e=new api.CordisError('INACTIVE_EFFECT');type C=api.CordisError.Code;type I=api.Inject;type P=api.Plugin;`],
  ['logger class/interface merging', `declare const l:api.Logger;l.error('x');l.warn('x');l.info('x');l.debug('x');declare const c:api.Context;c.logger.info('x');`],
  ['generic DisposableList', 'const list=new api.DisposableList<object>();const x={};const cleanup:()=>boolean=list.push(x);const n:number=list.length;list.delete(x);list.clear();'],
  ['Service out covariance', 'declare const narrow:api.Service<{x:1}>;const wide:api.Service<{x:number}>=narrow;'],
];
const negatives = [
  ['abstract construction', `new api.Service(new api.Context(),'api');`, [2511]],
  ['protected access', 'declare const s:api.Service;s.ctx;', [2445]],
  ['required plugin config missing', 'new api.Context().plugin((c:api.Context,v:{x:number})=>{});', [2554]],
  ['wrong plugin config', 'new api.Context().plugin((c:api.Context,v:{x:number})=>{},{x:"wrong"});', [2322]],
  ['invalid fiber enum', 'const f:api.FiberState=1000;', [2322]],
  ['volatile immutable snapshot', 'declare const v:api.Volatile<{x:number}>;v.get().x=2;', [2540]],
  ['wrong augmented event arg', `new api.Context().emit('demo/event','wrong');`, [2769]],
  ['unknown property', 'new api.Context().missing;', [2339]],
  ['readonly static symbol', 'api.Context.effect=Symbol();', [2540]],
  ['weak list primitive', 'new api.DisposableList<number>();', [2344]],
  ['private class access', 'declare const f:api.Fiber;f._runner;', [2341]],
  ['private nominal identity', 'declare class Fake{private sn:number;private map:number;private weak:number;readonly length:number;push(value:object):()=>boolean;delete(value:object):boolean;clear():object[];[Symbol.iterator]():MapIterator<object>;}declare const fake:Fake;const list:api.DisposableList<object>=fake;', [2322]],
  ['const enum object unavailable', 'const state=api.FiberState;', [2475]],
  ['type-only export unavailable as value', 'const v=api.Volatile;', [2339]],
  ['Service covariance reverse rejected', 'declare const wide:api.Service<{x:number}>;const narrow:api.Service<{x:1}>=wide;', [2322]],
];

const dir=mkdtempSync(join(tmpdir(),'mithril-cordis-complete-types-'));
try{
 const groups=[];
 for(const [category,cases]of [['positive',positives],['negative',negatives]])for(const [name,body,expected]of cases)for(const variant of ['original','candidate']){
  const file=join(dir,variant+'-'+groups.length+'.ts'),root=variant==='original'?reference:resolve(entry);
  writeFileSync(file,'import * as api from '+JSON.stringify(root.replace(/\.d\.(ts|mts)$/,variant==='original'?'.js':'.mjs'))+';\n'+(typeof body==='function'?body(variant):body));groups.push({category,name,variant,file,expected});
 }
 const program=ts.createProgram(groups.map(g=>g.file),options),diagnostics=ts.getPreEmitDiagnostics(program),negative=new Set(groups.filter(g=>g.category==='negative').map(g=>g.file));
 assert.deepEqual(diagnostics.filter(d=>!d.file||!negative.has(d.file.fileName)).map(d=>({code:d.code,file:d.file?.fileName,text:ts.flattenDiagnosticMessageText(d.messageText,' ')})),[]);
 for(const g of groups.filter(g=>g.category==='negative')){const codes=diagnostics.filter(d=>d.file?.fileName===g.file).map(d=>d.code).sort((a,b)=>a-b);assert.deepEqual(codes,g.expected,g.variant+':'+g.name);}
 const isolated=ts.createProgram(groups.filter(g=>g.variant==='candidate').map(g=>g.file),{...options,paths:undefined});
 const isolatedDiagnostics=ts.getPreEmitDiagnostics(isolated);assert.deepEqual(isolatedDiagnostics.filter(d=>!d.file||!negative.has(d.file.fileName)).map(d=>({code:d.code,text:ts.flattenDiagnosticMessageText(d.messageText,' ')})),[]);
 for(const g of groups.filter(g=>g.variant==='candidate'&&g.category==='negative'))assert.deepEqual(isolatedDiagnostics.filter(d=>d.file?.fileName===g.file).map(d=>d.code).sort((a,b)=>a-b),g.expected,g.name+' isolated candidate');
 assert(isolated.getSourceFiles().every(f=>!f.fileName.startsWith(fixture)&&!f.fileName.startsWith(resolve(fixture,'../cosmokit-declarations'))),'Candidate depends on original oracle types');
 const checker=program.getTypeChecker();
 const surface=file=>checker.getExportsOfModule(checker.getSymbolAtLocation(program.getSourceFile(resolve(file)))).map(s=>{const target=s.flags&ts.SymbolFlags.Alias?checker.getAliasedSymbol(s):s;return{name:s.name,value:!!(target.flags&ts.SymbolFlags.Value),type:!!(target.flags&ts.SymbolFlags.Type),const_enum:!!(target.flags&ts.SymbolFlags.ConstEnum)}}).sort((a,b)=>a.name.localeCompare(b.name));
 const expected=JSON.parse(readFileSync(join(fixture,'public-surface.json'),'utf8'));assert.deepEqual(surface(entry),expected);assert.deepEqual(surface(reference),expected);
 for(const name of ['context','events','fiber','logger','reflect','registry','service','utils'])assert.deepEqual(surface(candidatePath(name)),surface(originalPath(name)),name);
 for(const[name,file]of [['cosmokit',resolve(fixture,'../cosmokit-declarations/index.d.ts')],['standard.schema',join(fixture,'standard-schema/index.d.ts')]])assert.deepEqual(surface(join(dirname(resolve(entry)),meta['module-files'][name])),surface(file),name+' full dependency public surface');
 assert.equal(expected.length,50);assert.equal(expected.filter(s=>s.type).length,35);assert.equal(expected.filter(s=>s.value).length,28);assert.equal(expected.filter(s=>s.value&&!s.const_enum).length,26);
 const native=await import(pathToFileURL(resolve(runtime))),original=await import(new URL('../../../fixtures/cordis-core/index.mjs',import.meta.url));assert.deepEqual(Object.keys(native).sort(),expected.filter(s=>s.value&&!s.const_enum).map(s=>s.name).sort());
 for(const name of ['context','events','fiber','logger','reflect','registry','service','utils']){const leaf=await import(pathToFileURL(join(dirname(resolve(runtime)),meta['module-files']['cordis.'+name].replace('.d.mts','.mjs'))));assert.deepEqual(Object.keys(leaf).sort(),surface(candidatePath(name)).filter(s=>s.value&&!s.const_enum).map(s=>s.name).sort(),name+' actual runtime exports');for(const key of Object.keys(leaf))if(key in native)assert.equal(native[key],leaf[key],name+':'+key+' actual binding origin');}
 const consumer=join(dir,'constant-consumer.mts');writeFileSync(consumer,'import * as api from '+JSON.stringify(resolve(runtime))+';export const constants=[api.LoggerLevel.ERROR,api.LoggerLevel.DEBUG,api.FiberState.ACTIVE,api.FiberState.UNLOADING];export const Context=api.Context;');
 const output=join(dir,'emitted'),emitting=ts.createProgram([consumer],{...options,noEmit:false,allowImportingTsExtensions:false,outDir:output});assert.deepEqual(ts.getPreEmitDiagnostics(emitting).map(d=>ts.flattenDiagnosticMessageText(d.messageText,' ')),[]);assert.equal(emitting.emit().emitSkipped,false);const result=await import(pathToFileURL(join(output,'constant-consumer.mjs')));assert.deepEqual(result.constants,[0,3,2,5]);assert.equal(result.Context,native.Context);let enumAccesses=0;function visit(n){if(ts.isPropertyAccessExpression(n)&&ts.isIdentifier(n.expression)&&n.expression.text==='api'&&['LoggerLevel','FiberState'].includes(n.name.text))enumAccesses++;ts.forEachChild(n,visit)}visit(parse(readFileSync(join(output,'constant-consumer.mjs'),'utf8'),'consumer.mjs'));assert.equal(enumAccesses,0);
 async function contract(api){const c=new api.Context();c.logger.error=()=>{};let n=0;const release=c.on('qualification',()=>n++);c.emit('qualification');release();c.emit('qualification');const remove=c.provide('qualification',42),value=c.get('qualification');remove();const error=new api.CordisError('INACTIVE_EFFECT'),validation=new api.ValidationError([{message:'bad'}]);const out=[n,value,c.get('qualification')===undefined,c.fiber instanceof api.Fiber,c.registry instanceof api.RegistryService,c.logger instanceof api.LoggerService,c.reflect instanceof api.ReflectService,error instanceof Error,error.code,error.message,validation instanceof TypeError,validation.message,api.Inject.resolve(['logger'],{})];await c.fiber.dispose();return out;}
 // ReflectService is reachable through Context, but is intentionally not a public index export.
 const actualReflect=await import(pathToFileURL(join(dirname(resolve(runtime)),meta['module-files']['cordis.reflect'].replace('.d.mts','.mjs')))),originalReflect=await import(new URL('../../../fixtures/cordis-core/reflect.mjs',import.meta.url));assert.deepEqual(await contract({...native,ReflectService:actualReflect.ReflectService}),await contract({...original,ReflectService:originalReflect.ReflectService}));
 console.log('Complete Cordis type oracle:all9 original modules;31 original-paired strict groups;exact50names/35types/28TSvalues/2erased enums/26runtime values;candidate-owned external Context/Events augmentation;full9 module structures/imports/augmentations and all11 dependency forms;actual26-value root and source binding origins;constant folding and original-paired Context/errors/DI runtime;no external type adapters.');
}finally{rmSync(dir,{recursive:true,force:true})}
