import assert from 'node:assert/strict';
import {readFileSync, writeFileSync} from 'node:fs';
import {join, resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
const [compiler, runtimeDir, typesDir] = process.argv.slice(2), dir = resolve(typesDir);
const ts = createRequire(import.meta.url)(resolve(compiler));
assert.equal(ts.version, '6.0.3');
// This oracle is authored directly as TypeScript, independently of Mithril AST.
writeFileSync(join(dir, 'original-values.d.mts'), Array.from({length:64}, (_,i)=>`export declare function V${i}():number;`).join('\n'));
writeFileSync(join(dir, 'original.d.mts'), Array.from({length:64}, (_,i)=>`export type T${i}=number;export declare namespace N${i}{export type Member=number;}`).join('\n')+'\nexport type * from "./original-values.mjs";');
const cases = [
 ['first and last aliases', 'const first:A.T0=1;const last:A.T63=2;', []],
 ['first and last namespace members', 'const first:A.N0.Member=1;const last:A.N63.Member=2;', []],
 ['type-only functions remain queryable', 'const first:typeof A.V0=()=>1;const last:typeof A.V63=()=>2;', []],
 ['namespace and function relation', 'const call:typeof A.V32=()=>1;const value:A.N32.Member=call();', []],
 ['alias rejects string', 'const bad:A.T63="bad";', [2322]],
 ['namespace rejects string', 'const bad:A.N63.Member="bad";', [2322]],
 ['function return rejects string', 'const bad:typeof A.V63=()=>"bad";', [2322]],
 ['type-only namespace cannot run function', 'A.V63();', [1361,2339]],
];
const files=cases.map((_,i)=>join(dir,`consumer-${i}.mts`));
const options={strict:true,noEmit:true,skipLibCheck:false,types:[],target:ts.ScriptTarget.ES2024,module:ts.ModuleKind.NodeNext,moduleResolution:ts.ModuleResolutionKind.NodeNext};
function check(entry){
 const host=ts.createCompilerHost(options),read=host.readFile,exists=host.fileExists;
 host.readFile=f=>files.includes(f)?'import type * as A from "@qualification/spaces";'+cases[files.indexOf(f)][1]:read(f);
 host.fileExists=f=>files.includes(f)||exists(f);
 host.resolveModuleNames=(names,file)=>names.map(n=>n==='@qualification/spaces'?{resolvedFileName:entry,extension:ts.Extension.Dmts,isExternalLibraryImport:true}:ts.resolveModuleName(n,file,options,host).resolvedModule);
 const p=ts.createProgram(files,options,host),groups=files.map(()=>[]);
 for(const d of ts.getPreEmitDiagnostics(p)){const i=files.indexOf(d.file?.fileName);assert(i>=0,ts.flattenDiagnosticMessageText(d.messageText,' '));groups[i].push(d.code)}
 const source=p.getSourceFile(entry),symbols=p.getTypeChecker().getExportsOfModule(p.getTypeChecker().getSymbolAtLocation(source));
 return {groups,names:symbols.map(s=>s.name).sort()};
}
const original=check(join(dir,'original.d.mts'));
assert.deepEqual(original.groups,cases.map(c=>c[2]));
assert.equal(original.names.length,192);
assert.deepEqual(check(join(dir,'index.d.mts')),original);
const root=await import(pathToFileURL(join(resolve(runtimeDir),'index.mjs')));
assert.deepEqual(Object.keys(root),[]);
const runtime=await import(pathToFileURL(join(resolve(runtimeDir),'module-1.mjs')));
assert.deepEqual(Object.keys(runtime).sort(),Array.from({length:64},(_,i)=>`V${i}`).sort());
for(const fn of Object.values(runtime)){assert.equal(fn(),1);assert.equal(fn.length,0)}
console.log('Declaration symbol spaces: 4 positive/4 negative strict independent TypeScript-paired consumers, all 192 names and 64 private runtime functions preserved; empty public runtime surface.');
