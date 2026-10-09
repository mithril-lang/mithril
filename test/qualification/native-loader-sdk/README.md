# Loader runtime checkpoint

`examples/native-js-loader-esm.mith` contains the full eight-file Loader runtime
from DeepSeek Harness snapshot `441416c0048aa4281bffe59c1c7b5e13e08a9ec1`, linked
to the complete own Cordis/CosmoKit implementation: 24 native runtime modules,
13 public runtime exports, and a genuine default `Loader` identity. The only
external runtime module is `node:module` for the original `createRequire` path.

Both actual `js` and `js-browser` CLI outputs pass 25 paired original/candidate
groups each under Node. These cover class/function/namespace metadata, Context
and tree ownership, builtin imports, plugin start/update/disable/reenable/remove,
persistence callbacks, nested Group children/update/removal, listener cleanup,
and actual original/own Schema volatile references. Volatile-only updates retain
references and activation; invalid candidates retain raw config without changing
running references; ordinary config changes follow the original plugin lifecycle.
Explicitly await disposed fibers before checking listener cleanup, because
removing entries from the store does not itself drain those fibers.

Pinned original source, full program-emitted runtime, and all eight declaration
files are in `test/fixtures/loader-sdk`, with MIT licensing and SHA-256 provenance.
The original runtime retains the compiler's relative-import extension helper and
inlined const enums. In the candidate, lexical module `this` is undefined, while
function and class receivers retain their own contexts. TypeScript is used only
for original oracle/type authoring and independent consumers; native candidate
compilation and execution do not delegate to TypeScript or original code.

The original declaration-only baseline has zero diagnostics with the pinned
dependency declarations, TypeScript 6.0.3, Node types 26.6.3, and the Loader
package's `noImplicitAny: false` override. This is a declaration baseline, not a
claim that the original project's production build was run. The separate original
runtime authoring diagnostics are retained in provenance rather than hidden.

Run the independent runtime checkpoint from the compiler checkout:

```sh
MITHRIL_DECLARATIONS_ENGINE=/absolute/path/to/engine/cli.js \
MITHRIL_DECLARATIONS_TYPESCRIPT=/absolute/path/to/typescript/lib/typescript.js \
node /absolute/path/to/engine/cli.js --config /absolute/path/to/offline.edn \
  -cp src test/qualification/native-loader-sdk/controls/compile.cljk
```

The control compiles both Loader and own Schema through the actual CLI into fresh
owned temporary directories, verifies exact runtime artifact bytes, checks every
oracle fixture hash, and runs original/candidate cases in separate processes.

This checkpoint is not yet registered as a declaration qualification stage.
Complete native Loader public declaration authoring and strict consumers remain
pending, including Cordis augmentations, module-loader namespaces, private brands,
default/barrel identities and Schema type dependencies. Extended isolation,
injection, self-disposal, module resolution/errors and persistence contracts also
need qualification before claiming full Loader equivalence. Include, full Harness
API/plugin/profile/Session, actual browser/native/Q9 execution and release remain
pending. Operator authored; no new System One model trial, adoption or performance
gain is claimed. This branch is a local checkpoint, not PR/main/production delivery.
