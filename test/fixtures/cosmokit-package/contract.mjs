import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {resolve,dirname,basename} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
const [oracle,candidate]=process.argv.slice(2);if(!oracle||!candidate)throw Error('usage: contract <original-index.js> <compiled-library.mjs>');
async function load(file,buffer=false){
 const c=vm.createContext({btoa,atob,...(buffer?{Buffer}:{} )});
 vm.runInContext(`globalThis.initTrace=[];
 const SavedDate=Date,SavedSymbol=Symbol,SavedRegExp=RegExp;
 function ClockDate(...args){if(!new.target)return new SavedDate('2026-01-02T03:04:05Z').toString();return Reflect.construct(SavedDate,args.length?args:['2026-01-02T03:04:05Z'],new.target===ClockDate?SavedDate:new.target)}
 Object.setPrototypeOf(ClockDate,SavedDate);ClockDate.prototype=SavedDate.prototype;ClockDate.now=()=>SavedDate.parse('2026-01-02T03:04:05Z');
 Object.defineProperty(globalThis,'Date',{configurable:true,get(){initTrace.push('Date');return ClockDate}});
 Object.defineProperty(globalThis,'Symbol',{configurable:true,get(){initTrace.push('Symbol');return SavedSymbol}});
 Object.defineProperty(globalThis,'RegExp',{configurable:true,get(){initTrace.push('RegExp');return SavedRegExp}});
 `,c);
 const cache=new Map();
 const module=file=>{
  file=resolve(file);if(cache.has(file))return cache.get(file);
  const m=new vm.SourceTextModule(readFileSync(file,'utf8'),{context:c,identifier:pathToFileURL(file).href});cache.set(file,m);return m;
 };
 const entry=module(file),base=resolve(dirname(file));
 await entry.link((specifier,ref)=>{assert.match(specifier,/^\.\/[a-z]+\.js$/);const resolved=resolve(dirname(fileURLToPath(ref.identifier)),specifier);assert.equal(dirname(resolved),base);return module(resolved);});await entry.evaluate({timeout:2000});
 return {c,api:entry.namespace,trace:vm.runInContext('initTrace.slice()',c)};
}
function normalize(value,seen=new Map()){
 if(value===undefined)return {$:'undefined'};
 if(typeof value==='number'&&(!Number.isFinite(value)||Object.is(value,-0)))return {$:'number',value:Object.is(value,-0)?'-0':String(value)};
 if(typeof value==='function')return {$:'function',name:value.name,length:value.length,prototype:Object.hasOwn(value,'prototype')};
 if(typeof value==='symbol')return {$:'symbol',description:value.description};
 if(value===null||typeof value!=='object')return value;
 if(seen.has(value))return {$:'reference',id:seen.get(value)};seen.set(value,seen.size);
 const tag=Object.prototype.toString.call(value);
 if(tag==='[object ArrayBuffer]')return {$:'buffer',bytes:[...new Uint8Array(value)]};
 if(ArrayBuffer.isView(value))return {$:'view',tag,bytes:[...new Uint8Array(value.buffer,value.byteOffset,value.byteLength)]};
 if(tag==='[object Date]')return {$:'date',value:value.toISOString()};
 if(tag==='[object RegExp]')return {$:'regexp',source:value.source,flags:value.flags};
 if(Array.isArray(value))return Array.from(value,v=>normalize(v,seen));
 const entries=Reflect.ownKeys(value).map(k=>[typeof k==='symbol'?{$:'symbol',description:k.description}:k,normalize(value[k],seen)]);
 return {$:'object',tag,entries};
}
const cases=[
 ['public namespace and normal function metadata',(m)=>{
  const api=m.api;return {tag:Object.prototype.toString.call(api),prototype:Object.getPrototypeOf(api),extensible:Object.isExtensible(api),names:Object.keys(api),values:Object.keys(api).map(name=>[name,normalize(api[name])]),descriptors:Object.keys(api).map(name=>{const d=Object.getOwnPropertyDescriptor(api,name);return [name,d.enumerable,d.configurable,d.writable]})};
 }],
 ['evaluation order and no added observable initialization',(m)=>m.trace],
 ['array set operations',(m)=>{const a=m.api;return [a.contain([1,2],[2]),a.intersection([1,NaN,2],[NaN,2,3]),a.difference([1,2],[2]),a.union([1,2],[2,3]),a.deduplicate([1,NaN,NaN,-0,0]),a.makeArray(null),a.makeArray(2),a.makeArray([2])];}],
 ['remove mutates original array',(m)=>{const x=[1,2,2];return [m.api.remove(x,2),x,m.api.remove(x,9)];}],
 ['misc mapping and selection',(m)=>{const a=m.api,x={a:1,b:2};return [a.isNullable(null),a.isNonNullable(0),a.isPlainObject(x),a.mapValues(x,v=>v+1),a.filterKeys(x,k=>k==='b'),a.pick(x,['a']),a.omit(x,['b']),a.valueMap({a:'abc'},v=>v.length),a.noop()];}],
 ['property descriptors and ordered getter effects',(m)=>{const a=m.api,events=[],x={get a(){events.push('a');return 1},get b(){events.push('b');return 2}};const out=a.mapValues(x,(v,k)=>{events.push(k);return v*2});const y={};a.defineProperty(y,'hidden',3);return [out,events,Object.getOwnPropertyDescriptor(y,'hidden')];}],
 ['global predicates and alias identity',(m)=>{const a=m.api;return [a.is('String','x'),a.is('Array')([1]),a.is('Unknown',{}),a.Binary.is===a.Binary.isSource,a.mapValues===a.valueMap,a.base64ToArrayBuffer===a.Binary.fromBase64,a.arrayBufferToBase64===a.Binary.toBase64,a.hexToArrayBuffer===a.Binary.fromHex,a.arrayBufferToHex===a.Binary.toHex];}],
 ['binary browser codecs',(m)=>{const a=m.api;return [a.arrayBufferToBase64(new Uint8Array([0,255,42]).buffer),a.arrayBufferToHex(new Uint8Array([0,255,42]).buffer),a.base64ToArrayBuffer('AP8q'),a.hexToArrayBuffer('00ff2a'),a.Binary.fromSource(new Uint8Array([1,2,3]).subarray(1))];}],
 ['clone graph and native values',(m)=>{const a=m.api,s=Symbol.for('source-key'),x={a:[1,{n:2}],date:new Date('2026-01-02T00:00:00Z'),regex:/x/gi};x.self=x;x[s]={answer:42};const y=a.clone(x);return [y,y.self===y,y.a!==x.a,y.a[1]!==x.a[1],a.deepEqual(x,y),a.deepEqual({a:1},{a:2})];}],
 ['volatile reference shared with clone',(m)=>{const a=m.api;const v=a.createVolatile({n:1});const c=a.clone({v});a.updateVolatile(v,a.createVolatile({n:2}));return [a.isVolatile(v),c.v===v,v.get(),c.v.get(),[...a.volatileEntries({v})]];}],
 ['string complete public helpers',(m)=>{const a=m.api;return [a.capitalize('hello'),a.uncapitalize('HELLO'),a.camelCase('hello_world'),a.camelize('hello-world'),a.hyphenate('helloWorld'),a.paramCase('helloWorld'),a.snakeCase('helloWorld'),a.trimSlash('/a/'),a.sanitize('abc'),a.formatProperty('answer',42)];}],
 ['Time complete public namespace and constants',(m)=>{const t=m.api.Time;return [Object.keys(t),t.millisecond,t.second,t.minute,t.hour,t.day,t.week,t.getTimezoneOffset(),t.parseTime('2h30m'),t.parseDate('2026-01-02'),t.format(90061000),t.getDateNumber(new Date(0),0),t.fromDateNumber(0,0),t.template('yyyy-MM-dd hh:mm:ss',new Date('2026-01-02T03:04:05Z')),t.toDigits(7,3)];}],
 ['mutable Time timezone and detached lexical methods',(m)=>{const t=m.api.Time;const initial=t.getTimezoneOffset();t.setTimezoneOffset(120);const parse=t.parseDate,short=t.format;const out=[initial,t.getTimezoneOffset(),parse('2026-01-02'),short(1234)];t.setTimezoneOffset(initial);return out;}],
 ['live global access after package evaluation',(m)=>{
  const events=[],old=JSON;globalThis.JSON={stringify(...args){events.push('JSON');return old.stringify(...args)}};const value=m.api.formatProperty('a-b');globalThis.JSON=old;return [value,events];
 }],
];
function run(fn,m){m.c.normalize=normalize;m.c.__caseInput={api:m.api,trace:m.trace};return vm.runInContext('('+fn.toString()+')(__caseInput)',m.c,{timeout:2000});}
let count=0;
for(const [name,fn] of cases){const b=await load(oracle),a=await load(candidate);const expected=normalize(run(fn,b)),actual=normalize(run(fn,a));assert.deepEqual(actual,expected,name);count++;}
const b=await load(oracle,true),a=await load(candidate,true);assert.deepEqual(normalize(run(cases[7][1],a)),normalize(run(cases[7][1],b)),'binary Node Buffer codecs');count++;
assert.equal(Object.keys(a.api).length,40);console.log(`CosmoKit package: ${count} source-derived ESM groups, 40 public exports, Buffer/browser branches; Node VM execution only.`);
