# Global type declarations and full Schemastery declaration graph

NativeJsDeclarations and NativeJsDeclarationModule accept an optional `globals`
vector of exact `{declarations}` blocks. The supported declarations are aliases,
interfaces and namespaces. Each ambient declaration is semantically public even
when its original syntax omits `export`. A synthetic global scope is shared by
modules while each global block retains the source module's lexical type/value/
import frame. Globals do not enter module export tables. Source-private unique
symbols are merged by canonical owner, not by spelling; unrelated private keys
remain distinct. Global-only inline imports participate in dependency reachability.
Global runtime-valued declarations are refused by this type-only profile.

Emission preserves original names/export flags inside `declare global` and omits
ordinary namespace module markers only in that ambient context. Missing/empty
collections preserve old source bytes and the checked shape for missing fields.
Existing collection, namespace-depth and total-node budgets remain shared with
ordinary declarations; this adds no raw TypeScript/JavaScript delegation.

The full hashed original Schemastery `index.d.ts` supplies all 16 namespace
members, 42 callable/constructable interface members and seven private declaration
nodes. Their normalized grammar fingerprints and imports match the candidate.
The candidate depends on the actual Mithril-owned CosmoKit and StandardSchema
modules, with no Schema/type observation helpers or external type adapters.
Original and candidate globals are checked in separate TypeScript programs;
candidate programs must not resolve any original fixture. This prevents accidental
cross-program ambient merging or borrowing original types.

The entry intentionally exposes the original dual Schema binding through a
**type-only default selector**. The original comparator uses the same erased
selector. The complete private/global declaration graph is tested, but the native
Schema runtime is not yet implemented or exported. Its tiny native module owns
only a private Symbol binding; the actual runtime root exports nothing. This
stage therefore does not prove full default-value API or Schema execution parity.

Both Node-executed js/js-browser targets qualify six declaration CLI artifacts
and four native runtime CLI artifacts. Every declaration file matches checked
compiler bytes. The Schema graph has 52 positive and 22 negative consumer groups
per target, including factory/constructor/call inference, metadata, required/
volatile/default modes and StandardSchema members. Operator-authored five-module
and legacy mechanics have respectively 8/11 and 6/9 positive/negative groups;
they exercise private nominal/computed owners, implicit/nested ambient visibility,
imports and global-only inline dependencies. This totals 216 paired strict groups.
Four fresh Node imports confirm empty runtime roots and no fabricated global
Schema/GlobalModel object. Fourteen exact refusals include shapes, values, names,
arity, scope, duplicate owner, collection, depth and shared total budget. The full
runner retains all 12 previous stages and adds this independent 13th stage with
unchanged 300-second per-stage and 10-minute CI-job guards.

Next dependencies are the genuine full Schema runtime and value export, then
Loader/Include and whole Harness API/plugin/profile/Session/browser/native/Q9.
TypeScript 6.0.3 and Node ambient types 26.6.3 are qualification tools only.
System One trial results are recorded separately from operator implementation,
local verification, CI, publication and whole-Harness equivalence.


## Actual System One emitter trial

One fresh authenticated public `code.mithril.fund` trial used the baseline
emitter from main311c2af and the new checker as read-only context. Only the emitter
was editable; the operator solution was withheld. Before inference, the exact
source/goal/image/check plan was sealed. The fixed offline plan independently
verified the operator candidate, preserving baseline/candidate native source and
const-generic contracts and requiring the complete global contract for candidate.
An initial preflight failed because the old wrapper omitted the native engine
variable; the corrected plan uses the maintained source launcher. This occurred
before model admission and did not alter tests or generate a model request.

The one admitted model request returned `invalid_refactor_edits`, with completion
chatcmpl-ea230788-d0e3-40a9-93cb-00ee136cbea6,140.266 seconds,26706 input and5261
output tokens. No candidate was admitted, so independent model compilation/tests
were not reached. Attempts1/repairs0,cost unknown. Same-ID lookup returned exactly
the saved input/completion/usage/timing receipt without new inference. No model
source was adopted and no coding gain is measured. See system-one-evaluation.json.

The fixed failure code covers several edit-shape/count/scope/content conditions;
this receipt contains no finer detail. It does not identify ambiguous anchors
(the service uses a separate code for that). Add bounded fixed diagnostic detail
before attributing a cause, then evaluate separately sealed smaller-context or
complete-file generation strategies with the same independent contracts. Do not
retry this completed request or rewrite its result as a compiler failure/success.
