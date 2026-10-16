# Mithril typed modules on Amu native selfhost

Mithril's typed `mithril/module` source now has an explicit path through Amu's
adopted native selfhost compiler. The Mithril frontend validates and lowers a
`.mith`/`.mithril` module to Kotoba source; Amu G3 compiles that source to an
`aarch64-macos` `.kseed` artifact. Optional `--case` arguments extract and run
exported scalar functions through the pinned native loader.

This is a target-specific module path. It does not make the main Mithril
compiler or all Mithril `.mith` source forms self-hosted. The frontend is still
hosted by the project's KBB/SCI `.cljk` runtime. The Amu native profile accepts
`i64`, `bool`, and `string` values, with `add`, `sub`, `mul`, `eq`, and `not`
intrinsics plus calls, locals, `let`, sequences, and conditionals. It rejects
opaque `js-value`, JavaScript host intrinsics, and guest callables before
writing generated source. Those host-facing modules continue to use their
existing targets.

## Reproducible build and execution checks

The build script pins Amu to adoption commit
[`dd332a30f47a93909e55b7f1b2f6c1bda3dfcd8f`](https://github.com/kotoba-lang/amu/commit/dd332a30f47a93909e55b7f1b2f6c1bda3dfcd8f),
which carries the native fixed-point compiler. It rebuilds G1, G2, and G3 and
checks that all three compiler images and the bootstrap container match their
recorded SHA-256 values. The trusted C loader is retained as the native image
entrypoint; JVM, Node, and Graal are not compiler fallbacks.

On Apple Silicon, with a clean Amu checkout at that commit and KBB installed,
run:

```sh
python3 scripts/compile-mithril-amu-module.py \
  --amu-root /absolute/path/to/amu \
  --source examples/modules/amu-native.mith \
  --output /absolute/new/build-directory \
  --case '{"export":"increment","args":[41],"expected":42}' \
  --case '{"export":"choose","args":[1],"expected":7}' \
  --case '{"export":"choose","args":[0],"expected":0}'
```

The output directory must be new and outside both repositories. The script
records the Amu compiler and container hashes, the Mithril frontend source
hashes, the KBB launcher and SCI engine hashes, the input `.mith` hash, the
generated Kotoba hash, the `.kseed` hash, and each requested execution result
in `mithril-amu-build.json`. Without `--case`, the script compiles the module
but does not execute its exports. `bin/mithril-amu.cljk` can also be used
directly to validate and lower a module to a new `.kotoba` output file. Later
modules can pass `--selfhost-output /path/to/the/first/build` to reuse its
verified G3 image and loader while writing each module to a separate new output
directory.

`examples/modules/conditional.mith` is intentionally rejected by this native
profile because it uses `js-value`. This is a typed incompatibility with the
native ABI, not a failed general Mithril compile. No type erasure or JS host
emulation is applied to get it through Amu.

## Embench-derived evidence

Amu PR [#1319](https://github.com/kotoba-lang/amu/pull/1319) reports a corrected
M104 full-19 translated-port comparison on Apple M4. Its geometric mean of
`(4/m_w) * K/C` across all 19 workloads is `0.821298642657085`; the upstream
Embench driver ran fresh C binaries built with Apple Clang 17 at `-O2`, and
both Kotoba and C matched all 19 workloads.

Amu PR [#1318](https://github.com/kotoba-lang/amu/pull/1318) reports a second,
separate full-19 cycle on an Apple M4 Mac mini (Mac16,10, 16 GB, macOS 26.3.1)
with ratio `0.7877703355587422`; its C side used Apple Clang 21.0.0. The two
host results are not averaged.

These are Amu's Embench-derived translated-port time comparisons, not official
or certified Embench scores. A ratio below one favors Kotoba under the
reported formula; it does not mean every workload was faster. The comparisons
measure neither Mithril nor compiler speed, and do not show that selfhosting
caused the runtime results. The M1 Max attempt in PR #1318 was unqualified and
has no score or geometric mean.
