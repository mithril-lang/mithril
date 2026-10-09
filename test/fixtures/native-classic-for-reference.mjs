// Independent native JavaScript mechanics oracle.
export function reference({mark,test,wait,predicate}){
function updates(value){let x=value;const a=x++;const b=++x;const c=x--;const d=--x;return [a,b,c,d,x];}
function parameter(value){return [value++,++value,value];}
function collect(limit){const out=[];for(let i=0,j=2;i<limit;i++,j--){out.push([i,j]);}return out;}
function closures(limit){const out=[];for(let i=0;i<limit;i++){out.push(()=>i);}return out;}
function header(){const out=[];for(let i=mark('init',0);test(i);mark('update',i++)){out.push(i);mark('body',i);}return out;}
function control(mode){const out=[];for(let i=0;i<3;mark('update',i++)){try{out.push(i);if(mode==='continue')continue;if(mode==='break')break;if(mode==='return')return out;throw i;}finally{mark('finally',i);}}return out;}
function external(){let i=0;const out=[];for(mark('init');i<3;i++){out.push(i);}return [out,i];}
function missing(){const out=[];for(;;){out.push('body');break;}return out;}
function constant(){const out=[];for(const i=7;true;){out.push(()=>i);break;}return out;}
function selfTDZ(){for(let i=i;false;){mark('unreachable');}}
function forwardTDZ(){for(let i=j,j=1;false;){mark('unreachable');}}
function shadow(value){const out=[];for(let value=0;value<2;value++){out.push(()=>value);}return [out,value];}
function nested(){const out=[];for(let i=0;i<2;i++){for(let i=0;i<2;i++){switch(i){case 0:continue;default:out.push(i);}}out.push('outer:'+i);}return out;}
function mutate(){const out=[];for(let i=0;i<3;i++){out.push(()=>i);i++;}return out;}
function receiver(limit){const out=[];for(let i=0;i<limit;i++){out.push(()=>[i,this]);}return out;}
function* generate(){for(let i=yield 'init';yield ['test',i];i=yield ['update',i]){yield ()=>i;}return 42;}
async function asyncCollect(limit){const out=[];for(let i=await wait(0);await predicate(i,limit);i=await wait(i+1)){out.push(i);}return out;}

function wrapped(){return (()=>{for(;;){mark("wrapped");break;}return 42})()}
return {updates,parameter,collect,closures,header,control,external,missing,constant,selfTDZ,forwardTDZ,shadow,nested,mutate,receiver,generate,asyncCollect,wrapped};}
