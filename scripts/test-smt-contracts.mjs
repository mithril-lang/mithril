// Explicit L1 SMT contract suite (mithril.verify). Not part of any existing
// pipeline. Requires the pinned nbb engine and a z3 binary (MITHRIL_Z3 or PATH).
import {spawnSync} from 'node:child_process';
import {existsSync, mkdtempSync, writeFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve, join} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const args=process.argv.slice(2);
if(args.length!==2||args[0]!=='--engine')throw Error('usage: test-smt-contracts --engine <pinned nbb cli.js>');
const engine=resolve(args[1]);
if(!existsSync(engine))throw Error('Pinned bootstrap engine does not exist');
const z3=process.env.MITHRIL_Z3||'z3';
const version=spawnSync(z3,['--version'],{encoding:'utf8'});
if(version.error||version.status!==0)throw Error(`z3 is required for the SMT contract suite (tried ${z3})`);
console.log(version.stdout.trim());
const dir=mkdtempSync(join(tmpdir(),'mithril-smt-tests-'));
try{
  const config=join(dir,'offline.edn');
  writeFileSync(config,`{:paths [${JSON.stringify(join(root,'src'))} ${JSON.stringify(join(root,'test'))}]}`);
  const result=spawnSync(process.execPath,[engine,'--config',config,'test/run_verify.cljk'],
    {cwd:root,stdio:'inherit',timeout:300000});
  if(result.error||result.status!==0)throw result.error||Error(`SMT contract suite exited ${result.status}`);
}finally{rmSync(dir,{recursive:true,force:true});}
