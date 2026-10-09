import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const [compiler,typeRoots,directory]=process.argv.slice(2),ts=createRequire(import.meta.url)(resolve(compiler));assert.equal(ts.version,'6.0.3');
const fixture=fileURLToPath(new URL('../../../fixtures/include-sdk/',import.meta.url)),original=join(fixture,'yaml-types/index.mjs'),candidate=join(resolve(directory),'index.mjs');
const proof=JSON.parse(readFileSync(join(fixture,'provenance.json'),'utf8'));
const nativeProof=JSON.parse(readFileSync(new URL('../provenance.json',import.meta.url),'utf8')),repo=fileURLToPath(new URL('../../../../',import.meta.url));
for(const [file,sha]of Object.entries(nativeProof.sourceHashes))assert.equal(createHash('sha256').update(readFileSync(join(repo,file))).digest('hex'),sha);
for(const file of ['yaml-types/index.d.ts','yaml-types/index.d.mts','yaml-types/package.json'])assert.equal(createHash('sha256').update(readFileSync(join(fixture,file))).digest('hex'),proof.fixtures[file]);
const cases=[
 ['class namespace','const s:yaml.Schema=yaml.DEFAULT_SCHEMA.extend(new yaml.Type("!x",{kind:"scalar"}));const t:yaml.Type=new yaml.Type("!x");',[]],
 ['options namespace','const opts:yaml.LoadOptions={schema:yaml.DEFAULT_SCHEMA};const x:unknown=yaml.load("1",opts);',[]],
 ['Type options','const opts:yaml.TypeConstructorOptions={kind:"sequence",construct:x=>x};new yaml.Type("!x",opts);',[]],
 ['schema definition','const opts:yaml.SchemaDefinition={implicit:[new yaml.Type("!x")]};const s:yaml.Schema=new yaml.Schema(opts);',[]],
 ['error and mark','const e:yaml.YAMLException=new yaml.YAMLException("x");const m:yaml.Mark=e.mark;const x:Error=e;',[]],
 ['loadAll overloads','const xs:unknown[]=yaml.loadAll("1",null);const v:void=yaml.loadAll("1",x=>{});',[]],
 ['dump options','const x:yaml.DumpOptions={indent:2};const s:string=yaml.dump(1,x);',[]],
 ['namespace typeof','type API=typeof yaml;const x:API=yaml;',[]],
 ['original function assignment','yaml.load=(x:string)=>1;',[]],
 ['original schema assignment','yaml.DEFAULT_SCHEMA=new yaml.Schema([]);',[]],
 ['type-only default','const x:onlyYaml.LoadOptions={json:true};declare const s:onlyYaml.Schema;',[]],
 ['inline import type','declare const s:import(ENTRY).default.Schema;',[]],
 ['inline import query','const x:typeof import(ENTRY).default=yaml;',[]],
 ['bad Type','new yaml.Type(42);',[2345]],
 ['bad Schema','new yaml.Schema({implicit:[42]});',[2345]],
 ['bad options','yaml.load("1",{json:42});',[2322]],
 ['unknown load','const x:string=yaml.load("1");',[2322]],
 ['missing safeLoad','yaml.safeLoad("1");',[2339]],
 ['missing safeDump','yaml.safeDump(1);',[2339]],
 ['missing safeLoadAll','yaml.safeLoadAll("1");',[2339]],
 ['missing types','yaml.types;',[2551]],
 ['no recursive default','yaml.default;',[2339]],
 ['namespace is not a type','const x:yaml=1;',[2709]],
 ['missing public type','declare const x:yaml.Missing;',[2694]],
];
const dir=mkdtempSync(join(tmpdir(),'mithril-yaml-public-types-'));
const options={strict:true,skipLibCheck:false,noEmit:true,types:[],target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.NodeNext,moduleResolution:ts.ModuleResolutionKind.NodeNext,moduleDetection:ts.ModuleDetectionKind.Legacy};
try{
 function check(entry,tag){
  const files=cases.map(([name,body],i)=>{const f=join(dir,`${tag}-${i}.mts`),path=JSON.stringify(entry);writeFileSync(f,`import yaml from ${path};import type onlyYaml from ${path};\n`+body.replaceAll('ENTRY',path));return f});
  const p=ts.createProgram(files,options),groups=files.map(()=>[]);
  for(const d of ts.getPreEmitDiagnostics(p)){const i=files.indexOf(d.file?.fileName);assert(i>=0,ts.flattenDiagnosticMessageText(d.messageText,' '));groups[i].push(d.code)}
  const checker=p.getTypeChecker(),sf=p.getSourceFile(entry.replace(/\.mjs$/,'.d.mts'));
  const exports=checker.getExportsOfModule(checker.getSymbolAtLocation(sf)).map(s=>{const target=s.flags&ts.SymbolFlags.Alias?checker.getAliasedSymbol(s):s;return {name:s.name,type:!!(target.flags&ts.SymbolFlags.Type),value:!!(target.flags&ts.SymbolFlags.Value),namespace:!!(target.flags&ts.SymbolFlags.Namespace)}}).sort((a,b)=>a.name.localeCompare(b.name));
  const defaultSymbol=checker.getAliasedSymbol(checker.getExportsOfModule(checker.getSymbolAtLocation(sf)).find(s=>s.name==='default'));
  const members=checker.getExportsOfModule(defaultSymbol).map(s=>s.name).sort();
  return {codes:groups.map(x=>x.sort((a,b)=>a-b)),exports,members};
 }
 const baseline=check(original,'original');assert.deepEqual(baseline.codes,cases.map(x=>x[2]));assert.deepEqual(check(candidate,'candidate'),baseline,'full default namespace symbol spaces and consumer diagnostics');
 // Actual standard package self-reference resolution, without a virtual resolver.
 const good=join(directory,'native-package-positive.mts'),bad=join(directory,'native-package-negative.mts');
 writeFileSync(good,'import yaml,{Schema,load} from "@mithril/native-yaml";const s:yaml.Schema=new Schema([]);const opts:yaml.LoadOptions={schema:s};const x:unknown=load("1",opts);');
 writeFileSync(bad,'import yaml from "@mithril/native-yaml";yaml.safeLoad("1");const x:string=yaml.load("1");');
 const p=ts.createProgram([good,bad],options),groups=[[],[]];for(const d of ts.getPreEmitDiagnostics(p)){const i=[good,bad].indexOf(d.file?.fileName);assert(i>=0,ts.flattenDiagnosticMessageText(d.messageText,' '));groups[i].push(d.code)}assert.deepEqual(groups[0],[]);assert.deepEqual(groups[1].sort(),[2322,2339]);
 // Original UMD namespace still comes from the named API module. The new default
 // wrapper must not add a recursive `jsyaml.default` global type member.
 for(const [tag,entry]of [['original',original],['candidate',candidate]])for(const allow of [false,true]){
  const module=join(dir,`${tag}-umd-${allow}.mts`),script=join(dir,`${tag}-umd-${allow}.ts`),badScript=join(dir,`${tag}-umd-bad-${allow}.ts`);
  writeFileSync(module,'export {};const x:unknown=jsyaml.load("1");');writeFileSync(script,'{const x:unknown=jsyaml.load("1");const y:jsyaml.LoadOptions={json:true};}');writeFileSync(badScript,'jsyaml.default;');
  const p=ts.createProgram([module,script,badScript,entry.replace(/\.mjs$/,'.d.mts')],{...options,allowUmdGlobalAccess:allow}),codes=[[],[],[]];for(const d of ts.getPreEmitDiagnostics(p)){const i=[module,script,badScript].indexOf(d.file?.fileName);assert(i>=0,ts.flattenDiagnosticMessageText(d.messageText,' '));codes[i].push(d.code)}assert.deepEqual(codes,[allow?[]:[2686],[],[2339]]);
 }
 console.log('YAML default namespace types: 13 positive/11 negative strict original-paired consumers, exact public value/type/namespace spaces and default members; real NodeNext package resolution and conditional UMD globals.');
}finally{rmSync(dir,{recursive:true,force:true});}
