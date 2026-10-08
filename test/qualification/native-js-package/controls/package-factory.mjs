import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync} from 'node:fs';
const [file]=process.argv.slice(2);const c=vm.createContext({});const m=new vm.SourceTextModule(readFileSync(file,'utf8'),{context:c});await m.link(()=>{throw Error('unexpected external code')});await m.evaluate();
const instantiate=m.namespace.instantiateMithrilNativePackage;let calls=0,reads=0;
const make=()=>{calls++;return {value:42}};const grants={get make(){reads++;return make}};
for(const bad of [null,{}, {...grants,extra:1},Object.assign(Object.create(null),{make,[Symbol('extra')]:true})])assert.throws(()=>instantiate(bad),/host-grant-mismatch/);
// The spread in a deliberately malformed input may read its getter once.
reads=0;assert.equal(calls,0);
const first=instantiate(grants);assert.equal(calls,1);assert.equal(reads,1);assert.deepEqual(Object.keys(first),['left','right']);assert.equal(first.left,first.right);first.left.value=7;assert.equal(first.right.value,7);
const second=instantiate(grants);assert.equal(calls,2);assert.notEqual(first.left,second.left);assert.equal(second.left.value,42);console.log('Shared dependency: once per package, stable linked value identity, independent package instances; exact aggregate grants before initialization.');
