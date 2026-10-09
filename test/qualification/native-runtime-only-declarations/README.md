# Explicit runtime-only exports and original YAML named types

Single declaration documents and declaration modules accept optional
`runtime-only-exports`, a vector of at most 128 distinct export identifiers.
Typed value exports and explicitly listed runtime-only values must be disjoint,
and their union must exactly equal the actual checked runtime surface. Omitting
the field preserves the existing exact-match requirement. Non-entry barrels
without a native runtime identity cannot declare runtime-only values. Typed
binding origins and mutable binding checks remain required. Runtime-only names
never become type or value symbols in the declaration registry or emitted types.

The portable qualification checks 25 exact-code refusals, actual single-file and
multi-module CLI artifacts, exact runtime and declaration bytes, and an independent
counter fixture with 2 positive/2 negative strict consumers for both declaration
artifacts. Runtime-only functions remain executable from actual native ESM.

The source-derived YAML API view contains all 18 pinned `@types/js-yaml` 4.0.9
source declarations, including overloads, mutable schema bindings, classes,
interfaces, index signatures, `this` callbacks and UMD namespace syntax. Its
emitted TypeScript syntax is compared with the original declaration tree, with
only declaration/export modifiers, equivalent property names and parentheses
normalized. Separate original/candidate strict programs check 11 positive and
12 negative consumers with exact diagnostics and no skipLibCheck. There are 10
named typed value exports and 15 actual runtime exports. The five omitted values
are `default`, `safeDump`, `safeLoad`, `safeLoadAll` and `types`; the latter four
are absent from the pinned public types and are not invented as typed APIs.

Both CLI labels execute under Node. The synthetic default namespace wrapper is
still pending: this API view is a required dependency of that wrapper, not a
replacement for the complete public YAML entry or Include's default import.
Original YAML declarations and MIT notices are retained under
`test/fixtures/include-sdk/yaml-types`. This work is operator-authored and is not
new System One performance evidence.
