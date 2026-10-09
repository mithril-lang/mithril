import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,copyFileSync,mkdtempSync,rmSync,symlinkSync} from 'node:fs';
import {join,dirname,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';

// Execute the unchanged pinned test bodies in isolated processes. Only the
// small assertion adapter replaces Vitest; the type assertion is not counted
// as runtime or declaration evidence.
if(process.argv[2]==='case'){
  const tests=[];let suite='';
  globalThis.scopeTest={
    describe(name,body){const prior=suite;suite=prior+'/'+name;body();suite=prior},
    it(name,body){tests.push({name:suite+'/'+name,body})},
    vi:{fn(implementation=()=>undefined){const fn=(...args)=>{fn.calls.push(args);return implementation(...args)};fn.calls=[];return fn}},
    expectTypeOf(){return{toEqualTypeOf(){}}},
    expect(value){
      const matcher={
        toBe(expected){assert.equal(value,expected)},
        toEqual(expected){assert.deepEqual(value,expected)},
        toBeUndefined(){assert.equal(value,undefined)},
        toBeDefined(){assert.notEqual(value,undefined)},
        toContain(expected){assert.ok(value.includes(expected))},
        toThrow(expected){assert.throws(value,error=>expected instanceof Error?error===expected:expected instanceof RegExp?expected.test(error.message):typeof expected==='string'?error.message.includes(expected):true)},
        toHaveBeenCalled(){assert.ok(value.calls.length)},
        toHaveBeenCalledWith(...expected){assert.ok(value.calls.some(call=>call.length===expected.length&&expected.every((x,i)=>x?.scopeAny?call[i] instanceof x.scopeAny:(()=>{try{assert.deepEqual(call[i],x);return true}catch{return false}})())))},
      };
      matcher.not={toHaveBeenCalled(){assert.equal(value.calls.length,0)}};
      return matcher;
    },
  };
  globalThis.scopeTest.expect.any=type=>({scopeAny:type});
  await import(pathToFileURL(resolve(process.argv[3])));
  await import(pathToFileURL(resolve(process.argv[4])));
  const groups=[];
  for(const test of tests){await test.body();groups.push(test.name)}
  const api=await import(pathToFileURL(resolve(process.argv[5])));
  const shape=object=>Reflect.ownKeys(object).filter(k=>k!=='prototype').map(k=>{const d=Object.getOwnPropertyDescriptor(object,k);return{key:typeof k==='symbol'?String(k):k,enumerable:d.enumerable,configurable:d.configurable,writable:d.writable,value:typeof d.value==='function'?{name:d.value.name,length:d.value.length}:typeof d.value,get:d.get&&{name:d.get.name,length:d.get.length},set:d.set&&{name:d.set.name,length:d.set.length}}});
  const surface=Object.keys(api).sort().map(name=>({name,shape:shape(api[name]),prototype:api[name].prototype?shape(api[name].prototype):null}));
  console.log(JSON.stringify({groups,surface}));
}else{
  const [candidate,compiler]=process.argv.slice(2);
  const repo=fileURLToPath(new URL('../../../../',import.meta.url));
  const dir=mkdtempSync(join(tmpdir(),'mithril-scope-oracle-'));
  const hash=file=>createHash('sha256').update(readFileSync(file)).digest('hex');
  try{
    const fixture=join(repo,'test/fixtures/scope-core');
    const proof=JSON.parse(readFileSync(join(fixture,'provenance.json'),'utf8'));
    for(const[file,sha]of Object.entries(proof.fixtures)){const filePath=join(fixture,file);assert.equal(hash(filePath),sha);const bytes=readFileSync(filePath);assert.equal(createHash('sha1').update(Buffer.from('blob '+bytes.length+'\0')).update(bytes).digest('hex'),proof.originalGitBlobs[file])}
    for(const[file,sha]of Object.entries(proof.mithrilSources))assert.equal(hash(join(repo,'examples',file)),sha);
    writeFileSync(join(dir,'package.json'),JSON.stringify({type:'module'}));
    for(const[name,source,field,entry]of [['cordis','cordis-core','hashes','index.mjs'],['cosmokit','cosmokit-package','emitted_javascript_sha256','index.js']]){
      const f=join(repo,'test/fixtures',source),p=JSON.parse(readFileSync(join(f,'provenance.json'),'utf8')),pkg=join(dir,'node_modules/@deepseek-ai',name);mkdirSync(pkg,{recursive:true});
      for(const[file,sha]of Object.entries(p[field])){assert.equal(hash(join(f,file)),sha);copyFileSync(join(f,file),join(pkg,file))}
      writeFileSync(join(pkg,'package.json'),JSON.stringify({type:'module',exports:'./'+entry}));
    }
    symlinkSync('cosmokit',join(dir,'node_modules/@deepseek-ai/cosmokit-package'));
    const ts=(await import(pathToFileURL(resolve(compiler)))).default;assert.equal(ts.version,'6.0.3');
    const erase=(text,file)=>ts.transpileModule(text,{fileName:file,compilerOptions:{target:ts.ScriptTarget.ES2024,module:ts.ModuleKind.ESNext}}).outputText;
    for(const leaf of ['index','store'])writeFileSync(join(dir,leaf+'.mjs'),erase(readFileSync(join(fixture,'original-'+leaf+'.ts'),'utf8'),'scope-'+leaf+'.ts').replaceAll("'./store.ts'","'./store.mjs'").replaceAll("'./index.ts'","'./index.mjs'"));
    const metadata=JSON.parse(readFileSync(candidate+'.log','utf8'));
    for(const mode of ['original','candidate']){
      const entry=mode==='original'?join(dir,'index.mjs'):join(candidate,'index.mjs');
      const core=mode==='original'?join(dir,'node_modules/@deepseek-ai/cordis/index.mjs'):join(candidate,metadata['module-files']['cordis.context']);
      for(const leaf of ['scope','store']){
        const source=erase(readFileSync(join(fixture,leaf+'.spec.ts'),'utf8'),leaf+'.spec.ts')
          .replace(/import \{([^}]+)\} from 'vitest';/, 'const {$1} = globalThis.scopeTest;')
          .replaceAll("'@deepseek-ai/cordis'",JSON.stringify(pathToFileURL(core).href))
          .replaceAll("'@deepseek-ai/dsh-scope'",JSON.stringify(pathToFileURL(entry).href));
        writeFileSync(join(dir,mode+'-'+leaf+'.mjs'),source);
      }
    }
    const run=mode=>{const r=spawnSync(process.execPath,[fileURLToPath(import.meta.url),'case',join(dir,mode+'-scope.mjs'),join(dir,mode+'-store.mjs'),mode==='original'?join(dir,'index.mjs'):join(candidate,'index.mjs')],{encoding:'utf8',timeout:30000,env:{...process.env,CORDIS_SHARED:'{"startTime":0}'}});assert.equal(r.status,0,r.stdout+r.stderr);return JSON.parse(r.stdout)};
    const expected=run('original'),actual=run('candidate');assert.deepEqual(actual,expected);assert.equal(actual.groups.length,21);
    console.log('Scope core runtime: '+actual.groups.length+' unchanged original-test groups paired against complete own Scope and Cordis runtime; Node execution only; type assertions excluded.');
  }finally{rmSync(dir,{recursive:true,force:true})}
}
