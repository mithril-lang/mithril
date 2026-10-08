# Native arguments/type-operator foundation and actual System One evaluation

This is the next language prerequisite for the **whole** CosmoKit types.ts runtime:
is, Binary namespace and four aliases, clone and deepEqual. The full original
source is included in the selected task. No scalar-only module is substituted
for that complete scope, and types.ts is **not yet runtime qualified**.

## Language behavior

HostArgumentsLength (exact @type only; mithril/host-arguments-length Form tag)
reads native arguments.length from the nearest source normal Function or
LocalFunction. Arrows and generated expression IIFEs capture that frame lexically;
parameter defaults have the native per-call arguments object. Missing/extra and
explicit undefined arguments count as actual arguments, not declared parameters.
Module initializer/native-arrow contexts without a source normal function refuse;
a LocalFunction body creates its own frame, its result retains its outer frame.
Checker scope is passed explicitly, including Let initializers and bodies.
No rest array, opaque argument inspection, runtime call wrapper, guest ABI or eval.

Closed HostBinary whitelist adds instanceof,+,-,%,< with native primitive/BigInt
coercion, order, Symbol.hasInstance, proxy behavior and opaque exception identity.
New operators use separating spaces (1- -3 stays subtraction); existing ===/!==/>=
and in emitted bytes stay unchanged. Shared expression/source budgets and bounded
guest/native profile separation remain intact. Old checked IR is unchanged when
new operations are absent. Four existing mapValues/misc/array/volatile artifact
hashes remain preserved.

## Actual authenticated production System One attempt, 2026-10-08

Source main f78ce5756261131509aca0a5f417923eb0c4447d. Six complete selected files,
81,848 task JSON bytes, goal2,848 characters. Only native_js.cljk/form.cljk editable.
The approved full repository and frozen dependencies form the offline seed.
Before inference, old source81/431 and16 native reference runtime groups passed;
task/control/image fixed. One actual proposal attempt, model repair budget0.

Modelqwen/qwen3.8-27b returned two file changes in70.186 seconds,
23,962 prompt tokens /3,251 completion tokens. Monetary cost unknown.
Materialized changes/receipt were read from the visible public DOM; task identity
f7aebab41effb8f774d45334d50a563acd6e87b4bd3803a3cc172016e3287602 matched before
applying/verifying. Scope/hash admission was not behavioral qualification.

Raw candidate **passes the16 new native runtime groups**, but changes every old
binary operator's whitespace and therefore old misc/array/volatile artifact bytes.
Retained suite81/431 executes with2 failures/0 errors. The frozen new-feature
control also refuses the changed volatile artifact. Composite unassisted
acceptance0/1 for this task. Do not report a syntax failure or failure of all
new runtime semantics: the observed failure is stable artifact preservation.

Source inspection then found missed propagation of arguments scope into Let
initializer checking. Separate additional controls were created **after inference**;
they are not presented as pre-inference controls and do not change the already
failed frozen result. The raw candidate rejects a valid normal/default/local-function
Let initializer arguments read; the additional raw log records that failure.
Four module/loop/arrow/local-function-result scope refusals and3 runtime boundary
groups protect this requirement in the product source suite.

Final implementation is **operator repaired model output**: exactly two source
edits, propagate arguments scope for Let initializer and preserve old operator
bytes while spacing new operators. No model repair/retry occurred. Both raw and
operator candidates use the same original fixed official verifyRefactor plan;
operator passes. Raw/receipts, fixed plans/results and additional scope logs retained.

## Evidence and remaining scope

Approved image sha256:f73b2ecd3adebf79a19ba8f32bed6b0231ae056c0908d63e4d660fbcb570e383.
Official verifier uses digest-pinned networknone/read-only/uid65534 bounded container,
complete approved seed copied to workspace then selected overlays, no host checkout,
credentials or ambient env. Source classpath starts workspace; dependencies frozen.
Node24.21.0, java/javac/clojure/clj shadowed and marker absent.

- Same fixed plan: paired retained81/431, reference16 runtime groups and candidate
  6 admissions/6 malformed or scope refusals/2 budget refusals/1 Form tag pass.
- New native runtime16 groups cover actual argument count, retained arrow capture,
  default/LocalFunction/module initialization frames, arithmetic cross product,
  negative literal/negative zero/BigInt, ToPrimitive order/throws, custom
  Symbol.hasInstance, primitive/nonconstructible operands, foreign realm and proxies.
- Additional3 Let scope runtime groups and4 structural scope refusals pass after
  operator repair; raw candidate fails them. Old IR and volatile hash asserted.
- Maintained native suite18 tests/82 assertions and full registered83/433 pass,
  zero failures/errors, no JVM fallback. Source CI/main publication is a later gate.

The smaller task produces working new runtime semantics, unlike the previous
volatile language task's parse failure. These are **different tasks**, so time or
success differences are not a matched model improvement experiment. Investigate
recursive call-site completeness and stable old emission as explicit repair gates;
operator repairs remain excluded from unassisted model acceptance.

Next prerequisite plan from actual types.ts: exported Binary value object must
share identity with all function aliases; native indexed loops must retain early
exit/no extra observable reads; template coercion must preserve ToString's string
hint and Symbol failure without an extra host String call. Then port the whole
module, including Buffer-present/absent branches, clone prototypes/descriptors/cycles
and deepEqual volatile/cycle/strict behavior, linked to real Mithril misc/volatile.
Public types, package linking, string/time, Schemastery, Cordis/Include/Loader SCC,
remaining Harness341 packages, complete API/plugin/Session and normal native/Q9
qualification stay open. Node evidence does not prove actual browser execution.
