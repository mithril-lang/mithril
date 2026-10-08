# Native property deletion, loop bindings and object methods for reflect

The original Cordis reflect source at upstream
441416c0048aa4281bffe59c1c7b5e13e08a9ec1 requires three additional native syntax
features after the coroutine prerequisite: delete properties during service
cleanup; bind `for (const [key,value] of entries)` inside generator effects;
and create the ordinary object-literal methods used for accessor hooks.
These features now have checked inert Mithril admission and actual JS emission.

* `HostDelete` (`mithril/host-delete`) takes exactly object/key expressions and
  emits native strict `delete object[key]`, with native coercion, Proxy traps,
  boolean results and strict/invariant failures.
* `HostForOf.binding` retains its old string shape/IR/output or accepts exactly
  `{"array":["key","value"]}` (Mithril: `(rdf/node :array ["key" "value"])`).
  A bounded, unique, fresh, immutable name list is alpha-renamed into native
  array binding syntax. Empty patterns are supported. Defaults/rest/nested
  patterns are not admitted. Names are body-local and cannot escape into the
  iterable/result. Native iteration performs both inner binding-iterator close
  and outer loop-iterator close; no indexed-read surrogate is used.
* `HostObject.entries` retains existing key/value/infer_name entries or adds
  exact `kind:"method"`, key, params, rest, body entries, with optional boolean
  statements/async/generator flags. Native computed object method syntax keeps
  name, arity, enumerable data descriptors, nonconstructibility, arguments,
  dynamic this and new.target, lexical arrow inheritance and mutable super
  home-object behavior. Ordinary functions do not inherit method super or
  coroutine permissions. Method defaults cannot suspend. These are ordinary
  methods named get/set, not getter/setter declarations; other kinds are refused.

[Binding/delete source](../../../examples/native-js-reflect-bindings.mith) and
[object-method source](../../../examples/native-js-object-methods.mith) compile
through both actual CLI targets. The source suite passes 42 tests / 162
assertions, including 17 binding/delete refusals and 20 method refusals.
[Binding/delete controls](../../fixtures/native-reflect-bindings-contract.mjs)
compare 48 groups against native JS references: delete absent/own/inherited/symbol
properties; primitive/nonconfigurable/Proxy failures; no property getter read;
operand/key coercion order and thrown identity; destructuring custom iterators
without index access; short/long/Unicode rows; inner/outer close and abrupt close
precedence; iteration closures; return/continue/break/finally; generator suspension
and close; expression-mode loops; representative asynchronous allSettled cleanup
ordering and strict deletion failures. The cleanup fixture is a primitive control,
not the complete original reflect implementation.

[Method controls](../../fixtures/native-object-methods-contract.mjs) compare
24 groups: exact property/function names, arities/descriptors/prototypes and
nonconstructibility; computed key ordering/throw; symbol names including empty
and absent descriptions; __proto__ as an ordinary computed method; strict this,
arguments/default/rest/new.target; extracted super calls after changing the
home-object prototype; arrow lexical super; async/generator behavior; source
return/finally and thrown identity. These are finite Node controls; executing
js-browser output in Node does not qualify an actual browser, native or Q9 host.

Retained full utils/logger/suspension contracts, 40-export package / 15 groups per
target, seven frozen leaf artifacts and strict original CosmoKit declarations
(446 nodes; 10 positive / 12 negative groups per target) also pass. Existing source
and artifact output is retained for old shapes. Scope/shape/budget refusal guards
remain independent of runtime controls. The compiler reads no original TS and
performs no arbitrary source execution.

Operator-authored; new System One inference/repair/adoption counts remain zero,
and prior completed model failures remain sealed. Next is the COMPLETE original
reflect runtime source with genuinely compiled full CosmoKit/utils dependencies
and source-derived original program-emitted oracle controls. Then the four-file
context/events/fiber/registry SCC, service/index, public Cordis types and named
ESM/live initialization, complete Schemastery and full Harness API/plugin/profile/
Session/browser/native/Q9 parity remain. Missing org Harness delivery destination
still requires clarification. This prerequisite is not full migration completion
or measured model quality improvement. The corrected program static graph is
retained in the [coroutine qualification](../native-js-suspension/README.md).
