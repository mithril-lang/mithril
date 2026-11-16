# Explicit default exports and private local declaration exports

NativeJsEsmPackage accepts an optional finite `entry-exports` vector of module/import/
export selectors. Explicit names override star conflicts; stars still exclude default,
deduplicate equal binding origins and suppress distinct ambiguous bindings. An entry
may select a default without star roots. Empty/missing selectors retain previous entry
bytes. The old acyclic NativeJsPackage profile refuses the new field. Admission/read
plans check exact selector shapes, unique output names, names, module/export existence,
reachability and128-entry/public-export limits before emission.

Declaration programs accept optional `local-exports` (local/export/type-only) for own
private/public declarations. Aliases retain canonical private symbol owners, class
visibility and actual native local/function binding identity. Local exports cannot
reference ambient/imported bindings; imported aliases use explicit reexport groups.
Public default names are accepted in imports/reexports, external contracts, namespace
queries and inline import types; local default identifiers stay forbidden. Declaration
stars exclude default. Direct runtime-owned entry declarations append an explicit
value/type default reexport. Legacy export-alias also accepts default.

Operator-authored hashed trusted TypeScript fixtures qualify the mechanism independently
of Mithril. They are not the full original Schemastery. Both Node-executed js/js-browser
CLI targets compile program/direct/legacy/type-only/dual alias+const/enum/enum-legacy declaration profiles
(14 artifacts), plus10 actual native runtime artifacts. A single strict TypeScript6.0.3
program with skipLibCheck:false compares200 paired logical consumer groups, including
private nominal owner identity, default type/value/import/namespace/inline references,
const generic inference, explicit shadowing, dual private alias+value and erased default.
Fifty-six paired runtime groups cover exact surfaces, default/named constructor identity,
instances/payloads/static capture, live updates through root/reexport aliases, module
namespace/name and absence of type-only/enum runtime defaults and actual folded enum consumer JavaScript. Twenty exact-code refusals cover
native selectors and declaration shapes/names/scopes/identity/links/collisions/budgets.
Actual CLI bytes are compared with checked artifacts. All child compilers use explicit
offline configuration and inherit the no-JVM/dependency-launcher guard.

This resolves a default export prerequisite. It does not prove original full Schema
runtime/declarations, global namespace support, Harness API/plugin/profile/Session or
actual browser/native/Q9 equivalence. Operator authored; zero new System One inference,
adoption or measured gain. TypeScript is only a qualification tool, not a production
compiler or delegated runtime source. Run `scripts/test-native-declarations.mjs` with
pinned engine/TypeScript/type roots for the full qualification.

The full declaration runner executes all11 independent qualifications sequentially.
Each has the unchanged300-second process guard, explicit offline config and inherited
launcher refusal; any failed stage stops the run. The CI job keeps its10-minute guard.
This partitions the growing suite without removing contracts or lifting stage limits.
