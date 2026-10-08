export function instantiateMithrilNative(grants){let shared=9;return {
mutable:function mutable(a){let state=a;return {get:()=>state,set:(value)=>{state=value}}},
throwValue:function throwValue(a){throw a},
cleanup:function cleanup(body,cleanup){try{return body()}finally{cleanup()}},
has:function has(a,b){return a in b},
recursive:function recursive(a){function visit(item){return item?visit(false):a}return visit},
defaults:function defaults(factory,value=factory(),tail){return [value,tail]},
tdz:function tdz(a=b,b){return a},
moduleGet:function moduleGet(){return shared},moduleSet:function moduleSet(a){return shared=a},
shadow:function shadow(shared){return shared=>shared}
}}
