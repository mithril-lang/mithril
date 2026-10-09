// Independent native JavaScript mechanics oracle.
export function reference({label,discriminant,mark,wait}){
function dispatch(value) { const log=[]; switch(value){case label('first',1):log.push('one');case label('second',2):log.push('two');break;default:log.push('default');case label('third',3):log.push('three');}return log; }
function evaluated(){switch(discriminant()){case label('a',1):return 'one';default:return 'other';}}
function expression(value){switch(value){case 1:mark('one');break;default:mark('default');}return 42;}
function shared(value){const out=[];switch(value){case 0:out.push(()=>x);break;case 1:let x=7;out.push(()=>x);case 2:out.push(typeof x);x=9;out.push(()=>x);break;default:out.push('default');}return out;}
function labelTDZ(value){switch(value){case x:return 'hit';case 1:const x=1;return x;}return 'miss';}
function resultScope(value){const outside=3;switch(value){case 1:const local=7;mark(local);break;}return outside;}
function control(value,mode){switch(value){case 1:try{if(mode==='break')break;if(mode==='return')return 'returned';throw 'sentinel';}finally{mark('finally');}default:mark('default');}return 'done';}
function nested(object){const out=[];for(const key in object){switch(key){case 'skip':continue;case 'break':break;default:out.push(key);}out.push('after:'+key);}return out;}
function* generate(value){switch(value){case yield 'label':yield 'matched';break;default:yield 'default';}return 42;}
async function asyncDispatch(value){switch(await wait(value)){case await wait(1):mark('one');break;default:mark('default');}return 42;}
function closures(value){const out=[];switch(value){case 1:const x=7;out.push(()=>[x,this]);break;default:out.push(()=>this);}return out;}
function empty(value){switch(value){}return 42;}
function shadow(value){switch(value){case 1:let value=7;return ()=>value;default:return ()=>value;} }
function nestedSwitch(value){const out=[];switch(value){case 1:switch(value){case 1:out.push('inner');break;}out.push('outer');break;default:out.push('default');}return out;}

function wrapped(value){return (()=>{switch(value){case 1:mark("one");break;default:mark("default");}return 42})()}
return {dispatch,evaluated,expression,shared,labelTDZ,resultScope,control,nested,generate,asyncDispatch,closures,empty,shadow,nestedSwitch,wrapped};}
