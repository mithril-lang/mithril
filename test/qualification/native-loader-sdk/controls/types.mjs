import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';

const repo=fileURLToPath(new URL('../../../../',import.meta.url)),base=process.cwd(),ts=createRequire(import.meta.url)(resolve(process.argv[2]));
assert.equal(ts.version,'6.0.3');
const candidate=process.argv[4]?resolve(process.argv[4]):null;
const root=candidate?join(candidate,'index.d.mts'):join(repo,'test/fixtures/loader-sdk/declarations/index.d.ts');
const mapping={'@qualification/loader':root,'@deepseek-ai/cordis':join(repo,'test/fixtures/cordis-declarations/program/index.d.ts'),'@deepseek-ai/cosmokit':join(repo,'test/fixtures/cosmokit-declarations/index.d.ts'),'@standard-schema/spec':join(repo,'test/fixtures/cordis-declarations/standard-schema/index.d.ts')};
const originalMapping={...mapping,'@qualification/loader':join(repo,'test/fixtures/loader-sdk/declarations/index.d.ts')};
if(candidate){const meta=JSON.parse((await import('node:fs')).readFileSync(candidate+'.log','utf8'));for(const [pkg,id]of [['@deepseek-ai/cordis','cordis.index'],['@deepseek-ai/cosmokit','cosmokit'],['@standard-schema/spec','standard.schema']])mapping[pkg]=join(candidate,meta['module-files'][id]);}
const groups=[];
const options={target:ts.ScriptTarget.ES2024,module:ts.ModuleKind.ESNext,moduleResolution:ts.ModuleResolutionKind.Bundler,allowImportingTsExtensions:true,noEmit:true,strict:true,skipLibCheck:false,typeRoots:[resolve(process.argv[3])],types:['node']};
const cases=[
 ['construct reexported Context remains a class','const ctx=new Context();const loader:Loader=ctx.loader;',true],
 ['augmented Fiber preserves class identity','declare const fiber:Fiber;const entry:Entry|undefined=fiber.entry;',true],
 ['augmented Entry retains original private brands','declare const entry:Entry;const realm:LocalRealm=entry.realm;',true],
 ['Context augmentation is typed','const ctx=new Context();const n:number=ctx.loader;',false],
 ['Fiber entry augmentation rejects wrong values','declare const fiber:Fiber;fiber.entry=1;',false],
 ['Entry realm augmentation rejects wrong values','declare const entry:Entry;entry.realm=1;',false],
 ['Loader default identity and config namespace','const ctx=new Context();const config:Loader.Config={baseUrl:"file:///fixture/"};const loader=new Loader(ctx,config);const same:typeof Loader=DefaultLoader;',true],
 ['entry config and isolation options','const options:EntryOptions={id:"a",name:"cordis:fixture",isolate:{service:true},intercept:{service:{}}};',true],
 ['ModuleLoader discriminated host version','declare const host:ModuleLoader;if(host.version==="v1"){const r:Promise<ResolveResult>=host.resolve("x","file:///",{});}else{const r:ResolveResult=host.resolveSync("file:///",{specifier:"x"});}',true],
 ['Realm protected store and private entry brand','declare const realm:LocalRealm;realm.store;',false],
 ['tree abstract construction','const tree=new EntryTree(new Context());',false],
 ['v2 resolve uses request object','declare const host:ModuleLoaderV2;host.resolveSync("x","file:///");',false],
 ['Group init generator and fixed unique symbol','declare const group:Group;const init:AsyncGenerator<()=>void,void,unknown>=group[Service.init]();const flag:true=Group[EntryGroup.key];',true],
 ['tree task and config async return contracts','declare const tree:EntryTree;const tasks:Promise<void>[]=tree.getTasks();const created:Promise<string>=tree.create({name:"fixture"});const updated:Promise<void>=tree.update("a",{config:{}});',true],
 ['Entry constructor keeps required Loader type','new Entry(1);',false]
];
const files=cases.map((_,index)=>join(base,'loader-barrel-consumer-'+index+'.mts'));
const prefix='import {Context,Fiber,Service} from "@deepseek-ai/cordis";import DefaultLoader,{Loader,Entry,LocalRealm,EntryOptions,ModuleLoader,ModuleLoaderV2,ResolveResult,EntryTree,Group,EntryGroup} from "@qualification/loader";';
function checkProgram(mapping,root){
 const host=ts.createCompilerHost(options),read=host.readFile,exists=host.fileExists;
 host.readFile=f=>files.includes(f)?prefix+cases[files.indexOf(f)][1]:read(f);
 host.fileExists=f=>files.includes(f)||exists(f);
 host.resolveModuleNames=(names,source)=>names.map(n=>mapping[n]?{resolvedFileName:mapping[n],extension:ts.Extension.Dts,isExternalLibraryImport:true}:ts.resolveModuleName(n,source,options,host).resolvedModule);
 const program=ts.createProgram(files,options,host),diagnostics=files.map(()=>[]);
 for(const d of ts.getPreEmitDiagnostics(program)){
  const index=files.indexOf(d.file?.fileName);
  assert(index>=0,'Unexpected dependency error: '+ts.flattenDiagnosticMessageText(d.messageText,' '));
  diagnostics[index].push({code:d.code,message:ts.flattenDiagnosticMessageText(d.messageText,' ')});
 }
 const checker=program.getTypeChecker(),exports=checker.getExportsOfModule(checker.getSymbolAtLocation(program.getSourceFile(root))).map(s=>{const value=s.flags&ts.SymbolFlags.Alias?checker.getAliasedSymbol(s):s;return{name:s.name,type:!!(value.flags&ts.SymbolFlags.Type),value:!!(value.flags&ts.SymbolFlags.Value)}}).sort((a,b)=>a.name.localeCompare(b.name));
 return {diagnostics,exports};
}
const actual=checkProgram(mapping,root);
const original=candidate?checkProgram(originalMapping,originalMapping['@qualification/loader']):actual;
assert.deepEqual(actual.exports,original.exports,'Complete public TS symbol spaces');
for(let index=0;index<cases.length;index++){
 const [name,body,valid]=cases[index],diag=actual.diagnostics[index],expected=original.diagnostics[index];
 assert.equal(expected.length===0,valid,name+' original '+JSON.stringify(expected));
 assert.equal(diag.length===0,valid,name+JSON.stringify(diag));
 assert.deepEqual(diag.map(d=>d.code),expected.map(d=>d.code),name+' original/candidate diagnostic codes');
 groups.push({name,valid,diagnostics:diag});
}

console.log((candidate?'Native':'Original')+' complete Loader declaration graph: '+groups.filter(g=>g.valid).length+' positive/'+groups.filter(g=>!g.valid).length+' negative strict consumers, no skipLibCheck, barrel Context/Fiber and Entry augmentation identities.');
