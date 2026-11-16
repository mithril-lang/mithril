import assert from 'node:assert/strict';import fs from'node:fs';import vm from'node:vm';import path from'node:path';
const artifacts=JSON.parse(fs.readFileSync(path.join(process.argv[2],'artifacts.json'),'utf8'));
const load=(k,g)=>vm.runInContext('"use strict";'+artifacts[k].replace('export function','function')+';instantiateMithrilNative',vm.createContext({}))(g).value;
let groups=0;const group=f=>{f();groups++};
function values(log){return{[Symbol.iterator](){let i=0;return{next(){log.push('next');return ++i<=3?{value:i,done:false}:{done:true}},return(){log.push('close');return{done:true}}}}}}
const refs={return:function(v,mark){for(const value of v){try{return value}finally{mark(value)}}},continue:function(v,mark){for(const value of v){try{continue}finally{mark(value)}}return 7},break:function(v,mark){for(const value of v){try{break}finally{mark(value)}}return 8}};
for(const key of ['return','continue','break'])group(()=>{const results=[];for(const candidate of [false,true]){const log=[],mark=v=>log.push('mark:'+v),f=candidate?load(key,{mark}):v=>refs[key](v,mark);results.push([f(values(log)),log])}assert.deepEqual(results[0],results[1])});
group(()=>assert.equal(load('override',{})(),2));
group(()=>{for(const candidate of [false,true]){const log=[],sentinel={},mark=()=>{throw sentinel},f=candidate?load('return',{mark}):v=>refs.return(v,mark);assert.throws(()=>f(values(log)),e=>e===sentinel);assert.deepEqual(log,['next','close'])}});
group(()=>{for(const mode of ['return','continue','break']){const results=[];for(const candidate of [false,true]){const log=[],mark=v=>log.push(v),f=candidate?load('while',{mark}):function(mode){let i=0;while(i<3){i++;try{if(mode==='return')return i;if(mode==='break')break;continue}finally{mark(i)}}return i};results.push([f(mode),log])}assert.deepEqual(results[0],results[1])}});
console.log('Native source control transfer: '+groups+' runtime groups; real return/continue/break, finally override and IteratorClose; no operand/IIFE transfer.');
