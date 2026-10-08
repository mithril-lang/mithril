import assert from 'node:assert/strict';import{readFileSync,writeFileSync,mkdtempSync,rmSync}from'node:fs';import{resolve,join,dirname}from'node:path';import{pathToFileURL,fileURLToPath}from'node:url';import{tmpdir}from'node:os';import{createHash}from'node:crypto';
const[candidate,compiler,typeRoots,metadata,runtime]=process.argv.slice(2),ts=(await import(pathToFileURL(resolve(compiler)))).default;assert.equal(ts.version,'6.0.3');
const fixture=fileURLToPath(new URL('../../../fixtures/cordis-declarations/',import.meta.url)),meta=JSON.parse(readFileSync(metadata,'utf8')),provenance=JSON.parse(readFileSync(join(fixture,'program-provenance.json'),'utf8'));
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

const own=n=>!ts.isImportDeclaration(n)&&!ts.isExportDeclaration(n);
assert.deepEqual(parse(readFileSync(join(dirname(candidate),meta['module-files']['cordis.context']),'utf8'),'context.d.mts').statements.filter(own).map(fingerprint),source('context').statements.filter(own).map(fingerprint));
for(const name of ['events','logger','reflect','registry','fiber']){
 const original=source(name).statements.find(n=>ts.isModuleDeclaration(n)&&ts.isStringLiteral(n.name)),generated=parse(readFileSync(join(dirname(candidate),meta['module-files']['augmentation.'+name]),'utf8'),name+'.d.mts').statements.find(ts.isModuleDeclaration);
 assert(generated&&ts.isStringLiteral(generated.name));assert.equal(generated.name.text,'./'+meta['module-files']['cordis.context'].replace(/\.d\.mts$/,'.mjs'));
 assert.deepEqual(generated.body.statements.map(fingerprint),original.body.statements.map(fingerprint),name);
}
const dir=mkdtempSync(join(tmpdir(),'mithril-augmentation-consumers-'));
try{
 const cases=[
 ['real constructor',true,'const c=new api.Context();const root:api.Context=c.root;'],
 ['polymorphic Context',true,'class C extends api.Context { extra=1; } const c=new C();const e:C=c.extend({});const i:C=c.isolate("x");const n:C=c.intercept("x",{});'],
 ['predicate narrows',true,'declare const x:unknown;if(api.Context.is(x)){const c:api.Context=x;}'],
 ['reflection exact this indexing',true,'class C extends api.Context{foo=1;}declare const c:C;const n:number|undefined=c.get("foo");c.set("foo",1);const d:()=>void=c.provide("foo",1);'],
 ['reflection accessors',true,'declare const c:api.Context;c.accessor("x",{get(){return 1;}});c.mixin({root:c},["root"]);'],
 ['event methods inherited by this',true,'declare const c:api.Context;const d:()=>boolean=c.on("internal/plugin",()=>{});const p:Promise<void>=c.parallel("internal/plugin",c.fiber);c.emit("internal/plugin",c.fiber);c.serial("internal/plugin",c.fiber);c.bail("internal/plugin",c.fiber);c.waterfall("internal/plugin",c.fiber);c.once("internal/plugin",()=>{});'],
 ['fiber heritage effect',true,'declare const c:api.Context;const f:import("@augmentation/fiber").Fiber=c.fiber;c.effect(()=>()=>{});'],
 ['registry plugin inference',true,'declare const c:api.Context;c.plugin((ctx,config:{value:number})=>{}, {value:1});c.inject([],ctx=>{});'],
 ['Logger Intercept introduced exported interface',true,'const c:api.Intercept={logger:{name:"leaf",level:1}};'],
 ['Context base services original contracts',true,'declare const c:api.Context;const l:import("@augmentation/logger").LoggerService=c.logger;const r:import("@augmentation/registry").RegistryService=c.registry;'],
 ['invalid constructor',false,'new api.Context(1);'],
 ['distinct static symbols',false,'const k:typeof api.Context.effect=api.Context.filter;'],
 ['invalid extend meta',false,'declare const c:api.Context;c.extend(null);'],
 ['invalid isolate label',false,'declare const c:api.Context;c.isolate("x","wrong");'],
 ['reflection getter type',false,'class C extends api.Context{foo=1;}declare const c:C;const s:string=c.get("foo");'],
 ['reflection accessor type',false,'declare const c:api.Context;c.accessor("x",{get:1});'],
 ['Logger Intercept wrong type',false,'const c:api.Intercept={logger:{level:"wrong"}};'],
 ['event listener options',false,'declare const c:api.Context;c.on("internal/plugin",()=>{}, {prepend:"wrong"});'],
 ['registry config inference',false,'declare const c:api.Context;c.plugin((ctx,config:{value:number})=>{}, {value:"wrong"});'],
 ['fiber missing property',false,'declare const c:api.Context;c.fiber.noSuchField;'],
 ];
 const paths=Object.fromEntries(['context','events','logger','reflect','registry','fiber','utils','service'].map(n=>['@augmentation/'+n,[join(fixture,'program',n+'.d.ts')]]));paths['@deepseek-ai/cosmokit']=[resolve(fixture,'../cosmokit-declarations/index.d.ts')];paths['@standard-schema/spec']=[join(fixture,'standard-schema/index.d.ts')];
 const files=[];for(const[name,ok,body]of cases)for(const variant of ['original','candidate']){const file=join(dir,variant+'-'+files.length+'.ts'),root=variant==='original'?join(fixture,'program/context.js'):resolve(candidate).replace(/\.d\.mts$/,'.mjs');writeFileSync(file,'import * as api from '+JSON.stringify(root)+';\n'+body);files.push({file,name,ok,variant});}
 const program=ts.createProgram(files.map(x=>x.file),{strict:true,noEmit:true,skipLibCheck:false,target:ts.ScriptTarget.ES2024,module:ts.ModuleKind.ESNext,moduleResolution:ts.ModuleResolutionKind.Bundler,allowImportingTsExtensions:true,types:['node'],typeRoots:[resolve(typeRoots)],paths}),diagnostics=ts.getPreEmitDiagnostics(program),negative=new Set(files.filter(x=>!x.ok).map(x=>x.file));
 assert.deepEqual(diagnostics.filter(d=>!d.file||!negative.has(d.file.fileName)).map(d=>({file:d.file?.fileName,code:d.code,text:ts.flattenDiagnosticMessageText(d.messageText,' ')})),[]);
 for(const[name,ok]of cases)if(!ok){const pair=files.filter(x=>x.name===name),codes=c=>diagnostics.filter(d=>d.file?.fileName===c.file).map(d=>d.code).sort((a,b)=>a-b);assert(codes(pair[0]).length,name);assert.deepEqual(codes(pair[0]),codes(pair[1]),name);}
 const checker=program.getTypeChecker(),surface=file=>checker.getExportsOfModule(checker.getSymbolAtLocation(program.getSourceFile(file))).map(s=>s.name).sort();assert.deepEqual(surface(join(dirname(candidate),meta['module-files']['cordis.context'])),surface(join(fixture,'program/context.d.ts')));assert.deepEqual(surface(join(dirname(candidate),meta['module-files']['cordis.context'])),['Context','Intercept']);
 const actual=await import(pathToFileURL(resolve(runtime))),original=await import(new URL('../../../fixtures/cordis-core/index.mjs',import.meta.url));assert.deepEqual(Object.keys(actual),['Context']);assert.equal(actual.Context,(await import(new URL('./module-0.mjs',pathToFileURL(resolve(runtime))))).Context);
 async function contract(C){const c=new C();c.logger.error=()=>{};let n=0;const d=c.on('qualification',()=>n++);c.emit('qualification');d();c.emit('qualification');const release=c.provide('qualification',42);const value=c.get('qualification');release();const child=c.extend({label:'child'});const out=[n,value,c.get('qualification')===undefined,child.root===c,C.is(child),typeof c.effect,typeof c.plugin,typeof c.inject,typeof c.fiber.dispose];await c.fiber.dispose();return out;}
 assert.deepEqual(await contract(actual.Context),await contract(original.Context));
 console.log('Module augmentation oracle:real Context class/interface plus all5 original augmentation structures;20 paired strict groups;2types/1actual runtime value;original-paired context event/reflection/disposal behavior. External source service contracts remain qualification adapters.');
}finally{rmSync(dir,{recursive:true,force:true});}
