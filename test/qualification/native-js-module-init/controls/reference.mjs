export function instantiateMithrilNative(grants){
 if(grants===null||typeof grants!=='object')throw new Error('host-grant-mismatch');
 const keys=Reflect.ownKeys(grants);if(keys.length!==2||keys.some(k=>!['observe','after'].includes(k)))throw new Error('host-grant-mismatch');
 const namespace={};
 const early=(0,grants.observe)([read,later,cross,defaults,mutate]);
 let seed=10;
 function read(){return seed}
 function later(){return late}
 function cross(){return read()+2}
 function defaults(value=seed){return value}
 function mutate(value){seed=value;return undefined}
 const registration=(namespace.read=read,namespace.later=later,namespace.cross=cross,namespace.defaults=defaults,namespace.mutate=mutate,undefined);
 const value=cross();const late=20;const done=(0,grants.after)(namespace);
 return {namespace,value};
}
