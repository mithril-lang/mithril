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
const file=join(base,'loader-barrel-augmentation-consumer.mts'),groups=[];
const options={target:ts.ScriptTarget.ES2024,module:ts.ModuleKind.ESNext,moduleResolution:ts.ModuleResolutionKind.Bundler,allowImportingTsExtensions:true,noEmit:true,strict:true,skipLibCheck:false,typeRoots:[resolve(process.argv[3])],types:['node']};
for(const [name,body,valid]of [
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
]){
 const text='import {Context,Fiber,Service} from "@deepseek-ai/cordis";import DefaultLoader,{Loader,Entry,LocalRealm,EntryOptions,ModuleLoader,ModuleLoaderV2,ResolveResult,EntryTree,Group,EntryGroup} from '+JSON.stringify('@qualification/loader')+';'+body;
 const host=ts.createCompilerHost(options),oldRead=host.readFile,oldExists=host.fileExists;host.readFile=f=>f===file?text:oldRead(f);host.fileExists=f=>f===file||oldExists(f);
 host.resolveModuleNames=(names,source)=>names.map(name=>mapping[name]?{resolvedFileName:mapping[name],extension:ts.Extension.Dts,isExternalLibraryImport:true}:ts.resolveModuleName(name,source,options,host).resolvedModule);
 const p=ts.createProgram([file],options,host),diag=ts.getPreEmitDiagnostics(p).map(d=>({code:d.code,file:d.file?.fileName,line:d.file&&d.start!==undefined?d.file.getLineAndCharacterOfPosition(d.start).line+1:null,message:ts.flattenDiagnosticMessageText(d.messageText,' ')}));
 assert.equal(diag.length===0,valid,name+JSON.stringify(diag));assert(diag.every(d=>d.file===file),name+' unexpected dependency errors');
 if(candidate){const originalHost=ts.createCompilerHost(options),read=originalHost.readFile,exists=originalHost.fileExists;
  originalHost.readFile=f=>f===file?text:read(f);originalHost.fileExists=f=>f===file||exists(f);
  originalHost.resolveModuleNames=(names,source)=>names.map(n=>originalMapping[n]?{resolvedFileName:originalMapping[n],extension:ts.Extension.Dts,isExternalLibraryImport:true}:ts.resolveModuleName(n,source,options,originalHost).resolvedModule);
  const originalProgram=ts.createProgram([file],options,originalHost),original=ts.getPreEmitDiagnostics(originalProgram);
  assert(original.every(d=>d.file?.fileName===file),name+' original dependency error');
  assert.deepEqual(diag.map(d=>d.code),original.map(d=>d.code),name+' original/candidate diagnostic codes');
  const exportsOf=(program,path)=>{const checker=program.getTypeChecker();return checker.getExportsOfModule(checker.getSymbolAtLocation(program.getSourceFile(path))).map(s=>{const value=s.flags&ts.SymbolFlags.Alias?checker.getAliasedSymbol(s):s;return{name:s.name,type:!!(value.flags&ts.SymbolFlags.Type),value:!!(value.flags&ts.SymbolFlags.Value)}}).sort((a,b)=>a.name.localeCompare(b.name));};
  assert.deepEqual(exportsOf(p,root),exportsOf(originalProgram,originalMapping['@qualification/loader']),name+' complete public TS symbol spaces');
 }
 groups.push({name,valid,diagnostics:diag});
}

console.log((candidate?'Native':'Original')+' complete Loader declaration graph: '+groups.filter(g=>g.valid).length+' positive/'+groups.filter(g=>!g.valid).length+' negative strict consumers, no skipLibCheck, barrel Context/Fiber and Entry augmentation identities.');
