import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,symlinkSync,unlinkSync,existsSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {createRequire} from 'node:module';
const [compiler,typeRoots,include,yaml]=process.argv.slice(2),ts=createRequire(import.meta.url)(resolve(compiler));assert.equal(ts.version,'6.0.3');
const metadata=JSON.parse(readFileSync(include+'-types.log','utf8')),ownedModules=join(include,'node_modules'),yamlLink=join(ownedModules,'@mithril/native-yaml');
mkdirSync(join(ownedModules,'@mithril'),{recursive:true});assert(!existsSync(yamlLink));symlinkSync(resolve(yaml),yamlLink,'dir');
try{
 writeFileSync(join(include,'package.json'),JSON.stringify({name:'@qualification/include',exports:{'.':{types:'./index.d.mts',default:'./index.mjs'}}}));
 // These adapters only reexport the actual own canonical SDK modules. They do
 // not duplicate classes or author substitute dependency interfaces.
 for(const [name,id]of [['@deepseek-ai/cordis','cordis.index'],['@deepseek-ai/cordis-plugin-loader','loader.index']]){
  const dir=join(ownedModules,name);mkdirSync(dir,{recursive:true});const target=join(resolve(include),metadata['module-files'][id]).replace(/\.d\.mts$/,'.mjs');
  writeFileSync(join(dir,'package.json'),JSON.stringify({name,exports:{'.':{types:'./index.d.mts',default:'./index.mjs'}}}));
  const reexport=`export * from ${JSON.stringify(target)};\n`;writeFileSync(join(dir,'index.d.mts'),reexport);writeFileSync(join(dir,'index.mjs'),reexport);
 }
 const good=join(include,'package-positive.mts'),bad=join(include,'package-negative.mts');
 writeFileSync(good,'import Include,{entryListSchema} from "@qualification/include";import {Context} from "@deepseek-ai/cordis";import yaml from "@mithril/native-yaml";const s:yaml.Schema=entryListSchema;const i=new Include(new Context(),{path:"x.yaml"});const p:Promise<void>=i.stop();');
 writeFileSync(bad,'import Include,{entryListSchema} from "@qualification/include";import {Context} from "@deepseek-ai/cordis";new Include(new Context(),{});entryListSchema.extend(42);');
 const options={strict:true,skipLibCheck:false,noEmit:true,target:ts.ScriptTarget.ES2024,module:ts.ModuleKind.NodeNext,moduleResolution:ts.ModuleResolutionKind.NodeNext,typeRoots:[resolve(typeRoots)],types:['node']};
 const p=ts.createProgram([good,bad],options),groups=[[],[]];for(const d of ts.getPreEmitDiagnostics(p)){const i=[good,bad].indexOf(d.file?.fileName);assert(i>=0,JSON.stringify({code:d.code,file:d.file?.fileName,message:ts.flattenDiagnosticMessageText(d.messageText,' ')}));groups[i].push(d.code)}assert.deepEqual(groups[0],[]);assert.deepEqual(groups[1].sort(),[2345,2345]);
 console.log('Include native YAML package types: real NodeNext package resolution, canonical own Context/Loader owners, strict positive and two exact-code rejection cases; no virtual resolver or copied original YAML types.');
}finally{unlinkSync(yamlLink);}
