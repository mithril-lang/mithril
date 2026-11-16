import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const [out]=process.argv.slice(2);
const archive=fileURLToPath(new URL('./js-yaml-4.2.0.tar.gz',import.meta.url));
assert.equal(createHash('sha512').update(readFileSync(archive)).digest('base64'),'ePWsvanv0DWuDRsW8dnt+R4jQ31SCRCQ7hhNcPXZPsoBZiemuZNYGf7adZdqX2D86j6rvKp3RpCxVTSb8WQlOw==');
for(const [name,type,body]of [
 ['fixture.external','module','export let count=1;export function inc(){count++}export default {tag:"external"};'],
 ['fixture.cjs','commonjs','exports.count=1;exports.inc=function(){exports.count++};']]){
 const pkg=join(out,'node_modules',name);mkdirSync(pkg,{recursive:true});
 writeFileSync(join(pkg,'package.json'),JSON.stringify({name,type,exports:'./index.js'}));writeFileSync(join(pkg,'index.js'),body);
}
const yaml=join(out,'node_modules/js-yaml');mkdirSync(yaml,{recursive:true});
// This exact immutable archive is verified against the original lockfile before extraction.
execFileSync('tar',['-xzf',archive,'-C',yaml,'--strip-components=1']);
assert.equal(JSON.parse(readFileSync(join(yaml,'package.json'),'utf8')).version,'4.2.0');
writeFileSync(join(out,'original-leaf.mjs'),'import * as rootNs from "./original.mjs";export let count=1;export function inc(){return count=count+1};export function readView(){return rootNs.view};export default "local";');
writeFileSync(join(out,'original.mjs'),'import * as ns from "fixture.external";import * as again from "fixture.external";import {count} from "fixture.external";import * as cjs from "fixture.cjs";import * as yaml from "js-yaml";import * as leaf from "./original-leaf.mjs";export const view=ns;export {ns,again,count,cjs,yaml,leaf};export function load(){return import("fixture.external")};export function write(){return ns.count=7};');
const candidate=await import(pathToFileURL(join(out,'index.mjs'))),original=await import(pathToFileURL(join(out,'original.mjs')));
assert.deepEqual(Object.keys(candidate),Object.keys(original));
for(const name of ['ns','again','cjs','yaml']){
 assert.equal(candidate[name],original[name],name+' actual cached module namespace identity');
 assert.equal(Object.getPrototypeOf(candidate[name]),null);
 assert.equal(Object.isExtensible(candidate[name]),false);
 assert.equal(Object.prototype.toString.call(candidate[name]),'[object Module]');
 const actual=Object.getOwnPropertyDescriptors(candidate[name]),expected=Object.getOwnPropertyDescriptors(original[name]);
 assert.deepEqual(Reflect.ownKeys(actual),Reflect.ownKeys(expected));
 for(const key of Reflect.ownKeys(actual))for(const field of Reflect.ownKeys(actual[key]))assert.equal(actual[key][field],expected[key][field]);
}
assert.equal(candidate.ns,candidate.again);assert.equal(candidate.view,candidate.ns);
assert.equal(await candidate.load(),candidate.ns);assert.equal(await original.load(),candidate.ns);
candidate.ns.inc();assert.equal(candidate.count,2);assert.equal(original.count,2);assert.equal(candidate.view.count,2);
original.ns.inc();assert.equal(candidate.count,3);
function failure(fn){try{fn()}catch(e){return[e.name,e.message]}assert.fail('Expected native namespace refusal')}
assert.equal(failure(candidate.write)[0],"TypeError");assert.deepEqual(failure(candidate.write),failure(original.write));
assert.equal(candidate.cjs.count,1);candidate.cjs.inc();assert.equal(candidate.cjs.count,1);assert.equal(candidate.cjs.default.count,2);
assert.deepEqual(Object.keys(candidate.leaf),Object.keys(original.leaf));
assert.equal(candidate.leaf.default,original.leaf.default);
assert.equal(candidate.leaf.readView(),candidate.view);assert.equal(original.leaf.readView(),original.view);
assert.equal(Object.getPrototypeOf(candidate.leaf),null);assert.equal(Object.isExtensible(candidate.leaf),false);
for(const module of [candidate,original]){assert.equal(module.leaf.inc(),2);assert.equal(module.leaf.count,2)}
const documents=['name: test\nitems: [1, true, null]\n','base: &base {a: 1}\ncopy: *base\n','date: 2026-10-09\nfloat: .inf\n'];
for(const text of documents)assert.deepEqual(candidate.yaml.load(text),original.yaml.load(text));
assert.equal(candidate.yaml.Type,original.yaml.Type);assert.equal(candidate.yaml.default,original.yaml.default);
assert.deepEqual(failure(()=>candidate.yaml.load('bad: [broken')),failure(()=>original.yaml.load('bad: [broken')));
assert.equal(candidate.yaml.dump({items:[1,true,null]}),original.yaml.dump({items:[1,true,null]}));
console.log('Native namespace contract: actual ESM/CJS/cache identity, null prototype/descriptors, mixed named live bindings, dynamic import identity, readonly assignment, local namespace and pinned original js-yaml@4.2.0 parser/serializer/error behavior.');
