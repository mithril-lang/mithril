# Native loops, ToString and exported values: actual System One evaluation

This wave closes language prerequisites for the whole CosmoKit types.ts runtime.
It does not qualify that whole module or the complete Harness API/plugin/Session.

HostWhile has exactly condition/body/result checked expressions. All use the
same lexical/import/function/arguments scope. Native while runs in an arrow IIFE:
raw condition truthiness, body result discarded without awaiting, result evaluated
once on normal completion, opaque throws bypass result. Indexed early exit uses
private mutable state, with no additional observable array reads after mismatch.

HostToString has exactly value, emitting native template interpolation. Native
ToPrimitive uses string hint, rejects Symbol, preserves exception identity and
conversion order. Literal backticks and interpolation text remain safe data.
There is no extra global String lookup and no default-hint concatenation substitute.

Exports retain old strings and exact name/function entries with unchanged checked
name/target IR and old bytes. New exact name/value entries are checked after module
bindings and functions using the same shared 4096-node/64-depth counter. Module
export scope has no arguments frame; source LocalFunction bodies create one.
Native object factory construction evaluates exports once, left to right, after
bindings/functions, preserving function identity with aliases, mutable ordinary
properties, own computed __proto__ keys and per-factory object isolation. Existing
whole-tree generated-name collision scanning covers these new expressions.
Four old mapValues/misc/array/volatile artifact SHA256 values remain unchanged.

## Frozen task and actual production request, 2026-10-08

Published source main0ffdfd4ae4a26196d74b16dd77d49e2da345ae4e plus two operator
Form tag mappings added before inference. They are explicitly selected read-only
prerequisites, not model-authored changes. Six complete files selected, task86754
bytes, goal3418 characters, only native_js.cljk editable. This partition keeps
materialized output within the service49152-byte cap; no file truncation or cap bypass.
Original whole types.ts is supplied as reference. One request, repair budget0.

Approved image sha256:61a0de6d883ce81066ac8336fb41f8da63ee83a1dfe2ac68013d1145a2a5c41c
contains the complete approved source and exact Form overlay. Before inference:
retained83 tests/433 assertions pass, and independent native JS reference18 groups
pass. Frozen controls:3 admissions,12 malformed/scope refusals,3 shared-budget
refusals,2 Form tags and18 runtime groups. Same official verifyRefactor plan runs
raw and operator proposals in digest-pinned networknone/read-only uid65534 containers;
no host checkout/env/credentials, workspace source classpath, pinned dependencies,
Node24.21.0, four shadowed JVM launchers and absent launcher marker.

Actual authenticated code.mithril.fund System One returned qwen/qwen3.8-27b in
34.620 seconds,25461 prompt/1209 completion tokens, one attempt, cost unknown.
Task identity f2918c5e167b442be2323bed32254b0df3548b42abba75cc3cefa2972d21164b
matches materialized UI proposal. Scope/hash admission does not verify behavior.
Raw candidate fails parsing with unmatched delimiter294:57; no new compiler
runtime behavior is established. Composite unassisted acceptance0/1 for this task.
The standalone JS reference passes independently and is not model compilation.

Final implementation is operator repaired model output: export validation moves
inside the bindings/functions scope, exact alternatives preserve old IR, the node
budget stays shared, and template interpolation emission is repaired. Raw source
also referred to unbound module-env/nodes and always required function export shape;
these are source observations, not separately executed failures. Same frozen plan
passes after repair. No model repair/retry. Model receipts and raw failures remain.

Maintained native suite19 tests/83 assertions and full registered84/434 are tested
separately from frozen83/433. Runtime groups include150000-iteration sum/equality,
getter traces and early exit, Symbol/custom coercion/opaque throws, native body
thenable discard, real arguments capture, export order/property attributes/identity.
Source CI/main publication is a distinct later gate. Node evidence is not actual
browser execution. Different task timings are not a matched model improvement test.

## Next reverse dependency step

Actual TypeScript6.0.3 ES2022 transpilation of the unmodified original types/misc/
volatile source, with only relative dependency filenames adjusted, is recorded
in types-transpile-receipt.json. Baseline Binary aliases share function objects;
replacing Binary.fromSource does not affect lexical helper use inside toHex.
This independent source baseline is not a completed Mithril port.

Port the whole is/Binary/four aliases/clone/deepEqual runtime next, linking real
Mithril misc/volatile exports. Preserve Buffer-present/absent asymmetry, prototypes,
descriptors/cycles, volatile identity, strict/nullish comparisons, error identity
and function metadata. Then string/time/index, public types/package linking,
Schemastery/Cordis/Include/Loader SCC and the remaining Harness API/plugin/Session.
For System One improvements investigate a compile gate for emitted CLJK, lexical
scope order and exact discriminated shapes, and semantic probes for coercion;
operator repairs are excluded from model success rates.
