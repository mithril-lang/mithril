import {spawnSync} from 'node:child_process';
import {existsSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve,join,delimiter} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url)),args=process.argv.slice(2);
if(args.length!==2||args[0]!=='--engine')throw Error('usage: test-native-package --engine <pinned nbb cli.js>');
const engine=resolve(args[1]);if(!existsSync(engine))throw Error('Pinned bootstrap engine does not exist');
const dir=mkdtempSync(join(tmpdir(),'mithril-package-tests-')),marker=join(dir,'jvm.marker'),config=join(dir,'offline.edn');
try{
 writeFileSync(config,`{:paths [${JSON.stringify(join(root,'src'))}]}`);
 for(const name of ['java','javac','clojure','clj','bb'])writeFileSync(join(dir,name),'#!/bin/sh\n: > "$MITHRIL_PACKAGE_JVM_MARKER"\nexit 97\n',{mode:0o755});
 const r=spawnSync(process.execPath,[engine,'--config',config,'test/qualification/native-js-package/controls/compile-package.cljk'],{cwd:root,stdio:'inherit',timeout:240000,env:{...process.env,TZ:'UTC',PATH:dir+delimiter+process.env.PATH,MITHRIL_PACKAGE_JVM_MARKER:marker,MITHRIL_PACKAGE_ENGINE:engine}});
 if(existsSync(marker))throw Error('Forbidden JVM or dependency launcher invoked');
 if(r.error||r.status!==0)throw r.error||Error(`Native package qualification exited ${r.status}`);
 console.log('Checked native packages: both actual JS CLI targets, original 40-export runtime oracle, generic shared dependency and refusal guards; no JVM/dependency fallback.');
}finally{rmSync(dir,{recursive:true,force:true});}
