# Native UMD declaration qualification

Optional `umd-namespace` metadata in single declaration documents and declaration
modules admits one bounded identifier and emits `export as namespace <name>;`.
It does not register a global in Mithril's lexical registry, change runtime
exports, install a runtime global, or replace `declare global` semantics.

The operator-authored, hash-pinned TypeScript fixture exercises script access,
module access with `allowUmdGlobalAccess` disabled and enabled, type and value
namespace members, named and namespace imports, absent members, bad member types,
and assignment to the UMD namespace. Separate strict TypeScript 6.0.3 programs
check the original and actual single/program CLI artifacts with no skipLibCheck:
5 positive and 5 negative consumers for each artifact and CLI label. Negative
codes are 2686, 2339, 2322 and 2632. Both runtime CLI labels execute under Node;
no real browser qualification is claimed.

Admission controls reject 18 malformed namespace identifiers and two unexpected
fields with exact codes. Ordinary declaration bytes and checked public symbol
surfaces remain unchanged when the optional metadata is absent. Actual runtime
artifacts preserve the mutable exported binding and do not create `globalThis.jsyaml`.

This fixture isolates the language prerequisite used by pinned `@types/js-yaml`
4.0.9. It does not qualify its complete public types, synthetic default namespace,
UMD package resolution across all module modes, or System One model performance.
