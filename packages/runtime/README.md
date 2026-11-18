# @mithril-lang/runtime

The Mithril language as one plain ES module (`dist/runtime.mjs`). Consumers run
it with no nbb, kbb, shadow-cljs or other Kotoba toolchain. That stays inside
this repository's build. It has no imports and no Node built-ins, so it runs in
Cloudflare Workers and in Node 22+.

```js
import { compileApp, version, sourceSha } from '@mithril-lang/runtime';
const { artifact, semanticRun, trace } = compileApp(text); // throws Error{code, detail} when refused
```

| Export | Meaning |
| --- | --- |
| `compileApp(text)` | Compile and execute one app Form (`mithril.app/compile-text` against `lib/app/agent-loop-v1.mith`, then `mithril.execution/execute`), with the compile, artifact-test and not-run deploy receipts. Output is converted exactly as `clj->js`. On refusal it throws an `Error` with `code` (for example `:mithril.form/read-error`) and `detail`. |
| `appAgentLibrary()` | The compiled `lib/app/agent-loop-v1.mith` library (graph digest `sha256:b7d1290a…266ce`). |
| `version`, `sourceSha` | Package version and the commit whose `src/`, `vendor/src/`, `lib/app/` and `packages/runtime/src/` built this bundle. `dist/manifest.json` also records the bundle's SHA-256. |

Planned next, with the same rules: `compile` (native-js), `runBatch`,
`assessDependencies`, plus a Node-only `./node` `codeRun` and a
`mithril-runtime` CLI, for Fund's system-one and Code runner.

## Build

```sh
npm ci --prefix packages/runtime
node packages/runtime/scripts/build.mjs          # needs a JVM; writes dist/
node packages/runtime/scripts/build.mjs --check  # rebuild and require identical bytes
npm test --prefix packages/runtime
```

The build refuses uncommitted runtime sources, so `sourceSha` always names a
real commit. `dist/` is committed so consumers never build it themselves.
