# Mithril `.mith` artifacts on Amu native selfhost

Mithril accepts two `.mith` source forms in this path: JSON-LD Programs such
as `examples/tender.mith`, and inert `(mithril/module ...)` forms. The
frontend validates each form and lowers it to Kotoba source; the adopted Amu
G3 compiler then emits an `aarch64-macos` `.kseed` artifact.

For a JSON-LD Program, Mithril's existing compiler first produces the checked
`oak.transaction/v1` vector. The native module exposes that vector as the
canonical, inert EDN string returned by `transaction_edn`. The build driver
compiles a separate native string-equality harness and executes it against the
transaction string from the Mithril frontend. The native Amu ABI does not
export Mithril's `:document` type directly, so this boundary is an EDN string.
The downstream OaK reader remains responsible for parsing and re-admitting the
transaction before effects.

Typed `mithril/module` forms use a separate native-safe profile. It accepts
`i64`, `bool`, and `string` values, `add`, `sub`, `mul`, `eq`, and `not`, plus
local calls, `let`, sequences, and conditionals. It rejects `js-value`, JS host
intrinsics, and guest callables before emission. Those host-facing modules
continue to use their existing targets.

`src/mithril/runtime.kotoba` keeps its document-based OaK API. Amu's native
export boundary currently cannot accept a `:document`, so
`examples/modules/amu-transaction-runtime.mith` provides an explicit scalar
adapter for callers that already decoded the envelope: it checks the
`oak.transaction/v1` version and four top-level fields. The host still parses
and fully admits the OaK transaction; this small native check does not replace
that validation.

The Mithril frontend itself still runs on KBB/SCI. This integration uses Amu's
selfhosted compiler for native artifact generation; it does not claim that the
entire Mithril frontend has been ported to Kotoba.

## Reproducible build and execution checks

The build script pins Amu to current main commit
[`8af3a09e547e38885ed30f7bf674ed79f9144fff`](https://github.com/kotoba-lang/amu/commit/8af3a09e547e38885ed30f7bf674ed79f9144fff).
It rebuilds G1, G2, and G3 and checks their native image hashes and the
bootstrap container hash. The trusted C loader is the artifact entrypoint;
JVM, Node, and Graal are not compiler fallbacks.

On Apple Silicon, with a clean Amu checkout at that commit and KBB installed,
compile the typed module and execute its scalar cases:

```sh
python3 scripts/compile-mithril-amu-module.py \
  --amu-root /absolute/path/to/amu \
  --source examples/modules/amu-native.mith \
  --output /absolute/new/module-build \
  --case '{"export":"increment","args":[41],"expected":42}' \
  --case '{"export":"choose","args":[1],"expected":7}' \
  --case '{"export":"choose","args":[0],"expected":0}' \
  --case '{"export":"is_zero","args":[0],"expected":1}' \
  --case '{"export":"is_zero","args":[9],"expected":0}'
```

Compile the JSON-LD Program source with the same selfhost compiler:

```sh
python3 scripts/compile-mithril-amu-module.py \
  --amu-root /absolute/path/to/amu \
  --source examples/tender.mith \
  --output /absolute/new/program-build
```

Compile and execute the scalar transaction-envelope adapter:

```sh
python3 scripts/compile-mithril-amu-module.py \
  --amu-root /absolute/path/to/amu \
  --source examples/modules/amu-transaction-runtime.mith \
  --output /absolute/new/runtime-build \
  --case '{"export":"admit","args":["oak.transaction/v1",4],"expected":1}' \
  --case '{"export":"admit","args":["oak.transaction/v1",3],"expected":0}' \
  --case '{"export":"admit","args":["oak.transaction/v2",4],"expected":0}'
```

The Program path automatically runs an exact string check of the native
`transaction_edn` export. For either form, output directories must be new and
outside both repositories. The build receipt records the Amu compiler and
container hashes, Mithril frontend hashes, KBB/SCI and Node hashes, source and
generated Kotoba hashes, `.kseed` hash, target, and native execution results.
Later builds can use `--selfhost-output` to reuse a verified G3 image and
loader while writing to a separate new output directory.

`examples/modules/conditional.mith` is intentionally rejected by the native
module profile because it uses `js-value`. That is an ABI boundary, not a
failed general Mithril compile. No type erasure or JavaScript host emulation is
applied to get it through Amu.

## Embench-derived evidence

Amu PR [#1319](https://github.com/kotoba-lang/amu/pull/1319) reports a corrected
M104 full-19 translated-port comparison on Apple M4. Its geometric mean of
`(4/m_w) * K/C` across all 19 workloads is `0.821298642657085`; the upstream
Embench driver ran fresh C binaries built with Apple Clang 17 at `-O2`, and
both Kotoba and C matched all 19 workloads.

Amu PR [#1318](https://github.com/kotoba-lang/amu/pull/1318) reports a second,
separate full-19 cycle on an Apple M4 Mac mini (Mac16,10, 16 GB, macOS 26.3.1)
with ratio `0.7877703355587422`; its C side used Apple Clang 21.0.0. The host
results are not averaged.

These are Amu's Embench-derived translated-port time ratios, not official or
certified Embench scores. A ratio below one favors Kotoba under the reported
formula; it does not mean every workload was faster. The measurements cover
neither Mithril nor compiler speed and do not show that selfhosting caused the
runtime results. The M1 Max attempt in PR #1318 was unqualified and has no
score or geometric mean.
