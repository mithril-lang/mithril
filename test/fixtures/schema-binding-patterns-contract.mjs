import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {readFileSync} from 'node:fs';
import {instantiateSchemaBindingReference} from './schema-binding-patterns-reference.mjs';
const provenance=JSON.parse(readFileSync(new URL('./schema-binding-patterns-provenance.json',import.meta.url)));
assert.equal(provenance.lexical,5);assert.equal(provenance.parameter,23);
const directory=process.argv[2];
for(const target of ['js','js-browser']){
 const {instantiateMithrilNative}=await import(pathToFileURL(resolve(directory,`schema-binding-patterns-${target}.mjs`)));let groups=0;
 const pair=(id,run)=>{const a=run(instantiateSchemaBindingReference),b=run(Schema=>instantiateMithrilNative({Schema,Infinity}));assert.deepEqual(b,a,id);groups++;};
 for(const node of provenance.nodes){
  if(node.site==='Parameter'){
   for(const variant of ['values','absent','null','throw'])pair(node.id+':'+variant,factory=>{
    const api=factory({resolve(){throw Error('unexpected resolve')}}),events=[],marker=new Error('getter');let input;
    if(node.source.trim().startsWith('[')){
     input=variant==='null'?null:variant==='throw'?{[Symbol.iterator](){throw marker}}:variant==='absent'?[]:[1,2];
    }else{
     input=variant==='null'?null:new Proxy(Object.create(null),{get(_,key){events.push(String(key));if(variant==='throw')throw marker;return variant==='absent'?undefined:String(key)+':value';}});
    }
    try{return{value:api[node.id](input),events}}catch(error){if(variant==='throw')assert.equal(error,marker);return{error:error.constructor.name,identity:error===marker,events}}
   });
  }else if(node.helper){
   for(const variant of ['normal','undefined','null','short','throw'])pair(node.id+':'+variant,factory=>{
    const events=[],marker=new Error('resolve'),data={k:'input'},inner={tag:'inner'},schema={tag:'schema'},options={path:['root'],extra:2};
    const tuple=variant==='short'?[3]:variant==='undefined'?[3,undefined]:variant==='null'?[3,null]:[3,4];
    const Schema={resolve(...args){events.push(args);if(variant==='throw')throw marker;return tuple}},api=factory(Schema);
    try{const value=api[node.id](data,inner,options,true,{},'k',schema);return{value,adaptedOriginal:value[1]===data,events}}
    catch(error){assert.equal(error,marker);return{error:error.constructor.name,identity:true,events}}
   });
  }else{
   for(const variant of ['values','undefined','null-values','null','throw'])pair(node.id+':'+variant,factory=>{
    const api=factory({resolve(){throw Error('unexpected resolve')}}),events=[],marker=new Error('meta');
    const meta=variant==='null'?null:new Proxy({}, {get(_,key){events.push(String(key));if(variant==='throw')throw marker;return variant==='undefined'?undefined:variant==='null-values'?null:key==='max'?10:key==='min'?2:3;}});
    try{return{value:api[node.id](0,{}, {},false,meta,'k',{}),events}}
    catch(error){if(variant==='throw')assert.equal(error,marker);return{error:error.constructor.name,identity:error===marker,events}}
   });
  }
 }
 console.log(`Schema original binding patterns actual ${target} CLI: ${groups} paired observation groups passed; Schema.resolve helper explicit.`);
}
