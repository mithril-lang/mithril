import assert from 'node:assert/strict';import {join,resolve} from 'node:path';import{createRequire}from'node:module';import{writeFileSync}from'node:fs';
const [compiler,directory]=process.argv.slice(2),ts=createRequire(import.meta.url)(resolve(compiler));assert.equal(ts.version,'6.0.3');
const good=join(directory,'facade-positive.mts'),bad=join(directory,'facade-negative.mts');
writeFileSync(good,'import yaml,{load,loadAll,dump,Schema,Type} from "@mithril/native-yaml"; const s:Schema=yaml.DEFAULT_SCHEMA.extend(new Type("!x",{kind:"scalar"})); const parsed:unknown=load("a: 1",{schema:s}); const docs:unknown[]=loadAll("---\\n1"); loadAll("1",doc=>{const value:unknown=doc}); const output:string=dump(parsed);');
writeFileSync(bad,'import yaml,{load,Type} from "@mithril/native-yaml"; load(42); new Type("!x",{kind:"wrong"}); yaml.safeLoad("1");');
const options={target:ts.ScriptTarget.ES2024,module:ts.ModuleKind.NodeNext,moduleResolution:ts.ModuleResolutionKind.NodeNext,noEmit:true,strict:true,skipLibCheck:false,types:[]};
const program=ts.createProgram([good,bad],options);const codes=[[],[]];for(const d of ts.getPreEmitDiagnostics(program)){const index=[good,bad].indexOf(d.file?.fileName);assert(index>=0,ts.flattenDiagnosticMessageText(d.messageText,' '));codes[index].push(d.code)}
assert.deepEqual(codes[0],[]);assert.deepEqual(codes[1].sort(),[2322,2339,2345]);
console.log('YAML original type facade: actual NodeNext package exports, default namespace and classes resolve; strict positive and three exact-code rejection cases, no skipLibCheck; native YAML public declarations remain pending.');
