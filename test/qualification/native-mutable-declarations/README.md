# Mutable declaration bindings

Checked native declaration AST accepts `kind:"let"` with the same exact name/exported/
datatype fields as const. It participates in value registration, private lexical frames,
namespace value detection, typeof/member queries, explicit local exports, imports and
reexports, with the existing collection/node/depth bounds. It emits ambient `let`,
including nested namespace members. Const emission stays unchanged. Unique-symbol
annotation remains limited to const/readonly static properties, not mutable bindings.
Duplicate let/const/function/class/value-namespace merges are refused; compatible
separate type and value spaces retain existing rules.

A public top-level let requires an actual checked mutable native ESM binding/function
origin, including named aliases and reexports. Immutable origins and the old snapshot
NativeJsPackage refuse the new live-binding claim. The legacy NativeJsDeclarations
emitter is qualified against a genuine NativeJsEsmPackage; it does not turn the old
runtime wrapper into a live ESM package. Namespace properties remain genuine mutable
object fields, while the ESM module namespace itself is readonly.

The two module-local globalThis mutable declarations at original Schemastery source
line209 retain exact name/exported/let/type syntax fingerprints against the hashed
full original source. Schema is explicitly an observation helper with a numeric value
property; this is not full original Schema typing. Hashed operator-authored trusted
TypeScript mechanics are compiled independently; strict consumers resolve their
actual emitted declarations rather than source control-flow narrowing.

Both Node-executed js/js-browser targets qualify8 actual declaration CLI artifacts
(program/direct/legacy/mutable-function profiles),6 actual native runtime CLI artifacts,
260 paired strict logical consumer groups and20 exact-code refusals. Checks include
private scope, original namespace shapes, root/import/inline/namespace queries,
const-vs-let assignment behavior and exact public type/value surfaces. Eight paired
runtime scenarios run the original and candidate in fresh Node processes, checking
initial counters, alias/reexport live updates, namespaces containing only let members,
mutable refs, original global counter/refs state, reference identity and readonly module
namespace behavior. Checked artifacts are compared with every actual declaration CLI
file. The full runner executes all12 independent stages with unchanged300-second stage
and10-minute CI job guards, explicit offline compiler configs and inherited launcher
refusals. TypeScript is a qualification tool only; no production source delegation.

This resolves the mutable declaration prerequisite. Structured declare-global namespace/
interface merging, full original Schemastery runtime/declarations, Harness API/plugin/
profile/Session and actual browser/native/Q9 equivalence remain unproven. Operator
authored;zero new System One inference/adoption or measured performance gain.
