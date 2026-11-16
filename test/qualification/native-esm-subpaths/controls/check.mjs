import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,symlinkSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
const output=resolve(process.argv[2]),meta=JSON.parse(readFileSync(join(output,'metadata.json'),'utf8'));
const original=join(output,'original');mkdirSync(original);
for(const [file,text] of Object.entries({'shared.mjs':'export function inc(n){return n+1}', 'root.mjs':'export {inc} from "./shared.mjs";', 'sub.mjs':'export {inc} from "./shared.mjs";', 'failure.mjs':'throw "subpath evaluated";'}))writeFileSync(join(original,file),text);
const load=path=>import(pathToFileURL(path));
// Root resolution must succeed before either private entry is requested.
const source=await load(join(original,'root.mjs')),native=await load(join(output,'index.mjs'));
assert.deepEqual(Object.keys(native),Object.keys(source));for(const n of [-1,0,5])assert.equal(native.inc(n),source.inc(n));
const subSource=await load(join(original,'sub.mjs')),subNative=await load(join(output,meta['subpath-files']['entry.sub']));assert.equal(subSource.inc,source.inc);assert.equal(subNative.inc,native.inc);
async function failure(path){try{await load(path);return {resolved:true};}catch(error){return {resolved:false,error};}}
assert.deepEqual(await failure(join(output,meta['subpath-files']['entry.failure'])),await failure(join(original,'failure.mjs')));
assert.equal(native.inc(10),source.inc(10));assert.equal((await load(join(output,'index.mjs'))).inc,native.inc);
console.log('Independent subpaths: original root loads without throwing private entry; exact root exports, canonical shared function/cache identity, behavior and requested-entry failure match original ECMAScript.');

const types=resolve(process.argv[3]),typed=JSON.parse(readFileSync(join(types,'metadata.json'),'utf8'));
const ts=createRequire(import.meta.url)(resolve(process.argv[4]));assert.equal(ts.version,'6.0.3');
for(const [file,text] of Object.entries({'shared.d.mts':'export declare function inc(n:number):number;', 'root.d.mts':'export {inc} from "./shared.mjs";', 'sub.d.mts':'export {inc} from "./shared.mjs";', 'failure.d.mts':'export {};'}))writeFileSync(join(original,file),text);
const nativePackage=join(output,'published');mkdirSync(nativePackage);
// Install the actual adjacent runtime/declaration artifacts and emitted routes.
for(const file of ['index.mjs',...Object.values(meta['module-files'])])writeFileSync(join(nativePackage,file),readFileSync(join(output,file)));
for(const file of ['index.d.mts',...Object.values(typed['module-files'])])writeFileSync(join(nativePackage,file),readFileSync(join(types,file)));
writeFileSync(join(nativePackage,'host-globals.mjs'),readFileSync(join(output,'host-globals.mjs')));
const entries={'.':'entry.root','./sub':'entry.sub','./failure':'entry.failure'};
writeFileSync(join(nativePackage,'package.json'),JSON.stringify({name:'@probe/native',version:'1.0.0',type:'module',exports:Object.fromEntries(Object.entries(entries).map(([key,module])=>[key,{types:key==='.'?'./index.d.mts':'./'+typed['module-files'][module],default:key==='.'?'./index.mjs':'./'+meta['subpath-files'][module]}]))}));
writeFileSync(join(original,'package.json'),JSON.stringify({name:'@probe/source',version:'1.0.0',type:'module',exports:{'.':{types:'./root.d.mts',default:'./root.mjs'},'./sub':{types:'./sub.d.mts',default:'./sub.mjs'},'./failure':{types:'./failure.d.mts',default:'./failure.mjs'}}}));
const consumers=join(output,'consumers');mkdirSync(join(consumers,'node_modules/@probe'),{recursive:true});symlinkSync(nativePackage,join(consumers,'node_modules/@probe/native'),'dir');symlinkSync(original,join(consumers,'node_modules/@probe/source'),'dir');
const cases=[[true,'','const value:number=P.inc(1);'],[true,'/sub','const value:number=P.inc(2);'],[true,'/failure','type Empty=typeof P;'],[false,'','P.inc("wrong");'],[false,'/sub','P.inc("wrong");']];
const options={strict:true,noEmit:true,skipLibCheck:false,types:[],target:ts.ScriptTarget.ES2024,module:ts.ModuleKind.NodeNext,moduleResolution:ts.ModuleResolutionKind.NodeNext};
function check(pkg){const files=cases.map((_,i)=>join(consumers,`case-${i}.mts`));for(let i=0;i<files.length;i++)writeFileSync(files[i],`import * as P from "${pkg+cases[i][1]}";`+cases[i][2]);const p=ts.createProgram(files,options),groups=files.map(()=>[]),outside=[];for(const d of ts.getPreEmitDiagnostics(p)){const i=files.indexOf(d.file?.fileName);if(i<0)outside.push([d.code,ts.flattenDiagnosticMessageText(d.messageText,' ')]);else groups[i].push(d.code);}return{groups,outside};}
const a=check('@probe/source'),b=check('@probe/native');assert.deepEqual(a.outside,[]);for(let i=0;i<cases.length;i++)assert.equal(a.groups[i].length===0,cases[i][0]);assert.deepEqual(b,a);
// Actual bare package imports exercise exports, not a TypeScript resolver hook.
writeFileSync(join(consumers,'observe.mjs'),'import {inc} from "@probe/native";import {inc as sub} from "@probe/native/sub";if(inc!==sub||inc(3)!==4)throw Error("Published origin mismatch");');await import(pathToFileURL(join(consumers,'observe.mjs')));
const singleCase=join(consumers,'single.mts');writeFileSync(singleCase,'import {inc} from '+JSON.stringify(join(types,'single.mjs'))+';const n:number=inc(1);');
const singleProgram=ts.createProgram([singleCase],options);assert.deepEqual(ts.getPreEmitDiagnostics(singleProgram).map(d=>d.code),[]);
console.log('Subpath types: actual emitted routes and ordinary NodeNext package exports, three positive/two negative strict original-paired consumers, exact diagnostic codes and published canonical runtime identity.');
