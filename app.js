import { createCore } from './core.js';
const storageKey = 'todos-mithril';
const q = selector => document.querySelector(selector);
let tasks = [], core, editing = null;
const rows = new Map();
try {
 const stored = JSON.parse(localStorage.getItem(storageKey));
 if (Array.isArray(stored) && stored.every(x => typeof x.id === 'string' && typeof x.title === 'string' && typeof x.completed === 'boolean')) tasks = stored;
 else {
  const legacy = JSON.parse(localStorage.getItem('mithril-todo-pages-v1'));
  if (Array.isArray(legacy) && legacy.every(x => typeof x.id === 'string' && typeof x.title === 'string' && ['pending','in_progress','completed'].includes(x.status))) tasks = legacy.map(x => ({id:x.id,title:x.title,completed:x.status === 'completed'}));
 }
} catch { /* Invalid or inaccessible storage does not prevent local use. */ }
function route() { return ['#/active','#/completed'].includes(location.hash) ? location.hash : '#/'; }
function save() {
 try { localStorage.setItem(storageKey, JSON.stringify(tasks)); }
 catch { q('#feedback').textContent = 'Storage unavailable; changes are only in memory.'; }
 render();
}
function render() {
 if (!core) return;
 const remaining = core.remaining(tasks.map(x => x.completed));
 q('#main').hidden = q('#footer').hidden = tasks.length === 0;
 q('#toggle-all').checked = tasks.length > 0 && remaining === 0;
 q('.clear-completed').hidden = remaining === tasks.length;
 const strong = document.createElement('strong'); strong.textContent = remaining;
 q('.todo-count').replaceChildren(strong, document.createTextNode(` ${remaining === 1 ? 'item' : 'items'} left`));
 const filter = route();
 document.querySelectorAll('.filters a').forEach(a => a.classList.toggle('selected', a.getAttribute('href') === filter));
 const visible = tasks.filter(x => filter === '#/' || (filter === '#/completed' ? x.completed : !x.completed));
 const list = q('.todo-list');
 for (const id of rows.keys()) if (!tasks.some(x => x.id === id)) { rows.get(id).remove(); rows.delete(id); }
 const visibleIds = new Set(visible.map(x => x.id));
 for (const child of [...list.children]) if (!visibleIds.has(child.dataset.id)) child.remove();
 for (const task of visible) {
  let li = rows.get(task.id);
  if (!li) {
  li = document.createElement('li'); li.dataset.id = task.id;
  const view = document.createElement('div'); view.className = 'view';
  const toggle = document.createElement('input'); toggle.type = 'checkbox'; toggle.className = 'toggle'; toggle.checked = task.completed; toggle.setAttribute('aria-label', `Complete ${task.title}`);
  toggle.onchange = () => { task.completed = core.toggle(task.completed); save(); };
  const label = document.createElement('label'); label.textContent = task.title;
  const destroy = document.createElement('button'); destroy.className = 'destroy'; destroy.setAttribute('aria-label', `Delete ${task.title}`);
  destroy.onclick = () => { tasks = tasks.filter(x => x.id !== task.id); save(); };
  view.append(toggle, label, destroy); li.append(view);
  const edit = document.createElement('input'); edit.className = 'edit'; edit.setAttribute('aria-label', `Edit ${task.title}`); li.append(edit);
  label.ondblclick = () => {
   editing = task.id; li.classList.add('editing'); edit.value = task.title; edit.focus(); edit.setSelectionRange(edit.value.length, edit.value.length);
  };
  const finish = cancelled => {
   if (editing !== task.id) return;
   editing = null;
   if (!cancelled) { const value = edit.value.trim(); if (value) task.title = value; else tasks = tasks.filter(x => x.id !== task.id); }
   save();
  };
  edit.onblur = () => finish(false);
  edit.onkeydown = event => { if (event.key === 'Enter' || event.key === 'Escape') { event.preventDefault(); finish(event.key === 'Escape'); } };
  rows.set(task.id, li);
  }
  li.classList.toggle('completed', task.completed); li.classList.toggle('editing', editing === task.id);
  li.querySelector('.toggle').checked = task.completed;
  li.querySelector('.toggle').setAttribute('aria-label', `Complete ${task.title}`);
  li.querySelector('label').textContent = task.title;
  li.querySelector('.destroy').setAttribute('aria-label', `Delete ${task.title}`);
  li.querySelector('.edit').setAttribute('aria-label', `Edit ${task.title}`);
  if (list.children[visible.indexOf(task)] !== li) list.insertBefore(li, list.children[visible.indexOf(task)] || null);
 }
}
q('.new-todo').onkeydown = event => {
 if (event.key !== 'Enter' || !core || event.isComposing) return;
 const title = event.target.value.trim(); if (!title) return;
 tasks.push({id:crypto.randomUUID(),title,completed:false}); event.target.value = ''; save();
};
q('#toggle-all').onchange = event => { tasks.forEach(x => { x.completed = event.target.checked; }); save(); };
q('.clear-completed').onclick = () => { tasks = tasks.filter(x => !x.completed); save(); };
window.addEventListener('hashchange', () => { editing = null; render(); });
async function boot() {
 const [logic, metrics, bytes] = await Promise.all([fetch('./logic.json').then(r => r.json()), fetch('./metrics.json').then(r => r.json()), fetch('./policy.wasm').then(r => r.arrayBuffer())]);
 const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), x => x.toString(16).padStart(2,'0')).join('');
 if (digest !== metrics.policy.wasm_sha256) throw Error('Mithril artifact digest mismatch');
 new WebAssembly.Module(bytes); core = createCore(logic); render();
 q('#feedback').textContent = 'Verified Jev toggle/count · 511 completion-state vectors';
 q('#jev-time').textContent = `${metrics.jev.runner_seconds.toFixed(2)} seconds`;
 q('#jev-decisions').textContent = `${metrics.jev.decisions} decisions`;
 q('#jev-cost').textContent = metrics.jev.api_cost_usd === null ? 'Cost unmeasured' : `$${metrics.jev.api_cost_usd.toFixed(6)}`;
 q('#jev-tokens').textContent = `${metrics.jev.input_tokens} input / ${metrics.jev.output_tokens} output tokens`;
 q('#build-id').textContent = metrics.build_id;
 window.mithrilTodoReady = true;
}
boot().catch(error => { q('#feedback').textContent = 'Unable to load verified logic. Reload to retry.'; q('.new-todo').disabled = true; console.error(error); });
