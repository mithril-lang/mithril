import assert from 'node:assert/strict';
import {join} from 'node:path';import {pathToFileURL} from 'node:url';
const original={equal:(left,right)=>left==right,unequal:(left,right)=>left!=right,orderedEqual:(left,right)=>left()==right(),orderedUnequal:(left,right)=>left()!=right()};
const shared={},symbol=Symbol('same'),values=[undefined,null,false,true,0,-0,1,-1,NaN,Infinity,-Infinity,0n,1n,-1n,9007199254740993n,'','0','1','-1','false',' \t\n','0x10','9007199254740993','NaN',symbol,Symbol('same'),shared,{},[],[0],[1],new Number(1),new String('1'),new Boolean(false),new Date(0)];
function primitiveMatrix(api){return values.flatMap(left=>values.flatMap(right=>[api.equal(left,right),api.unequal(left,right)]));}
function coercion(api,method){
 const output=[];
 for(const primitive of [0,1,'1',true,1n,symbol]){
  for(const position of ['left','right']){
   const trace=[];const obj={[Symbol.toPrimitive](hint){trace.push(['primitive',hint]);return primitive;}};
   const left=()=>{trace.push('left');return position==='left'?obj:1};const right=()=>{trace.push('right');return position==='right'?obj:1};
   output.push([api[method](left,right),trace]);
  }
 }
 for(const mode of ['valueOf','toString','invalid','throwPrimitive','throwValueOf','throwLeft','throwRight']){
  const trace=[],sentinel={mode};const obj=mode==='throwPrimitive'?{[Symbol.toPrimitive](){trace.push('primitive');throw sentinel}}:
   {valueOf(){trace.push('valueOf');if(mode==='throwValueOf')throw sentinel;return mode==='valueOf'?1:{}},toString(){trace.push('toString');return mode==='invalid'?{}:'1'}};
  const left=()=>{trace.push('left');if(mode==='throwLeft')throw sentinel;return obj};const right=()=>{trace.push('right');if(mode==='throwRight')throw sentinel;return 1};
  try{output.push([api[method](left,right),trace]);}catch(error){if(mode==='invalid')assert.ok(error instanceof TypeError);else assert.equal(error,sentinel);output.push(['throw',mode,trace]);}
 }
 const trace=[];const left={[Symbol.toPrimitive](){trace.push('left coercion');throw Error('unexpected coercion')}};const right={[Symbol.toPrimitive](){trace.push('right coercion');throw Error('unexpected coercion')}};
 output.push([api[method](()=>left,()=>right),trace]);
 return output;
}
const baseline={matrix:primitiveMatrix(original),equal:coercion(original,'orderedEqual'),unequal:coercion(original,'orderedUnequal')};
const groups=values.length**2*2+baseline.equal.length+baseline.unequal.length;
for(const target of ['js','js-browser']){
 const module=await import(pathToFileURL(join(process.argv[2],target+'.mjs')));const candidate=module.instantiateMithrilNative({});
 assert.deepEqual({matrix:primitiveMatrix(candidate),equal:coercion(candidate,'orderedEqual'),unequal:coercion(candidate,'orderedUnequal')},baseline);
 console.log(`Native abstract equality ${target}: ${groups} original-paired groups; null/undefined, primitive matrix, bigint/symbol, object identity, ToPrimitive order and exact abrupt completion; Node execution only.`);
}
