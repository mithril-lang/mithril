import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const [reference,candidate,compiler,typeRoots,generic]=process.argv.slice(2);if(!reference||!candidate||!compiler||!typeRoots)throw Error('usage: type-contract <original-index.d.ts> <candidate.d.mts> <typescript.js> <typeRoots>');
const ts=(await import(pathToFileURL(resolve(compiler)).href)).default;
assert.equal(ts.version,'6.0.3');
const options={noEmit:true,strict:true,target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,moduleResolution:ts.ModuleResolutionKind.Bundler,allowImportingTsExtensions:true,types:['node'],typeRoots:[resolve(typeRoots)]};
const dir=mkdtempSync(join(tmpdir(),'mithril-type-oracle-'));
const modulePath=p=>resolve(p).replace(/\.d\.mts$/,'.mjs').replace(/\.d\.ts$/,'.js');
const header=path=>`import * as api from ${JSON.stringify(modulePath(path))};\ntype Eq<A,B>=(<T>()=>T extends A?1:2) extends (<T>()=>T extends B?1:2)?true:false;type Yes<T extends true>=T;type IsAny<T>=0 extends (1&T)?true:false;\n`;
const positives=[
 ['generic utility types',`type T=[Yes<Eq<api.Dict<1,'a'|'b'>,{a:1,b:1}>>,Yes<Eq<api.Get<{a:1},'a'>,1>>,Yes<Eq<api.Get<{a:1},'z'>,never>>,Yes<Eq<api.Extract<1|2,1,boolean>,boolean>>,Yes<Eq<api.MaybeArray<number[]>,number[]>>,Yes<Eq<api.MaybeArray<1>,1|1[]>>,Yes<Eq<api.Promisify<Promise<1>>,Promise<1>>>,Yes<Eq<api.Awaitable<Promise<1>>,Promise<1>>>,Yes<Eq<api.Intersect<{a:1}|{b:2}>,{a:1}&{b:2}>>];`],
 ['readonly array inference',`const r=api.intersection([1,2] as const,[2] as const);type T=Yes<Eq<typeof r,(1|2)[]>>;const u=api.union(['a'] as const,['b'] as const);type U=Yes<Eq<typeof u,('a'|'b')[]>>;const a=api.makeArray(1);type A=Yes<Eq<typeof a,number[]>>;const d=api.deduplicate([1] as const);type D=Yes<Eq<typeof d,1[]>>;const list=[1];api.remove(list,1);api.contain(list,[1]);api.difference(list,['x']);`],
 ['object transform and overload guard inference',`const x={a:1,b:2};const mapped=api.mapValues(x,(v,k)=>String(v)+k);type T=Yes<Eq<typeof mapped,{a:string,b:string}>>;const alias=api.valueMap(x,v=>String(v));type A=Yes<Eq<typeof alias,{a:string,b:string}>>;const selected=api.filterKeys(x,(k):k is 'a'=>k==='a');type P=Yes<Eq<typeof selected,{a:number}>>;const retained=api.filterKeys(x,()=>true);type R=Yes<Eq<typeof retained,{a:number,b:number}>>;const picked=api.pick(x,['a']);type K=Yes<Eq<typeof picked,{a:number}>>;const omitted=api.omit(x,['a']);type O=Yes<Eq<typeof omitted,{b:number}>>;const defined=api.defineProperty(x,'a',3);type D=Yes<Eq<typeof defined,typeof x>>;api.defineProperty(x,'new-key',{});`],
 ['nullability and declared any',`declare let x:string|null; if(api.isNonNullable(x)){const s:string=x;} if(api.isNullable(x)){const n:null|undefined|void=x;}type T=Yes<IsAny<ReturnType<typeof api.noop>>>;type P=Yes<IsAny<ReturnType<typeof api.isPlainObject>>>;`],
 ['constructor predicates and overloads',`declare let x:unknown;const date=api.is('Date');if(date(x)){const d:Date=x;}if(api.is('Map',x)){const m:Map<any,any>=x;}type R=Yes<Eq<ReturnType<typeof api.is<'Date'>>,boolean>>;`],
 ['Binary namespace and alias types',`type S=Yes<Eq<api.Binary.Source<ArrayBuffer>,ArrayBuffer|ArrayBufferView<ArrayBuffer>>>;const b=api.Binary.fromSource(new Uint8Array(2));type B=Yes<Eq<typeof b,ArrayBuffer>>;const decoded=api.Binary.fromBase64('');type D=Yes<Eq<typeof decoded,ArrayBuffer|Uint8Array<ArrayBuffer>>>;type A=Yes<Eq<typeof api.base64ToArrayBuffer,typeof api.Binary.fromBase64>>;type H=Yes<Eq<typeof api.hexToArrayBuffer,typeof api.Binary.fromHex>>;api.Binary.toHex(b);api.Binary.toBase64(b);api.arrayBufferToBase64(b);api.arrayBufferToHex(b);if(api.Binary.isSource(b)){const s:api.Binary.Source=b;}if(api.Binary.is(b)){const s:ArrayBufferLike=b;}`],
 ['recursive volatile snapshots',`type S=Yes<Eq<api.VolatileSnapshot<{a:{b:1}}>,{readonly a:{readonly b:1}}>>;const ref=api.createVolatile({a:{b:1}});const snapshot=ref.get();type T=Yes<Eq<typeof snapshot,{readonly a:{readonly b:number}}>>;declare let x:unknown;if(api.isVolatile(x)){const r:api.Volatile<unknown>=x;}const entries=api.volatileEntries(ref);type E=Yes<Eq<typeof entries,{path:string[],ref:api.Volatile<unknown>}[]>>;api.updateVolatile(ref,api.createVolatile({a:{b:2}}));`],
 ['template literal recursion and dual type/value names',`type C=Yes<Eq<api.camelize<'foo-bar-baz'>,'fooBarBaz'>>;type H=Yes<Eq<api.hyphenate<'fooBarBaz'>,'foo-bar-baz'>>;const c=api.camelize('foo-bar');const h=api.hyphenate('fooBar');type V=Yes<Eq<typeof c,string>>;type W=Yes<Eq<typeof h,string>>;api.capitalize('a');api.uncapitalize('A');api.camelCase('x');api.paramCase('x');api.snakeCase('x');api.formatProperty(Symbol());api.trimSlash('/');api.sanitize('/');`],
 ['Time constants and optional signatures',`type M=Yes<Eq<typeof api.Time.millisecond,1>>;type S=Yes<Eq<typeof api.Time.second,1000>>;const date=api.Time.fromDateNumber(1);type D=Yes<Eq<typeof date,Date>>;api.Time.setTimezoneOffset(0);api.Time.getTimezoneOffset();api.Time.getDateNumber();api.Time.getDateNumber(new Date(),0);api.Time.parseTime('1s');api.Time.parseDate('x');api.Time.format(1);api.Time.toDigits(1);api.Time.template('yyyy');`],
 ['clone identity and equality API',`const value={a:1};const cloned=api.clone(value);type T=Yes<Eq<typeof cloned,typeof value>>;const e=api.deepEqual(value,cloned,true);type E=Yes<Eq<typeof e,boolean>>;`],
];
const negatives=[
 ['unknown constructor',`api.is('NotAConstructor');`],
 ['readonly removal',`declare const xs:readonly number[];api.remove(xs,1);`],
 ['mutable snapshot',`api.createVolatile({a:{b:1}}).get().a.b=2;`],
 ['Time literal constant',`api.Time.second=2;`],
 ['Time argument',`api.Time.setTimezoneOffset('wrong');`],
 ['Binary generic constraint',`type Bad=api.Binary.Source<string>;`],
 ['helper generic arity',`type Bad=api.Get<{a:1}>;`],
 ['template generic constraint',`type Bad=api.camelize<1>;`],
 ['missing picked key',`api.pick({a:1},['z']);`],
 ['private namespace',`type Bad=api.Letter.Upper;`],
 ['private constructor helper',`api.isArrayBufferLike(new ArrayBuffer(2));`],
 ['volatile update source',`api.updateVolatile(api.createVolatile({}),{});`],
];
function errors(d){return d.map(x=>x.code).sort((a,b)=>a-b);}
function description(d){return ts.formatDiagnosticsWithColorAndContext(d,{getCanonicalFileName:x=>x,getCurrentDirectory:()=>dir,getNewLine:()=> '\n'});}
try{
 const files=[],groups=[];
 for(const [category,cases] of [['positive',positives],['negative',negatives]]){
  for(const [index,[name,body]] of cases.entries()){
   const paths={};for(const [variant,file] of [['original',reference],['candidate',candidate]]){
    const path=join(dir,category+'-'+index+'-'+variant+'.ts');writeFileSync(path,header(file)+body);files.push(path);paths[variant]=path;
   }groups.push({category,name,paths});
  }
 }
 if(generic){const file=join(dir,'generic.ts');writeFileSync(file,header(generic)+`const x=api.echo('literal');type R=Yes<Eq<typeof x,'literal'>>;type I=Yes<Eq<api.Item<number[]>,number>>;type N=Yes<Eq<api.Visible,'private'>>;`);files.push(file);}
 const mutual=join(dir,'mutual.ts');writeFileSync(mutual,`import * as B from ${JSON.stringify(modulePath(reference))};import * as C from ${JSON.stringify(modulePath(candidate))};declare const b:typeof B;declare const c:typeof C;const asC:typeof C=b;const asB:typeof B=c;`);files.push(mutual);
 // Each consumer remains a distinct module. Check all original and candidate
 // consumers in one program, retaining full strict library/definition checking.
 // This shares immutable library parsing without hiding any diagnostic.
 const p=ts.createProgram(files,options),diagnostics=ts.getPreEmitDiagnostics(p);
 const at=path=>diagnostics.filter(d=>d.file?.fileName===path);
 const known=new Set(groups.filter(g=>g.category==='negative').flatMap(g=>Object.values(g.paths)));
 const unexpected=diagnostics.filter(d=>!d.file||!known.has(d.file.fileName));
 assert.equal(unexpected.length,0,'Positive consumers, declarations, libraries or mutual namespace failed\n'+description(unexpected));
 for(const g of groups){if(g.category==='negative'){const b=at(g.paths.original),a=at(g.paths.candidate);assert(b.length>0,'Original negative must reject: '+g.name);assert.deepEqual(errors(a),errors(b),'Negative diagnostic codes: '+g.name);}}
 const checker=p.getTypeChecker(),surface=file=>{const sf=p.getSourceFile(resolve(file));assert(sf,'Source module loaded');const symbol=checker.getSymbolAtLocation(sf);return checker.getExportsOfModule(symbol).map(s=>{const x=s.flags&ts.SymbolFlags.Alias?checker.getAliasedSymbol(s):s;return {name:s.name,value:!!(x.flags&ts.SymbolFlags.Value),type:!!(x.flags&ts.SymbolFlags.Type)};}).sort((a,b)=>a.name.localeCompare(b.name));};
 const b=surface(reference),a=surface(candidate);assert.deepEqual(a,b,'Exact public names and type/value spaces');assert.equal(a.filter(x=>x.value).length,40);assert.equal(a.filter(x=>x.type).length,11);assert.equal(a.length,49);
 console.log(`Declaration oracle: ${positives.length} positive consumer groups, ${negatives.length} source-derived negative groups, full bidirectional value namespace, exact49public names/40values/11type bindings (2dual), pinned TSC6.0.3 strict noEmit. No skipLibCheck; generic=${!!generic}.`);
}finally{rmSync(dir,{recursive:true,force:true});}
