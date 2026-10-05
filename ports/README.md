# Mithril agent harness and computer driver ports

These executable Mithril ports derive their agent/plugin/effect boundaries from
DeepSeek Harness and their computer-tool schemas from Cua Driver. The official
upstreams were forked into `mithril-lang/deepseek-harness` and `mithril-lang/cua`.
Exact source revisions and license attribution are retained in `upstreams.edn`
and `resources/ports/*-LICENSE`.

Mithril Form profiles declare plugins, tool contracts, dependencies, execution
budgets and completion facts. `mithril.harness` and `mithril.cua-driver` implement
the control/protocol logic in CLJK. The actual Kotoba budget predicate compiles
to Wasm and is called during dispatch; a missing or mismatched artifact stops
execution. The original TypeScript/Cordis agent runtime is not launched.
OS-specific input/capture is an explicit native provider, **not a rewritten
macOS/Windows/Linux backend**. The provider is never silently installed,
started, granted permissions or upgraded by the Mithril runtime.

## Implemented contracts

| Area | Implemented | Compatibility boundary |
| --- | --- | --- |
| Agent | Finite typed decisions, step/call budgets, correlated tool results, host-gated finish, cancellation, checkpoint/journal | Single sequential effect; no free-form model tool arguments |
| Plugins | Declarative dependency order, unique tool ownership, removal with dependency/in-flight guards | No Cordis loading, HMR or TypeScript plugin ABI |
| Session | Per-run correlated IDs and checkpoints; committed results survive later model failure | No DSH released persistence format, durable inbox, restart/resume, parallel scheduler or UI parity |
| Driver | Mithril MCP stdio, legacy initialization, modern discovery/list/call metadata subset, schema validation, explicit tool allowlist, result budgets, one-use call IDs | No complete MCP resource/skill/HTTP surface; call IDs cannot be retried within a run |
| Native | Explicit `cua-driver call` provider; macOS observation and owned-window input verified | Other OS platforms and screen capture are not qualified by this run |

The current driver profile publishes 15 tools. The pinned upstream manifest has
29 schemas, all admitted by the common schema implementation; callers can
declare a different reviewed subset in a Mithril profile. Native capabilities
and permission checks still apply. State-changing native failures are uncertain
outcomes: the runtime records them and does not automatically repeat input.

`ports.edn` is deliberately dependency-free. Do not launch the unrelated full
`nbb.edn` dependency resolver for these ports: it can invoke Clojure/Java for
resolution. Port execution and the compiler routes below use Node/MLX/Wasm;
this is not a complete Q9 migration of the CLJK host.

## Build and focused tests

Prepare the pinned compiler and local MLX/CLEF model as documented by
`../mithril-fund/apps/coding/README.md`. The CLI arguments below refer explicitly
to those existing local capabilities; no cloud endpoint is used.

```sh
hy scripts/build-port-kernel.hy --compiler-root /private/tmp/coding-compiler \
  --output-dir /private/tmp/mithril-port-policy
MITHRIL_POLICY_MANIFEST=/private/tmp/mithril-port-policy/manifest.json \
  kbb --backend sci --config ports.edn --classpath src:test test/run_ports.cljk
```

The builder compiles the full exported policy to `wasm32-browser` and runs
four assertions on KIR, JS and Wasm. The host checks both source and Wasm hashes
before instantiating it. Eight focused tests / 74 assertions cover the real
Wasm budget gate, profile admission, plugin disposal, stale/duplicate results,
unverified finish, cancellation, MCP metadata, schema boundaries, uncertain
native failures and retention of committed tool results after model failure.
Existing Form tests (4 / 13) and repair tests (11 / 587) also passed.

## Run the agent with local CLEF

Run from the Mithril checkout. Replace these paths with the explicit local
model, Hy runtime and adapter locations prepared above:

```sh
export MITHRIL_AGENT_PROFILE=/path/to/deepseek-harness/mithril/computer-agent.mith
export MITHRIL_DRIVER_PROFILE=/path/to/cua/mithril/driver.mith
kbb --backend sci --config ports.edn --classpath src bin/mithril-port-agent.cljk \
  clef /private/tmp/mithril-port-policy/manifest.json /absolute/path/to/cua-driver \
  /absolute/path/to/hy /absolute/path/to/pinned-clef-snapshot \
  /absolute/path/to/mithril-fund/apps/coding /private/tmp/computer-receipt.json
```

`replay` is an explicitly deterministic mechanism check, not a model run.
`clef` performs real offline forwards. Computer mode only lists apps and records
their count and output hash; its receipt does not retain app names or screenshots.

For the executable coding-development experiment, set `MITHRIL_AGENT_PROFILE`
to the fork's `coding-agent.mith`, provide `CODING_COMPILER_ROOT`, and select
`clef-coding` with the same argv. The tool injects a zero-budget boundary bug
into a scratch copy of the **actual port policy**, asks CLEF to select among
three supplied fixes, verifies the accepted fix with native compilation and
KIR/JS/Wasm tests, and correlates that result into the agent's next model turn.
The source checkout remains unchanged. This is a seeded mutation experiment,
not autonomous design of the port, arbitrary source generation or a benchmark.
All broader implementation in this change was written by the coding assistant;
CLEF supplies the measured decisions and bounded repair.

## Run the Mithril MCP driver

```sh
kbb --backend sci --config ports.edn --classpath src bin/mithril-port-driver.cljk \
  /private/tmp/mithril-port-policy/manifest.json /absolute/path/to/cua-driver
```

This reads newline-delimited JSON-RPC from stdin and emits responses to stdout.
Legacy clients initialize `2025-06-18` before list/call. Modern requests use
`2026-07-28` and both namespaced protocol/client-capability metadata fields.
The native daemon must already be running with its established OS permissions.
This is a local stdio server; no public listener or cloud service is created.

## Measured evidence

`docs/evidence/mithril-ports-2026-10-05.md` distinguishes actual CLEF decisions,
compiler/test results, native MCP observation and owned-TextEdit input from the
remaining upstream features. Raw bounded receipts are in
`docs/evidence/ports-2026-10-05/`. Neither full upstream has been ported, and no
production/public Mithril site was changed.
