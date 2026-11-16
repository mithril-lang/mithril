import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,copyFileSync,mkdirSync,unlinkSync,realpathSync} from 'node:fs';
import {join,resolve,relative,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
const [compiler,typeRoots,sdkInput,typedInput]=process.argv.slice(2);
const sdk=realpathSync(sdkInput),typed=realpathSync(typedInput);
const ts=(await import(pathToFileURL(resolve(compiler)))).default;assert.equal(ts.version,'6.0.3');
const types=JSON.parse(readFileSync(typed+'.log','utf8')),runtime=JSON.parse(readFileSync(sdk+'.log','utf8'));
const rootType=types['module-files']['scope.index'];
for(const file of Object.keys(types['module-files']).map(name=>types['module-files'][name]))copyFileSync(join(typed,file),join(sdk,file));
copyFileSync(join(typed,'index.d.mts'),join(sdk,'index.d.mts'));
// The original package exposes the actual index declaration module. Preserve
// that lexical root, including its private ScopedBrand; the generic compiler
// barrel is also checked separately and remains on disk.
writeFileSync(join(sdk,'package.json'),JSON.stringify({name:'@mithril/native-scope',type:'module',main:'./index.mjs',types:'./'+rootType,exports:{'.':{types:'./'+rootType,default:'./index.mjs'},'./package.json':'./package.json'}}));
const adapter=join(sdk,'node_modules/@deepseek-ai/cordis');mkdirSync(adapter,{recursive:true});
const local=file=>'./'+relative(adapter,join(sdk,file)).replaceAll('\\','/');
writeFileSync(join(adapter,'index.d.mts'),'export * from '+JSON.stringify(local(types['module-files']['cordis.index'].replace('.d.mts','.mjs')))+';');
writeFileSync(join(adapter,'index.mjs'),'export * from '+JSON.stringify(local(runtime['module-files'].cordis))+';');
writeFileSync(join(adapter,'package.json'),JSON.stringify({type:'module',exports:{'.':{types:'./index.d.mts',import:'./index.mjs'}}}));
const prefix='import * as A from "@mithril/native-scope";import {Context} from "@deepseek-ai/cordis";';
const cases=[
 ['positive','const context=new Context();const scope:A.Scope=A.createScope(context,{});const same:Context=scope.ctx;const carrier:A.Scoped<{value:number}>=A.scopeTarget({value:1},{});const entries=new A.NamedEntries<number>(n=>new Error(n));const undo:()=>void=entries.insert("x",1);const layers=new A.ScopedLayers(()=>({isEmpty:()=>true}),()=>{});const effect:()=>void=layers.effect(context,()=>()=>{},{label:"package"});',[]],
 ['private','new A.NamedEntries<number>(n=>new Error(n)).data;',[2341]],
 ['readonly','const s=new A.ScopedLayers(()=>({isEmpty:()=>true}),()=>{});s.global={isEmpty:()=>true};',[2540]],
 ['brand','const c:A.Scoped<object>={};',[2322]],
 ['private-brand','import {ScopedBrand} from "@mithril/native-scope";',[2459]],
];
const files=cases.map(([name,body])=>{const file=join(sdk,'package-'+name+'.mts');writeFileSync(file,prefix+body);return file});
try{
 const options={strict:true,noEmit:true,skipLibCheck:false,target:ts.ScriptTarget.ES2024,module:ts.ModuleKind.NodeNext,moduleResolution:ts.ModuleResolutionKind.NodeNext,typeRoots:[resolve(typeRoots)],types:['node']};
 const program=ts.createProgram(files,options),groups=files.map(()=>[]);
 for(const d of ts.getPreEmitDiagnostics(program)){const index=files.indexOf(d.file?.fileName);assert(index>=0,ts.flattenDiagnosticMessageText(d.messageText,' '));groups[index].push(d.code)}
 assert.deepEqual(groups,cases.map(c=>c[2]),'real NodeNext package self-reference and canonical Cordis class owners');
 const executable=join(sdk,'package-execute.mjs');
 writeFileSync(executable,'import assert from "node:assert/strict";'+prefix+'const ctx=new Context(),key={};let scope;await ctx.plugin(inner=>{scope=A.createScope(inner,key)});assert.equal(A.scopeOf(scope.ctx),key);assert.equal(scope.ctx instanceof Context,true);const carrier=A.scopeTarget({},key);assert.equal(A.carrierKeyOf(carrier),key);await scope.dispose();console.log("Scope package execution passed");');
 const result=spawnSync(process.execPath,[executable],{encoding:'utf8',timeout:30000,env:{...process.env,CORDIS_SHARED:'{"startTime":0}'}});assert.equal(result.status,0,result.stdout+result.stderr);assert.match(result.stdout,/Scope package execution passed/);unlinkSync(executable);
 console.log('Scope SDK package: real NodeNext self-reference, 1 positive/4 exact-code negative consumers and actual bare-package runtime execution; actual source declaration entry preserves private-brand diagnostic 2459, no virtual resolution.');
}finally{for(const file of files)unlinkSync(file)}
