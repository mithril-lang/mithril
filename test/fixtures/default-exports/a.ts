class Schema<const T=unknown> {
 private brand!:undefined;
 constructor(readonly value:T) {}
 static capture<const U>(value:U):U{return value}
}
let count=0;
function bump():number{return ++count}
export {Schema as default,Schema as Named,count,bump};
