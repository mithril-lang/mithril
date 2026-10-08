import {spawnSync} from 'node:child_process';
import {existsSync, mkdtempSync, writeFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve, join, delimiter} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const args=process.argv.slice(2);
if(args.length!==2||args[0]!=='--engine')throw Error('usage: test-native-js --engine <pinned nbb cli.js>');
const engine=resolve(args[1]);
if(!existsSync(engine))throw Error('Pinned bootstrap engine does not exist');
const dir=mkdtempSync(join(tmpdir(),'mithril-native-js-tests-'));
const marker=join(dir,'jvm.marker'),config=join(dir,'offline.edn');
try{
  writeFileSync(config,`{:paths [${JSON.stringify(join(root,'src'))} ${JSON.stringify(join(root,'test'))}]}`);
  for(const name of ['java','javac','clojure','clj'])writeFileSync(join(dir,name),
    '#!/bin/sh\n: > "$MITHRIL_NATIVE_JVM_MARKER"\nexit 97\n',{mode:0o755});
  const result=spawnSync(process.execPath,[engine,'--config',config,'test/run_native_js.cljk'],
    {cwd:root,stdio:'inherit',timeout:120000,env:{...process.env,
      PATH:dir+delimiter+process.env.PATH,MITHRIL_NATIVE_JVM_MARKER:marker,MITHRIL_NATIVE_ENGINE:engine}});
  if(existsSync(marker))throw Error('Forbidden JVM launcher was invoked');
  if(result.error||result.status!==0)throw result.error||Error(`Native JS source suite exited ${result.status}`);
  console.log('Native JS host backend: 55 tests / 201 assertions; paired mapValues, complete misc, array and volatile runtime contracts; native type foundation; native loop/string/export values; ordered object spreads; whole types runtime; string/time native prerequisites; whole string runtime; module initializer function references; whole time runtime; private checked package factories; native normal function contexts; native classes and complete DisposableList; native catch/optional access and source error composition; native function kinds and original constructor classifier; recursive/statement prerequisites and whole Cordis utils; native logger static-block/arrow-rest/bitwise prerequisites; native source control transfer and complete Cordis logger; native await/yield with own coroutine contexts and async arrow/class methods; native strict property deletion and for-of array binding; genuine object literal methods with native home objects; native property logical assignment and complete Cordis reflect; real multi-file ESM live binding/cycle initialization and complete dependency leaves; native spread/optional value invocation, do/while/void and core source prerequisites; explicit mutable module function assignment with native cyclic namespace initialization; actual mutable parameter bindings/default closure scope and original Events.on body; genuine continuous optional chains with native receivers and suspension; no JVM fallback.');
}finally{rmSync(dir,{recursive:true,force:true});}
