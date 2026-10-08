# Erased const enum qualification

Checked Mithril declarations express the two pinned original Cordis const enums,
LoggerLevel and FiberState, with finite numeric or string literal members. Their
names, const modifiers and members are compared against SHA-256 verified original
logger/fiber declarations. Enum bindings exist in TypeScript type/value spaces
and remain erased from the actual native ESM surface.

The selected ten-module declaration graph and genuine sixteen-module native
Context graph run through both actual declaration/native CLI targets (`js` and
`js-browser`), executed in Node. Each target passes 23 original-paired logical
strict groups; four additional original-paired single-document alias groups run
once, for 50 total. TypeScript 6.0.3 uses strict checking with skipLibCheck:false.
The root has five type exports, four TypeScript value bindings and one actual
runtime value (Context). Service is a type-only helper; both enums are erased.
Actual TypeScript JS emission folds four enum constants and the emitted consumer
runs against the actual compiled Context with no enum object or enum access.

Structured ambient Error/TypeError constructor heritage now agrees with the
original strict oracle. Arbitrary external values still cannot serve as class
constructors. Nominal enum/member identity, string enums, namespace member types,
whole-enum typeof and inline import queries are exercised. Direct typeof enum
member queries are refused, matching pinned TypeScript diagnostic 2475; inline
import member queries are valid. The legacy declaration emitter preserves local
enum aliases using export import and retains canonical member identity.

Admission includes 18 exact-code refusals for literal/name/shape/merge/scope/arity,
constructor and budget errors, plus a counterfeit actual native enum export.
Each enum has at most 128 members, including merged fragments, and accepts only
explicit finite numeric or string literals (strings at most 4096 characters).
Merges with other declaration kinds, duplicate members, raw expressions and
caller-supplied erasure metadata are refused. Existing node/depth budgets remain.

This selected qualification graph is not the complete original nine-module
Cordis declaration graph. External plugin/core type adapters, the full public
runtime root, full Harness/API/plugin/profile/Session/browser/native/Q9 parity
and System One performance remain separate gates. These changes are operator
authored, with zero new System One inferences, adoption or measured gain.

Run through `node scripts/test-native-declarations.mjs --engine <engine> --typescript
<typescript.js> --type-roots <@types>`. All child compiler calls use explicit
offline configuration and retain the no-JVM/dependency-launcher guard.
