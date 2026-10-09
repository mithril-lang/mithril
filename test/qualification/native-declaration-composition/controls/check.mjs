import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,readdirSync,mkdirSync,copyFileSync,symlinkSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
const [output,compiler]=process.argv.slice(2),ts=createRequire(import.meta.url)(resolve(compiler));
assert.equal(ts.version,'6.0.3');
const artifact=JSON.parse(readFileSync(join(output,'artifact.json')));
const runtimes=['consumer','base','bridge'];
for(const [i,p] of artifact.packages.entries()){
 const dir=join(output,p.directory);
 for(const file of readdirSync(join(output,'runtime-'+runtimes[i])))copyFileSync(join(output,'runtime-'+runtimes[i],file),join(dir,file));
 const exports={};for(const e of p.entries)exports[e.specifier===p.package?'.':'.'+e.specifier.slice(p.package.length)]={types:'./'+e.declarations,import:'./'+e.runtime};
 writeFileSync(join(dir,'package.json'),JSON.stringify({name:p.package,version:p.version,type:'module',exports}));
 mkdirSync(join(dir,'node_modules/@probe'),{recursive:true});
 for(const dependency of artifact.packages)if(dependency!==p)symlinkSync(join(output,dependency.directory),join(dir,'node_modules',dependency.package),'dir');
}
const dir=join(output,'consumer'),entry=join(dir,'positive.mts'),negative=join(dir,'negative.mts');
writeFileSync(entry,'import increment,{inc} from "@probe/consumer";import original from "@probe/base";const a:number=increment(3);const same:typeof original=inc;');
writeFileSync(negative,'import increment from "@probe/consumer";increment("wrong");');
const options={strict:true,noEmit:true,skipLibCheck:false,types:[],target:ts.ScriptTarget.ES2024,module:ts.ModuleKind.NodeNext,moduleResolution:ts.ModuleResolutionKind.NodeNext};
const program=ts.createProgram([entry,negative],options),diagnostics=ts.getPreEmitDiagnostics(program);
assert.deepEqual(diagnostics.map(d=>[d.file?.fileName,d.code]),[[negative,2345]]);
const a=await import(pathToFileURL(join(dir,'index.mjs'))),b=await import(pathToFileURL(join(output,'producer-0/index.mjs')));
assert.equal(a.default,b.default);assert.equal(a.inc,b.inc);assert.equal(a.default,a.inc);
// Independent source behavior, including coercion and non-finite results.
function original(n){return n+1;}
for(const value of [-4,0,3,Infinity,NaN,'3'])assert.deepEqual(a.inc(value),original(value));
console.log('Composition consumers: actual ordinary NodeNext, strict positive and exact 2345 negative, canonical named/default bindings across two producers, six independent runtime observations; no candidate resolution hooks.');
