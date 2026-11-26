# Archive (Item 224 §B)

Nothing has been moved into this directory yet. This note records the intended
§B end-state and the CURRENT status of each reference:

- `bin/mithril-native-*.cljk` — still in `bin/` and still EXECUTED: CI runs them
  through nbb as the parity oracle for `bin/compiler/mithril-native-*.mjs`
  (see `scripts/test-native-*.mjs`, `test/qualification/*/controls/*.cljk` and
  `scripts/verify-compiler-bundle.mjs`). Do not delete or treat as frozen until
  the bundle parity job is the only consumer.
- `test/qualification/native-*` — live qualification corpus, executed by CI;
  not deleted, not frozen.

The `examples/native-js-*.mith` corpus stays in place, never deleted.
