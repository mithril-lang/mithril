import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const [single,program,runtime,yamlTypes,yamlRuntime,compiler]=process.argv.slice(2),ts=(await import(pathToFileURL(resolve(compiler)))).default;
assert.equal(ts.version,'6.0.3');
const fixture=fileURLToPath(new URL('../../../fixtures/include-sdk/',import.meta.url)),original=join(fixture,'yaml-types/index.d.ts');
const provenance=JSON.parse(readFileSync(join(fixture,'provenance.json'),'utf8'));
assert.equal(createHash('sha256').update(readFileSync(original)).digest('hex'),provenance.fixtures['yaml-types/index.d.ts']);
function parse(file){return ts.createSourceFile(file,readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TS)}
function shape(n){
 if(ts.isParenthesizedTypeNode(n))return shape(n.type);
 if(ts.isIdentifier(n)||ts.isStringLiteral(n)||ts.isNumericLiteral(n))return {text:n.text};
 const children=[];ts.forEachChild(n,c=>{if(![ts.SyntaxKind.ExportKeyword,ts.SyntaxKind.DeclareKeyword].includes(c.kind))children.push(shape(c))});
 return {kind:n.kind,children};
}
const source=parse(original),candidate=parse(yamlTypes);
const sourceDeclarations=source.statements.filter(n=>!ts.isNamespaceExportDeclaration(n));
const candidateDeclarations=candidate.statements.filter(n=>!ts.isNamespaceExportDeclaration(n)&&!ts.isExportDeclaration(n));
assert.equal(sourceDeclarations.length,18);assert.deepEqual(candidateDeclarations.map(shape),sourceDeclarations.map(shape),'all original YAML source declarations, class members and overloads');
assert.deepEqual(source.statements.filter(ts.isNamespaceExportDeclaration).map(shape),candidate.statements.filter(ts.isNamespaceExportDeclaration).map(shape),'original UMD namespace');
const yamlCases=[
 ['load','const x:unknown=A.load("a: 1");',[]],
 ['load options','const x:A.LoadOptions={filename:"x",schema:A.DEFAULT_SCHEMA,json:true,onWarning(this:null,e){const r:string=e.reason},listener(this:A.State,event,state){const x:A.EventType=event;const n:number=this.line}};A.load("1",x);',[]],
 ['loadAll array','const x:unknown[]=A.loadAll("1");const y:unknown[]=A.loadAll("1",null);',[]],
 ['loadAll iterator','const x:void=A.loadAll("1",doc=>{const d:unknown=doc},{json:true});',[]],
 ['dump',String.raw`const x:string=A.dump({x:1},{indent:2,noArrayIndent:true,sortKeys:(a,b)=>a.localeCompare(b),styles:{"!!null":"canonical"},quotingType:"\"",replacer:(k,v)=>v});`,[]],
 ['Type','const t:A.Type=new A.Type("!x",{kind:"scalar",resolve:(x)=>true,construct:x=>x,instanceOf:Object,predicate:x=>true,represent:{canonical:(x)=>String(x)},representName:x=>"!x",defaultStyle:"x",multi:true,styleAliases:{x:[1]}});const b:boolean=t.resolve(1);const r:any=t.construct(1);',[]],
 ['Schema','const t=new A.Type("!x");const s:A.Schema=new A.Schema({implicit:[t],explicit:[t]}).extend(t).extend([t]);const d:A.Schema=s.extend({explicit:[t]});',[]],
 ['schemas','const s:A.Schema[]= [A.FAILSAFE_SCHEMA,A.JSON_SCHEMA,A.CORE_SCHEMA,A.DEFAULT_SCHEMA];',[]],
 ['exception','const e:A.YAMLException=new A.YAMLException("x",{name:"f",buffer:"x",position:0,line:0,column:0,snippet:"x"});const x:string=e.toString(true);const y:Error=e;const z:A.Mark=e.mark;',[]],
 ['state','declare const s:A.State;const a:string=s.input;const b:number=s.line;const c:A.EventType="open";',[]],
 ['full options','const x:A.TypeConstructorOptions={kind:"mapping",resolve:x=>true,construct:x=>x,instanceOf:Object,predicate:x=>true,represent:x=>x,representName:x=>"!x",defaultStyle:"x",multi:true,styleAliases:{x:["one"]}};',[]],
 ['bad load','A.load(42);',[2345]],
 ['bad iterator','const x:unknown[]=A.loadAll("1",doc=>{});',[2322]],
 ['bad kind','new A.Type("!x",{kind:"wrong"});',[2322]],
 ['bad schema','new A.Schema({implicit:[42]});',[2345]],
 ['bad options','A.dump(1,{indent:"x"});',[2322]],
 ['bad event','const x:A.EventType="wrong";',[2322]],
 ['bad mark','const x:A.Mark={name:"f",buffer:"x",position:0,line:0,column:0};',[2741]],
 ['missing safeLoad','A.safeLoad("1");',[2339]],
 ['missing safeDump','A.safeDump(1);',[2339]],
 ['missing safeLoadAll','A.safeLoadAll("1");',[2339]],
 ['missing types','A.types;',[2551]],
 ['unknown load value','const x:string=A.load("1");',[2322]],
];
const dir=mkdtempSync(join(tmpdir(),'mithril-runtime-only-consumers-'));
const options={strict:true,skipLibCheck:false,noEmit:true,types:[],target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.NodeNext,moduleResolution:ts.ModuleResolutionKind.NodeNext,moduleDetection:ts.ModuleDetectionKind.Legacy};
try{
 const small=join(dir,'counter-original.d.mts');writeFileSync(small,'export let count:number;export interface Options{label:string}');
 const smallCases=[['count','const x:number=A.count;',[]],['types','const x:A.Options={label:"x"};',[]],['untyped bump','A.bump();',[2339]],['bad type','const x:string=A.count;',[2322]]];
 function diagnostics(entry,cases,tag){
  const files=cases.map(([name,body],i)=>{const file=join(dir,`${tag}-${i}.mts`);writeFileSync(file,`import * as A from ${JSON.stringify(resolve(entry).replace(/\.d\.(?:mts|ts)$/,entry.endsWith('.mts')?'.mjs':'.js'))};\n${body}`);return file});
  const p=ts.createProgram(files,options),groups=files.map(()=>[]);
  for(const d of ts.getPreEmitDiagnostics(p)){const i=files.indexOf(d.file?.fileName);assert(i>=0,ts.flattenDiagnosticMessageText(d.messageText,' '));groups[i].push(d.code)}
  return groups.map(x=>x.sort((a,b)=>a-b));
 }
 const counterOracle=diagnostics(small,smallCases,'counter-original');assert.deepEqual(counterOracle,smallCases.map(x=>x[2]));
 for(const [i,c]of [single,program].entries())assert.deepEqual(diagnostics(c,smallCases,`counter-candidate-${i}`),counterOracle);
 const yamlOracle=diagnostics(original,yamlCases,'yaml-original');assert.deepEqual(yamlOracle,yamlCases.map(x=>x[2]),'original exact diagnostics');
 assert.deepEqual(diagnostics(yamlTypes,yamlCases,'yaml-candidate'),yamlOracle);
 const sdk=await import(pathToFileURL(resolve(runtime)));assert.equal(sdk.count,0);assert.equal(sdk.bump(),1);assert.equal(sdk.count,1);
 const yaml=await import(pathToFileURL(resolve(yamlRuntime)));assert.equal(Object.keys(yaml).length,15);assert.equal(typeof yaml.safeLoad,'function');assert.equal(typeof yaml.types,'object');assert.deepEqual(yaml.load('x: 1'),{x:1});
 console.log('Runtime-only types: 2 positive/2 negative counter consumers for single/program artifacts; untyped runtime symbol remains executable; strict exact-code paired consumers.');
 console.log('YAML named API types: all 18 original declarations, 11 positive/12 negative strict original-paired consumers, 10 named typed values with 15 actual runtime exports; default namespace wrapper remains pending.');
}finally{rmSync(dir,{recursive:true,force:true});}
