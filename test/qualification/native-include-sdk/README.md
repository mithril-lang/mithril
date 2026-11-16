# Complete Include source SDK

The complete pinned `vendor/include/src/index.ts` body is authored as inert
Mithril in `examples/native-js-include.mith`. Its actual ESM SDK links 25 own
Include/Loader/Cordis/CosmoKit runtime modules. Public exports are `Include`,
`applyEntryPatches`, `entryListSchema` and the genuine default `Include` identity.
The public declaration graph has 19 modules and preserves `PatchOptions`,
`Include.Config`, private members, inherited tree contracts, the fixed unique
symbol marker and asynchronous initialization/disposal signatures.

The runtime uses the original Node host imports and pinned `js-yaml@4.2.0` as
explicit external dependencies. The declaration program binds `yaml.Schema`
to that external package; strict original/candidate consumers resolve the full
pinned `@types/js-yaml@4.0.9` declaration package, matching the original lock
integrity. This does not claim that YAML itself has been translated to Mithril.
Source, full runtime erasure, full original declaration emission, MIT notices
and every fixture SHA-256 are in `test/fixtures/include-sdk`. TypeScript is used
only for authoring, the original declaration oracle and independent consumers.
Candidate compilation and runtime do not delegate to TypeScript or original
Include/Loader/Cordis code.

Declaration qualification stage 20 runs both actual CLI labels, verifies exact
runtime/declaration artifact bytes, and checks public type/value symbol spaces.
Six positive and eight negative original-paired strict consumer groups must
match exact diagnostic codes without skipLibCheck. Each consumer is its own
virtual module in a separate original/candidate TypeScript program.

Thirty-two paired runtime groups per label execute in separate original/candidate
Node processes. They cover source class/prototype descriptors, YAML `!!js`
round-tripping and JSON schema behavior, patch composition and retained row
identity, real file mounting, valid/invalid refreshes, missing-file initialization,
actual temp-write/rename, queued failure/recovery, unchanged-path config patch
updates, readonly refusal, unsupported extensions and owner cleanup. The readonly
flag is controlled directly; this is not filesystem permission/ACL qualification.
Retry fixtures temporarily wrap the real Node filesystem/timer exports within
each owned child process, synchronize builtin ESM live bindings, perform actual
writes/renames and real delays, and restore the exports in `finally`. All three
retryable codes, delay progression, eleven attempts at exhaustion and the final
host error are checked. No production process or host permissions are modified.

The control rechecks fixture/archive hashes, extracts only the pinned archive,
links YAML within fresh owned SDK directories and cleans its temporary paths.
`js-browser` is executed under Node here; actual browser/native/Q9 execution is
still pending. Full YAML source/type closure, broader Include/HMR contracts and
the full Harness API/plugin/profile/Session refactor remain separate gates.
No new System One trial, adoption or model performance gain is claimed.

Run through `scripts/test-native-declarations.mjs`, or run the stage control with
`MITHRIL_DECLARATIONS_ENGINE`, `MITHRIL_DECLARATIONS_TYPESCRIPT` and
`MITHRIL_DECLARATIONS_TYPE_ROOTS` set to the pinned tools documented in the
continuation map. Both actual CLI targets must pass before delivery.
