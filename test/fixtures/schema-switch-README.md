# Checked native switch qualification

`HostSwitch` has exact fields `value`, `clauses`, and `result`. Each clause has
`test` and `statements`, or `default: true` and `statements`. There may be one
default, in any position. A statement is exactly `expression`, or `binding` with
`name`, `value`, and optional boolean `mutable`. Bindings are fresh and unique
across the entire CaseBlock; mutable=false emits const, mutable=true emits let.
All label and clause expressions share that lexical scope, while discriminant and
post-switch result use the outer scope. Declaration initializers remain at their
original statement positions. Native TDZ, fallthrough and strict case comparison
are preserved rather than simulated. Ordinary nested `Let` represents an explicit
source block. No raw source or external parser enters runtime compilation.

The bounds are 128 clauses, 128 statements per clause, 128 shared lexical bindings,
4096 total switch statements and existing global depth64/node4096 budgets. Cases
with the same test are legal; duplicate default/declaration names are refused.
Switch break permission is independent of loop continue permission. New function,
arrow and class bodies reset inherited switch/loop permission. Expression wrappers
allow their own switch break but cannot borrow source return, outer loop continue,
await or yield; direct source bodies retain their own coroutine permissions.

Both actual CLI targets are executed under Node against an independent native
JavaScript mechanics oracle:44 paired groups for discriminant/label evaluation,
default before a matching case, fallthrough, primitives/object identity/NaN, shared
lexical TDZ (including default closures), shadowing, nested switches/loops, finally,
return/throw, lexical this, generator label suspension and async label/discriminant.
The source suite checks shape/scope/readonly/coroutine/depth/shared-node/collection
and lexical-binding refusals without relaxing existing gates or replacing source.

`schema-switch-provenance.json` pins the full original Schemastery source hash and
both exact switch node ranges/hashes. The original file and every selected source
range are checked by the runtime contract. The two original nodes are emitted as
checked Mithril in `examples/native-js-schema-switch.mith`, with explicit wrappers
and Schema/valueMap observation helpers.34 paired observation groups cover native
constructor identity selection, every original factory branch, inner/list/dict
conversion, inherited bit enumeration/filtering and callback/constructor toJSON
installation/preservation. The offline TypeScript-erased reference is qualification
only; the production compiler has no TypeScript/runtime delegation dependency.

These helpers do not implement the Schema class. Complete callable/constructable
Schema, metadata/validation/serialization/Function reconstruction and its real
default value API remain to be ported. Node execution of js-browser is not actual
browser-host proof. This prerequisite is operator-authored with no new System One
request, model source adoption or measured coding gain.
