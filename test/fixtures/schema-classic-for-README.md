# Native classic for and local update qualification

`HostFor` has exact fields initializer/condition/update/body/result. Null initializer,
condition or update represents the omitted header component. Otherwise initializer
is exactly an expression record or a nonempty bindings vector. Bindings have name,
value and optional boolean mutable, with one common let/const kind, fresh unique
names and a bound of64. All declaration initializers/condition/update/body share the
native lexical scope; result uses the outer scope. Emission is native for syntax,
with declarations at their original header position, preserving TDZ and distinct
per-iteration let bindings. It does not lower iteration to while or snapshots.

`HostLocalUpdate` has name/operator/prefix, accepting only ++/-- and boolean prefix
on an explicitly mutable local. It emits the actual variable update, preserving
native ToNumeric (including BigInt), prefix/postfix results and thrown identity.
Existing property update and prior artifact bytes remain covered by regression.

Direct source bodies retain their own return/loop/coroutine permissions. Expression
wrappers have their own loop break/continue but cannot borrow source return or
await/yield. Header expressions cannot transfer source control; nested functions,
arrows and class bodies reset loop/switch permissions. Existing depth64/node4096
and collection/scope/readonly guards remain unchanged.

Both actual CLI targets execute under Node against42 paired mechanics groups:
numeric/string/nullish/boolean/symbol/BigInt updates and coercion side effects,
multiple declaration headers, initialization/test/body/update order, closures,
continue/finally/break/return/throw, omitted/expression headers, const, forward/self
TDZ, shadowing, nested switches/loops, mutation, lexical this, generator header
suspension and asynchronous thenable/rejection sequencing.

`schema-classic-for-provenance.json` records the exact original line505 list loop
and its source range/hash in the pinned962-line Schemastery source. Runtime checks
verify the entire original hash and selected range. The checked Mithril example
and offline TypeScript-erased reference use an explicit validateVolatileSchema
observation helper.18 paired groups cover empty/dense/sparse lists, growth/shrink,
replacement, proxy reads and helper/length errors, preserving path and seen identity.
This is the original loop node, not the full volatile validator or Schema runtime.

Actual browser/native/Q9 and full Harness API/plugin/profile/Session parity remain
separate. This prerequisite is operator-authored with no new System One inference,
model source adoption or measured coding gain.
