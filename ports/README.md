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
| Agent | Finite typed decisions, step/call budgets, correlated tool results, legal-action masking, host-gated finish, cancellation, checkpoint/journal | Single sequential effect; no free-form model tool arguments |
| Plugins | Declarative dependency order, unique tool ownership, removal with dependency/in-flight guards | No Cordis loading, HMR or TypeScript plugin ABI |
| Session | UUID-scoped call IDs, atomic/fsynced checkpoints, exclusive process ownership, profile/task binding, journal reconstruction, explicit restart/resume | No DSH released persistence format, durable inbox, parallel scheduler or UI parity; uncertain native effects cannot be automatically retried |
| Repository editing | Declared single-file candidate selection, hash-bound verification inputs, isolated verifier, durable intent, verified edit retained in the repository, explicit interrupted-edit reconciliation | Supplied candidates; no unrestricted source generation, multi-file transaction or full OS sandbox for the verifier |
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
`clef` performs real offline forwards when multiple legal choices exist. A single
legal choice is admitted by the host, recorded as `host-singleton`, and does not
load the model. This is never counted as model accuracy. Computer mode only lists apps and records
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

## Edit a declared repository task and resume

`bin/mithril-workspace-agent.cljk` accepts a JSON task with exactly `root`,
`file`, `goal`, `before-sha256`, `old`, `candidates`, `inputs` and `verifier`.
`root` is an absolute repository path; `file` and hash-bound `inputs` are regular
relative paths with no traversal or symlinks. `old` must occur exactly once.
The host accepts one of 1–8 supplied replacement strings at confidence >= 0.6.
The caller declares the verifier's absolute executable, fixed `argv` and
`timeout-ms`. Model output cannot change commands, paths or verification inputs.
The verifier runs in temporary staging with only the declared source/inputs.
This isolates generated artifacts, but is not an OS security sandbox: the
declared verifier capability is trusted.

```sh
kbb --backend sci --config ports.edn --classpath src bin/mithril-workspace-agent.cljk \
  clef task.json /private/tmp/mithril-port-policy/manifest.json /private/tmp/task-session \
  /absolute/path/to/hy /absolute/path/to/clef-snapshot \
  /absolute/path/to/mithril-fund/apps/coding /private/tmp/task-result.json
```

The original task must fail verification first. The selected patch is tested in
staging; only a passing patch is atomically retained in the actual repository.
The source hash is checked again immediately before publication. This is a
single-file operation, not a compare-and-swap against arbitrary external writers.
Use an isolated checkout and preserve other work.

Run the same command with `resume` to restore the same bound task and session.
Committed results do not execute again; a changed retained file refuses resume.
If a pending repository edit has a durable intent, use `reconcile` to inspect the
actual file and rerun verification, without reselecting or republishing the patch.
An unpublished intent yields a failed receipt, not an automatic retry. A pending
native OS effect is refused on resume, because input may already have occurred.

The existing port-agent CLI uses `output.json.session` by default, or
`MITHRIL_SESSION_DIR`. Set `MITHRIL_RESUME=1` for explicit reuse. Existing state
is never implicitly overwritten. A process crash can leave `owner.lock`; first
confirm its recorded PID has ended before manually removing that stale lock.
Live ownership, profile drift, digest drift and invented facts/counters refuse
restoration. Checksums detect corruption; they do not authenticate against an
actor who can rewrite the entire session directory.

## Record speed, accuracy and cost

`scripts/benchmark-workspace.hy` builds isolated Git repositories and rotates
three patch candidates across three Kotoba boundary tasks. It runs the real
workspace CLI, retains edits only after native compilation and KIR/JS/Wasm
tests, and writes per-run receipts, `runs.json` and `summary.json`.

```sh
hy scripts/benchmark-workspace.hy --compiler-root /absolute/compiler \
  --model-dir /absolute/clef-snapshot --adapter-root /absolute/mithril-fund/apps/coding \
  --kernel-manifest /private/tmp/mithril-port-policy/manifest.json \
  --output-dir /private/tmp/new-workspace-evaluation --repeats 3
```

It records end-to-end wall time, actual model load/inference/wall time, input
tokens, exact-patch success and API cost. `replay` always picks the first candidate
and is a mechanism reference, not another LLM. Local API cost is zero; electricity,
device amortization and human implementation cost are unmeasured. Three repeated
small supplied-candidate tasks do not establish general coding accuracy.

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
