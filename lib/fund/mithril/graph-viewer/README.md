# fund.mithril.lib.graph-viewer

Presentation-only Mithril graph viewer. Four layouts: semantic overview,
focus orbits, workflow swimlanes, and recorded-step history. Framework-free
ES modules, accessible SVG node controls, independent instances, no runtime
package dependencies. Apache-2.0.

## Install

Versioned distribution is on GitHub Releases (not the npm registry):

```sh
npm install https://github.com/mithril-lang/fund.mithril.lib.graph-viewer/releases/download/v0.1.1/fund.mithril.lib.graph-viewer-0.1.1.tgz
```

For a browser without a bundler, serve the released `src/` directory and import
`src/index.js` directly. No build is required.

```js
// In a Mithril host, import its canonical shared stylesheet first:
import '@mithril/design-system/web-console.css';
import 'fund.mithril.lib.graph-viewer/viewer.css';
import { mount } from 'fund.mithril.lib.graph-viewer';

const viewer = mount(document.querySelector('#map'), {
  model: {
    nodes: [
      { id: 'approve', label: '契約承認', types: ['Activity'], domain: 'architecture' },
      { id: 'ceo', label: 'CEO', types: ['Person'], domain: 'architecture' }
    ],
    edges: [{ source: 'ceo', target: 'approve', predicate: 'approves' }]
  },
  onSelect(id, node) { console.log(id, node.label); },
  onStep(step) { console.log('Recorded step', step); }
});
viewer.select('approve'); // focus orbits, using supplied relations
viewer.setLayout('community');
// Later: viewer.destroy(); removes only this instance.
```

The shared design-system stylesheet is supplied by the host and is not copied
into this library. `viewer.css` consumes its tokens with standalone fallbacks.

## Language policy

English is the default for UI, accessible names, empty states, group and lane
labels, counts, documentation, and examples. Browser/document language does not
silently select a translation. Opt in with `locale: 'ja'` or `viewer.setLocale('ja')`.
Input node labels and properties retain their original language. Changing locale
preserves selection, route, computation and inspected step.

This follows the [Mithril organization language policy](https://github.com/mithril-lang/.github/blob/main/LANGUAGE_POLICY.md).

## API

`mount(container, { model, layout?, locale?, selected?, computation?, onSelect?, onStep? })`
returns:

| Method | Behavior |
| --- | --- |
| `select(id)` | Center an existing node and emit `onSelect`; keyboard Enter/Space also works |
| `setLocale(locale)` | Explicit `en` or `ja`; default is always `en` |
| `setLayout(name)` | `community`, `orbit`, `flow`, or `river` |
| `setModel(model)` | Replace the inert graph and clear stale selection/route |
| `setPredicate(iri)` | Filter orbit relations; empty string restores all |
| `setRoute(ids)` | Highlight a host-computed route; does not calculate a path |
| `setComputation(record)` | Replace a supplied workflow/propagation record, or clear with `null` |
| `setStep(n)` | Inspect a recorded one-based step without executing anything |
| `getState()` | Return current layout, selection, group, and step |
| `destroy()` | Remove the instance; subsequent mutations fail |

`layout` (also available from `/layout`) exports deterministic `community`,
`orbit`, `flow`, `history`, `labels`, `groupFor`, and `groups` functions.

A model needs unique string node IDs and edges whose endpoints exist. Node
fields: `id`, optional `label`, `types` (IRI/string array), `domain` (`architecture`,
`code`, `ontology`), and `external`. Properties can be retained by the host.
The viewer copies input data and renders labels through `textContent`.

Workflow record:

```js
viewer.setComputation({
  kind: 'workflow',
  plan: {
    nodes: [{ id: 'inspect', op: 'neighbors' }, { id: 'review', op: 'pause' }],
    edges: [{ from: 'inspect', to: 'review' }]
  },
  result: {
    status: 'paused', pending: [],
    trace: [
      { step: 1, active: ['inspect'], changed: [] },
      { step: 2, active: ['review'], changed: [] }
    ]
  }
});
viewer.setLayout('flow');
```

Propagation record: `{ kind: 'propagation', result: { trace: [
{ step: 1, active: 4, changed: 3, messages: 7 } ] } }`. Counts describe supplied
records. They are not inferred measurements or causal effects. Steps must be
contiguous starting at one. Workflow definitions are limited to 128 actors and
traces to 10,000 steps.

## Display boundaries

Semantic overview uses six fixed Mithril domain/type groups (not inferred
communities), six representatives per group and up to 36 on group expansion.
Orbits show up to eight immediate neighbors and twelve second-hop candidates
through those displayed neighbors. Flow condenses cycles and places joins after
predecessors. Wide diagrams scroll. History shows up to twelve actors and a
window of 32 steps. Retain the full corpus/trace and offer additional search or
inspection in the host application.

No RDF/`.mith` parser, repository ingestion, mathematical projection engine,
traversal/BSP/workflow runtime, checkpoint store, LLM inference, or project data
is bundled. The descriptive `library.mith` identifies this browser library; it
is not a native Mithril executable/import binding. Numerical coordinates and
DoDAF filtering belong to the host, not these four presentation layouts.

Extracted from the local Atlas presentation in `mithril-lang/mithril`, then
adapted to a scoped multi-instance API. The existing Atlas stays independent;
this release does not publish its workspace snapshot.

## Develop and verify

```sh
npm ci
npm run check
npm test
python3 -m http.server 8768 --bind 127.0.0.1
# Open http://127.0.0.1:8768/examples/
npm pack --dry-run
```

Tests cover full-scope counts, real relations, bounded layouts, cyclic workflow
placement, collision avoidance, multiple instance isolation, keyboard selection,
escaped labels, model replacement, recorded replay, malformed input and teardown.
`examples/` contains only a small illustrative graph and a static execution trace.
