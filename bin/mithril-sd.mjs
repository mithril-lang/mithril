#!/usr/bin/env node
/* Mithril system dynamics CLI. Pure JS, driven by .mith sources.
 *
 * Reads inert .mith system dynamics programs and executes them with the
 * shared local SD runtime. No Clojure: the .mith source is read directly
 * by resources/sd/reader.mjs (the Node-side equivalent of
 * mithril.form/parse for the RDF subset the SD lane declares) and the
 * resulting JSON-LD document model is handed to resources/sd/runtime.cjs.
 *
 *   mithril-sd <run> <programs.mith> <key> [max-samples]
 */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseMith} from '../resources/sd/reader.mjs';
import R from '../resources/sd/runtime.cjs';
const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
function run(args){
  const [command,programsFile,key,maxSamples]=args;
  if(command!=='run'||!programsFile||!key)throw new Error('sd <run> <programs.mith> <key> [max-samples]');
  const programs=R.programs(parseMith(fs.readFileSync(programsFile,'utf8')));
  const program=programs.find(p=>p.key===key);
  if(!program)throw new Error('unknown SD program: '+key);
  const specification=program.specification;
  const model=specification.model;
  if(model===undefined||model===null)throw new Error('SD specification requires a model');
  const options={dt:specification.dt,horizon:specification.horizon,maxSamples:maxSamples?Number(maxSamples):specification.maxSamples};
  return R.integrate(model,options);
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
  try{
    console.log(JSON.stringify(run(process.argv.slice(2)),null,2));
  }catch(e){
    process.stderr.write('REFUSE\t'+(e&&e.message||String(e))+'\n');
    process.exit(1);
  }
}
export{run};
