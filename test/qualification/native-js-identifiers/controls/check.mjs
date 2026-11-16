import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
const [runtime,types,compiler]=process.argv.slice(2),ts=createRequire(import.meta.url)(resolve(compiler));assert.equal(ts.version,'6.0.3');
const names=['$schema','Σ','𝒟','e\u0301','join\u200c','join\u200d','Å','A\u030a'];
const original=join(runtime,'original.mjs');writeFileSync(original,names.map((name,i)=>`export function ${name}($arg){return $arg+${i+1};}`).join('\n'));
const source=await import(pathToFileURL(original)),native=await import(pathToFileURL(join(runtime,'index.mjs')));
assert.deepEqual(Object.keys(native),Object.keys(source));
for(const name of names){const a=source[name],b=native[name];assert.equal(b.name,a.name);assert.equal(b.length,a.length);assert.deepEqual(Object.getOwnPropertyNames(b),Object.getOwnPropertyNames(a));for(const value of [-3,0,7])assert.equal(b(value),a(value));}
assert.notEqual(native['Å'],native['A\u030a']);
const originalTypes=join(types,'original.d.mts');writeFileSync(originalTypes,names.map(n=>`export declare function ${n}($arg:number):number;`).join('\n')+'\nexport declare namespace $global {type Shared=string;}\ndeclare global {type Shared=number;}\nexport type UsesGlobal=Shared;\nexport type UsesLocal=$global.Shared;\nexport type $Type<$Value>=$Value;\n');
const cases=[
 [true,'const n:number=P.$schema(P.Σ(P.𝒟(1)));'],
 [true,'const n:P.UsesGlobal=1;'],
 [true,'const s:P.UsesLocal="fixture";'],
 [true,'const generic:P.$Type<string>="fixture";'],
 [false,'P.$schema("wrong");'],
 [false,'const wrong:P.UsesGlobal="wrong";'],
 [false,'const wrong:P.UsesLocal=1;'],
 [false,'const wrong:P.$Type<string>=1;'],
];
const options={strict:true,noEmit:true,skipLibCheck:false,types:[],target:ts.ScriptTarget.ES2024,module:ts.ModuleKind.NodeNext,moduleResolution:ts.ModuleResolutionKind.NodeNext};
function check(entry){const files=cases.map((_,i)=>join(types,'consumer-'+i+'.mts'));for(let i=0;i<files.length;i++)writeFileSync(files[i],`import * as P from "${entry}";`+cases[i][1]);const p=ts.createProgram(files,options),groups=files.map(()=>[]),outside=[];for(const d of ts.getPreEmitDiagnostics(p)){const i=files.indexOf(d.file?.fileName);if(i<0)outside.push([d.code,ts.flattenDiagnosticMessageText(d.messageText,' ')]);else groups[i].push(d.code);}return{groups,outside};}
const a=check('./original.mjs'),b=check('./index.mjs');assert.deepEqual(a.outside,[]);for(let i=0;i<cases.length;i++)assert.equal(a.groups[i].length===0,cases[i][0],String(i)+': '+a.groups[i]);assert.deepEqual(b,a);
console.log('Identifiers: eight independent JavaScript export/name/parameter spellings, 24 runtime pairs and four positive/four negative strict original-paired consumers; dollar namespace/global isolation, generic names and normalization distinctions retained.');
