# bin/compiler — AOT native compiler CLIs (Item 224 §C.2)

Node entry points into `packages/runtime/dist/compiler.mjs` (shadow-cljs AOT
bundle). They replace the `bin/mithril-native-*.cljk` nbb CLIs with identical
contracts:

| CLI | Usage | Exit codes |
| --- | --- | --- |
| `mithril-native-js.mjs` | `<source.mith> --target js\|js-browser --output <file.mjs>` | 64 usage, 65 REFUSE |
| `mithril-native-esm.mjs` | `<package.mith> --target js\|js-browser --output-directory <new-dir>` | same; refuses existing dir |
| `mithril-native-package.mjs` | `<package.mith> --target js\|js-browser --output <library.mjs>` | same |
| `mithril-native-declarations.mjs` | `<declarations.mith> --target js\|js-browser --output <library.d.mts>` | same |
| `mithril-native-declaration-program.mjs` | `<program.mith> --target js\|js-browser --output-directory <new-dir>` | same |
| `mithril-native-declaration-composition.mjs` | `<composition.mith> --target js\|js-browser --output-directory <new-dir>` | same |

`--target` is restricted to `js`/`js-browser`; every other value prints
`REFUSE\t<name>-target\t…` and exits 65 before touching the filesystem.
`node:fs`/`node:path` are the only Node imports (allowlist); all compile/check
logic runs in the bundle. Bounded reads (≤1MiB, regular non-symlink files)
and admission-before-write semantics match the legacy `.cljk` CLIs.

Build: `MITHRIL_RUNTIME_ALLOW_DIRTY=1 node packages/runtime/scripts/build.mjs`
(needs JVM; cached in `~/.m2`).
Reproducibility: `node packages/runtime/scripts/build.mjs --check`
compares both `dist/runtime.mjs` and `dist/compiler.mjs` hashes.

**Rebase risk:** PR #174's perf fix (`form.cljk` regex scan, 56da43c) is NOT
in main. The bundle is built from main's `form.cljk`; after #174 merges, re-run
`build.mjs` (the hash will change; no CLI contract changes).
