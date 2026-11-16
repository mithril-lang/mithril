import assert from 'node:assert/strict';import fs from 'node:fs';import {pathToFileURL} from 'node:url';import {resolve,join} from 'node:path';import{fileURLToPath}from'node:url';import{createHash}from'node:crypto';import{tmpdir}from'node:os';import{execFileSync}from'node:child_process';
const repo=fileURLToPath(new URL('../../../../',import.meta.url));
const archive=join(repo,'test/fixtures/native-esm-namespaces/js-yaml-4.2.0.tar.gz');
assert.equal(createHash('sha256').update(fs.readFileSync(archive)).digest('hex'),'50bafc4aa4cb263b2d3b3f430535ed8d49294eb107796e767d76a5ca475aca66');
const dir=fs.mkdtempSync(join(tmpdir(),'mithril-yaml-source-oracle-'));
try{
execFileSync('tar',['-xzf',archive,'-C',dir,'--strip-components=1']);
const source=join(dir,'dist/js-yaml.mjs');assert.equal(createHash('sha256').update(fs.readFileSync(source)).digest('hex'),'5b4536e72a2203aa6f159630caeefde35a95d8f95620f5a1d3c48efe3a0e76fa');
const original=await import(pathToFileURL(source));
function snapshot(value,seen=new Map()){
 if(typeof value==='number'){if(Number.isNaN(value))return {number:'NaN'};if(Object.is(value,-0))return {number:'-0'};if(!Number.isFinite(value))return{number:String(value)};return value;}
 if(value===undefined)return {undefined:true};if(value===null||typeof value!=='object')return value;
 if(seen.has(value))return {ref:seen.get(value)};const id=seen.size;seen.set(value,id);
 if(value instanceof Date)return{id,date:value.toISOString()};if(value instanceof Uint8Array)return{id,bytes:[...value]};
 if(Array.isArray(value))return{id,array:value.map(v=>snapshot(v,seen))};return{id,object:Object.keys(value).map(k=>[k,snapshot(value[k],seen)])};
}
function error(e){return{name:e.name,message:e.message,reason:e.reason,mark:e.mark?{name:e.mark.name,buffer:e.mark.buffer,position:e.mark.position,line:e.mark.line,column:e.mark.column,snippet:e.mark.snippet}:null,toString:e.toString(),compact:e.toString(true)};}
function outcome(fn){try{return{value:snapshot(fn())}}catch(e){return{error:error(e)}}}
function observe(y){const groups=[];function add(name,fn){groups.push({name,...outcome(fn)});}
 add('public exports',()=>({keys:Object.keys(y),defaultKeys:Object.keys(y.default),aliases:Object.keys(y).filter(k=>k!=='default').map(k=>[k,y[k]===y.default[k]]),metadata:['Type','Schema','YAMLException','load','loadAll','dump','safeLoad','safeLoadAll','safeDump'].map(k=>[k,y[k].name,y[k].length]),prototypes:['Type','Schema','YAMLException'].map(k=>[k,Reflect.ownKeys(y[k].prototype).map(String)])}));
 const scalars=['null','Null','NULL','~','true','True','FALSE','yes','on','0','-0','42','0b101','0o17','0xFF','012','1_000','3.14','-.inf','.NaN','2026-10-09','2001-12-15T02:59:43.1Z','"unicode ☃"',"'quoted ''text'''",'!!binary SGVsbG8=','!!str 42'];
 for(const schema of ['FAILSAFE_SCHEMA','JSON_SCHEMA','CORE_SCHEMA','DEFAULT_SCHEMA'])for(const scalar of scalars)add(`${schema} ${scalar}`,()=>y.load(scalar,{schema:y[schema]}));
 const docs=[
 'a: 1\nb:\n  - true\n  - null\n', '{a: [1, 2], b: {c: value}}', 'base: &base {a: 1, b: 2}\nmerged: {<<: *base, b: 3}',
 'a: &x [1, 2]\nb: *x','&self [*self]', 'block: |\n  line one\n  line two\n', 'folded: >-\n  line one\n  line two\n',
 '!!omap [{a: 1}, {b: 2}]','!!pairs [{a: 1}, {a: 2}]','!!set {a: null, b: null}',
 '\uFEFFa: 1\r\nb: 2\r\n', '"\\x41\\u263a\\U0001F600"', 'a: [1,\n  2,\n  3]\n', '%YAML 1.2\n---\na: 1\n',
 '%TAG !e! tag:example.com,2026:\n---\n!e!thing hi','a: [','a:\n\tbad: true','a: 1\na: 2','a: *missing','!unknown text','!!binary %%%','"\\q"','---\n1\n---\n2',
 ];
 for(const doc of docs)add('load '+doc,()=>y.load(doc,{filename:'fixture.yaml'}));
 add('duplicate keys JSON option',()=>y.load('a: 1\na: 2',{json:true}));
 add('multidoc array',()=>y.loadAll('---\na: 1\n---\n[2, 3]\n---\nnull'));
 add('multidoc iterator',()=>{const values=[];const r=y.loadAll('---\n1\n---\n2',v=>values.push(v));return{values,result:r}});
 add('warning callback',()=>{const warnings=[];const value=y.load('%YAML 1.3\n---\n1',{onWarning:e=>warnings.push(error(e))});return{value,warnings}});
 add('listener callback',()=>{const events=[];const value=y.load('a: [1, 2]',{listener:(event,state)=>events.push([event,state.kind,state.result,state.position])});return{value,events}});
 const alias={a:1},cycle={};cycle.self=cycle;
 const dumpValues=[null,true,false,0,-0,NaN,Infinity,-Infinity,'yes','line\nbreak','unicode ☃',{a:1,b:[true,null],c:'001'},[alias,alias],cycle,new Date('2001-12-15T02:59:43.100Z'),new Uint8Array([0,1,255]),{nested:{array:[{x:'long text '.repeat(12)}]}}];
 const dumpOptions=[{}, {flowLevel:0},{indent:4,noArrayIndent:true},{sortKeys:true},{lineWidth:20},{noRefs:true},{quotingType:'"',forceQuotes:true},{styles:{'!!int':'hexadecimal','!!null':'canonical'}},{skipInvalid:true}];
 for(let i=0;i<dumpValues.length;i++)for(let j=0;j<dumpOptions.length;j++){
  if(dumpValues[i]===cycle&&dumpOptions[j].noRefs)continue;
  add(`dump ${i} ${j}`,()=>y.dump(dumpValues[i],dumpOptions[j]));
 }
 for(const name of ['safeLoad','safeLoadAll','safeDump'])add(name+' removed',()=>y[name]('a: 1'));
 add('custom scalar schema',()=>{const type=new y.Type('!upper',{kind:'scalar',resolve:x=>typeof x==='string',construct:x=>x.toUpperCase(),predicate:x=>x?.custom===true,represent:x=>x.text,defaultStyle:'plain'});const schema=y.DEFAULT_SCHEMA.extend([type]);return{load:y.load('!upper hello',{schema}),dump:y.dump({custom:true,text:'value'},{schema})}});
 add('custom multi tag',()=>{const type=new y.Type('!prefix:',{kind:'scalar',multi:true,resolve:()=>true,construct:(x,tag)=>({value:x,tag})});return y.load('!prefix:thing hello',{schema:y.DEFAULT_SCHEMA.extend([type])})});
 for(const invalid of [null,[],{},42,{kind:'invalid'},{kind:'scalar',unknown:true}])add('Type constructor invalid '+JSON.stringify(invalid),()=>new y.Type('!bad',invalid));
 for(const invalid of [null,42,{},'bad',{implicit:[{}]},{explicit:[{}]}])add('Schema extend invalid '+JSON.stringify(invalid),()=>y.DEFAULT_SCHEMA.extend(invalid));
 add('Schema alias compiled arguments',()=>{const type=new y.Type('!custom',{kind:'scalar',styleAliases:{canonical:['first','second']}});const schema=new y.Schema({explicit:[type]});return{aliases:type.styleAliases,implicit:schema.compiledImplicit.length,explicit:schema.compiledExplicit.length,scalar:schema.compiledTypeMap.scalar['!custom']===type,fallback:schema.compiledTypeMap.fallback['!custom']===type}});
 add('YAMLException mark',()=>new y.YAMLException('bad',{name:'fixture.yaml',line:2,column:3,snippet:'  abc\n     ^'}).toString());
 return groups;}
const baseline=observe(original);const candidate=await import(pathToFileURL(resolve(process.argv[2],'index.mjs')));const actual=observe(candidate);
assert.equal(baseline.length,304,'Finite full-source YAML runtime coverage');
for(let i=0;i<baseline.length;i++)try{assert.deepEqual(actual[i],baseline[i]);}catch(e){console.error('YAML source mismatch',baseline[i].name);throw e;}
console.log('YAML source runtime: 304 original-paired groups; own checked Mithril source, pinned original oracle, Node execution only; public YAML declaration closure remains pending.');
}finally{fs.rmSync(dir,{recursive:true,force:true})}
