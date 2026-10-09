import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,rmSync,mkdirSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {spawnSync,execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
const repo=fileURLToPath(new URL('../../../../',import.meta.url));
if(process.argv[2]==='case'){
 const [kind,entry,coreEntry,loaderEntry,yamlEntry]=process.argv.slice(3);
 const core=await import(pathToFileURL(coreEntry)),loader=await import(pathToFileURL(loaderEntry)),yaml=await import(pathToFileURL(yamlEntry));
 const api=await import(pathToFileURL(entry));
 const groups=[],observations=[],check=(name,fn)=>{fn();groups.push(name)};
 check('Include complete source public identities',()=>{assert.equal(api.default,api.Include);assert.equal(Object.keys(api).length,4);assert.equal(api.Include.name,'Include');assert.equal(api.Include[loader.EntryGroup.key],true);assert.deepEqual(api.Include.inject,['loader'])});
 check('Include static and prototype descriptors retain source metadata',()=>{
  const shape=object=>Reflect.ownKeys(object).map(key=>{const d=Object.getOwnPropertyDescriptor(object,key),fn=value=>value&&{name:value.name,length:value.length,kind:Object.getPrototypeOf(value).constructor.name};return{key:typeof key==='symbol'?'symbol:'+key.description:key,enumerable:d.enumerable,configurable:d.configurable,writable:d.writable,value:typeof d.value==='function'?fn(d.value):typeof d.value==='boolean'||typeof d.value==='number'||typeof d.value==='string'?d.value:typeof d.value,get:fn(d.get),set:fn(d.set)}});
  observations.push({class:shape(api.Include),prototype:shape(api.Include.prototype)});
 });
 check('YAML entry dialect round trip retains lazy JS scalar',()=>{const data=yaml.load('- id: row\n  name: cordis:probe\n  config:\n    x: !!js 1+2\n',{schema:api.entryListSchema});assert.equal(data[0].config.x.__jsExpr,'1+2');assert.deepEqual(yaml.load(yaml.dump(data,{schema:api.entryListSchema}),{schema:api.entryListSchema}),data);observations.push(yaml.dump(data,{schema:api.entryListSchema}))});
 check('JSON dialect does not enable YAML implicit dates',()=>{const d=yaml.load('- config: {date: 2026-10-09}\n',{schema:api.entryListSchema});assert.equal(typeof d[0].config.date,'string')});
 const data=[{id:'group',name:'cordis:group',group:true,config:[{id:'row',name:'cordis:probe',config:{x:1}}]}],warnings=[];
 const warn=(...args)=>warnings.push(args);
 check('unpatched input retains row identity and detached list',()=>{const result=api.applyEntryPatches(data,undefined,warn);assert.notEqual(result,data);assert.equal(result[0],data[0])});
 const patched=api.applyEntryPatches(data,[{id:'row',config:{x:2}},{id:'group',insert:[{id:'new',name:'cordis:probe',config:{x:3}}]},{id:'new',disabled:true}],warn);
 check('nested patch and same-layer inserted row targeting',()=>{assert.equal(patched[0].config[0].config.x,2);assert.equal(patched[0].config[1].disabled,true);assert.equal(data[0].config[0].config.x,1);assert.equal(data[0].config.length,1)});
 check('fresh application can remove prior overlays',()=>{assert.equal(api.applyEntryPatches(data,[],warn)[0].config[0].config.x,1)});
 check('root insertion retains original patch row identity and sequential overrides',()=>{
  const inserted={id:'root-new',name:'cordis:probe'},result=api.applyEntryPatches(data,[{insert:[inserted]},{id:'root-new',disabled:true}],warn);
  assert.equal(result[1],inserted);assert.equal(inserted.disabled,true);assert.equal(data.length,1);
 });
 api.applyEntryPatches(data,[{id:'missing',config:{}},{config:{}},{id:'row',name:'wrong',disabled:true},{id:'missing',insert:[]},{id:'row',insert:[]}],warn);
 check('invalid patches preserve original warnings and input',()=>{assert.equal(warnings.length,5);observations.push(warnings)});
 const dir=mkdtempSync(join(tmpdir(),'mithril-include-live-')),root=new core.Context(),trace=[];
 let owner;
 try{
  root.baseUrl=pathToFileURL(dir+'/').href;root.on('include-probe',x=>trace.push(x));
  owner=await root.plugin(loader.Loader);const runtime=root.loader;
  runtime.builtins.include=api.Include;
  runtime.builtins.probe=(ctx,config)=>{ctx.emit('include-probe',['start',config.x]);return()=>ctx.emit('include-probe','stop')};
  const file=join(dir,'config.yaml');
  writeFileSync(file,'- id: child\n  name: cordis:probe\n  config:\n    x: !!js 1+2\n');
  await runtime.create({id:'include',name:'cordis:include',group:true,config:{path:'./config.yaml'}});await runtime.await();
  const entry=runtime.resolve('include'),tree=entry.subtree;
  check('real Include mounts file-backed tree with literal entry config',()=>{assert.equal(entry.fiber.state,2);assert(tree instanceof api.Include);assert.equal(tree.filename,file);assert.equal(tree.root.data[0].config.x.__jsExpr,'1+2');assert.equal(tree.resolve('child').fiber.config.x,3);assert.deepEqual(trace,[['start',3]])});
  await tree.refresh();await runtime.await();
  check('unchanged content refresh retains running child',()=>{assert.deepEqual(trace,[['start',3]])});
  writeFileSync(file,'- id: child\n  name: cordis:probe\n  config: {x: 4}\n');await tree.refresh();await runtime.await();
  check('changed valid file refresh updates real child',()=>{assert.equal(tree.resolve('child').fiber.config.x,4)});
  for(const invalid of ['', 'bad: shape', '- [broken']){
   writeFileSync(file,invalid);await tree.refresh();await runtime.await();
   check('invalid file retains last good child '+JSON.stringify(invalid),()=>{assert.equal(tree.resolve('child').fiber.config.x,4)});
  }
  await tree._writeFile([{id:'child',name:'cordis:probe',config:{x:5}}]);await tree.read(true);await tree.root.update(tree.applyPatches(tree.data));await runtime.await();
  check('actual YAML temp-write/rename commits and activates config',()=>{assert.equal(yaml.load(readFileSync(file,'utf8'),{schema:api.entryListSchema})[0].config.x,5);assert.equal(tree.resolve('child').fiber.config.x,5)});
  tree.write();await tree.flushWrite();
  check('scheduled persistence drains queue',()=>{assert.equal(tree.pendingWrite,undefined);observations.push(yaml.load(readFileSync(file,'utf8'),{schema:api.entryListSchema}))});
  tree.readonly=true;
  let readonlyError;try{await tree._writeFile([])}catch(error){readonlyError=error}
  check('readonly write refusal preserves file',()=>{assert.equal(readonlyError.message,'cannot overwrite readonly config');assert.equal(yaml.load(readFileSync(file,'utf8'),{schema:api.entryListSchema})[0].config.x,5)});
  tree.readonly=false;rmSync(file);mkdirSync(file);
  tree.writeFile([{id:'child',name:'cordis:probe',config:{x:6}}]);
  let writeError;try{await tree.flushWrite()}catch(error){writeError=error}
  check('actual rename failure rejects queued write',()=>{assert.equal(writeError.code,'EISDIR');assert.equal(tree.pendingWrite,undefined)});
  rmSync(file,{recursive:true});writeFileSync(file,'[]');
  tree.writeFile([{id:'child',name:'cordis:probe',config:{x:6}}]);await tree.flushWrite();
  check('queued write recovers after prior rejection',()=>{assert.equal(yaml.load(readFileSync(file,'utf8'),{schema:api.entryListSchema})[0].config.x,6)});
  check('empty flush returns current write queue',()=>{assert.equal(tree.flushWrite(),tree.writeQueue)});
  const {createRequire,syncBuiltinESMExports}=await import('node:module');
  const hostFs=createRequire(import.meta.url)('node:fs/promises'),hostTimer=createRequire(import.meta.url)('node:timers/promises');
  const rename=hostFs.rename,delay=hostTimer.setTimeout;
  try{
   for(const code of ['EACCES','EBUSY','EPERM']){
    let attempts=0;const delays=[];
    hostFs.rename=async(...args)=>{if(++attempts<=2)throw Object.assign(new Error('fixture transient rename'),{code});return rename(...args)};
    hostTimer.setTimeout=(ms,...args)=>{delays.push(ms);return delay(ms,...args)};syncBuiltinESMExports();
    await tree._writeFile([{id:'child',name:'cordis:probe',config:{x:6}}]);
    check('actual host rename retries '+code,()=>{assert.equal(attempts,3);assert.deepEqual(delays,[50,100]);assert.equal(yaml.load(readFileSync(file,'utf8'),{schema:api.entryListSchema})[0].config.x,6)});
   }
   let attempts=0;const delays=[];
   hostFs.rename=async()=>{attempts++;throw Object.assign(new Error('fixture permanent access denial'),{code:'EACCES'})};
   hostTimer.setTimeout=(ms,...args)=>{delays.push(ms);return delay(ms,...args)};syncBuiltinESMExports();
   let exhausted;try{await tree._writeFile([])}catch(error){exhausted=error}
   check('retry limit preserves final host failure',()=>{assert.equal(exhausted.code,'EACCES');assert.equal(attempts,11);assert.deepEqual(delays,[50,100,150,200,250,300,350,400,450,500]);assert.equal(yaml.load(readFileSync(file,'utf8'),{schema:api.entryListSchema})[0].config.x,6)});
  }finally{hostFs.rename=rename;hostTimer.setTimeout=delay;syncBuiltinESMExports()}
  await tree.read(true);await tree.root.update(tree.data);await runtime.await();
  const includeFiber=entry.fiber;
  await runtime.update('include',{config:{path:'./config.yaml',patches:[{id:'child',config:{x:9}}]}});await runtime.await();
  check('same-path config patch updates retain Include fiber and parsed source data',()=>{assert.equal(entry.fiber,includeFiber);assert.equal(tree.config.patches[0].config.x,9);assert.equal(tree.resolve('child').fiber.config.x,9);assert.equal(tree.data[0].config.x,6)});
  await runtime.update('include',{config:{path:'./config.yaml'}});await runtime.await();
  check('removed config patch restores parsed source data',()=>{assert.equal(entry.fiber,includeFiber);assert.equal(tree.resolve('child').fiber.config.x,6)});
  writeFileSync(join(dir,'invalid.json'),'{}');
  await runtime.create({id:'invalid',name:'cordis:include',group:true,config:{path:'./invalid.json',initial:[]}});await runtime.await();
  check('existing invalid file does not fall back to initial',()=>{assert.equal(runtime.resolve('invalid').fiber.state,3);assert.equal(runtime.resolve('invalid').fiber._error?.name,'TypeError');assert.equal(readFileSync(join(dir,'invalid.json'),'utf8'),'{}')});
  await runtime.create({id:'json',name:'cordis:include',group:true,config:{path:'./initial.json',initial:[{id:'initial',name:'cordis:probe',config:{x:7}}]}});await runtime.await();
  check('missing JSON file initializes through actual write',()=>{assert.equal(runtime.resolve('json').subtree.resolve('initial').fiber.config.x,7);assert.equal(JSON.parse(readFileSync(join(dir,'initial.json'),'utf8'))[0].config.x,7)});
  await runtime.create({id:'missing',name:'cordis:include',group:true,config:{path:'./missing.yaml'}});await runtime.await();
  check('missing file without initial preserves failure',()=>{assert.equal(runtime.resolve('missing').fiber.state,3);observations.push(runtime.resolve('missing').fiber._error?.message.replaceAll(dir,'<dir>'))});
  await runtime.create({id:'bad-extension',name:'cordis:include',group:true,config:{path:'./config.txt'}});await runtime.await();
  check('unsupported extension preserves constructor failure',()=>{assert.equal(runtime.resolve('bad-extension').fiber.state,3);observations.push(runtime.resolve('bad-extension').fiber._error?.message)});
 }finally{await owner?.dispose();await root.fiber.dispose();rmSync(dir,{recursive:true,force:true})}
 check('Include owner drains and releases registry',()=>assert.equal(root.registry.size,0));
 console.log(JSON.stringify({groups,observations}));
}else{
 const [candidate,nativeYaml]=process.argv.slice(2);
 const {mkdtempSync,mkdirSync,copyFileSync,symlinkSync,rmSync}=await import('node:fs'),{tmpdir}=await import('node:os'),{createHash}=await import('node:crypto');
 const dir=mkdtempSync(join(tmpdir(),'mithril-loader-sdk-oracle-'));
 const hash=path=>createHash('sha256').update(readFileSync(path)).digest('hex');
 try{
  const fixture=join(repo,'test/fixtures/loader-sdk'),p=JSON.parse(readFileSync(join(fixture,'provenance.json'),'utf8'));
  for(const [file,sha]of Object.entries(p.fixtures))assert.equal(hash(join(fixture,file)),sha);
  const loader=join(dir,'loader');mkdirSync(loader,{recursive:true});
  for(const file of Object.keys(p.fixtures).filter(f=>f.startsWith('runtime/'))){const target=join(loader,file.slice(8));mkdirSync(dirname(target),{recursive:true});copyFileSync(join(fixture,file),target)}
  writeFileSync(join(dir,'package.json'),JSON.stringify({type:'module'}));
  for(const [name,source,field,entry]of [['cordis','cordis-core','hashes','index.mjs'],['cosmokit','cosmokit-package','emitted_javascript_sha256','index.js']]){
   const f=join(repo,'test/fixtures',source),proof=JSON.parse(readFileSync(join(f,'provenance.json'),'utf8')),pkg=join(dir,'node_modules/@deepseek-ai',name);mkdirSync(pkg,{recursive:true});
   for(const [file,sha]of Object.entries(proof[field])){assert.equal(hash(join(f,file)),sha);copyFileSync(join(f,file),join(pkg,file))}
   writeFileSync(join(pkg,'package.json'),JSON.stringify({type:'module',exports:'./'+entry}));
  }
  symlinkSync('cosmokit',join(dir,'node_modules/@deepseek-ai/cosmokit-package'));
  const pkg=join(dir,'node_modules/@deepseek-ai/cordis-plugin-loader');mkdirSync(pkg,{recursive:true});writeFileSync(join(pkg,'package.json'),JSON.stringify({type:'module',exports:'./index.mjs'}));writeFileSync(join(pkg,'index.mjs'),"export * from '../../../loader/index.js';export {default} from '../../../loader/index.js';");
  const original=join(dir,'include.mjs');const include=join(repo,'test/fixtures/include-sdk'),includeProof=JSON.parse(readFileSync(join(include,'provenance.json'),'utf8'));
  for(const [file,sha]of Object.entries(includeProof.fixtures))assert.equal(hash(join(include,file)),sha);
  copyFileSync(join(include,'runtime/index.mjs'),original);
  const yamlProof=JSON.parse(readFileSync(join(repo,'test/fixtures/native-esm-namespaces/provenance.json'),'utf8')),archive=join(repo,'test/fixtures/native-esm-namespaces/js-yaml-4.2.0.tar.gz');
  assert.equal(hash(archive),yamlProof.archive_sha256);
  const yamlDir=join(dir,'node_modules/js-yaml');mkdirSync(yamlDir,{recursive:true});execFileSync('tar',['-xzf',join(repo,'test/fixtures/native-esm-namespaces/js-yaml-4.2.0.tar.gz'),'-C',yamlDir,'--strip-components=1']);
  assert.equal(JSON.parse(readFileSync(join(yamlDir,'package.json'),'utf8')).version,'4.2.0');
  const yamlEntry=join(yamlDir,'dist/js-yaml.mjs');
  function run(kind,entry,core,loaderEntry,yamlRuntime=yamlEntry){const r=spawnSync(process.execPath,[fileURLToPath(import.meta.url),'case',kind,entry,core,loaderEntry,yamlRuntime],{encoding:'utf8',timeout:30000,env:{...process.env,CORDIS_SHARED:'{"startTime":0}'}});assert.equal(r.status,0,r.stdout+r.stderr);return JSON.parse(r.stdout)}
  const expected=run('original',original,join(dir,'node_modules/@deepseek-ai/cordis/index.mjs'),join(loader,'index.js'));
  const meta=JSON.parse(readFileSync(candidate+'.log','utf8'));
  assert.equal(meta['external-modules']['js.yaml'],nativeYaml?'@mithril/native-yaml':'js-yaml');
  if(nativeYaml){const yamlMeta=JSON.parse(readFileSync(nativeYaml+'.log','utf8'));assert.equal(Object.keys(yamlMeta['module-files']).length,29);assert.equal(yamlMeta.exports.length,15);assert.equal(yamlMeta['external-modules'],undefined);}
  const candidateModules=join(candidate,'node_modules');mkdirSync(candidateModules,{recursive:true});
  const {unlinkSync}=await import('node:fs');const yamlLink=join(candidateModules,nativeYaml?'@mithril/native-yaml':'js-yaml');mkdirSync(dirname(yamlLink),{recursive:true});symlinkSync(nativeYaml||yamlDir,yamlLink);
  let actual;
  try{actual=run('candidate-sdk',join(candidate,'index.mjs'),join(candidate,meta['module-files'].cordis),join(candidate,meta['module-files']['loader.index']),nativeYaml?join(nativeYaml,'index.mjs'):yamlEntry)}finally{unlinkSync(yamlLink)}

  assert.deepEqual(actual,expected);
  assert.equal(actual.groups.length,32,'Full Include runtime group coverage');
  console.log('Include SDK runtime: '+actual.groups.length+' paired full-source groups; own Loader/Cordis, '+(nativeYaml?'own checked YAML runtime':'pinned external YAML')+', Node execution only.');
 }finally{rmSync(dir,{recursive:true,force:true})}
}
