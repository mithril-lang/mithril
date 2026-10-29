/* Mithril system dynamics v1. Pure, bounded stock-and-flow simulation.
 *
 * A model is inert JSON: stocks with initial values, parameters, constants,
 * rates and auxiliaries, where every rate and auxiliary is a bounded
 * arithmetic expression over the declared identifiers and `time`. No eval and
 * no I/O: the recursive-descent expression parser is the only path from text
 * to computation.
 *
 * Stocks integrate the net of their declared inflows and outflows with the
 * classic midpoint (improved Euler) step:
 *
 *   S(t+dt) = S(t) + dt * net(S(t) + dt/2 * net(S(t)))
 *
 * Budgets are enforced by refusal, not truncation: a step, identifier or
 * sample that overflows is an error, never a silent clamp. The identical
 * model and specification produce the identical run on Node and in the
 * browser.
 */
(function(global){
'use strict';
const NS='https://mithril.fund/ns/sd/v1#';
const FORMAT='mithril.sd/run-v1';
const MAX_ELEMENTS=4096,MAX_STEPS=1000000,MAX_EXPRESSION=4096,MAX_AUX_ITERATIONS=64;
const AUX_CONVERGENCE=1e-12;
const bad=k=>['__proto__','prototype','constructor'].includes(k);
function finite(x,label){if(typeof x!=='number'||!Number.isFinite(x))throw Error(label+' must be a finite number');return x;}
function integer(x,min,max,label){if(!Number.isInteger(x)||x<min||x>max)throw Error(label+' outside budget');return x;}
function identifier(x,label){if(typeof x!=='string'||!x.length||x.length>MAX_EXPRESSION||bad(x))throw Error(label+' must be a bounded identifier');return x;}
function safeId(x){return /^[A-Za-z_][A-Za-z0-9_.-]*$/.test(x)?x:null;}
const TOKEN_RE=/\s*(\d+(?:\.\d*)?|\.\d+|[A-Za-z_][A-Za-z0-9_.-]*|[+\-*/()^,])\s*/y;
function tokenize(expression){
  if(typeof expression!=='string'||!expression.length||expression.length>MAX_EXPRESSION)throw Error('expression outside budget');
  const tokens=[];let index=0,m;
  while((m=TOKEN_RE.exec(expression))){
    if(m.index!==index)throw Error('unparsed expression character: '+expression[index]);
    index+=m[0].length;
    const t=m[1];
    if(/^\d/.test(t)||t.startsWith('.'))tokens.push(['num',parseFloat(t)]);
    else if(/^[A-Za-z_]/.test(t))tokens.push(['id',t]);
    else tokens.push(['op',t]);
  }
  if(index!==expression.length)throw Error('trailing expression text');
  return tokens;
}
function parseExpression(expression){
  const tokens=tokenize(expression);
  if(!tokens.length)throw Error('empty expression');
  let pos=0;
  const peek=()=>tokens[pos];
  const isNum=()=>peek()&&peek()[0]==='num';
  const isId=()=>peek()&&peek()[0]==='id';
  const isOp=op=>peek()&&peek()[0]==='op'&&peek()[1]===op;
  const expect=op=>{if(!isOp(op))throw Error('expected "'+op+'" in expression');pos++;};
  function unary(){
    if(isOp('-')){pos++;return{op:'neg',args:[unary()]};}
    if(isOp('+')){pos++;return unary();}
    if(isOp('(')){pos++;const inner=or();expect(')');return inner;}
    if(isNum()){const value=peek()[1];pos++;return{op:'const',value};}
    if(isId()){const name=peek()[1];pos++;if(name==='time')return{op:'time'};return{op:'var',name};}
    throw Error('unexpected token in expression');
  }
  function power(){
    let base=unary();
    while(isOp('^')){pos++;base={op:'pow',args:[base,unary()]};}
    return base;
  }
  function term(){
    let left=power();
    for(;;){if(isOp('*')){pos++;left={op:'mul',args:[left,power()]};}else if(isOp('/')){pos++;left={op:'div',args:[left,power()]};}else return left;}}
  function or(){
    let left=term();
    for(;;){if(isOp('+')){pos++;left={op:'add',args:[left,term()]};}else if(isOp('-')){pos++;left={op:'sub',args:[left,term()]};}else return left;}}
  const ast=or();
  if(pos!==tokens.length)throw Error('trailing tokens in expression');
  return ast;
}
const evalNode=(node,scope)=>{
  switch(node.op){
    case 'const':return node.value;
    case 'time':return scope.time;
    case 'var':if(!(node.name in scope))throw Error('unknown identifier in expression: '+node.name);return scope[node.name];
    case 'neg':{const v=-evalNode(node.args[0],scope);if(!Number.isFinite(v))throw Error('expression overflow');return v;}
    case 'add':{const a=evalNode(node.args[0],scope),b=evalNode(node.args[1],scope),v=a+b;if(!Number.isFinite(v))throw Error('expression overflow');return v;}
    case 'sub':{const a=evalNode(node.args[0],scope),b=evalNode(node.args[1],scope),v=a-b;if(!Number.isFinite(v))throw Error('expression overflow');return v;}
    case 'mul':{const a=evalNode(node.args[0],scope),b=evalNode(node.args[1],scope),v=a*b;if(!Number.isFinite(v))throw Error('expression overflow');return v;}
    case 'div':{const a=evalNode(node.args[0],scope),b=evalNode(node.args[1],scope),v=a/b;if(!Number.isFinite(v))throw Error('expression overflow');return v;}
    case 'pow':{const a=evalNode(node.args[0],scope),b=evalNode(node.args[1],scope),v=Math.pow(a,b);if(!Number.isFinite(v))throw Error('expression overflow');return v;}
    default:throw Error('unknown expression node');
  }
};
function validateModel(model){
  if(!model||typeof model!=='object'||Array.isArray(model))throw Error('SD model must be an object');
  const collections={stocks:model.stocks,parameters:model.parameters,constants:model.constants,rates:model.rates,auxiliaries:model.auxiliaries};
  if(!Array.isArray(collections.stocks))throw Error('SD model requires a stocks array');
  for(const key of Object.keys(collections)){
    const value=collections[key];
    if(value===undefined)continue;
    if(!Array.isArray(value)||value.length>MAX_ELEMENTS)throw Error('SD '+key+' exceeds budget');
  }
  const ids=new Set();
  const collect=(rows,label,valueKey,expressionKey)=>{
    if(rows===undefined)return[];
    return rows.map(row=>{
      if(!row||typeof row!=='object'||Array.isArray(row))throw Error('SD '+label+' must be an object');
      const id=identifier(row.id,'SD '+label+' ID');
      if(!safeId(id))throw Error('SD '+label+' ID is not a safe identifier');
      if(ids.has(id))throw Error('duplicate SD identifier: '+id);
      ids.add(id);
      const out={id};
      if(valueKey!==undefined&&row[valueKey]!==undefined)out[valueKey]=finite(row[valueKey],'SD '+label+' '+valueKey);
      if(expressionKey!==undefined)out.expression=parseExpression(row.expression);
      if(label==='rate'){
        if(typeof row.direction!=='string')throw Error('rate requires a direction: '+id);
        out.direction=row.direction;
        if(typeof row.target!=='string'||!row.target.length)throw Error('rate requires a stock target: '+id);
        out.target=row.target;
      }
      return out;
    });
  };
  const stocks=collect(collections.stocks,'stock','initial',undefined).map(s=>({...s,initial:finite(s.initial??0,'stock initial')}));
  const parameters=collect(collections.parameters,'parameter','value',undefined);
  const constants=collect(collections.constants,'constant','value',undefined);
  for(const p of parameters)if(p.value===undefined)throw Error('parameter requires a finite value: '+p.id);
  for(const c of constants)if(c.value===undefined)throw Error('constant requires a finite value: '+c.id);
  const rates=collect(collections.rates,'rate',undefined,'expression');
  const auxiliaries=collect(collections.auxiliaries,'auxiliary',undefined,'expression');
  const stockIds=new Set(stocks.map(s=>s.id));
  for(const r of rates){
    if(!['in','out'].includes(r.direction))throw Error('rate direction must be in or out');
    if(!stockIds.has(r.target))throw Error('rate target is not a stock: '+r.target);
  }
  const known=new Set([...stocks.map(s=>s.id),...parameters.map(p=>p.id),...constants.map(c=>c.id),...auxiliaries.map(a=>a.id),...rates.map(r=>r.id),'time']);
  const visit=(node,allowSelf)=>{
    if(node.op==='var'&&!known.has(node.name))throw Error('unknown identifier in expression: '+node.name);
    (node.args||[]).forEach(a=>visit(a,allowSelf));
  };
  for(const a of auxiliaries)visit(a.expression,false);
  for(const r of rates)visit(r.expression,false);
  return{stocks,parameters,constants,rates,auxiliaries};
}
function evaluateSystem(model,state,time){
  const scope={time};
  for(const p of model.parameters)scope[p.id]=p.value;
  for(const c of model.constants)scope[c.id]=c.value;
  for(const s of model.stocks)scope[s.id]=state[s.id];
  for(const a of model.auxiliaries)scope[a.id]=0;
  let previousChange=null;
  for(let iteration=0;iteration<MAX_AUX_ITERATIONS;iteration++){
    let change=0;
    for(const a of model.auxiliaries){
      const next=evalNode(a.expression,scope);
      if(!Number.isFinite(next))throw Error('auxiliary overflow: '+a.id);
      if(Math.abs(next-scope[a.id])>change)change=Math.abs(next-scope[a.id]);
      scope[a.id]=next;
    }
    if(previousChange!==null&&change<=AUX_CONVERGENCE)return scope;
    previousChange=change;
  }
  throw Error('auxiliary system did not converge within '+MAX_AUX_ITERATIONS+' iterations');
}
function netFlow(model,state,time){
  const scope=evaluateSystem(model,state,time);
  const rates=new Map();
  for(const r of model.rates){
    const v=evalNode(r.expression,scope);
    if(!Number.isFinite(v))throw Error('rate overflow: '+r.id);
    rates.set(r.id,v);
  }
  const net={};
  for(const s of model.stocks){
    let sum=0;
    for(const r of model.rates){
      if(r.direction==='in'&&r.target===s.id)sum+=rates.get(r.id);
      else if(r.direction==='out'&&r.target===s.id)sum-=rates.get(r.id);
    }
    net[s.id]=sum;
  }
  return{scope,rates,net};
}
function integrate(model,spec={}){
  const m=validateModel(model);
  const dt=finite(spec.dt??0.01,'dt');
  if(dt<=0||dt>1)throw Error('dt outside budget: (0, 1]');
  const horizon=finite(spec.horizon??0,'horizon');
  if(horizon<0||horizon>1e6)throw Error('horizon outside budget');
  const maxSamples=integer(spec.maxSamples??1024,0,4096,'maxSamples');
  const steps=horizon===0?0:Math.max(1,Math.ceil(horizon/dt));
  if(steps>MAX_STEPS)throw Error('integration step budget exceeded');
  const state={};
  for(const s of m.stocks)state[s.id]=s.initial;
  const stride=maxSamples>0?Math.max(1,Math.ceil(steps/Math.max(1,maxSamples))):1;
  const series={},times=[];
  let t=0;
  const record=()=>{times.push(+t.toFixed(12));for(const s of m.stocks)(series[s.id]??=[]).push(state[s.id]);};
  record();
  for(let step=1;step<=steps;step++){
    const full=step===steps?horizon-t:dt;
    const start=netFlow(m,state,t);
    const half={};
    for(const s of m.stocks)half[s.id]=state[s.id]+full/2*start.net[s.id];
    const mid=netFlow(m,half,t+full/2);
    for(const s of m.stocks){
      state[s.id]=state[s.id]+full*mid.net[s.id];
      if(!Number.isFinite(state[s.id]))throw Error('stock overflow: '+s.id);
    }
    t+=full;
    if(step%stride===0||step===steps)record();
  }
  const result={format:FORMAT,status:'complete',dt,horizon,steps:steps+1,maxSamples,stockCount:m.stocks.length,stocks:Object.fromEntries(m.stocks.map(s=>[s.id,series[s.id]])),times};
  if(JSON.stringify(result).length>16777216)throw Error('SD sample budget exceeded');
  return result;
}
function programs(document){
  const arr=x=>x==null?[]:Array.isArray(x)?x:[x],literal=x=>x&&typeof x==='object'?x['@value']??x['@id']:x;
  const flatten=doc=>arr(doc).flatMap(n=>n['@graph']?flatten(n['@graph']):[n]);
  const result=[];
  for(const n of flatten(document)){
    const types=[...arr(n['@type']),...arr(n['http://www.w3.org/1999/02/22-rdf-syntax-ns#type']).map(literal)];
    if(!types.includes(NS+'Program'))continue;
    if(['key','model','specification'].some(k=>arr(n[NS+k]).length!==1))throw Error('program fields require exactly one value');
    const key=literal(arr(n[NS+'key'])[0]),model=literal(arr(n[NS+'model'])[0]),source=literal(arr(n[NS+'specification'])[0]);
    if(typeof key!=='string'||!key.length||typeof source!=='string'||!['sd'].includes(model))throw Error('invalid SD program declaration');
    if(result.some(p=>p.key===key))throw Error('duplicate SD program key: '+key);
    const specification=JSON.parse(source);
    if(!specification||typeof specification!=='object'||Array.isArray(specification))throw Error('SD specification must be an object');
    result.push({id:n['@id'],key,model,specification});
  }
  return result;
}
const api={NS,FORMAT,integrate,programs,parseExpression,validateModel};
if(typeof module!=='undefined')module.exports=api;else global.MithrilSD=api;
})(typeof globalThis!=='undefined'?globalThis:this);
