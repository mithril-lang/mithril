# Loader runtime checkpoint

`examples/native-js-loader-esm.mith` contains the full eight-file Loader runtime
from DeepSeek Harness snapshot `441416c0048aa4281bffe59c1c7b5e13e08a9ec1`, linked
to the complete own Cordis/CosmoKit implementation: 24 native runtime modules,
13 public runtime exports, and a genuine default `Loader` identity. The only
external runtime module is `node:module` for the original `createRequire` path.

Both actual `js` and `js-browser` CLI outputs pass 40 paired original/candidate
groups each under Node. These cover class/function/namespace metadata, Context
and tree ownership, builtin imports, plugin start/update/disable/reenable/remove,
persistence callbacks, nested Group children/update/removal, listener cleanup,
actual original/own Schema volatile references, real Node builtin/relative ESM
imports, file plugin namespaces, config expressions, self-disposal, actual service
providers, local/shared realms and required-service consumers. Volatile-only updates retain
references and activation; invalid candidates retain raw config without changing
running references; ordinary config changes follow the original plugin lifecycle.
Explicitly await disposed fibers before checking listener cleanup, because
removing entries from the store does not itself drain those fibers.

The host fixture sets `baseUrl` on the actual calling Context before using the
traceable Loader service; its methods rebind the Context. Explicit concurrent
`Entry.init()` calls on an active entry follow the original extra activation;
`refresh()` has the separate existing-fiber guard. Node import errors retain their
code/message and observed outer-stack splice behavior; this is not full stack text
or source-map equivalence.

The service transfer/removal fixture preserves an observed original quirk: moving
a local provider to a shared realm transfers its implementation's store key, but
its original disposer retains the old key. Removing it suspends the injected
consumer; a replacement provider fails with the original duplicate-registration
message while the consumer remains pending. Both pinned original and native
candidate match. This qualification does not silently repair that source behavior.

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

## Public declaration qualification

All eight original declaration files are authored as the 31 top-level native
declarations in `native-js-loader-*-complete-types.mith`, with both original
augmentation blocks retained. `native-js-loader-program.mith` combines them with
the complete own Cordis/CosmoKit/standard-schema declaration graph and the actual
`node:module` type dependency. Both actual declaration CLI targets now admit the
18-module public graph with 13 runtime exports and 23 type exports. The internal
`config/diff` declaration is outside the original public type dependency graph;
its full declaration and source remain qualified independently by the Loader
leaves stage. No artificial public export or side-effect type import is added.

The checker first resolves the original export graph, retaining every possible
origin to reject ambiguity, before installing augmentation declarations. It
registers interfaces at their declaration owner and gives every augmentation its
original source lexical frame. Internal registration metadata supports renamed
exports without rewriting source AST names or emitted module targets. Existing
arity, private member, duplicate, class identity and exact runtime surface guards
remain active. Expanded module-augmentation controls compare separate private
aliases and unique symbols through direct, barrel and renamed export views.
Renamed views follow TypeScript's independent augmentation views; the finite
controls do not establish universal TypeScript declaration compatibility.

The Loader runtime index now owns all original star reexports as native live
imports/exports, so its declaration module has a genuine matching identity.
Cordis's internal barrel likewise uses its actual native runtime module.

`controls/original-types.mjs` verifies the complete pinned original graph with
three positive and three negative strict consumers, without `skipLibCheck`:
constructible reexported Context with typed loader, Fiber with typed Entry, and
Entry with typed LocalRealm. All diagnostics must belong to the consumer, so a
broken original dependency graph cannot count as an expected rejection. Run it
with the pinned TypeScript path and Node type-root directory as its two arguments.
`controls/types.mjs` extends this to 8 positive/7 negative consumers for the
original and actual CLI declarations independently, without skipLibCheck and
with exact rejection-code comparison. Every original/candidate public symbol's
name and type/value spaces also match. The consumers cover default/class/namespace
identity, options and isolation, protected/private members, abstract EntryTree, tree async
returns, Group unique-symbol/generator contracts and discriminated Node loader
v1/v2 requests. Use the original Loader ESNext/Bundler type environment; fixture
`.d.ts` files otherwise inherit this checkout's CommonJS package boundary under
NodeNext, which would give a false default-import discrepancy.

Run the complete SDK qualification from the compiler checkout:

```sh
MITHRIL_DECLARATIONS_ENGINE=/absolute/path/to/engine/cli.js \
MITHRIL_DECLARATIONS_TYPESCRIPT=/absolute/path/to/typescript/lib/typescript.js \
MITHRIL_DECLARATIONS_TYPE_ROOTS=/absolute/path/to/node_modules/@types \
node /absolute/path/to/engine/cli.js --config /absolute/path/to/offline.edn \
  -cp src test/qualification/native-loader-sdk/controls/compile.cljk
```

The control compiles both Loader and own Schema through the actual CLI into fresh
owned temporary directories, verifies exact runtime artifact bytes, checks every
oracle fixture hash, and runs original/candidate cases in separate processes.

This is registered as declaration qualification stage 18. Extended module-loader
internals/HMR, persistence failures and further lifecycle contracts still need
qualification before claiming full Loader equivalence. Include, full Harness
API/plugin/profile/Session, actual browser/native/Q9 execution and release remain
pending. Operator authored; no new System One model trial, adoption or performance
gain is claimed. This branch is a local checkpoint, not PR/main/production delivery.
