import {spawnSync} from 'node:child_process';
import {mkdtempSync,writeFileSync,existsSync} from 'node:fs';
import {join} from 'node:path';
const d=mkdtempSync('/tmp/misc-check-'), marker=join(d,'jvm');
for(const n of ['java','javac','clojure','clj'])writeFileSync(join(d,n),'#!/bin/sh\n: > "$MISC_JVM_MARKER"\nexit 97\n',{mode:0o755});
const r=spawnSync(process.execPath,['/opt/nbb/cli.js','--config','/opt/native-controls/workspace.edn',...process.argv.slice(2)],{cwd:'/workspace',stdio:'inherit',timeout:120000,env:{PATH:d+':'+process.env.PATH,MISC_JVM_MARKER:marker}});
if(existsSync(marker))throw Error('forbidden JVM launcher');if(r.error||r.status!==0)throw r.error||Error('source check failed: '+r.status);
console.log('JVM launcher marker absent; workspace source classpath.');
