# Checked public native declarations

`examples/native-js-cosmokit-declarations.mith` contains the complete original CosmoKit declaration shapes as inert Mithril data: 446 type nodes, 40 runtime values, 11 public type bindings and 49 unique public names (camelize/hyphenate occupy both spaces). The compiler admits exact node shapes, names, generic arity/defaults, namespace visibility, mapped/infer/predicate scopes, the matching genuinely checked runtime package and bounded collections/depth/source. It emits declarations from admitted data. [SCHEMA.md](SCHEMA.md) specifies the profile.

The compiler does not parse or copy original TypeScript source, call TSC or depend on TypeScript. During authoring only, the original declaration AST was structurally converted with TypeScript 6.0.3 into the Mithril data document. This provenance is explicit in [the oracle record](../../fixtures/cosmokit-declarations/provenance.json); original license is [COSMOKIT-LICENSE](../../fixtures/COSMOKIT-LICENSE). Original declarations are immutable test fixtures only.

Emit runtime and declarations with the same output basename:

```sh
node <pinned-engine>/cli.js --config <offline-config> -cp src \
  bin/mithril-native-package.cljk examples/native-js-cosmokit.mith \
  --target js --output /tmp/cosmokit.mjs
node <pinned-engine>/cli.js --config <offline-config> -cp src \
  bin/mithril-native-declarations.cljk examples/native-js-cosmokit-declarations.mith \
  --target js --output /tmp/cosmokit.d.mts
node scripts/test-native-declarations.mjs --engine <pinned-engine>/cli.js \
  --typescript <typescript-6.0.3>/lib/typescript.js --type-roots <@types-directory>
```

The CLI accepts js/js-browser, checks the local runtime manifest and regular non-symlink runtime leaf files before admission, and writes only after checks succeed. An unsupported target refuses before reading a source. Invalid target/missing-source tests preserve existing output. The restricted guest compiler refuses this context.

Both actual CLI targets emit .mjs/.d.mts pairs. Ten positive and twelve original-source-derived negative consumer groups import the .mjs pair under strict TypeScript 6.0.3; no skipLibCheck. The oracle checks exact public names/type-value flags, full bidirectional public value namespace assignability, utility and template inference, generic defaults, overload predicates, readonly arrays/volatile snapshots, Binary/Time namespaces, nullability, helper arity and private visibility. Original and candidate negative diagnostic code arrays must match; no unexpected diagnostics are ignored. Separate generic Toy declarations exercise non-CosmoKit echo/conditional-infer and nested private namespace scope. Each target also passes all 15 original runtime ESM groups in Node VM. Existing native 28 tests/121 assertions remain green.

[The isolated receipt](operator-container-generic-preflight.json) records the five baseline/candidate checks in a pinned, network-disabled, nonroot, read-only container with 1 GiB/2 CPU limits. Its baseline is published main d5eb8e3 plus explicitly recorded readonly compiler/profile/control overlays; the operator checker is withheld and absent from the seed. [The seal](pre-inference-seal.json) fixes task, plan, image and control hashes before any model request. This implementation is the identical independently qualified operator checker.

## System One evaluation status

The prepared System One task allows only the absent checker file; emitter/schema/full AST and controls are readonly. No inference was sent. The public UI navigation was refused with ERR_BLOCKED_BY_CLIENT; the maintained API CLI has no configured MITHRIL_API_TOKEN. [The access record](live-access-blocker.json) and [evaluation](evaluation.json) report requests 0, repairs 0 and null model metrics. No model proposal is adopted or scored. The previous completed package trial and unknown legacy Time trial remain preserved.

The checker/emitter split and exact schema respond to the previous package model proposal's parse failure; their effect on model performance is **unmeasured**. Run this unchanged sealed task after authenticated access is available and evaluate the unmodified proposal with the fixed container controls before adoption.

This is bounded AST/scope/arity admission plus checked public declarations for the stated consumers, not a replacement for TypeScript semantic checking or an all-input-domain proof. Actual browser execution, other targets/Q9, arbitrary cyclic packages, downstream Cordis/Schemastery and full Harness API/plugin/profile/Session parity remain separate gates.
