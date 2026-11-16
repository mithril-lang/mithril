import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const repo=fileURLToPath(new URL('../../../../',import.meta.url)),fixture=join(repo,'test/fixtures/include-sdk'),[compiler,typeRoots,directory,nativeYamlDirectory]=process.argv.slice(2),ts=createRequire(import.meta.url)(resolve(compiler));
assert.equal(ts.version,'6.0.3');
const {createHash}=await import('node:crypto'),proof=JSON.parse(readFileSync(join(fixture,'provenance.json'),'utf8'));
for(const [file,sha]of Object.entries(proof.fixtures))assert.equal(createHash('sha256').update(readFileSync(join(fixture,file))).digest('hex'),sha);
const candidate=resolve(directory),meta=JSON.parse(readFileSync(candidate+'.log','utf8'));
const originalRoot=join(fixture,'declarations/index.d.ts'),candidateRoot=join(candidate,'index.d.mts');
const originalMapping={'@qualification/include':originalRoot,'@deepseek-ai/cordis-plugin-loader':join(repo,'test/fixtures/loader-sdk/declarations/index.d.ts'),'@deepseek-ai/cordis':join(repo,'test/fixtures/cordis-declarations/program/index.d.ts'),'@deepseek-ai/cosmokit':join(repo,'test/fixtures/cosmokit-declarations/index.d.ts'),'@standard-schema/spec':join(repo,'test/fixtures/cordis-declarations/standard-schema/index.d.ts'),'js-yaml':join(fixture,'yaml-types/index.d.ts')};
const mapping={...originalMapping,'@qualification/include':candidateRoot,'@mithril/native-yaml':join(fixture,'yaml-types/index.d.ts')};
if(nativeYamlDirectory){mapping['@mithril/native-yaml']=join(resolve(nativeYamlDirectory),'index.d.mts');mapping['js-yaml']=mapping['@mithril/native-yaml'];}
for(const [pkg,id]of [['@deepseek-ai/cordis-plugin-loader','loader.index'],['@deepseek-ai/cordis','cordis.index'],['@deepseek-ai/cosmokit','cosmokit'],['@standard-schema/spec','standard.schema']])mapping[pkg]=join(candidate,meta['module-files'][id]);
const groups=[
 ['constructor and merged Config namespace','const config:Include.Config={path:"./x.yaml",patches:[{id:"row",group:null,custom:true}]};const i=new Include(new Context(),config);const same:typeof Include=DefaultInclude;',true],
 ['patch options arbitrary keys','const patch:PatchOptions={id:"row",arbitrary:{nested:true},group:true,disabled:null};const entries:EntryOptions[]=applyEntryPatches([], [patch],()=>{});',true],
 ['Schema public external class','const schema:yaml.Schema=entryListSchema;const next:yaml.Schema=schema.extend(new yaml.Type("fixture",{}));',true],
 ['actual service init generator','declare const i:Include;const gen:AsyncGenerator<()=>Promise<void>,void,unknown>=i[Service.init]();',true],
 ['entry marker and inherited tree','const marker:true=Include[EntryGroup.key];declare const i:Include;const updated:Promise<void>=i.update("row",{});',true],
 ['public persistence and lifecycle returns','declare const i:Include;const wrote:void=i.write();const stopped:Promise<void>=i.stop();const refreshed:Promise<void>=i.refresh();',true],
 ['private parsed data remains private','declare const i:Include;i.data;',false],
 ['private queued flush remains private','declare const i:Include;i.flushWrite();',false],
 ['path required','const config:Include.Config={};',false],
 ['patch group discriminant','const patch:PatchOptions={group:42};',false],
 ['entry marker readonly','Include[EntryGroup.key]=true;',false],
 ['Context constructor argument','new Include(1,{path:"x.yaml"});',false],
 ['async stop return','declare const i:Include;const stopped:void=i.stop();',false],
 ['typed YAML extend argument','entryListSchema.extend(42);',false],
];
const files=groups.map((_,i)=>join(repo,'include-consumer-'+i+'.mts'));
const options={target:ts.ScriptTarget.ES2024,module:ts.ModuleKind.ESNext,moduleResolution:ts.ModuleResolutionKind.Bundler,allowImportingTsExtensions:true,noEmit:true,strict:true,skipLibCheck:false,typeRoots:[resolve(typeRoots)],types:['node']};
function check(mapping,root){
 const host=ts.createCompilerHost(options),read=host.readFile,exists=host.fileExists;
 host.readFile=f=>files.includes(f)?'import DefaultInclude,{Include,PatchOptions,entryListSchema,applyEntryPatches} from "@qualification/include";import {Context,Service} from "@deepseek-ai/cordis";import {EntryGroup,EntryOptions} from "@deepseek-ai/cordis-plugin-loader";import * as yaml from "js-yaml";'+groups[files.indexOf(f)][1]:read(f);
 host.fileExists=f=>files.includes(f)||exists(f);
 host.resolveModuleNames=(names,source)=>names.map(n=>mapping[n]?{resolvedFileName:mapping[n],extension:ts.Extension.Dts,isExternalLibraryImport:true}:ts.resolveModuleName(n,source,options,host).resolvedModule);
 const p=ts.createProgram(files,options,host),result=files.map(()=>[]);
 for(const d of ts.getPreEmitDiagnostics(p)){const i=files.indexOf(d.file?.fileName);assert(i>=0,JSON.stringify({code:d.code,file:d.file?.fileName,message:ts.flattenDiagnosticMessageText(d.messageText,' ')}));result[i].push(d.code)}
 const checker=p.getTypeChecker(),exports=checker.getExportsOfModule(checker.getSymbolAtLocation(p.getSourceFile(root))).map(s=>{const v=s.flags&ts.SymbolFlags.Alias?checker.getAliasedSymbol(s):s;return {name:s.name,type:!!(v.flags&ts.SymbolFlags.Type),value:!!(v.flags&ts.SymbolFlags.Value)}}).sort((a,b)=>a.name.localeCompare(b.name));
 return {codes:result.map(x=>x.sort()),exports};
}
const original=check(originalMapping,originalRoot),actual=check(mapping,candidateRoot);
for(let i=0;i<groups.length;i++){assert.equal(original.codes[i].length===0,groups[i][2],groups[i][0]);assert.deepEqual(actual.codes[i],original.codes[i],groups[i][0])}
assert.deepEqual(actual.exports,original.exports);
console.log(nativeYamlDirectory?'Include native YAML types: 6 positive/8 negative strict original-paired groups, exact diagnostic codes and public symbol spaces; complete own native YAML declarations.':'Include SDK types: 6 positive/8 negative strict original-paired groups, exact diagnostic codes and public symbol spaces; no skipLibCheck; pinned external YAML types.');
