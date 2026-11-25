# Archive (Item 224 §B)

Moved here (NOT deleted): legacy `native_*` + `bin/` `.cljk` guest-path references used only by the pre-§B guest tests (`.mjs`/`.d.mts` oracles).

- `bin/mithril-native-*.cljk` — superseded by `bin/compiler/mithril-native-*.mjs` (AOT bundle); kept frozen as the CLI contract reference, not executed.
- `test/qualification/native-*` — frozen corpus + oracles, not deleted; guest-path tests now assert Amu receipts (`:mithril.module/amu-native-source-v1`) instead.

The `examples/native-js-*.mith` corpus stays frozen, never deleted.
