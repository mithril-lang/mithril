# Literal ECMAScript identifiers

Stage 36 admits literal dollar and Unicode identifiers in native runtime bindings,
package exports and declarations. The same checked grammar uses ECMAScript
ID_Start/ID_Continue with dollar, underscore and permitted join continuations.
Names are emitted literally; escapes and normalization are not introduced.
Existing reserved-word guards, logical module paths and all budgets remain intact.
The internal global registry prefix is outside the admitted identifier grammar,
so a real `$global` namespace cannot capture global declaration ownership.

Eight independently written JavaScript functions verify export names, function
names, arity and 24 behavior pairs per execution label. Strict original-paired
TypeScript consumers cover four positive and four negative cases, including
Unicode normalization distinctions, dollar generic parameters and source/global
namespace isolation. Fifteen exact admission refusals cover malformed identifiers,
injection, synthetic global references and the existing declaration name limit.
Both actual CLIs verify exact artifact bytes and pre-write injection refusal.
Both `js` and `js-browser` labels run in Node; browser execution is unqualified.

The motivating original Typert host/client bodies contain `$schema` factory
names. Compiling those bodies is separate evidence; this stage does not qualify
the complete LLM generated API or System One inference performance.
