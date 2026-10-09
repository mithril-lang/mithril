# Complete util-values SDK qualification

Stage 29 preserves the complete original two-file source cycle, seven runtime
exports, four public types and all nine original declarations. Both actual CLI
labels compile their own Mithril runtime and declaration modules; execution is
under Node, not a browser or another native backend.

TypeScript 6.0.3 is used only to re-emit pinned original source declarations and
check consumers. All original sources, declaration fixtures and Mithril sources
have checked SHA-256 provenance; original source Git blobs are also checked.
The candidate compiler never delegates its runtime or declaration body to
TypeScript. Strict consumers include six positive and sixteen negative groups.
Real NodeNext duplicate installs preserve nominal private identities at the same
package version and reject cross-version assignments. A separate control uses
the candidate's actual `#private;` node with no ordinary private fields, ensuring
those fields cannot conceal missing ECMAScript private nominality.

The bounded declaration member `private-brand` emits exactly `#private;`. It
admits no names, modifiers or other fields and rejects duplicate markers. Eight
exact-code controls cover these refusals. Existing opaque named-private members
and readonly modifiers retain their original semantics.

Seventy-five original-paired JSON helper groups cover lossless validation,
snapshot detachment, cycles, shared aliases, prototype-safe `__proto__`, recursive
freezing, structural equality and exact assertion failures. The earlier stage
retains all 102 unchanged upstream parser/WeakMap test groups and the independent
native private-field controls. The port is operator authored; this qualification
is not a System One model trial or a model performance measurement.
