# Native Harness Scope runtime

The complete `packages/core/scope/src/index.ts` and `store.ts` sources from
`deepseek-ai/deepseek-harness` commit
`441416c0048aa4281bffe59c1c7b5e13e08a9ec1` are expressed as inert Mithril
modules. Their genuine import/re-export cycle links to the previously qualified
Cordis runtime, with no original runtime body or external package dependency.
The reachable package contains 16 own modules and exactly 11 original exports.

The control compiles both `js` and `js-browser` through the actual CLI, checks
all emitted bytes, and runs the unchanged upstream test bodies in separate
original/candidate processes. Its small assertion adapter implements only the
used Vitest assertions and spy calls. Type assertions are explicitly excluded
from this runtime evidence. Both processes must pass the same 21 groups;
exported function/class names, arities and property/prototype descriptors must
also match. Original TypeScript erasure is used only for the independent oracle
and upstream test execution, never by the Mithril compiler or candidate runtime.
Fixture hashes and the upstream license are retained under `test/fixtures/scope-core`.

The tests cover scope tagging, nearest context inheritance, synchronous setup,
shared async quiescence, raw-disposer ordering, opaque carriers, base-filter
receiver identity, global listener semantics, upward ancestor routing and
privileged parent rebind/cycle guards. Store tests cover duplicate diagnostics,
live iterator generations, exact idempotent undo, independent anonymous entries,
non-creating reads, shadow merge order, effect ownership/labels, notification
order, aggregate reclamation and failed-registration cleanup.

These sources and controls are operator authored. This does not constitute a
System One model trial. Public Scope declarations, strict consumer parity,
real browser execution, native/Q9 execution and complete Harness migration
remain pending.
