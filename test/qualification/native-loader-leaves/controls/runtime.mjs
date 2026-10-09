import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,mkdirSync,copyFileSync,rmSync} from 'node:fs';
import {resolve,join,dirname} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const repo=fileURLToPath(new URL('../../../../',import.meta.url)),entry=process.argv[3];
if(process.argv[2]==='case'){
 const utils=await import(pathToFileURL(entry)),diff=process.argv[4]?await import(pathToFileURL(process.argv[4])):utils;
 const S=(await import(pathToFileURL(process.argv[5]))).default;
 const groups=[];function check(name,body){body();groups.push(name)}
 check('public functions and evaluate source',()=>{for(const [name,length]of [['evaluate',2],['interpolate',2],['isJsExpr',1]]){assert.equal(utils[name].name,name==='evaluate'?'anonymous':name);assert.equal(utils[name].length,length)}assert.equal(diff.equalExceptVolatile.name,'equalExceptVolatile');assert.equal(diff.equalExceptVolatile.length,3)});
 check('context expression',()=>{assert.equal(utils.evaluate({a:2},'a+3'),5);const ctx={a:2};assert.equal(utils.evaluate(ctx,'a++'),2);assert.equal(ctx.a,3)});
 check('inherited context',()=>{assert.equal(utils.evaluate(Object.create({a:7}),'a+1'),8)});
 check('unscopables',()=>{const ctx={Number:()=>0,[Symbol.unscopables]:{Number:true}};assert.equal(utils.evaluate(ctx,'Number("3")'),3)});
 check('expression parameter shadow',()=>{assert.equal(utils.evaluate({a:7,expr:'a+2'},'a'),9)});
 check('expression errors',()=>{assert.throws(()=>utils.evaluate({},'missing'),ReferenceError);assert.throws(()=>utils.evaluate({},'broken )'),SyntaxError)});
 check('expression classification',()=>{for(const value of [null,undefined,0,'x',true])assert.equal(utils.isJsExpr(value),false);assert.equal(utils.isJsExpr({__jsExpr:'a'}),true);assert.equal(utils.isJsExpr(Object.create({__jsExpr:'a'})),true);assert.equal(utils.isJsExpr(Object.assign(Object.create(null),{__jsExpr:'a'})),false)});
 check('recursive interpolate and input preservation',()=>{const input={a:{__jsExpr:'n+1'},b:[{__jsExpr:'n*2'},null,false],c:'text'};assert.deepEqual(utils.interpolate({n:3},input),{a:4,b:[6,null,false],c:'text'});assert.deepEqual(input,{a:{__jsExpr:'n+1'},b:[{__jsExpr:'n*2'},null,false],c:'text'})});
 check('opaque return identity',()=>{const fn=()=>1;assert.equal(utils.interpolate({},fn),fn);assert.equal(utils.interpolate({},undefined),undefined)});
 const schema=(type,dict={},meta={})=>({['~standard']:{vendor:'schemastery'},type,dict,meta});
 check('raw absent and foreign schema',()=>{assert.equal(diff.equalExceptVolatile({a:1},{a:1},undefined),true);assert.equal(diff.equalExceptVolatile({a:1},{a:2},undefined),false);assert.equal(diff.equalExceptVolatile({a:1},{a:2},{['~standard']:{vendor:'foreign'}}),false)});
 check('fixed volatile path',()=>{const s=schema('object',{stable:schema('number'),volatile:schema('number',{}, {volatile:true})});assert.equal(diff.equalExceptVolatile({stable:1,volatile:2},{stable:1,volatile:3},s),true);assert.equal(diff.equalExceptVolatile({stable:1},{stable:2},s),false);assert.equal(diff.equalExceptVolatile({unknown:1},{unknown:2},s),false)});
 check('nested/default object',()=>{const child=schema('object',{value:schema('number'),volatile:schema('number',{}, {volatile:true})},{default:{value:2}});const s=schema('object',{child});assert.equal(diff.equalExceptVolatile({}, {child:{value:2,volatile:4}},s),true);assert.equal(diff.equalExceptVolatile({}, {child:{value:3}},s),false)});
 check('schema backedge and input immutability',()=>{const s=schema('object');s.dict.child=s;const a={child:{value:1}},b={child:{value:2}};assert.equal(diff.equalExceptVolatile(a,b,s),false);assert.deepEqual(a,{child:{value:1}});assert.deepEqual(b,{child:{value:2}})});
 check('expression/opaque equality',()=>{const s=schema('object',{n:schema('number',{}, {volatile:true})});assert.equal(diff.equalExceptVolatile({__jsExpr:'a'},{__jsExpr:'b'},s),false);class Item{constructor(n){this.n=n}}assert.equal(diff.equalExceptVolatile(new Item(1),new Item(2),s),false)});
 check('actual Schema volatile and unknown paths',()=>{const s=S.object({stable:S.number(),volatile:S.number().volatile()});assert.equal(diff.equalExceptVolatile({stable:1,volatile:2},{stable:1,volatile:3},s),true);assert.equal(diff.equalExceptVolatile({stable:1},{stable:2},s),false);assert.equal(diff.equalExceptVolatile({unknown:1},{unknown:2},s),false)});
 check('actual Schema defaults and backedges',()=>{const child=S.object({value:S.number(),volatile:S.number().volatile()}).default({value:2}),s=S.object({child});assert.equal(diff.equalExceptVolatile({}, {child:{value:2,volatile:4}},s),true);assert.equal(diff.equalExceptVolatile({}, {child:{value:3}},s),false);s.dict.child=s;assert.equal(diff.equalExceptVolatile({child:{a:1}},{child:{a:2}},s),false)});
 check('no validators transforms hooks or input mutation',()=>{let calls=0;const s=S.object({n:S.transform(S.number(),()=>{calls++;throw Error('unexpected transform')})});s['~standard'].validate=()=>{calls++;throw Error('unexpected validation')};const a=Object.freeze({n:1}),b=Object.freeze({n:1});assert.equal(diff.equalExceptVolatile(a,b,s),true);assert.equal(calls,0);assert.deepEqual(a,{n:1});assert.deepEqual(b,{n:1})});
 check('actual malformed schema and raw expressions',()=>{assert.throws(()=>diff.equalExceptVolatile({}, {}, {}),TypeError);const s=S.object({n:S.number().volatile()});assert.equal(diff.equalExceptVolatile({__jsExpr:'a'},{__jsExpr:'b'},s),false)});
 check('public function descriptors',()=>{for(const fn of [utils.evaluate,utils.interpolate,utils.isJsExpr,diff.equalExceptVolatile]){assert.equal(Object.getPrototypeOf(fn),Function.prototype);for(const key of ['name','length']){const d=Object.getOwnPropertyDescriptor(fn,key);assert.equal(d.writable,false);assert.equal(d.enumerable,false);assert.equal(d.configurable,true)}}});
 const surface=[...new Set([...Object.keys(utils),...Object.keys(diff)])].sort();
 assert.deepEqual(surface,['equalExceptVolatile','evaluate','interpolate','isJsExpr']);
 console.log(JSON.stringify({groups,surface,evaluateSource:utils.evaluate.toString()}));
}else{
 const [candidate,schemaEntry,compiler]=process.argv.slice(2),ts=(await import(pathToFileURL(resolve(compiler)))).default,dir=mkdtempSync(join(tmpdir(),'mithril-loader-leaves-oracle-'));
 assert.equal(ts.version,'6.0.3');
 try{
  const leaf=join(repo,'test/fixtures/loader-leaves'),provenance=JSON.parse(readFileSync(join(leaf,'provenance.json'),'utf8'));
  for(const [file,hash]of Object.entries(provenance.fixtures))assert.equal(createHash('sha256').update(readFileSync(join(leaf,file))).digest('hex'),hash);
  const fixture=join(repo,'test/fixtures/cosmokit-package'),p=JSON.parse(readFileSync(join(fixture,'provenance.json'),'utf8')),pkg=join(dir,'node_modules/@deepseek-ai/cosmokit');mkdirSync(pkg,{recursive:true});
  for(const [file,hash]of Object.entries(p.emitted_javascript_sha256)){assert.equal(createHash('sha256').update(readFileSync(join(fixture,file))).digest('hex'),hash);copyFileSync(join(fixture,file),join(pkg,file))}
  writeFileSync(join(pkg,'package.json'),JSON.stringify({type:'module',exports:'./index.js'}));
  const erase=file=>ts.transpileModule(readFileSync(file,'utf8'),{fileName:file,compilerOptions:{target:ts.ScriptTarget.ES2024,module:ts.ModuleKind.ESNext}}).outputText;
  const utils=join(dir,'utils.mjs'),diff=join(dir,'diff.mjs'),schema=join(dir,'schema.mjs');
  writeFileSync(utils,erase(join(leaf,'original-utils.ts')));writeFileSync(diff,erase(join(leaf,'original-diff.ts')).replace("'./utils.ts'","'./utils.mjs'"));
  const schemaFixture=join(repo,'test/fixtures/schemastery-declarations'),sp=JSON.parse(readFileSync(join(schemaFixture,'provenance.json'),'utf8'));
  for(const [file,hash]of Object.entries(sp.fixtures))assert.equal(createHash('sha256').update(readFileSync(join(schemaFixture,file))).digest('hex'),hash);
  writeFileSync(schema,erase(join(schemaFixture,'original-index.ts')));
  function run(source,other,schema){const r=spawnSync(process.execPath,[fileURLToPath(import.meta.url),'case',source,other,schema],{encoding:'utf8',timeout:30000});assert.equal(r.status,0,r.stdout+r.stderr);return JSON.parse(r.stdout)}
  const expected=run(utils,diff,schema),actual=run(join(candidate,'index.mjs'),join(candidate,'index.mjs'),join(schemaEntry,'index.mjs'));assert.deepEqual(actual,expected);
  console.log('Loader leaves runtime: '+actual.groups.length+' original/candidate groups, actual original/own Schema, exact dynamic evaluate source, full own nine-module closure; Node execution only.');
 }finally{rmSync(dir,{recursive:true,force:true})}
}
