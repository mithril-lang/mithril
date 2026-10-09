'use strict';
(() => {
  const data = JSON.parse(document.getElementById('graph-data').textContent);
  const $ = id => document.getElementById(id);
  const byId = new Map(data.nodes.map(n => [n.id,n]));
  const files = data.nodes.filter(n => n.kind==='file');
  const fileByPath = new Map(files.map(n => [n.path,n]));
  const membership = data.analysis.membership;
  const groups = data.analysis.communities;
  const fileDegree=new Map(); for(const e of data['file-edges'])for(const id of [e.source,e.target])fileDegree.set(id,(fileDegree.get(id)||0)+e.weight);
  const short = n => (n.label || n.name || n.path).split('/').pop();
  const number = n => n.toLocaleString('en-US');
  let selected = null, pinned = null, zoom = 1, offset = [0,0], drag = null;
  function element(tag,text,className) {
    const e=document.createElement(tag); if(text!==undefined)e.textContent=text;
    if(className)e.className=className; return e;
  }
  function member(n) { const f=fileByPath.get(n.path); return f && membership[f.id]; }
  function matches(n) {
    const q=$('search').value.trim().toLowerCase();
    return (!q || `${n.name} ${n.label||''} ${n.path}`.toLowerCase().includes(q)) &&
      (!$('kind').value || n.kind===$('kind').value) &&
      (!$('community').value || member(n)===$('community').value);
  }
  function select(id) {
    const n=byId.get(id); if(!n)return; selected=n;
    $('empty').hidden=true; $('detail').hidden=false;
    $('selection-kind').textContent=n.kind; $('selection-name').textContent=n.name;
    $('location').textContent=`${n.path}${n.span?`:${n.span['start-line']}:${n.span['start-column']} — ${n.span['end-line']}:${n.span['end-column']}`:''} · ${n['location-precision']||'syntax'}`;
    $('source').textContent=n.source||'';
    $('source-status').textContent=n['source-truncated']?'Source excerpt truncated by the snapshot limit. Use the node API for more source.':'Indexed source';
    $('request').textContent=JSON.stringify({operation:'node',node:n.id},null,2);
    $('walk-result').textContent=''; $('neighbors').replaceChildren();
    const edges=data.edges.filter(e=>e.source===id || e.target===id);
    for(const e of edges.slice(0,30)) {
      const incoming=e.target===id, other=byId.get(incoming?e.source:e.target);
      if(!other)continue;
      const b=element('button',`${incoming?'←':'→'} ${e.relation} · ${other.name}`,'neighbor');
      b.addEventListener('click',()=>select(other.id)); $('neighbors').append(b);
    }
    if(!edges.length)$('neighbors').append(element('p','No related nodes in this view.','muted small'));
    if(edges.length>30)$('neighbors').append(element('p',`${edges.length-30} items omitted.`,'muted small'));
    renderList(); renderGraph();
  }
  function renderList() {
    const nodes=data.nodes.filter(matches); $('results').replaceChildren();
    $('result-count').textContent=`${number(nodes.length)} items · Showing up to 100 items`;
    for(const n of nodes.slice(0,100)) {
      const b=element('button',undefined,'result'+(selected&&selected.id===n.id?' selected':''));
      const body=element('span');body.append(element('span',n.label||n.name,'result-name'),element('span',`${n.path}${n.span?`:${n.span['start-line']}`:''}`,'result-path'));
      b.append(body,element('span',n.kind,'tag'));b.addEventListener('click',()=>select(n.id));$('results').append(b);
    }
    if(!nodes.length)$('results').append(element('p','No matching nodes.','empty'));
  }
  const NS='http://www.w3.org/2000/svg';
  function svg(tag,attrs,text) {const e=document.createElementNS(NS,tag);for(const [k,v] of Object.entries(attrs||{}))e.setAttribute(k,v);if(text!==undefined)e.textContent=text;return e;}
  function transform(){$('viewport').setAttribute('transform',`translate(${offset[0]} ${offset[1]}) scale(${zoom})`);}
  function renderGraph() {
    const relevant=new Set(data.nodes.filter(matches).map(n=>n.path));
    const available=files.filter(n=>relevant.has(n.path)).sort((a,b)=>(fileDegree.get(b.id)||0)-(fileDegree.get(a.id)||0)||a.path.localeCompare(b.path));
    // The map is a bounded file projection, independent of the semantic node list.
    const visible=available.slice(0,100), ids=new Set(visible.map(n=>n.id));
    const edges=data['file-edges'].filter(e=>ids.has(e.source)&&ids.has(e.target)).slice(0,500);
    const g=$('viewport');g.replaceChildren();
    $('map-count').textContent=`${visible.length} / ${available.length} Files · ${edges.length} relationships`;
    const buckets=new Map();for(const n of visible){const key=membership[n.id];if(!buckets.has(key))buckets.set(key,[]);buckets.get(key).push(n);}
    const coords=new Map(), entries=[...buckets.values()];
    entries.forEach((nodes,idx)=>{
      const a=idx/Math.max(1,entries.length)*Math.PI*2;
      const cx=entries.length===1?380:380+Math.cos(a)*215, cy=entries.length===1?230:230+Math.sin(a)*125;
      nodes.forEach((n,i)=>{const angle=i/nodes.length*Math.PI*2, radius=nodes.length===1?0:(entries.length===1?Math.min(160,80+nodes.length*4):Math.min(95,25+nodes.length*2.5));coords.set(n.id,[cx+Math.cos(angle)*radius,cy+Math.sin(angle)*radius]);});
    });
    for(const e of edges){const a=coords.get(e.source),b=coords.get(e.target);g.append(svg('line',{x1:a[0],y1:a[1],x2:b[0],y2:b[1],class:'graph-edge','stroke-width':Math.min(4,1+Math.log2(e.weight+1)/3)}));}
    for(const n of visible){const [x,y]=coords.get(n.id);const node=svg('g',{transform:`translate(${x} ${y})`,class:'graph-node',tabindex:0,role:'button','aria-label':n.path});
      const doc=/\.(md|markdown|txt|mith|mithril|jsonld)$/.test(n.path);
      node.append(svg('circle',{r:selected&&selected.path===n.path?9:6,fill:doc?'#b7822e':'#587ba0',stroke:selected&&selected.path===n.path?'#172b32':'#fffefa','stroke-width':2}),svg('title',{},n.path),svg('text',{x:10,y:4},short(n).slice(0,27)));
      node.addEventListener('click',()=>select(n.id));node.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();select(n.id);}});g.append(node);
    }
    transform();
  }
  function walk(start,target,reverse) {
    const adjacency=new Map();for(const e of data.edges){const key=reverse?e.target:e.source;if(!adjacency.has(key))adjacency.set(key,[]);adjacency.get(key).push(e);}
    const seen=new Set([start]), parents=new Map();let frontier=[start],cut=false;
    for(let depth=0;frontier.length && depth<data.limits.depth;depth++) {
      const next=[];for(const id of frontier)for(const e of adjacency.get(id)||[]){const other=reverse?e.source:e.target;if(seen.has(other))continue;
        if(seen.size>=data.limits.visited){cut=true;continue;}seen.add(other);parents.set(other,{previous:id,edge:e});next.push(other);
        if(other===target)return {seen,parents,found:true,truncated:cut};
      }frontier=next;
    }
    cut ||= frontier.some(id=>(adjacency.get(id)||[]).some(e=>!seen.has(reverse?e.source:e.target)));
    return {seen,parents,found:start===target,truncated:cut};
  }
  $('impact').addEventListener('click',()=>{if(!selected)return;const r=walk(selected.id,null,true);const names=[...r.seen].filter(id=>id!==selected.id).map(id=>byId.get(id)?.name||id);
    $('walk-result').textContent=`Impact within this snapshot: ${names.length} items${r.truncated?' (exploration limit reached)':''}\n${names.slice(0,30).join('\n')}${names.length>30?'\n…':''}`;
    $('request').textContent=JSON.stringify({operation:'impact',node:selected.id},null,2);
  });
  $('pin').addEventListener('click',()=>{if(!selected)return;pinned=selected.id;$('walk-result').textContent=`Path start: ${selected.name}`;});
  $('path').addEventListener('click',()=>{if(!selected)return;if(!pinned){$('walk-result').textContent='Select a node and choose Set path start.';return;}
    const r=walk(pinned,selected.id,false);const chain=[];if(r.found){let id=selected.id;chain.push(byId.get(id).name);while(id!==pinned){const p=r.parents.get(id);chain.push(`— ${p.edge.relation} →`);id=p.previous;chain.push(byId.get(id).name);}chain.reverse();}
    $('walk-result').textContent=r.found?chain.join('\n'):`No path found in this snapshot${r.truncated?' (exploration limit reached)':''}.`;
    $('request').textContent=JSON.stringify({operation:'path',from:pinned,to:selected.id},null,2);
  });
  $('graph').addEventListener('wheel',e=>{e.preventDefault();zoom=Math.max(.3,Math.min(4,zoom*(e.deltaY<0?1.12:.88)));transform();},{passive:false});
  $('graph').addEventListener('pointerdown',e=>{if(e.target.closest('.graph-node'))return;drag=[e.clientX,e.clientY,...offset];$('graph').setPointerCapture(e.pointerId);});
  $('graph').addEventListener('pointermove',e=>{if(!drag)return;const factor=760/$('graph').getBoundingClientRect().width;offset=[drag[2]+(e.clientX-drag[0])*factor,drag[3]+(e.clientY-drag[1])*factor];transform();});
  $('graph').addEventListener('pointerup',()=>{drag=null;});$('graph').addEventListener('pointercancel',()=>{drag=null;});
  for(const id of ['search','kind','community'])$(id).addEventListener(id==='search'?'input':'change',()=>{renderList();renderGraph();});
  $('reset').addEventListener('click',()=>{$('search').value='';$('kind').value='';$('community').value='';zoom=1;offset=[0,0];renderList();renderGraph();});
  $('project').textContent=data.project;
  for(const [key,label] of [['files','Files'],['nodes','Code and document nodes'],['edges','Explicit and resolved relationships'],['documents','Documents'],['unresolved','Unresolved references']]){const card=element('div',undefined,'metric');card.append(element('strong',number(data.counts[key])),element('span',label));$('metrics').append(card);}
  groups.forEach((g,i)=>{const option=element('option',`C${i+1} · ${g.size} files`);option.value=g.id;$('community').append(option);});
  $('scope').textContent=`${data.truncated?'Partial snapshot':'Index snapshot'} · ${data.nodes.length}/${data.counts.nodes} nodes,${data.edges.length}/${data.counts.edges} relationships. Source excerpts contain up to 1,024 characters. Run codegraph ui again to refresh.`;
  $('analysis').textContent=`Community ${groups.length} · modularity ${data.analysis.modularity.toFixed(3)} · ${data.analysis.passes} passes · ${data.analysis.converged?'Converged':'Computation limit reached'}${data.analysis.truncated?' · Some edges omitted':''}`;
  $('diagnostic-summary').textContent=`Coverage and diagnostics · Unresolved ${number(data.counts.unresolved)} items / Diagnostics ${number(data.counts.diagnostics)} items`;
  $('diagnostics').textContent=JSON.stringify({unresolved:data.unresolved,diagnostics:data.diagnostics},null,2);
  $('revision').textContent=data['snapshot-digest'];renderList();renderGraph();
})();
