import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
const base=dirname(fileURLToPath(import.meta.url));
if(process.argv[2]==='case'){
 const api=await import(pathToFileURL(resolve(process.argv[3]))),core=await import(pathToFileURL(resolve(process.argv[4]))),groups=[];const S=(await import(pathToFileURL(resolve(process.argv[5])))).default;
 const check=(name,fn)=>{fn();groups.push(name)};
 const key=x=>typeof x==='symbol'?'symbol:'+x.description:'string:'+x;
 const metadata=[];
 check('complete public source surface and default identity',()=>{assert.equal(api.default,api.Loader);assert.equal(Object.keys(api).length,13)});
 check('all public class static/prototype function metadata',()=>{
  for(const name of ['Loader','Entry','EntryGroup','EntryTree','Group','Realm','LocalRealm','GlobalRealm']){
   const C=api[name];assert.equal(C.name,name);
   const shape=object=>Reflect.ownKeys(object).filter(k=>k!=='prototype').map(k=>{const d=Object.getOwnPropertyDescriptor(object,k),functionShape=f=>f&&{name:f.name,length:f.length};return{key:key(k),enumerable:d.enumerable,configurable:d.configurable,writable:d.writable,value:typeof d.value==='function'?functionShape(d.value):typeof d.value==='symbol'?key(d.value):typeof d.value==='string'||typeof d.value==='number'||typeof d.value==='boolean'?d.value:typeof d.value,get:functionShape(d.get),set:functionShape(d.set)};});
   metadata.push({name,length:C.length,static:shape(C),prototype:shape(C.prototype)});
  }
  assert.equal(typeof api.ModuleLoader,'object');
  metadata.push({namespace:'ModuleLoader',members:Reflect.ownKeys(api.ModuleLoader).map(k=>{const value=api.ModuleLoader[k];return{key:key(k),type:typeof value,name:typeof value==='function'?value.name:undefined,length:typeof value==='function'?value.length:undefined}})});
 });
 const ctx=new core.Context(),tree=new api.EntryTree(ctx);
 check('actual Context/tree/group ownership',()=>{assert.equal(tree.context,tree.ctx);assert.equal(tree.root.context,tree.ctx);assert.equal(tree.root.tree,tree);assert(tree.root instanceof api.EntryGroup);assert.equal(Object.getPrototypeOf(tree.store),null)});
 check('empty real tree iterator and pending tasks',()=>{assert.deepEqual([...tree.entries()],[]);assert.deepEqual(tree.getTasks(),[]);assert.equal(tree.resolveGroup(null),tree.root)});
 check('existing entry ids retained',()=>{const options={id:'fixed'};assert.equal(tree.ensureId(options),'fixed');assert.deepEqual(options,{id:'fixed'})});
 check('missing real tree lookup errors',()=>{assert.throws(()=>tree.resolve('missing'),{message:'cannot resolve entry missing'});assert.throws(()=>tree.resolve('missing:child'),{message:'cannot resolve entry missing:child'})});
 const loader=new api.Loader(new core.Context(),{baseUrl:'file:///mithril-loader-fixture/'});
 check('actual Loader registration and config',()=>{assert.equal(loader.name,'loader');assert.equal(loader.ctx.loader.name,'loader');metadata.push({serviceRawIdentity:loader.ctx.loader===loader,serviceConfigIdentity:loader.ctx.loader.config===loader.config,serviceBaseUrl:loader.ctx.loader.ctx.baseUrl});assert.equal(loader.ctx.baseUrl,'file:///mithril-loader-fixture/');assert.equal(loader.envData.startTime,0);assert.equal(Object.getPrototypeOf(loader.builtins),null)});
 check('builtin plugin module import',()=>{const token={};loader.builtins.fixture=token;assert.equal(loader.import('cordis:fixture'),token)});
 await tree.await();await loader.await();
 check('empty real Loader lifecycle task drain',()=>{assert.deepEqual(loader.getTasks(),[]);assert.deepEqual([...loader.entries()],[])});

 const lifecycle=[],root=new core.Context(),writes=[];
 class PersistentLoader extends api.Loader{write(){writes.push(this.root.data.map(o=>o.id))}}
 const owner=await root.plugin(PersistentLoader),live=root.loader;
 const plugin=(ctx,config)=>{lifecycle.push(['start',config.x]);ctx.on('loader-probe-owned',()=>lifecycle.push('owned'));return()=>lifecycle.push('stop')};
 live.builtins.worker=plugin;
 await live.create({id:'alpha',name:'cordis:worker',config:{x:1}});await live.await();
 const entry=live.resolve('alpha'),firstFiber=entry.fiber;
 check('real builtin entry starts under owning fiber',()=>{assert.equal(entry.options.id,'alpha');assert.equal(entry.fiber.state,2);assert.equal(entry.fiber.entry,entry);assert.equal(live.locate(entry.fiber),'alpha');assert.deepEqual(lifecycle,[['start',1]])});
 root.emit('loader-probe-owned');
 await live.update('alpha',{config:{x:2}});await live.await();
 check('real config update and owned event lifecycle',()=>{assert.equal(entry.fiber.state,2);assert.equal(entry.fiber.config.x,2);metadata.push({sameFiberAfterUpdate:entry.fiber===firstFiber,trace:lifecycle.slice(),writes:writes.map(x=>x.slice())})});
 await live.update('alpha',{disabled:true});await live.await();await firstFiber.await();
 check('disable preserves raw entry and disposes plugin',()=>{assert.equal(entry.disabled,true);assert.equal(entry.fiber.uid,null);assert.equal(live.root.data.length,1)});
 await live.update('alpha',{disabled:null});await live.await();
 check('reenable restarts real plugin and removes null option',()=>{assert.equal(entry.disabled,false);assert.equal(Object.hasOwn(entry.options,'disabled'),false);assert.equal(entry.fiber.state,2)});
 live.remove('alpha');await live.await();
 check('remove clears store config and owned listeners',()=>{assert.equal(Object.hasOwn(live.store,'alpha'),false);assert.deepEqual(live.root.data,[]);const n=lifecycle.length;root.emit('loader-probe-owned');assert.equal(lifecycle.length,n)});
 metadata.push({lifecycle:lifecycle.slice(),persistence:writes.map(x=>x.slice())});
 await owner.dispose();await root.fiber.dispose();
 check('real Loader owner cleanup',()=>{assert.equal(root.reflect.get('loader',false),undefined);assert.equal(root.registry.size,0)});


 const nestedTrace=[],nestedRoot=new core.Context();
 const nestedOwner=await nestedRoot.plugin(PersistentLoader),nested=nestedRoot.loader;
 nested.builtins.group=api.Group;
 nested.builtins.child=(ctx,config)=>{nestedTrace.push(['start',config.value]);ctx.on('nested-owned',()=>nestedTrace.push('event'));return()=>nestedTrace.push('stop')};
 await nested.create({id:'parent',name:'cordis:group',config:[{id:'child',name:'cordis:child',config:{value:3}}]});await nested.await();
 const parent=nested.resolve('parent'),child=nested.resolve('child');
 check('real nested Group mounts child ownership',()=>{assert(parent.subgroup instanceof api.Group);assert.equal(child.parent,parent.subgroup);assert.equal(child.parent.tree,parent.parent.tree);assert.equal(child.fiber.state,2);assert.deepEqual(nestedTrace,[['start',3]]);metadata.push({nestedEntries:[...nested.entries()].map(e=>e.options.id),nestedLocate:nested.locate(child.fiber)})});
 nestedRoot.emit('nested-owned');
 await nested.update('parent',{config:[{id:'child',name:'cordis:child',config:{value:4}},{id:'sibling',name:'cordis:child',config:{value:5}}]});await nested.await();
 check('real Group update replaces child list and starts sibling',()=>{assert.equal(nested.resolve('child').fiber.config.value,4);assert.equal(nested.resolve('sibling').parent,parent.subgroup);assert.equal(parent.subgroup.data.length,2);metadata.push({nestedUpdate:nestedTrace.slice()})});
 await nested.update('parent',{config:[{id:'sibling',name:'cordis:child',config:{value:6}}]});await nested.await();
 check('Group update disposes omitted children',()=>{assert.equal(Object.hasOwn(nested.store,'child'),false);assert.equal(nested.resolve('sibling').fiber.config.value,6);assert.equal(parent.subgroup.data.length,1)});
 const descendantFiber=nested.resolve('sibling').fiber;const groupFiber=parent.fiber;nested.remove('parent');await nested.await();await groupFiber.await();await descendantFiber.await();
 check('Group removal disposes all descendants and listeners',()=>{assert.deepEqual(Object.keys(nested.store),[]);const n=nestedTrace.length;nestedRoot.emit('nested-owned');assert.equal(nestedTrace.length,n);metadata.push({nestedLifecycle:nestedTrace.slice()})});
 await nestedOwner.dispose();await nestedRoot.fiber.dispose();
 check('nested Group owner drains registry',()=>{assert.equal(nestedRoot.registry.size,0)});


 const volatileRoot=new core.Context(),volatileOwner=await volatileRoot.plugin(PersistentLoader),vol=volatileRoot.loader;
 const volatileTrace=[],volatileEvents=[],refs=[];
 const volatilePlugin=(ctx,config)=>{refs.push(config.live);volatileTrace.push(['start',config.stable,config.live.get()]);ctx.on('loader/volatile-update',paths=>volatileEvents.push(paths));return()=>volatileTrace.push('stop')};
 volatilePlugin.Config=S.object({stable:S.number().required(),live:S.number().required().volatile()});
 vol.builtins.volatile=volatilePlugin;
 await vol.create({id:'volatile',name:'cordis:volatile',config:{stable:1,live:2}});await vol.await();
 const volatileEntry=vol.resolve('volatile'),volatileFiber=volatileEntry.fiber,liveRef=refs[0];
 check('actual Schema volatile config mounts real reference',()=>{assert.equal(volatileFiber.state,2);assert.equal(liveRef.get(),2);assert.equal(Object.isFrozen(liveRef),true)});
 await vol.update('volatile',{config:{stable:1,live:3}});await vol.await();
 check('volatile-only update retains live reference and plugin activation',()=>{assert.equal(volatileEntry.fiber,volatileFiber);assert.equal(volatileEntry.fiber.config.live,liveRef);assert.equal(liveRef.get(),3);assert.equal(refs.length,1);assert.deepEqual(volatileEvents,[[['live']]])});
 await vol.update('volatile',{config:{stable:1,live:'invalid'}});await vol.await();
 check('invalid volatile candidate preserves references and raw config',()=>{assert.equal(liveRef.get(),3);assert.equal(refs.length,1);assert.equal(volatileEntry.options.config.live,'invalid')});
 await vol.update('volatile',{config:{stable:2,live:4}});await vol.await();
 check('ordinary config update follows real plugin lifecycle',()=>{assert.equal(volatileEntry.fiber.config.stable,2);assert.equal(volatileEntry.fiber.config.live.get(),4);metadata.push({volatileLifecycle:volatileTrace.slice(),volatileEvents:volatileEvents.slice(),volatileReferenceRetained:volatileEntry.fiber.config.live===liveRef})});
 vol.remove('volatile');await volatileFiber.await();await vol.await();await volatileOwner.dispose();await volatileRoot.fiber.dispose();
 check('volatile owner cleanup',()=>{assert.equal(volatileRoot.registry.size,0)});

 console.log(JSON.stringify({surface:Object.keys(api).sort(),metadata,groups}));
 }else{
 const [candidate,schemaEntry,compiler]=process.argv.slice(2);
 const {mkdtempSync,mkdirSync,copyFileSync,symlinkSync,rmSync}=await import('node:fs'),{tmpdir}=await import('node:os'),{createHash}=await import('node:crypto');
 const repo=fileURLToPath(new URL('../../../../',import.meta.url)),dir=mkdtempSync(join(tmpdir(),'mithril-loader-sdk-oracle-'));
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
  const ts=(await import(pathToFileURL(resolve(compiler)))).default;assert.equal(ts.version,'6.0.3');
  const sf=join(repo,'test/fixtures/schemastery-declarations'),sp=JSON.parse(readFileSync(join(sf,'provenance.json'),'utf8'));
  for(const [file,sha]of Object.entries(sp.fixtures))assert.equal(hash(join(sf,file)),sha);
  const schema=join(dir,'schema.mjs');writeFileSync(schema,ts.transpileModule(readFileSync(join(sf,'original-index.ts'),'utf8'),{fileName:'schema.ts',compilerOptions:{target:ts.ScriptTarget.ES2024,module:ts.ModuleKind.ESNext}}).outputText);
  function run(entry,core,schema){const r=spawnSync(process.execPath,[fileURLToPath(import.meta.url),'case',entry,core,schema],{encoding:'utf8',timeout:30000,env:{...process.env,CORDIS_SHARED:'{"startTime":0}'}});assert.equal(r.status,0,r.stdout+r.stderr);return JSON.parse(r.stdout)}
  const expected=run(join(loader,'index.js'),join(dir,'node_modules/@deepseek-ai/cordis/index.mjs'),schema);
  const meta=JSON.parse(readFileSync(candidate+'.log','utf8'));
  const actual=run(join(candidate,'index.mjs'),join(candidate,meta['module-files'].cordis),join(schemaEntry,'index.mjs'));
  assert.deepEqual(actual,expected);
  console.log('Loader SDK runtime: '+actual.groups.length+' paired full-source ownership, lifecycle, nested Group, persistence and actual Schema volatile groups; Node execution only.');
 }finally{rmSync(dir,{recursive:true,force:true})}
}
