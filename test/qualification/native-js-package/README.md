# Checked native module packages

The native package profile composes genuine checked Mithril leaves into a public JavaScript ESM library. `examples/native-js-cosmokit.mith` declares the original six-module CosmoKit index. The package checker resolves imports, initializes shared dependencies once in source DFS order, and preserves actual exported function/object identity. Explicit-grant artifacts validate the aggregate capability keys before initialization; public library artifacts use compiler-owned lazy global getters and expose only the original 40 public names.

This profile admits **acyclic, unambiguous packages**. It refuses cycles, ambiguous star exports, unknown/unreachable modules, incorrect grants, undeclared links, changed source identities, unsafe source paths, and bounded collection/source violations. The CLI accepts only `js` or `js-browser`, reads regular local `.mith` leaves, and completes admission before writing output. The existing restricted guest checker refuses native packages.

```sh
node <pinned-engine>/cli.js --config <offline-source-config> -cp src \
  bin/mithril-native-package.cljk examples/native-js-cosmokit.mith \
  --target js --output /tmp/cosmokit.mjs
node scripts/test-native-package.mjs --engine <pinned-engine>/cli.js
```

The fixed oracle is unmodified original TypeScript emitted by TSC 6.0.3, ES2022/ESNext, into the seven fixture modules. Provenance and hashes are in `test/fixtures/cosmokit-package/provenance.json`; the original license is `test/fixtures/COSMOKIT-LICENSE`. The tests run 15 positive source-derived groups in fresh Node VM realms for each actual CLI target: all 40 exports, namespace/function metadata, initialization order and host reads, all leaf API groups, Buffer-absent and Buffer-present codecs, shared volatile state and clone identity, mutable Time and late host access. Generic shared-object tests verify once-per-package initialization, alias identity, independent instances, and aggregate grant refusal before initialization. Additional controls cover malformed input, cycles, ambiguous exports, safe read plans, CLI sentinel preservation and symlink refusal. Seven previous compiled leaf hashes must remain unchanged. CI also retains the native 28-test/121-assertion suite.

These are Node VM and actual CLI results, **not** an actual browser run, complete input-domain proof, checked public TypeScript declarations, non-JS/Q9 compatibility, arbitrary SCC linking, or full Harness API/plugin/profile/Session parity. Those remain separate downstream gates. Original `.d.ts` files retained in the external evaluation are reference-only, not a Mithril type facade.

The operator compiler was withheld from the model and independently passed the fixed isolated container controls before the live System One request. The sole editable model path is the absent `src/mithril/native_package.cljk`. Input identity, pinned image, frozen controls and actual model outcome are recorded in the evaluation record; operator implementation must never be attributed to the model.

## Actual System One outcome

The real public request returned model `qwen/qwen3.8-27b`, one attempt, repairs 0, 100.603 seconds, 23,866 prompt tokens and 4,033 completion tokens. Input identity matched the pre-inference seal. The unmodified proposal **failed source parsing** at line 188:76 (unmatched delimiter); candidate package runtime comparisons were not reached. The editor proposal was not adopted. Retained native tests and original source oracle passed independently.

Same-execution public result retrieval returned the identical completion ID, source proposal and inference receipt. This verifies completed-result recovery for this actual request; it does not measure model compatibility performance. API cost is unavailable. One attempt does not establish a general success rate.

The published compiler is the byte-identical operator source that passed all isolated controls before inference, withheld from model input and image. `evaluation.json` records attribution, hashes, actual failure and proposed improvements. No model repair was attempted, and frozen controls remained unchanged.
