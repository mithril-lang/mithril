# Native enumeration and original Schema loop qualification

`HostForIn` takes exact `object`, `binding`, `body`, and `result` fields. It emits
native `for (const binding in object)` in both expression wrappers and direct
source statement bodies. It preserves inherited enumerable keys, native ordering,
shadowing, Proxy behavior, mutation during enumeration and per-iteration lexical
bindings. It does not materialize `Object.keys`, read values eagerly, or invoke an
external language runtime. Binding names remain fresh and immutable; the existing
array pattern bounds and node/depth budgets still apply.

Direct source bodies retain their own return/loop/async/generator context. Nested
functions and expression wrappers cannot borrow control or suspension permission.
The source suite compiles both examples through the actual CLI for `js` and
`js-browser`. The mechanics oracle covers 36 paired runtime groups including
primitives/null, proxies, mutation, lexical `this`, closures, return/break/continue,
finally, generator suspension and async thenable/rejection sequencing.

`schema-for-in-provenance.json` records all eight original loop nodes, their exact
source ranges and SHA-256 values in the pinned 962-line original Schemastery file.
The original file hash and every selected source range are checked at runtime.
`schema-for-in-reference.mjs` is an offline TypeScript-erased observation oracle.
`examples/native-js-schema-for-in.mith` contains checked Mithril forms for those
nodes, with explicit function wrappers/local accumulators and observation helpers.
Its 18 paired runtime groups cover refs, descriptions, simplification, bitsets,
dictionary key resolution and mutation/error behavior, merging, object resolution
and factory bits, including inherited/proxied inputs.

These are loop-node observations. The explicit Schema/property/isNullable helpers
are not a port of the Schema class. The complete Schema runtime, both switch nodes,
dynamic Function serialization and real default export API remain separate work.
Both target artifacts run here in Node, not in an actual browser host. This stage
is operator-authored; it makes no new System One request or coding-gain claim.

Run the official source launcher from the repository root:

```sh
node scripts/test-native-js.mjs --engine /absolute/path/to/pinned/nbb/cli.js
```
