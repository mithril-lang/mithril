/* Deterministic presentation layouts. They change neither RDF nor computation. */
'use strict';
const groups=[
 {id:'business',label:'Business & processes',color:'#368f83',fill:'#edf8f4'},
 {id:'product',label:'Products & services',color:'#397fe0',fill:'#edf4ff'},
 {id:'organization',label:'Organization & governance',color:'#aa7b3f',fill:'#fbf5ea'},
 {id:'code',label:'Code & implementation',color:'#7863bb',fill:'#f3effc'},
 {id:'ontology',label:'Ontology',color:'#9c69bb',fill:'#f8f0fb'},
 {id:'evidence',label:'Evidence & references',color:'#65909f',fill:'#eff6f8'}];
const local=x=>String(x||'').split(/[#/:]/).pop();
function groupFor(n){const types=(n.types||[]).map(local).join(' '),label=n.label||'';
 if(n.external)return 'evidence';
 if(n.domain==='code'||/CodeDefinition|SourceFile/.test(types))return 'code';
 if(/Change|ArchitecturalDescription/.test(types)||/evidence|provenance/i.test(types))return 'evidence';
 if(n.domain==='ontology')return 'ontology';
 if(/Activity|Rule|Process/.test(types)||/process-task|\/process\//.test(n.id))return 'business';
 if(/Organization|Person|Role|Country|Location|Region/.test(types))return 'organization';
 if(n.domain==='architecture'||/Mithril|mithril|Fund|Desktop|Agent|Registry/.test(label))return 'product';
 return 'ontology';
}
function degrees(edges){const d=new Map();for(const e of edges){d.set(e.source,(d.get(e.source)||0)+1);d.set(e.target,(d.get(e.target)||0)+1);}return d;}
function rank(nodes,edges,priority=[]){const d=degrees(edges),preferred=new Set(priority);const relevance=n=>/^(CEO|CFO|COO|CTO|IT Admin)$/.test(n.label||'')||/contract|approv|marketing|契約|承認|マーケティング/i.test(n.label||'')?15:/^(mithril|mithril-agent|mithril-fund|mithril-desktop|ontology|Mithril \(mithril.fund\))$/.test(n.label||'')?15:/(?:-test|_test|\.test|\/test)/.test(n.label||'')?-15:0;return nodes.slice().sort((a,b)=>(+preferred.has(b.id)-+preferred.has(a.id))||(+a.id.startsWith('_:')-+b.id.startsWith('_:'))||(+!a.label-+!b.label)||(relevance(b)-relevance(a))||((d.get(b.id)||0)-(d.get(a.id)||0))||a.id.localeCompare(b.id));}
function community(nodes,edges,{group='',priority=[]}={}){
 const ids=new Set(nodes.map(n=>n.id)),visibleEdges=edges.filter(e=>ids.has(e.source)&&ids.has(e.target)),buckets=new Map(groups.map(g=>[g.id,[]]));for(const n of nodes)buckets.get(groupFor(n)).push(n);
 const present=groups.filter(g=>buckets.get(g.id).length&&(!group||g.id===group));const points=[],regions=[];
 if(group&&present.length){const g=present[0],all=rank(buckets.get(g.id),visibleEdges,priority),sample=all.slice(0,36);regions.push({...g,x:28,y:42,w:944,h:568,total:all.length,shown:sample.length});sample.forEach((n,i)=>points.push({id:n.id,x:104+(i%6)*157,y:135+Math.floor(i/6)*78,group:g.id}));}
 else present.forEach((g,i)=>{const x=28+(i%3)*326,y=42+Math.floor(i/3)*286,all=rank(buckets.get(g.id),visibleEdges,priority),sample=all.slice(0,6);regions.push({...g,x,y,w:292,h:260,total:all.length,shown:sample.length});sample.forEach((n,j)=>points.push({id:n.id,x:x+76+(j%2)*140,y:y+83+Math.floor(j/2)*57,group:g.id}));});
 const nodeGroup=new Map(nodes.map(n=>[n.id,groupFor(n)])),bridges=new Map();for(const e of visibleEdges){const a=nodeGroup.get(e.source),b=nodeGroup.get(e.target);if(a===b)continue;const key=a+'|'+b;if(!bridges.has(key))bridges.set(key,{source:a,target:b,count:0});bridges.get(key).count++;}
 const pointIds=new Set(points.map(p=>p.id));return {points,regions,bridges:[...bridges.values()].filter(b=>present.some(g=>g.id===b.source)&&present.some(g=>g.id===b.target)),edges:visibleEdges.filter(e=>pointIds.has(e.source)&&pointIds.has(e.target)),total:nodes.length,shown:points.length,group};
}
function orbit(model,center,{predicate='',priority=[]}={}){
 const byId=new Map(model.nodes.map(n=>[n.id,n]));if(!byId.has(center))throw Error('unknown orbit center');
 const edges=model.edges.filter(e=>!predicate||e.predicate===predicate),adj=new Map();for(const e of edges){if(!adj.has(e.source))adj.set(e.source,new Set());if(!adj.has(e.target))adj.set(e.target,new Set());adj.get(e.source).add(e.target);adj.get(e.target).add(e.source);}
 const firstAll=[...(adj.get(center)||[])].filter(id=>id!==center),first=rank(firstAll.map(id=>byId.get(id)).filter(Boolean),edges,priority).slice(0,8),firstIds=new Set(first.map(n=>n.id));
 const secondSet=new Set();for(const n of first)for(const id of adj.get(n.id)||[])if(id!==center&&!firstAll.includes(id))secondSet.add(id);
 const second=rank([...secondSet].map(id=>byId.get(id)).filter(Boolean),edges,priority).slice(0,12),points=[{id:center,x:500,y:318,tier:0}];
 const ring=(nodes,r,tier,offset)=>nodes.forEach((n,i)=>{const t=-Math.PI/2+offset+2*Math.PI*i/nodes.length;points.push({id:n.id,x:500+r*Math.cos(t),y:318+r*Math.sin(t),tier});});ring(first,185,1,0);ring(second,277,2,Math.PI/12);
 const shown=new Set(points.map(p=>p.id));return {points,edges:edges.filter(e=>shown.has(e.source)&&shown.has(e.target)&&(e.source===center||e.target===center||(firstIds.has(e.source)!==firstIds.has(e.target)))),totalFirst:firstAll.length,shownFirst:first.length,totalSecond:secondSet.size,shownSecond:second.length};
}
function flow(program){
 const nodes=program.nodes||[],edges=program.edges||[],byId=new Map(nodes.map(n=>[n.id,n]));if(!nodes.length)return {nodes:[],edges:[],width:1000,height:630};
 // SCC condensation gives finite layers even when the workflow contains loops.
 const adj=new Map(nodes.map(n=>[n.id,[]]));for(const e of edges)if(byId.has(e.from)&&byId.has(e.to))adj.get(e.from).push(e.to);
 let serial=0;const idx=new Map(),low=new Map(),stack=[],on=new Set(),components=[];
 function visit(id){idx.set(id,serial);low.set(id,serial++);stack.push(id);on.add(id);for(const to of adj.get(id)){if(!idx.has(to)){visit(to);low.set(id,Math.min(low.get(id),low.get(to)));}else if(on.has(to))low.set(id,Math.min(low.get(id),idx.get(to)));}if(low.get(id)===idx.get(id)){const c=[];let k;do{k=stack.pop();on.delete(k);c.push(k);}while(k!==id);components.push(c.sort());}}
 for(const id of [...byId.keys()].sort())if(!idx.has(id))visit(id);
 const owner=new Map();components.forEach((c,i)=>c.forEach(id=>owner.set(id,i)));const incoming=new Map(components.map((_,i)=>[i,new Set()])),outgoing=new Map(components.map((_,i)=>[i,new Set()]));for(const e of edges){const a=owner.get(e.from),b=owner.get(e.to);if(a!==undefined&&b!==undefined&&a!==b){incoming.get(b).add(a);outgoing.get(a).add(b);}}
 const layer=new Map(components.map((_,i)=>[i,0])),pending=new Map([...incoming].map(([id,ns])=>[id,ns.size])),queue=[...pending].filter(([,v])=>!v).map(([id])=>id);
 for(let cursor=0;cursor<queue.length;cursor++){const a=queue[cursor];for(const b of outgoing.get(a)){layer.set(b,Math.max(layer.get(b),layer.get(a)+1));pending.set(b,pending.get(b)-1);if(!pending.get(b))queue.push(b);}}
 const lanes=['Read graph','Update state','Control & review'],lane=n=>['neighbors','traverse','propagate'].includes(n.op)?0:['set','increment','append'].includes(n.op)?1:2,slots=new Map();
 const laid=nodes.slice().sort((a,b)=>a.id.localeCompare(b.id)).map(n=>{const column=layer.get(owner.get(n.id)),row=lane(n),key=column+'|'+row,slot=slots.get(key)||0;slots.set(key,slot+1);return {...n,column,lane:row,slot,cycle:components[owner.get(n.id)].length>1||adj.get(n.id).includes(n.id)};});
 const laneHeights=lanes.map((_,i)=>Math.max(1,...[...slots].filter(([k])=>+k.split('|')[1]===i).map(([,v])=>v))*92+30),laneYs=[];let y=76;laneHeights.forEach(h=>{laneYs.push(y);y+=h;});
 for(const n of laid){n.x=200+n.column*230;n.y=laneYs[n.lane]+28+n.slot*92;}
 return {nodes:laid,edges:edges.filter(e=>byId.has(e.from)&&byId.has(e.to)),lanes:lanes.map((label,i)=>({label,y:laneYs[i],height:laneHeights[i]})),width:Math.max(1000,440+Math.max(...laid.map(n=>n.column))*230),height:Math.max(630,y+40)};
}
function history(result){const rows=result?.trace||[],actors=[...new Set(rows.flatMap(r=>Array.isArray(r.active)?r.active:[]))].sort();return {actors,steps:rows.map(r=>({...r,actors:Array.isArray(r.active)?r.active:[],activeCount:Array.isArray(r.active)?r.active.length:r.active})),width:Math.max(1000,200+rows.length*155),height:Math.max(630,140+Math.max(actors.length,3)*82)};}
function labels(points,byId,{width=1000,height=630,center=null}={}){
 const occupied=[],result=[];const sorted=points.slice().sort((a,b)=>((a.id===center?-1:a.tier??1)-(b.id===center?-1:b.tier??1))||a.id.localeCompare(b.id));
 for(const p of sorted){const n=byId.get(p.id);if(!n)continue;const text=n.label||n.id,estimate=Math.min(p.group?112:148,2+[...text].reduce((s,c)=>s+(c.charCodeAt(0)>255?13:13*.55),0)),w=Math.max(40,estimate),h=32;
 const candidates=p.group?[{x:p.x-w/2,y:p.y+13}]:[{x:p.x+14,y:p.y-15},{x:p.x-w-14,y:p.y-15},{x:p.x-w/2,y:p.y+17},{x:p.x-w/2,y:p.y-49}];
 for(const c of candidates){const box={...c,w,h};if(c.x<12||c.x+w>width-12||c.y<12||c.y+h>height-22||points.some(q=>q.id!==p.id&&c.x<q.x+10&&c.x+w>q.x-10&&c.y<q.y+10&&c.y+h>q.y-10)||occupied.some(b=>c.x<b.x+b.w+5&&c.x+w+5>b.x&&c.y<b.y+b.h+4&&c.y+h+4>b.y))continue;occupied.push(box);result.push({...box,id:p.id,text});break;}
 }return result;
}
export { groups, groupFor, community, orbit, flow, history, labels };
