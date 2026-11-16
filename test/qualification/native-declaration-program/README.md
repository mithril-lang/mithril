# Native declaration programs

A checked `mithril/native-js-declaration-program` ties a finite set of inert
`mithril/native-js-declaration-module` sources to a checked native ESM graph.
Modules have named/type-only/namespace/side-effect imports and named/type-only/star
reexports. Export tables reach a bounded fixed point before type checking, admitting
forward and cyclic barrel dependencies without losing the original declaration's
class or unique-symbol owner. External contracts support qualified public type
namespaces, including the actual `StandardSchemaV1.Issue` reference needed by Fiber. Explicit own/named exports take priority over stars;
ambiguous stars, missing bindings, duplicate imports/exports and ungrounded cycles
refuse. Internal checker module names are unavailable to source references.

Imported classes retain their defining module and lexical namespace blocks for
heritage, private/protected identity and inherited static queries. Type-only
imports remain usable in declaration queries and ambient heritage, as verified
against TSC6.0.3. Type-only reexports keep their TypeScript bindings and erase their
runtime exports; they cannot create extra values in the native root. Namespace
imports expose public module exports, not private StackInfo or neighboring-module
bindings. Qualified global host type contracts retain explicit finite arities.

Structured `import-type` nodes carry an admitted module identity, qualified public
name, finite argument vector and query boolean. They emit genuine `import(...)`
references through the checked program path map, including the original Logger
`Disposable<Promise<void>>` return and qualified namespace/static type queries.
No TypeScript parser, raw source text or upstream runtime import is used in
production. Query type arguments are currently refused. The complete input set,
source identities, namespaces and existing declaration node/depth/arity/member
budgets are checked. There are at most64 internal modules,32 external contracts,
128 imports/reexports/exports per module and64 reexport rounds; total declaration
source text is bounded by1MiB. Unreachable internal modules refuse.

Every declared runtime module must match the actual native module export set.
The root must match all actual runtime root values. Both module and root values
must resolve to the same genuine native binding origin as their declaration
provider; matching names alone cannot authorize a swapped function or facade. Non-entry value barrels need
a real native module identity. Declaration filenames for runtime modules match the
native ESM artifact stems; a pure root barrel emits directly to `index.d.mts` for
the actual `index.mjs`. Type-only modules have separate declaration filenames.
The CLI validates local basenames before reading modules, rejects symlinks and
oversized/nonregular sources, completes admission before output creation, refuses
existing output directories and cleans up only a directory it created.

The qualification splits29 complete selected original Service/Utils/Logger forms
across four actual declaration files, preserving the Utils→index→Service→Utils
cycle and genuine Service/Utils config symbol identity. Logger's inline imported
Disposable is no longer replaced by an ambient alias. Strict TSC6.0.3 with full
library checking runs13positive/13negative original-paired groups and19 generic
namespace/alias/qualified-query/global-type/foreign-heritage groups per target:
142 logical groups over both actual CLI targets and pure-root/actual-native
barrel profiles (generic groups run once per target). Original negative diagnostics
must agree. The exact surface has25 names/12 types/18 TypeScript value bindings,
including one erased type-only Context binding, and17 actual runtime values.
Forty-three exact-code malformed/source/identity/scope/arity/visibility/cycle/
erasure/budget cases refuse, and two actual CLI cases preserve existing output
and refuse source symlinks. Runtime file identities, Service/Utils symbols and
original-paired real context ownership, service disposal and Logger behavior pass
on the genuine15-module native graph and16-module native barrel variant. Existing declaration/class/interface/merge,
source and package suites remain in the same CI.

External Context/Fiber/Disposable imports are explicit finite qualification package
contracts resolved to pinned original fixtures by the strict oracle. They remain
adapters: the independent nine-module Cordis graph, five actual Context module
augmentations, erased LoggerLevel/FiberState enums and original full index are
not yet established. LoggerLevel and the Logger augmentation are intentionally
outside this selected Logger structure comparison. The17-value qualification root
does not replace the full26-value Cordis root. Both targets execute under Node;
actual browser/native/Q9 and complete Harness API/plugin/profile/Session parity
remain later gates. Operator authored; zero new System One inference, model
repair/adoption or measured performance gain is claimed.
