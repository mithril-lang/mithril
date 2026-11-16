#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn,execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
import http from 'node:http';
import {fileURLToPath} from 'node:url';
const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),root=fs.mkdtempSync(path.join(os.tmpdir(),'mithril-web-test-'));
execFileSync('git',['init','-q',root]);
fs.writeFileSync(path.join(root,'a.cljk'),'(ns a) (defn leaf [] 1) (defn caller [] (leaf))');
fs.writeFileSync(path.join(root,'guide.md'),'# Guide\n`a/leaf`\nexact-evidence 日本語');
// More nodes than the offline contract allows: complete-index requests must reach them.
fs.writeFileSync(path.join(root,'many.cljk'),'(ns many)\n'+Array.from({length:2005},(_,i)=>`(defn f${String(i).padStart(4,'0')} [] ${i})`).join('\n'));
const proc=spawn('node',['scripts/run-sci.mjs','bin/mithril-codegraph.cljk','web',root],{cwd:repo,stdio:['ignore','pipe','pipe']});
let stderr='';proc.stderr.on('data',b=>stderr+=b);
let base;
try{
 base=await new Promise((resolve,reject)=>{let buf='';const timer=setTimeout(()=>reject(new Error('server startup timed out '+stderr)),240000);proc.stdout.on('data',b=>{buf+=b;for(const line of buf.split('\n')){try{const r=JSON.parse(line);if(r.url){clearTimeout(timer);resolve(r.url);return;}}catch{}}});proc.on('exit',c=>{clearTimeout(timer);reject(new Error(`server exited ${c}: ${stderr}`));});});
 const post=async(data,endpoint='/query',headers={})=>{const response=await fetch(base+endpoint,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(data)});return {status:response.status,data:await response.json()};};
 const page=await fetch(base);assert.equal(page.status,200);assert.match(page.headers.get('content-security-policy'),/connect-src 'self'/);assert.match(await page.text(),/complete index/);
 const initial=(await post({operation:'status'})).data;assert.ok(initial.nodes>2000);
 const revision=initial['snapshot-digest'];
 const first=(await post({operation:'catalog',limit:2,revision})).data;
 const second=(await post({operation:'catalog',limit:2,offset:first['next-offset'],revision})).data;assert.notDeepEqual(first.nodes,second.nodes);
 const far=(await post({operation:'catalog',offset:2000,limit:100,revision})).data;assert.ok(far.nodes.length>0);
 const search=(await post({operation:'search',query:'many/f2004',revision})).data;assert.equal(search.nodes[0].name,'many/f2004');
 const evidence=(await post({operation:'content',query:'exact-evidence',revision})).data;assert.equal(evidence.matches[0].path,'guide.md');assert.equal(evidence.matches[0].span['start-line'],3);
 const source=(await post({operation:'node',node:'a/leaf',revision})).data;assert.equal(source.source,'(defn leaf [] 1)');
 const neighbors=(await post({operation:'neighbors',node:'a/leaf',revision})).data;assert.ok(neighbors.edges.some(e=>e.relation==='calls'));
 assert.equal((await post({operation:'catalog',revision:'stale'})).status,409);
 assert.equal((await post({operation:'status'},'/query',{Origin:'https://foreign.example'})).status,403);
 const foreignHost=await new Promise((resolve,reject)=>{const req=http.request(base+'/query',{method:'POST',headers:{'Content-Type':'application/json',Host:'foreign.example'}},res=>{res.resume();res.on('end',()=>resolve(res.statusCode));});req.on('error',reject);req.end(JSON.stringify({operation:'status'}));});
 assert.equal(foreignHost,403);
 assert.equal((await post({operation:'status',noise:'x'.repeat(20000)})).status,413);
 assert.equal((await post({root:'/etc'},'/refresh')).status,400);
 fs.writeFileSync(path.join(root,'a.cljk'),'(ns a) (defn replacement [] 1)');
 // Until explicit refresh, requests stay on the admitted snapshot.
 assert.equal((await post({operation:'node',node:'a/leaf',revision})).status,200);
 const refreshed=await post({},'/refresh');assert.equal(refreshed.status,200);assert.notEqual(refreshed.data['snapshot-digest'],revision);
 assert.equal((await post({operation:'catalog',revision})).status,409);
 assert.equal((await post({operation:'node',node:'a/leaf'})).status,400);
 fs.unlinkSync(path.join(root,'guide.md'));await post({},'/refresh');assert.equal((await post({operation:'content',query:'exact-evidence'})).data.matches.length,0);
 console.log('Codegraph HTTP: complete-index pagination, evidence, revision binding, refresh/deletion, origin and body limits passed.');
}finally{
 // The runner owns its child; signal the whole process group where supported.
 proc.kill('SIGTERM');await new Promise(resolve=>{if(proc.exitCode!==null)resolve();else proc.once('exit',resolve);});fs.rmSync(root,{recursive:true,force:true});
}
