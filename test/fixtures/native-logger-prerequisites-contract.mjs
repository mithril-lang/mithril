import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import vm from 'node:vm';
import {pathToFileURL} from 'node:url';
const dir=process.argv[2];let groups=0;const group=f=>{f();groups++};
const capture=f=>{try{return{value:f()}}catch(e){return{name:e.name,message:e.message}}};
function original({Base,mark,key,heritage,fail}){
 const formatters={C:()=>Late.value};class Late{static value=23};
 return{
  ops:{['<<']:(a,b)=>a<<b,['>>']:(a,b)=>a>>b,['>>>']:(a,b)=>a>>>b,['&']:(a,b)=>a&b,['|']:(a,b)=>a|b,['^']:(a,b)=>a^b,['>']:(a,b)=>a>b},
  bits:function(a,b){return[a<<b,a>>b,a>>>b,a&b,a|b,a^b,a>b,~a]},
  bit:function(a,b){return mark('left',a)<<mark('right',b)},
  arrow:function(){return(first,second=first,...tail)=>[this,new.target,arguments.length,first,second,tail]},
  arrayArrow:([a,b]=[3,4],...tail)=>[a,b,tail],
  selfDefault:(x=x)=>x,
  laterDefault:(x=tail,...tail)=>x,
  defaultClosure:(f=()=>x,x=6)=>f(),
  classFactory:function(){return class C extends heritage(Base){
   [key('instance')]=mark(this,'instance');
   static [key('first')]=mark(this,'first');
   static {const privateValue=9;this.self=C;this.snapshot=super.base;this.lexical=(...tail)=>[this,new.target,super.base,privateValue,tail];super.write=11;mark(this,'block');}
   [key('method')](){return this;}
   static [key('last')]=mark(this,'last');
   static {mark(this,'block2');}
  }},
  throwingClass:function(){return class {
   static before=mark(this,'before');
   static {fail();}
   static after=mark(this,'after');
  }},formatters,Late
 }
}
function grants(effects=[],sentinel={failure:1}){
 class Base {static base=7;static set write(x){effects.push(['super-write',this.name,x]);this.written=x}}
 return{Base,mark(receiver,value){effects.push(['mark',typeof receiver==='string'?receiver:receiver.name,value]);return typeof receiver==='string'?value:receiver},key(k){effects.push(['key',k]);return k},heritage(base){effects.push(['heritage']);return base},fail(){throw sentinel}}
}
function classContract(factory){const effects=[],g=grants(effects),api=factory(g);assert.deepEqual(effects,[]);const C=api.classFactory();const out=[effects.slice(),C.name,C.self===C,C.snapshot,C.written,C.first===C,C.last===C];const fn=C.lexical;const value=fn.call({},1,2);out.push(value[0]===C,value[1],value[2],value[3],value[4],fn.length,fn.name,Object.hasOwn(fn,'prototype'));const x=new C();out.push(x.instance===x,x.method()===x,effects.slice());class Child extends C{};const child=new Child();out.push(child.instance===child,child.method()===child,C.lexical===Child.lexical);return out}
for(const target of ['js','js-browser']){
 const module=await import(pathToFileURL(path.join(dir,target+'.mjs'))),factory=module.instantiateMithrilNative,api=factory(grants()),ref=original(grants());
 group(()=>{assert.equal(api.formatters.C(),23);assert.equal(api.formatters.C.name,'C');assert.equal(api.Late.name,'Late');api.Late.value=31;assert.equal(api.formatters.C(),31)});
 group(()=>{assert.deepEqual(Object.keys(api),Object.keys(ref));for(const k of Object.keys(api.ops)){assert.equal(api.ops[k].name,k);assert.equal(api.ops[k].length,2);assert.equal(Object.hasOwn(api.ops[k],'prototype'),false)}});
 for(const op of Object.keys(api.ops))group(()=>{const values=[-1,0,1,2147483648,4294967297,NaN,Infinity,'7',null,undefined,2n,Symbol('operand')];for(const a of values)for(const b of values)assert.deepEqual(capture(()=>api.ops[op](a,b)),capture(()=>ref.ops[op](a,b)),op)});
 group(()=>{for(const [a,b]of [[5,2],[-2147483648,33],['4294967297','2'],[undefined,NaN],[null,0]])assert.deepEqual(api.bits(a,b),ref.bits(a,b))});
 group(()=>{for(const build of [original,factory]){const log=[],g=grants(log),f=build(g),a={[Symbol.toPrimitive](hint){log.push(['coerce-left',hint]);return 7n}},b={[Symbol.toPrimitive](hint){log.push(['coerce-right',hint]);return 1n}};assert.equal(f.bit(a,b),14n);assert.deepEqual(log.map(x=>x.slice(0,2)),[['mark','left'],['mark','right'],['coerce-left','number'],['coerce-right','number']])}});
 group(()=>{for(const build of [original,factory]){const sentinel={},g=grants();let rights=0;g.mark=(side,value)=>{if(side==='left')throw sentinel;rights++;return value};assert.throws(()=>build(g).bit(1,2),e=>e===sentinel);assert.equal(rights,0)}});
 group(()=>{for(const f of [api.arrow,ref.arrow]){const receiver={},arrow=f.call(receiver,1,2);assert.equal(arrow.length,1);assert.equal(arrow.name,'');assert.equal(Object.hasOwn(arrow,'prototype'),false);assert.throws(()=>new arrow(),TypeError);const values=arrow.call({},5,undefined,6,7);assert.equal(values[0],receiver);assert.equal(values[1],undefined);assert.equal(values[2],2);assert.deepEqual(values.slice(3),[5,5,[6,7]]);assert.deepEqual(arrow(5,null).slice(3),[5,null,[]]);const constructed=new f();assert.equal(constructed()[1],f);assert.equal(constructed()[2],0)}});
 group(()=>{assert.deepEqual(api.arrayArrow(),ref.arrayArrow());assert.deepEqual(api.arrayArrow([7,8],9,10),ref.arrayArrow([7,8],9,10));assert.equal(api.arrayArrow.length,0);assert.deepEqual(capture(()=>api.arrayArrow(null)),capture(()=>ref.arrayArrow(null)));for(const f of [api.arrayArrow,ref.arrayArrow]){let closed=0;const iterable={[Symbol.iterator](){let i=0;return{next(){return{value:++i,done:false}},return(){closed++;return{done:true}}}}};assert.deepEqual(f(iterable,4),[1,2,[4]]);assert.equal(closed,1)}});
 group(()=>{for(const f of [api.selfDefault,api.laterDefault,ref.selfDefault,ref.laterDefault]){assert.throws(()=>f(),ReferenceError);assert.equal(f(8),8)}assert.equal(api.defaultClosure(),6);assert.equal(ref.defaultClosure(),6);assert.equal(api.defaultClosure(()=>9),9)});
 group(()=>assert.deepEqual(classContract(factory),classContract(original)));
 group(()=>{for(const build of [original,factory]){const effects=[],sentinel={},api=build(grants(effects,sentinel));assert.throws(()=>api.throwingClass(),e=>e===sentinel);assert.equal(effects.length,1);assert.equal(effects[0][2],'before')}});
 console.log('Native logger prerequisites actual '+target+' CLI: native class static initialization/home-object/abrupt completion, lexical arrow defaults/rest/TDZ and Number/BigInt bitwise controls passed.');
}
const artifacts=JSON.parse(fs.readFileSync(path.join(dir,'artifacts.json'),'utf8'));
const load=k=>vm.runInContext(artifacts[k].replace('export function','function')+';instantiateMithrilNative({})',vm.createContext({}));
group(()=>assert.equal(load('deferred').first(),7));
group(()=>{for(const key of ['early','earlyCall','earlySet'])assert.throws(()=>load(key),e=>e.name==='ReferenceError')});
group(()=>{const api=load('mutual');assert.equal(api.f(),api.g);assert.equal(api.g(),api.f)});
group(()=>{const api=load('mutable');assert.equal(api.get(),7);assert.equal(api.set(),8);assert.equal(api.get(),8)});
console.log('Native logger prerequisites: '+groups+' paired runtime groups; actual CLI outputs only, native reference controls, no source delegation.');
