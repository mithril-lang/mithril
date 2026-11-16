# Native private fields and complete util-values runtime

The native host grammar accepts an optional boolean `private` on class fields,
methods, getters/setters, property reads/writes, updates, compound/logical
assignments, method calls (including spread arguments), optional reads and
optional-chain get steps. A true flag requires a literal valid JavaScript
private identifier without `#`; the compiler emits actual `#name` syntax.
Unicode and dollar names are admitted. Runtime privacy is enforced by the
JavaScript engine, retaining genuine brands, receiver errors and initialization.

Private names are resolved lexically, including nested functions/defaults,
arrows, object methods, classes, static blocks and computed public member keys.
Heritage expressions use the enclosing private environment. Duplicate names
are refused except matching getter/setter pairs with the same static flag.
Private constructors, undeclared names, malformed flags/keys, extra fields and
private delete/super requests are refused. A private key cannot escape as an
ordinary expression. Thirty-six exact-code refusals and actual CLI exit-65
no-artifact checks run alongside absent/false ordinary byte compatibility.

An independently authored native JavaScript oracle supplies 26 paired groups
and full exported class/function descriptors. It exercises reflected own keys,
forged/proxy/primitive receivers, distinct/inherited brands, numeric updates,
single receiver/RHS evaluation, abrupt completion, logical short circuits,
optional calls, private method names, initialization order, accessors, Unicode
names and nested lexical owners. A legacy LocalFunction control separately
checks private access in both its body and parameter default. Oracle provenance
is explicit; it is not an upstream Harness file.

The complete pinned original util-values source at Harness commit
`441416c0048aa4281bffe59c1c7b5e13e08a9ec1` is also ported to inert
Mithril. Its genuine two-file cycle and all seven runtime exports are retained,
including the entire PartialArguments parser with all 16 private fields and
every JSON validation/snapshot/freeze/weak-map helper. All original fixture Git
blobs, SHA-256 hashes and candidate source hashes are checked. Both actual CLI
labels reproduce every artifact byte and pass 102 unchanged upstream runtime
groups in separate original/candidate Node processes. TypeScript erases the
original oracle/test sources only; candidate bodies are emitted by Mithril.

Compiler source/node/depth/module budgets remain unchanged. Both CLI labels are
executed under Node; this does not qualify actual browser/native/Q9 execution.
Complete util-values public declarations, independent JSON utility coverage,
publication and the full Harness migration remain pending. The port is operator
authored and does not constitute a System One model trial.
