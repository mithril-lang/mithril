#!/usr/bin/env node
// Mission SCI test/CLI runner with the repository's pinned dependency classpath. Does not replace or emulate native Amu.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {spawn,spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const cp=spawnSync('clojure',['-Spath'],{cwd:repo,encoding:'utf8',maxBuffer:8388608});
if(cp.status!==0){process.stderr.write(cp.stderr||'Cannot resolve pinned classpath\n');process.exit(cp.status||1);}
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'mithril-sci-'));
function mirror(src,dest){
 fs.mkdirSync(dest,{recursive:true});
 for(const e of fs.readdirSync(src,{withFileTypes:true})){
  if(e.name==='.git')continue;
  const from=path.join(src,e.name),to=path.join(dest,e.name);
  if(e.isDirectory())mirror(from,to);else{
   fs.symlinkSync(from,to);
   if(e.name.endsWith('.cljk')){
    const alias=path.join(dest,e.name.slice(0,-5)+'.cljs');
    if(!fs.existsSync(path.join(src,e.name.slice(0,-5)+'.cljs')))fs.symlinkSync(from,alias);
   }
  }
 }
}
try{
 // Preserve the package-root layout used by bootstrap artifact loaders.
 for(const e of fs.readdirSync(repo,{withFileTypes:true})){
  if(['src','test','.git','.mithril-codegraph','.nbb'].includes(e.name))continue;
  fs.symlinkSync(path.join(repo,e.name),path.join(temp,e.name));
 }
 mirror(path.join(repo,'src'),path.join(temp,'src'));
 mirror(path.join(repo,'test'),path.join(temp,'test'));
 const roots=cp.stdout.trim().split(path.delimiter).map((root,i)=>{
  const absolute=path.resolve(repo,root);
  if(absolute===path.join(repo,'src'))return path.join(temp,'src');
  if(!fs.existsSync(absolute)||!fs.statSync(absolute).isDirectory())return absolute;
  const dest=path.join(temp,'deps',String(i));mirror(absolute,dest);return dest;
 });
 const raw=process.argv.slice(2),args=[];
 for(let i=0;i<raw.length;i++){
  if(raw[i]==='--backend'){if(raw[++i]!=='sci')throw new Error('This runner supports SCI only');}
  else if(raw[i]==='--classpath'||raw[i]==='-cp'){const extra=raw[++i];if(!extra)throw new Error('Missing classpath');
   for(const r of extra.split(path.delimiter)){const absolute=path.resolve(repo,r);if(!fs.existsSync(absolute))continue;
    const dest=path.join(temp,'extra',String(roots.length));mirror(absolute,dest);roots.push(dest);}}
  else if(raw[i]==='-Spath'){console.log(cp.stdout.trim());fs.rmSync(temp,{recursive:true,force:true});process.exit(0);}
  else args.push(raw[i]);
 }
 if(!args.length)throw new Error('Pass an nbb script or -e expression');
 const bin=path.join(temp,'.runner-bin');fs.mkdirSync(bin);
 const shim=path.join(bin,'kbb');
 fs.writeFileSync(shim,'#!/bin/sh\nexec node '+"'"+fileURLToPath(import.meta.url).replace(/'/g,"'\\''")+"'"+' "$@"\n',{mode:0o700});
 const child=spawn('nbb',['--classpath',[path.join(temp,'test'),...roots].join(path.delimiter),...args],{cwd:repo,stdio:'inherit',env:{...process.env,PATH:bin+path.delimiter+process.env.PATH}});
 const stop=signal=>child.kill(signal);
 const terminate=()=>stop('SIGTERM'),interrupt=()=>stop('SIGINT');
 process.on('SIGTERM',terminate);process.on('SIGINT',interrupt);
 try{
  process.exitCode=await new Promise(resolve=>{
   child.on('error',error=>{process.stderr.write(error.message+'\n');resolve(1);});
   child.on('exit',(status,signal)=>resolve(status??(signal==='SIGINT'?130:143)));
  });
 }finally{process.off('SIGTERM',terminate);process.off('SIGINT',interrupt);}

}finally{fs.rmSync(temp,{recursive:true,force:true});}
