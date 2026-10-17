# Mithril `.mith` artifacts on Amu native selfhost

The Amu native CLI routes checked `.mith` sources through their existing
Mithril compiler, then lowers the resulting program or artifact to Kotoba. The
adopted Amu G3 compiler emits an `aarch64-macos` `.kseed` artifact.

For a JSON-LD Program, Mithril's existing compiler first produces the checked
`oak.transaction/v1` vector. The native module exposes that vector as the
canonical, inert EDN string returned by `transaction_edn`. It also exports
`admit_edn(string)`: Amu parses that bounded EDN string into its internal
`:document` value and checks the v1 tag and four-field envelope. The native ABI
does not pass `:document` across its entry boundary, so it uses EDN as the
serialized input. The downstream OaK path still repeats the complete goal,
ontology, choice, authority and digest checks before effects.

Typed `mithril/module` forms use a separate native-safe profile. It accepts
`i64`, `bool`, and `string` values, `add`, `sub`, `mul`, `eq`, and `not`, plus
local calls, `let`, sequences, and conditionals. It rejects `js-value`, JS host
intrinsics, and guest callables before emission. Those host-facing modules
continue to use their existing targets.

Static `WebApplication` sources lower their finite route table to an actual
native `dispatch_edn(method, path)` function. The lowerer derives each route
response by calling the existing `mithril.web/dispatch` implementation, then
emits Amu conditions for the admitted method/path pairs and the 404 fallback.
The build driver compiles and executes those exports for every route, GET's
HEAD behavior, and an unmatched path. A repeated `--library` option supplies
the checked Library artifacts required by a WebApplication.

The CLI also admits Library, Ontology, BotProfile, DesktopApplication,
HermesProfile, GrowthProfile, MissionModel, AppAgentApplication,
GraphAgentApplication, LanguageKernel, and CodeGraphApplication sources.
Their existing Mithril compilers validate and produce the artifacts; the
native module exports the complete artifact as an inert EDN string. Internal
bootstrap libraries and ontologies are pinned as build dependencies and
recorded in the receipt. This packages checked data in a native artifact. It
does not port those artifacts' host runtimes or grant their effects to Amu.
Native JavaScript modules, acyclic packages, multi-file ESM packages, checked
declaration modules and declaration programs pass through Mithril's existing
complete checkers and emitters. The resulting JavaScript, ESM and TypeScript
artifacts are carried as inert EDN in an Amu-native module; Amu does not execute
JavaScript or grant host imports. Manifest-declared source files are read from
the checkout with bounded regular-file checks, their hashes are bound into the
build receipt, and any dependency change during compilation fails the build.
Declaration composition uses the same checked source-owned linker. Component,
Assembly, Stack, Cluster, TwinDocument, TwinService, and TwinRun sources now use
their existing sealed validators, compilers, and simulation paths; catalog
inputs are hash-bound in the receipt and simulation output stays unapplied.
Synthesis sources lower their checked route/candidate question plan into an
Amu artifact. Completing an application still requires the explicitly
validated model result; compilation never invents a decision. Hermes BPMN
scheduler contracts require a checked BotProfile supplied through
`--bot-profile`, and the profile bytes are bound into the receipt before its
digest is checked against the contract. Model decisions, durable runtime-state
transitions, and other process actions still need their owning runtime; the
CLI rejects unsupported source types before emitting output.

`src/mithril/runtime.kotoba` keeps its host-neutral document API. The Program
lowerer adds the equivalent EDN-string entrypoint to the generated native
artifact without changing that public API.

The Mithril frontend itself still runs on KBB/SCI. This integration uses Amu's
selfhosted compiler for native artifact generation; it does not claim that the
entire Mithril frontend or every `.mith` source kind has been ported to Kotoba.

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

Compile a static WebApplication and execute its native route table. Library
inputs are checked against the application's pinned graph digests:

```sh
python3 scripts/compile-mithril-amu-module.py \
  --amu-root /absolute/path/to/amu \
  --source examples/hello-web.mith \
  --library lib/web/v1.mith \
  --output /absolute/new/web-build
```

Compile a Hermes scheduler contract only with its matching checked BotProfile:

```sh
python3 scripts/compile-mithril-amu-module.py \
  --amu-root /absolute/path/to/amu \
  --source examples/hermes-readonly-scheduler.mith \
  --bot-profile examples/hermes-readonly-bot.mith \
  --output /absolute/new/scheduler-build
```

Compile an application synthesis request and its candidate question plan without
supplying or inferring the model's decision:

```sh
python3 scripts/compile-mithril-amu-module.py \
  --amu-root /absolute/path/to/amu \
  --source examples/hello-web-synthesis.mith \
  --library lib/web/v1.mith \
  --output /absolute/new/synthesis-plan-build
```

Compile a checked Library or other admitted data artifact. The native module's
`artifact_edn()` export is compared byte-for-byte with Mithril's compiled
artifact:

```sh
python3 scripts/compile-mithril-amu-module.py \
  --amu-root /absolute/path/to/amu \
  --source lib/web/v1.mith \
  --output /absolute/new/library-build
```

Compile a checked native JavaScript module. The native artifact packages its
generated JavaScript and required host-import list as inert EDN; JavaScript
execution remains on its explicitly granted JS target:

```sh
python3 scripts/compile-mithril-amu-module.py \
  --amu-root /absolute/path/to/amu \
  --source examples/native-js-array.mith \
  --output /absolute/new/native-js-build
```

Compile a checked multi-file ESM package and its declaration program. Their
source manifests must refer to bounded local `.mith` files in the checkout;
the driver records each dependency hash and verifies the sources stayed stable:

```sh
python3 scripts/compile-mithril-amu-module.py \
  --amu-root /absolute/path/to/amu \
  --source examples/native-js-cosmokit-esm.mith \
  --source-root /absolute/path/to/mithril/examples \
  --output /absolute/new/native-esm-build
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

The Program path automatically compares the native `transaction_edn` export
with Mithril's output, then calls `admit_edn` with the valid transaction, a
wrong-version transaction, and a wrong-cardinality transaction. Output
directories must be new and outside both repositories. The build receipt
records the Amu compiler and container hashes, Mithril frontend hashes, KBB/SCI
and Node hashes, source and supplied Library hashes, generated Kotoba and
`.kseed` hashes, target, and native execution results. String inputs and
outputs are SHA-256 recorded in the receipt. Later builds can use
`--selfhost-output` to reuse a verified G3 image and loader while writing to a
separate new output directory.

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
