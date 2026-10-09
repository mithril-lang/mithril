// Independent native JavaScript oracle: no compiler helper or generated source.
export function lexicalArray(input,fallback){const [a=fallback,,{v:b=7}={},...tail]=input;return[a,b,tail];}
export function lexicalHoles(input){const [,,]=input;return 0;}
export function lexicalNested(input){const [[a=8],{x:b}]=input;return[a,b];}
export function lexicalObject(input,key,fallback){const {[key]:value=fallback,x:renamed=9,...rest}=input;return[value,renamed,rest];}
export function lexicalTDZ(input){const [a=b,b=3]=input;return[a,b];}
export function lexicalForward(input){const [a]=[b];const b=4;return a;}
export function lexicalShadow(x){{const [x=x]=[undefined];return x;}}
export function mutableArray(input){let [x]=input;x++;return x;}
export function defaultNames(input){const [x=function(){return 1;},y=()=>{return 2;},z=class{}]=input;return[x.name,y.name,z.name];}
export function lexicalName(){const original=function(){return arguments.length;};return[original.name,original(1,2)];}
export function parameterArray([a=10,b],last){return[a,b,last,arguments.length,this.tag];}
export function parameterObject({x:renamed=9,...rest}={},last){return[renamed,rest,last,arguments.length];}
export function parameterNames([x=function(){return 1;},y=()=>{return 2;},z=class{}]){return[x.name,y.name,z.name];}
export function parameterTDZ([x=later],later=3){return x;}
export function parameterMutable([x]){--x;return x;}
export const arrowObject=({x:value=5},last)=>{return[value,last];};
export async function asyncPattern([x]){return await x;}
export function* generatorPattern([x]){yield x;return 2;}
export function* lexicalGenerator(input){const[x=yield 'default']=input;return x;}
export function localPattern(input){function pick({x}){return x;}return pick(input);}
export class PatternClass{constructor({tag}){this.tag=tag;}value({x=7}){return[x,this.tag,arguments.length];}}
export function objectMethod(){return{value({x=7}){return[x,this.tag,arguments.length];}};}
export function hoistedPattern([x=6]){return x;}

export function nestedRest(input){const[a,...[b,c]]=input;return[a,b,c];}

export function parameterLeafName(callback=function(){return 1;}){return callback.name;}
export const arrowLeafName=(callback=function(){return 1;})=>{return callback.name;};
