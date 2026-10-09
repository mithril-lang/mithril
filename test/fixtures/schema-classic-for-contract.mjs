import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {join} from 'node:path';
import {reference} from './schema-classic-for-reference.mjs';
const dir=process.argv[2],sha=x=>createHash('sha256').update(x).digest('hex');
const original=readFileSync(new URL('./schemastery-declarations/original-index.ts',import.meta.url),'utf8'),p=JSON.parse(readFileSync(new URL('./schema-classic-for-provenance.json',import.meta.url)));
assert.equal(sha(original),'a6647b515659cf439b701fa9f9574c9c310ce3872d26a13a81e9fa4d02ba10ad');assert.equal(p.original_sha256,sha(original));assert.equal(original.slice(p.start,p.end),p.source);assert.equal(sha(p.source),p.sha256);
let groups=0;const capture=f=>{try{return{value:f()}}catch(e){return e instanceof Error?{error:e.name}:{thrown:e}}};
for(const target of ['js','js-browser']){
 const {instantiateMithrilNative}=await import(pathToFileURL(join(dir,'schema-classic-for-'+target+'.mjs'))),factories=[instantiateMithrilNative,reference];
 for(const mode of ['empty','dense','holes','grow','shrink','replace','proxy','throw','length-throw']){const traces=[];for(const factory of factories){const log=[],seen={},list=mode==='empty'?[]:mode==='holes'?[,,'third']:['first','second'],schema={list};if(mode==='proxy'||mode==='length-throw')schema.list=new Proxy(list,{get(t,k){log.push(['get',String(k)]);if(mode==='length-throw'&&k==='length')throw 'length';return Reflect.get(t,k)}});let count=0;const api=factory({String,validateVolatileSchema(child,path,blocked,actualSeen){assert.equal(actualSeen,seen);log.push(['visit',child,path,blocked]);count++;if(mode==='grow'&&count===1)list.push('third');if(mode==='shrink'&&count===1)list.length=1;if(mode==='replace'&&count===1)schema.list=['replacement','new-second','new-third'];if(mode==='throw'&&count===1)throw 'validation'}});traces.push([capture(()=>api.list(schema,['root'],seen)),log])}assert.deepEqual(...traces);groups++}
 console.log(`Schema original classic for actual ${target} CLI:9 paired observation groups passed; validateVolatileSchema helper explicit.`);
}
assert.equal(groups,18);
console.log('Schema classic for:one exact original node/18 paired observation groups; not whole Schema or volatile validation.');
