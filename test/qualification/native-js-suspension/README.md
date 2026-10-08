# Native suspension prerequisite for Cordis reflect

The checked inert AST adds `HostAwait` (`mithril/host-await`), `HostYield`
(`mithril/host-yield`, optional boolean `delegate` for yield*) and optional boolean
`async` on NativeLambda, `async`/`generator` on class methods. Output uses actual
JavaScript coroutine syntax, native Promise assimilation and generator protocols.
No interpreter, original-source evaluation or async helper replaces suspension.

Await requires the current source function/arrow/method to be async; yield requires
its current function/method to be a generator. Arrows preserve lexical this,
arguments, new.target and super but reset coroutine permissions. Ordinary nested
functions reset both. Parameter defaults, class fields and static blocks cannot
borrow suspension. Class heritage and computed member keys retain the enclosing
source permissions. Constructors/accessors cannot become coroutine methods.

Direct `statements:true` bodies lower Let/loops/try/throw directly. In expression
operands these forms introduce an ordinary compiler arrow, so suspension inside
that frame is refused. LocalFunction's outer result always uses a helper frame.
An explicitly nested async function can establish its own permissions there.
No top-level await, async iteration, async generator arrows or arbitrary raw
JavaScript is admitted. Omitted/false flags preserve old artifact output.

[The Mithril source](../../../examples/native-js-suspension.mith) is compiled by
both actual CLI targets. [Runtime controls](../../fixtures/native-suspension-contract.mjs)
compare 26 groups against native JavaScript references in Node: thenable getter/
microtask order, thrown/rejected identity, real Promise prototypes, generator
start/resume/return/throw and finally override, delegated iterator return/throw,
async generator request queuing/rejection, async arrow lexical receivers/arguments/
new.target, class method super/shape and enclosing suspension in class keys/base.
[Source checks](../../mithril/native_suspension_test.cljk) also cover scope/shape
refusals. At this original qualification: 38 source tests / 152 assertions. Retained package/runtime
and strict declaration controls must also pass. These are finite Node checks;
js-browser output execution in Node is not a browser host, native or Q9 claim.

The [corrected graph](cordis-program-runtime-graph.json) uses actual upstream
441416c0048aa4281bffe59c1c7b5e13e08a9ec1 program emit under base+Cordis options
with root/outdir/typeRoots adapters, including static imports AND reexports.
Const-enum erasure removes the apparent reflect→fiber dependency produced by
isolated transpileModule. Order: CosmoKit → utils → logger and reflect → SCC
{context, events, fiber, registry} → service → index. The nine-module target emit
retains 21 diagnostics; this graph is not original full-project typecheck/build,
tsdown bundle or dynamic provider/runtime verification. Prior five-/six-file SCC
claims are superseded by this scoped runtime graph.

Operator-authored; no new System One request, repair or model-code adoption.
Prior completed model failures remain sealed. The later [reflect prerequisites](../native-js-reflect-prerequisites/README.md)
add native for-of array bindings, property deletion and object methods. Next is
the COMPLETE original reflect source. Public Cordis
types, named ESM/live SCC initialization, service/index, complete Schemastery,
full Harness API/plugin/profile/Session/browser/native/Q9 parity and the missing
organization delivery destination still remain. This prerequisite does not
complete the full migration or demonstrate a model quality improvement.
