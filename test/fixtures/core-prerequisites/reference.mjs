// Native JavaScript reference for the inert call/loop controls. These are not
// a replacement Fiber/Events implementation. Extracted source bodies below
// match pinned program emit fiber.mjs53-56 and250-256.
export function instantiate(g){
 return {
  callSpread:function callSpread(){return (0,(0,g.callee)())((0,g.arg)('first'),...(0,g.spread)('one'),(0,g.arg)('middle'),...(0,g.spread)('two'),(0,g.arg)('last'))},
  optional:function optional(){return (0,(0,g.callee)())?.((0,g.arg)('first'))},
  optionalSpread:function optionalSpread(){return (0,(0,g.callee)())?.((0,g.arg)('first'),...(0,g.spread)('one'),(0,g.arg)('middle'),...(0,g.spread)('two'),(0,g.arg)('last'))},
  optionalPropertyValue:function optionalPropertyValue(){return (0,(0,g.object)()[(0,g.key)()])?.((0,g.arg)('first'))},
  doLoop:function doLoop(){do{(0,g.body)()}while((0,g.condition)());return (0,g.result)()},
  expressionLoop:function expressionLoop(){return (()=>{do{(0,g.body)()}while((0,g.condition)());return (0,g.result)()})()},
  finallyLoop:function finallyLoop(){do{try{const token=(0,g.body)();if(token==='continue')continue;if(token==='break')break;if(token==='return')return token;}finally{(0,g.record)('finally')}}while((0,g.condition)());return (0,g.result)()},
  returnLoop:function returnLoop(){do{return (0,g.body)()}while((0,g.condition)());return (0,g.result)()},
  outerClose:function outerClose(){for(const entry of g.iterator){do{return entry}while((0,g.condition)())}return (0,g.result)()},
  voidCall:function voidCall(){return void (0,g.body)()},
  asyncLoop:async function asyncLoop(){do{await (0,g.body)()}while(await (0,g.condition)());return await (0,g.result)()},
  asyncGeneratorLoop:async function* asyncGeneratorLoop(){do{yield await (0,g.body)()}while(await (0,g.condition)());return await (0,g.result)()},
  generatorLoop:function* generatorLoop(){do{yield (0,g.body)()}while(yield (0,g.condition)());return yield (0,g.result)()},
  asyncOptionalSpread:async function asyncOptionalSpread(){return (0,await (0,g.callee)())?.(await (0,g.arg)('first'),...await (0,g.spread)('one'))},
  yieldOptionalSpread:function* yieldOptionalSpread(){return (0,yield (0,g.callee)())?.(yield (0,g.arg)('first'),...yield (0,g.spread)('one'))},
  runDisposable:function runDisposable(dispose,inertia){const result=dispose();return inertia.get(dispose)?.()??result;},
  FiberNameFixture:class FiberNameFixture{get name(){let fiber=this;do{if(fiber.runtime?.name)return fiber.runtime.name;fiber=fiber.parent.fiber;}while(fiber!==fiber.parent.fiber);return 'root';}},
 };
}
