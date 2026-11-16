import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
// These independently authored JavaScript functions are the language oracle.
const original={
 raw:tag=>tag`\s+\b`,invalid:tag=>tag`\u{bad}`,
 substitution:(tag,value)=>tag`before ${value} after`,member:owner=>owner.tag`receiver`,
 escaped:tag=>tag`\` \${literal}`,multiline:tag=>tag`a
b`,unicode:tag=>tag`😀 \uD800`,continuation:tag=>tag`a\
b`,ordered:(owner,first,second)=>owner.tag`${first()} / ${second()}`
};
const module=await import(pathToFileURL(process.argv[2]));
const candidate=module.instantiateMithrilNative({});
function inspect(strings,...values){return {cooked:[...strings],raw:[...strings.raw],values,frozen:Object.isFrozen(strings),rawFrozen:Object.isFrozen(strings.raw),keys:Reflect.ownKeys(strings),rawDescriptor:Object.getOwnPropertyDescriptor(strings,'raw'),elementDescriptor:Object.getOwnPropertyDescriptor(strings,'0')};}
let groups=0;
for(const name of ['raw','invalid','escaped','multiline','unicode','continuation']){
 assert.deepEqual(candidate[name](inspect),original[name](inspect));groups++;
 assert.equal(candidate[name](String.raw),original[name](String.raw));groups++;
 for(const implementation of [original,candidate]){
  let first;assert.equal(implementation[name](s=>(first=s,0)),0);assert.equal(implementation[name](s=>s===first),true);
 }
 groups++;
}
const value={toString(){throw Error('Tagged substitutions must not coerce')}};
assert.deepEqual(candidate.substitution(inspect,value),original.substitution(inspect,value));groups++;
for(const implementation of [original,candidate]){
 let raw,other;implementation.raw(s=>(raw=s));implementation.escaped(s=>(other=s));assert.notEqual(raw,other);
 const receiver={tag(){return this}};assert.equal(implementation.member(receiver),receiver);
 const owner={get tag(){this.order.push('get');return function(s){this.order.push('call');return s.raw[0];}},order:[]};
 assert.equal(implementation.member(owner),'receiver');assert.deepEqual(owner.order,['get','call']);
 assert.throws(()=>implementation.raw(null),TypeError);
 const error=new Error('getter');assert.throws(()=>implementation.member({get tag(){throw error;}}),e=>e===error);
}
groups+=5;
function observe(implementation,mode){const trace=[],error=new Error('identity'),value={toString(){throw error}},owner={get tag(){trace.push('get');return mode==='noncallable'?null:function(strings,...values){trace.push('tag');assert.equal(this,owner);assert.equal(values[0],value);if(mode==='tag-throw')throw error;return {...inspect(strings,...values),values:values.map(v=>v===value?'input-reference':v)};}}};let result,thrown;try{result=implementation.ordered(owner,()=>{trace.push('first');if(mode==='first-throw')throw error;return value},()=>{trace.push('second');return 2});}catch(e){thrown=e===error?'same':e.constructor.name;}return {trace,result,thrown};}
for(const mode of ['normal','noncallable','first-throw','tag-throw']){assert.deepEqual(observe(candidate,mode),observe(original,mode));groups++;}
for(const implementation of [original,candidate]){
 const object={toString(){throw Error('coerce')}};let observed;
 implementation.ordered({tag(strings,...values){observed=values}},()=>object,()=>object);
 assert.equal(observed[0],object);assert.equal(observed[1],object);
 let first;implementation.ordered({tag(s){first=s}},()=>0,()=>0);
 assert.equal(implementation.ordered({tag(s){return s===first}},()=>1,()=>2),true);
}
groups+=2;
function originalFactory(){return{raw:tag=>tag`\s+\b`}};
for(const factory of [originalFactory,()=>module.instantiateMithrilNative({})]){
 const first=factory(),second=factory();assert.notEqual(first.raw,second.raw);
 const strings=first.raw(s=>s);assert.equal(second.raw(s=>s),strings);
}
groups++;
assert.equal(groups,31);
console.log(`Tagged templates: ${groups} independent native-JavaScript-paired groups; native TemplateStringsArray descriptors, cooked/raw invalid escapes, freezing, per-site cache across factories, distinct sites, exact receiver/getter/substitution order, uncoerced values, Unicode/line continuations and thrown identity. Node execution only.`);
