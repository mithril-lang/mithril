# Schemastery default value SDK

The new `examples/native-js-schemastery-{esm,program}.mith` entrypoints combine
full source-authored native Schema with its own seven-module Mithril CosmoKit
closure and the complete original private/global declaration graph. The original
`native-js-global-schemastery-*` erased-runtime fixtures remain unchanged.

`native-js-schemastery.mith` translates the entire pinned 962-line original
`test/fixtures/schemastery-declarations/original-index.ts` runtime into inert
Mithril source. TypeScript is used only for authoring and the independent test
oracle. Neither production compiler nor candidate runtime loads original source,
TypeScript, an adapter to Schema, or original dependency JavaScript. Explicit
ambient imports preserve original free-global semantics in serialized callbacks.

The same actual ESM/declaration CLIs run for `js` and `js-browser`. Their artifacts
are checked against in-process compilation and assembled into one SDK directory.
Strict TypeScript 6.0.3 consumers import its actual default value. Original and
candidate declaration graphs have separate programs: all 16 namespace declarations,
42 interface members, seven private declarations and imports are compared;
54 positive and 21 negative consumers preserve exact original refusal codes.
Candidate type resolution cannot load original fixtures.

The runtime test uses hash-verified original Schema source and the pinned original
CosmoKit output as its independent oracle, in a separate process. It exercises
26 paired runtime groups, restored Date callbacks and complete own static/prototype
descriptors. The candidate imports only its own compiled CosmoKit. Original code
is transpiled only in an oracle temporary directory, never into candidate output.

Both target artifacts execute under Node. These checks do not prove every Schema
input or actual browser/native behavior, Loader/Include parity, or the whole Harness.
Run through `scripts/test-native-declarations.mjs` with the pinned toolchain.
The translated source retains the upstream [MIT license](../../fixtures/schemastery-declarations/LICENSE);
source hashes and the pinned dependency snapshot are recorded in `provenance.json`.
