import { draw } from './presentation.js';
import { translator } from './locale.js';
import { groups } from './layout.js';
export * as layout from './layout.js';
let serial=0;
const modes=['community','orbit','flow','river'];
/** Validate inert graph data without accepting source execution or remote fetching. */
export function validateModel(model){
 if(!model||!Array.isArray(model.nodes)||!Array.isArray(model.edges))throw new TypeError('nodes and edges arrays required');
 const ids=new Set();
 for(const n of model.nodes){if(!n||typeof n.id!=='string'||!n.id||ids.has(n.id))throw new TypeError('unique nonempty node IDs required');ids.add(n.id);if(n.label!==undefined&&typeof n.label!=='string')throw new TypeError('node label must be a string');if(n.types!==undefined&&!Array.isArray(n.types))throw new TypeError('node types must be an array');}
 for(const e of model.edges)if(!e||!ids.has(e.source)||!ids.has(e.target))throw new TypeError('edge endpoints must exist');
 return model;
}
function validateComputation(c){
 if(!c)return;
 if(!['workflow','propagation'].includes(c.kind)||!Array.isArray(c.result?.trace))throw new TypeError('recorded workflow or propagation trace required');
 if(c.result.trace.length>10000)throw new RangeError('trace exceeds 10000 steps');
 for(let i=0;i<c.result.trace.length;i++){const t=c.result.trace[i];if(t.step!==i+1||!(Array.isArray(t.active)||Number.isFinite(t.active)))throw new TypeError('contiguous one-based steps and active actor IDs or counts required');if(c.kind==='workflow'&&(!Array.isArray(t.active)||t.active.some(x=>typeof x!=='string')))throw new TypeError('workflow active must contain actor IDs');}
 if(c.kind==='workflow'){
  if(!Array.isArray(c.plan?.nodes)||!Array.isArray(c.plan?.edges)||!c.plan.nodes.length||c.plan.nodes.length>128)throw new RangeError('workflow needs nodes/edges and 1–128 actors');
  const ids=new Set();for(const n of c.plan.nodes){if(!n||typeof n.id!=='string'||ids.has(n.id))throw new TypeError('unique workflow actor IDs required');ids.add(n.id);}
  for(const e of c.plan.edges)if(!ids.has(e.from)||!ids.has(e.to))throw new TypeError('workflow edge endpoints must exist');
  for(const t of c.result.trace)if(t.active.some(id=>!ids.has(id)))throw new TypeError('trace actor must exist in plan');
 }
}
/** Mount a presentation-only viewer. No graph runtime or project data is bundled. */
export function mount(container,options={}){
 if(!container?.ownerDocument)throw new TypeError('DOM container required');
 let model=structuredClone(validateModel(options.model)),computation=options.computation?structuredClone(options.computation):null;
 validateComputation(computation);
 let locale=options.locale??'en',t=translator(locale);
 let selected=options.selected??null,mode=options.layout??'community',group='',step=1,predicate='',path=[],destroyed=false;
 if(selected&&!model.nodes.some(n=>n.id===selected))throw new TypeError('selected node must exist');
 if(!modes.includes(mode))throw new TypeError('unknown layout');
 const doc=container.ownerDocument,root=doc.createElement('section');root.className='mithril-graph-viewer';root.lang=locale;
 const el=(tag,text)=>{const n=doc.createElement(tag);if(text)n.textContent=text;return n;};
 const heading=el('header'),title=el('h2'),count=el('span'),nav=el('nav'),note=el('p'),legend=el('div'),stage=el('div'),back=el('button',t('back'));
 title.dataset.ui='layout-title';count.dataset.ui='layout-count';note.dataset.ui='layout-note';nav.setAttribute('aria-label',t('navigation'));legend.className='legend';stage.className='stage';back.type='button';
 heading.append(title,count);root.append(heading,nav,legend,back,note,stage);
 const canvas=doc.createElementNS('http://www.w3.org/2000/svg','svg');canvas.setAttribute('role','group');canvas.setAttribute('aria-label',t('canvas'));stage.append(canvas);
 const labelKeys=['tabOverview','tabOrbit','tabFlow','tabRiver'];
 const buttons=modes.map((m,i)=>{const b=el('button',t(labelKeys[i]));b.type='button';b.onclick=()=>setLayout(m);nav.append(b);return b;});
 groups.forEach(g=>{const label=el('span',t('group.'+g.id)),dot=doc.createElementNS('http://www.w3.org/2000/svg','svg'),circle=doc.createElementNS(dot.namespaceURI,'circle');dot.setAttribute('viewBox','0 0 10 10');dot.setAttribute('aria-hidden','true');circle.setAttribute('cx','5');circle.setAttribute('cy','5');circle.setAttribute('r','3');circle.setAttribute('fill',g.color);dot.append(circle);label.prepend(dot);legend.append(label);});
 back.onclick=()=>{group='';render();};container.append(root);
 const markerId='mithril-viewer-arrow-'+(++serial);
 function live(){if(destroyed)throw new Error('viewer destroyed');}
 function render(){live();root.lang=locale;back.textContent=t('back');nav.setAttribute('aria-label',t('navigation'));canvas.setAttribute('aria-label',t('canvas'));buttons.forEach((b,i)=>b.textContent=t(labelKeys[i]));legend.querySelectorAll('span').forEach((span,i)=>{span.lastChild.textContent=t('group.'+groups[i].id);});buttons.forEach((b,i)=>b.setAttribute('aria-pressed',String(modes[i]===mode)));back.hidden=!group;legend.hidden=mode==='flow'||mode==='river';draw(canvas,{model,layout:mode,selected,scope:model.nodes,group,route:{path},highlight:new Set(),computation,step,predicate,ui:root,markerId,t,locale,onSelect:select,onGroup:g=>{group=g;render();},onStep:s=>{setStep(s);options.onStep?.(s);}});}
 function select(id){live();if(!model.nodes.some(n=>n.id===id))throw new TypeError('unknown node');selected=id;mode='orbit';render();options.onSelect?.(id,structuredClone(model.nodes.find(n=>n.id===id)));}
 function setLayout(value){live();if(!modes.includes(value))throw new TypeError('unknown layout');mode=value;render();}
 function setLocale(value){live();const next=translator(value);locale=value;t=next;render();}
 function setStep(value){live();if(!Number.isInteger(value)||value<1||value>(computation?.result.trace.length||0))throw new RangeError('step outside recorded trace');step=value;render();}
 function setComputation(value){live();validateComputation(value);computation=value?structuredClone(value):null;step=Math.max(1,computation?.result.trace.length||1);render();}
 function setModel(value){live();model=structuredClone(validateModel(value));if(!model.nodes.some(n=>n.id===selected))selected=null;path=[];group='';render();}
 function setRoute(value){live();if(!Array.isArray(value)||value.some(id=>!model.nodes.some(n=>n.id===id)))throw new TypeError('route IDs must exist');path=value.slice();render();}
 function setPredicate(value){live();if(typeof value!=='string')throw new TypeError('predicate must be a string');predicate=value;render();}
 step=Math.max(1,computation?.result.trace.length||1);render();
 return {select,setLayout,setLocale,setStep,setComputation,setModel,setRoute,setPredicate,getState:()=>({layout:mode,selected,group,step,locale}),destroy(){if(!destroyed){root.remove();destroyed=true;}}};
}
