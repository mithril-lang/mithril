import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';

const repo=fileURLToPath(new URL('../../../../',import.meta.url)),base=process.cwd(),ts=createRequire(import.meta.url)(resolve(process.argv[2]));
assert.equal(ts.version,'6.0.3');
const root=join(repo,'test/fixtures/loader-sdk/declarations/index.d.ts');
const mapping={'@qualification/loader':root,'@deepseek-ai/cordis':join(repo,'test/fixtures/cordis-declarations/program/index.d.ts'),'@deepseek-ai/cosmokit':join(repo,'test/fixtures/cosmokit-declarations/index.d.ts'),'@standard-schema/spec':join(repo,'test/fixtures/cordis-declarations/standard-schema/index.d.ts')};
const file=join(base,'loader-barrel-augmentation-consumer.mts'),groups=[];
const options={target:ts.ScriptTarget.ES2024,module:ts.ModuleKind.NodeNext,moduleResolution:ts.ModuleResolutionKind.NodeNext,allowImportingTsExtensions:true,noEmit:true,strict:true,skipLibCheck:false,typeRoots:[resolve(process.argv[3])],types:['node']};
for(const [name,body,valid]of [
 ['construct reexported Context remains a class','const ctx=new Context();const loader:Loader=ctx.loader;',true],
 ['augmented Fiber preserves class identity','declare const fiber:Fiber;const entry:Entry|undefined=fiber.entry;',true],
 ['augmented Entry retains original private brands','declare const entry:Entry;const realm:LocalRealm=entry.realm;',true],
 ['Context augmentation is typed','const ctx=new Context();const n:number=ctx.loader;',false],
 ['Fiber entry augmentation rejects wrong values','declare const fiber:Fiber;fiber.entry=1;',false],
 ['Entry realm augmentation rejects wrong values','declare const entry:Entry;entry.realm=1;',false]
]){
 const text='import {Context,Fiber} from "@deepseek-ai/cordis";import {Loader,Entry,LocalRealm} from '+JSON.stringify('@qualification/loader')+';'+body;
 const host=ts.createCompilerHost(options),oldRead=host.readFile,oldExists=host.fileExists;host.readFile=f=>f===file?text:oldRead(f);host.fileExists=f=>f===file||oldExists(f);
 host.resolveModuleNames=(names,source)=>names.map(name=>mapping[name]?{resolvedFileName:mapping[name],extension:ts.Extension.Dts,isExternalLibraryImport:true}:ts.resolveModuleName(name,source,options,host).resolvedModule);
 const p=ts.createProgram([file],options,host),diag=ts.getPreEmitDiagnostics(p).map(d=>({code:d.code,file:d.file?.fileName,line:d.file&&d.start!==undefined?d.file.getLineAndCharacterOfPosition(d.start).line+1:null,message:ts.flattenDiagnosticMessageText(d.messageText,' ')}));
 assert.equal(diag.length===0,valid,name+JSON.stringify(diag));assert(diag.every(d=>d.file===file),name+' unexpected original dependency errors');groups.push({name,valid,diagnostics:diag});
}

console.log('Original complete Loader declaration graph: 3 positive/3 negative strict consumers, no skipLibCheck, barrel Context/Fiber and Entry augmentation identities.');
