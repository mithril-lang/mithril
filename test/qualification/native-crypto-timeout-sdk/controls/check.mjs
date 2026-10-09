import assert from 'node:assert/strict';
import{readFileSync,writeFileSync,mkdirSync,mkdtempSync,rmSync,realpathSync,copyFileSync}from'node:fs';
import{join,resolve}from'node:path';import{tmpdir}from'node:os';import{pathToFileURL,fileURLToPath}from'node:url';
import{spawnSync}from'node:child_process';
import{toolchain,fixture}from'./support.mjs';
const [compiler,typeRoots,cryptoSdk,cryptoTypes,timeoutSdk,timeoutTypes]=process.argv.slice(2),ts=await toolchain(resolve(compiler));
const sdk={crypto:resolve(cryptoSdk),timeout:resolve(timeoutSdk)},typed={crypto:resolve(cryptoTypes),timeout:resolve(timeoutTypes)};
import {cases} from './cases.mjs';
const dir=realpathSync(mkdtempSync(join(tmpdir(),'crypto-timeout-types-'))),options={strict:true,noEmit:true,skipLibCheck:false,types:[],lib:['lib.es2024.d.ts','lib.dom.d.ts','lib.esnext.disposable.d.ts'],target:ts.ScriptTarget.ES2024,module:ts.ModuleKind.NodeNext,moduleResolution:ts.ModuleResolutionKind.NodeNext};
try{const records={};for(const pkg of ['crypto','timeout']){const files=cases[pkg].map((_,i)=>join(dir,pkg+i+'.mts'));
 function check(root){const host=ts.createCompilerHost(options),read=host.readFile,exists=host.fileExists;host.readFile=file=>files.includes(file)?'import * as A from "@qualification/'+pkg+'";'+cases[pkg][files.indexOf(file)][1]:read(file);host.fileExists=file=>files.includes(file)||exists(file);host.resolveModuleNames=(names,file)=>names.map(n=>n==='@qualification/'+pkg?{resolvedFileName:root,extension:root.endsWith('.mts')?ts.Extension.Dmts:ts.Extension.Dts,isExternalLibraryImport:true}:ts.resolveModuleName(n,file,options,host).resolvedModule);const p=ts.createProgram(files,options,host),groups=files.map(()=>[]);for(const d of ts.getPreEmitDiagnostics(p)){const i=files.indexOf(d.file?.fileName);assert(i>=0,ts.flattenDiagnosticMessageText(d.messageText,' '));groups[i].push(d.code)}const checker=p.getTypeChecker(),sf=p.getSourceFile(root),surface=checker.getExportsOfModule(checker.getSymbolAtLocation(sf)).map(s=>({name:s.name,type:!!(s.flags&ts.SymbolFlags.Type),value:!!(s.flags&ts.SymbolFlags.Value)})).sort((a,b)=>a.name.localeCompare(b.name));return{groups,surface};}
 const original=check(join(fixture,pkg+'.d.ts')),candidate=check(join(typed[pkg],'module-0.d.mts'));for(let i=0;i<original.groups.length;i++)assert.equal(original.groups[i].length===0,cases[pkg][i][2],cases[pkg][i][0]);assert.deepEqual(candidate,original);records[pkg]={positive:cases[pkg].filter(c=>c[2]).length,negative:cases[pkg].filter(c=>!c[2]).length,diagnostics:original.groups.map((codes,i)=>({case:cases[pkg][i][0],codes}))};}

 const emissionOptions={strict:true,noImplicitAny:true,skipLibCheck:false,declaration:true,emitDeclarationOnly:true,typeRoots:[resolve(typeRoots)],types:['node'],target:ts.ScriptTarget.ES2024,module:ts.ModuleKind.ESNext,moduleResolution:ts.ModuleResolutionKind.Bundler};
 for(const pkg of ['crypto','timeout'])copyFileSync(join(fixture,'original-'+pkg+'.ts'),join(dir,pkg+'.ts'));
 const emission=ts.createProgram(['crypto','timeout'].map(n=>join(dir,n+'.ts')),emissionOptions);assert.deepEqual(ts.getPreEmitDiagnostics(emission),[],'Complete original strict emission');const emitted=[];const result=emission.emit(undefined,(file,text)=>emitted.push([file,text]));assert.equal(result.emitSkipped,false);assert.deepEqual(result.diagnostics,[]);assert.equal(emitted.length,2);for(const[file,text]of emitted)assert.equal(text,readFileSync(join(fixture,file.split('/').at(-1)),'utf8'));
 const source=file=>ts.createSourceFile(file,readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
 function shape(n){if(ts.isParenthesizedTypeNode(n))return shape(n.type);if(ts.isVariableDeclaration(n))return{variable:n.name.text,datatype:shape(n.type||ts.factory.createLiteralTypeNode(n.initializer))};if(ts.isIdentifier(n)||ts.isStringLiteral(n)||ts.isNumericLiteral(n))return{text:n.text};const children=[];ts.forEachChild(n,c=>{if(![ts.SyntaxKind.ExportKeyword,ts.SyntaxKind.DeclareKeyword].includes(c.kind))children.push(shape(c))});return{kind:n.kind,children}}
 // The emitter's empty export is a module boundary, not a public declaration.
 const decls=sf=>sf.statements.filter(n=>{if(!ts.isExportDeclaration(n))return true;assert(!n.moduleSpecifier&&!n.isTypeOnly&&ts.isNamedExports(n.exportClause)&&n.exportClause.elements.length===0);return false;});
 let declarations=0;
 for(const pkg of ['crypto','timeout']){const a=source(join(fixture,pkg+'.d.ts')),b=source(join(typed[pkg],'module-0.d.mts'));assert.deepEqual(decls(b).map(shape),decls(a).map(shape),'Complete original '+pkg+' declaration structure');declarations+=decls(a).length;const metadata=JSON.parse(readFileSync(typed[pkg]+'.log','utf8'));assert.deepEqual(Object.keys(metadata['module-files']),[pkg+'.index']);assert.equal(metadata['exports'].length,pkg==='crypto'?2:6);assert.equal(metadata['type-exports'].length,pkg==='crypto'?1:3);}
 assert.equal(declarations,11);
 // Each real-package type program has its own bounded process. This preserves
 // the full original/candidate/version matrix without retaining library ASTs.
 for(const mode of ['original','candidate'])for(const pkg of ['crypto','timeout'])for(const differentVersion of [false,true]){
  const r=spawnSync(process.execPath,[fileURLToPath(new URL('package.mjs',import.meta.url)),compiler,pkg,mode,String(differentVersion),sdk[pkg],typed[pkg]],{encoding:'utf8',timeout:30000,maxBuffer:4194304});assert.equal(r.status,0,r.stdout+r.stderr);
 }
 console.log('Crypto/timeout SDK: all 11 original declarations, crypto 3 positive/3 negative and timeout 6 positive/8 negative strict paired consumers, complete strict original re-emission, real NodeNext bare imports/self-reference and duplicate-install structural types with runtime owner isolation; Node execution only.');
}finally{rmSync(dir,{recursive:true,force:true})}
