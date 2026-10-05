# Mithril agent / Cua driver port qualification — 2026-10-05

This is the preserved v1 measurement record. The follow-up repository-edit,
durable-resume and performance work is recorded in
`mithril-workspace-evaluation-2026-10-05.md`; remaining-scope statements below
describe v1 rather than overriding the later qualification.

Forked the official upstreams into
`https://github.com/mithril-lang/deepseek-harness` and
`https://github.com/mithril-lang/cua`, and cloned them locally. Exact upstream
SHAs, contract digest and MIT attribution are retained in `ports/upstreams.edn`.
Fork profiles in `mithril/` are read by the actual Mithril runtimes through
`MITHRIL_AGENT_PROFILE` and `MITHRIL_DRIVER_PROFILE`; they are not just unused
configuration examples.

## Implementation boundary

New `mithril/agent-harness`, `mithril/plugin`, `mithril/tool` and
`mithril/computer-driver` Forms are inert language declarations. They lower via
the existing Mithril Form reader and pass closed-profile validation before any
effect. Agent/plugin/event logic and MCP/schema/dispatch logic are CLJK, not
the original TypeScript/Cordis engine or original Rust MCP implementation.
The actual Kotoba dispatch-budget function compiles to Wasm, is hash-bound to
source and artifact, and is called by both ports. A missing/mismatched kernel
fails closed. Native OS calls go through the explicit existing CuaDriver
0.28.2 provider. No macOS/Windows/Linux backend rewrite is claimed.

## Actual qualification

| Path | Observed behavior |
| --- | --- |
| Kotoba/Wasm kernel | Compiled `ports/policy.kotoba` to `wasm32-browser`; four budget-boundary assertions passed on KIR, JS and Wasm (12 backend assertions). Host loaded and called the Wasm export, with source/artifact hash checks. |
| Mithril agent + actual local CLEF + native driver | CLEF selected `observe-apps` at 0.965339. One native `list_apps` call produced a successful, correlated host result. The next model turn reached a host-admitted terminal `done`; two model forwards / one tool effect. The **fork** computer-agent and driver profiles were used on the final run. |
| CLEF development experiment | An explicit `>= 0` zero-budget mutation was injected only in a scratch copy of the actual port policy. CLEF selected `> 0` at 0.967445; native compilation and all KIR/JS/Wasm assertions passed. Repaired policy matched the original source byte-for-byte. |
| Mithril coding-agent effect | Actual CLEF selected `verify-repair` at 0.955922. The tool performed the actual mutation-repair experiment above and returned compiler/test evidence. A correlated result admitted the next finish turn. This has two agent model turns plus one model call inside the repair tool; no arbitrary repository/source generation. Final run used the **fork** coding profile. |
| Mithril MCP stdio + actual native provider | Legacy initialize reported `mithril-cua-driver`; tools/list exposed the declared 15-tool subset; a real list_apps call returned 113 app entries. Calling non-exposed clipboard_read was refused. Raw app entries were not committed. |
| Mithril MCP + real macOS input | Opened only `/private/tmp/mithril-port-driver-demo.txt` in TextEdit. Through the Mithril MCP process: found that exact owned window, started a named session, observed it, typed a known marker using an explicit pid/window target, observed the marker in native accessibility state, saved, closed that window and ended the session. Nine successful native calls; saved file read-back contained the marker. Existing documents were not edited. |

The final agent turn offers only `finish` after required host facts exist, so
its probability 1.0 is a singleton-choice result, **not independent evidence of
model intelligence**. Before verification the model can choose finish, but the
host refuses it; this denial is tested. The seeded coding mutation has supplied
candidates and fixed assertions. The coding assistant authored the broader
port implementation; CLEF supplied actual typed decisions and the measured
bounded repair. No training improvement, model comparison or general coding
success rate follows from these scenarios.

## Focused checks and preserved boundaries

- Eight port tests / 74 assertions passed using the actual compiled Wasm
  kernel. They cover plugin dependency/disposal, result correlation and stale
  results, finish denial, budgets, low confidence, cancellation, upstream
  schemas, legacy/modern MCP admission, duplicate-call denial, uncertain native
  errors, and preserving a committed tool result after later model failure.
- Existing Mithril Form tests: four / 13 assertions passed, with explicit local
  JSON-LD/RDF dependencies. Existing repair tests: 11 / 587 passed.
- A normal full-project dependency-resolver attempt was unsuccessful in the
  restricted environment and invoked the compatibility JVM resolver; it is
  not port acceptance evidence. `ports.edn` is dependency-free; all successful
  port/compiler runs above used Node/MLX/Wasm routes. No complete Q9 migration
  or full original-upstream suite pass is claimed.
- Both upstream forks retained all existing source/history; new Mithril
  profiles are additive. Existing Kotoba checkout WIP and the local Web coding
  page were preserved. No Modal, cloud model call, global permission grant,
  native-driver installation/upgrade or production Worker change occurred.

Raw bounded receipts: `ports-2026-10-05/computer.json`, `coding.json`,
`coding-repair.json`, `development.json`, `kernel.json`, and `native-input.json`.
They retain actual model distributions, correlated host journals, compiler
diagnostics, policy source/artifact hashes and the owned-window input result.
The full app inventory and native accessibility tree remain local and are not
part of the committed evidence.

## Remaining upstream scope

This is an executable v1 port, not complete clones of both upstream products.
DSH's durable inbox/released persistence, parallel tool scheduler, streaming,
subagents, full plugin ABI, UI and general patch generation remain unported.
Cua resource/skill/HTTP surfaces, native OS backend replacement and qualification
on Windows/Linux remain outside this version. The current state has no durable
restart/resume or cross-process exactly-once guarantee. Native call IDs are
one-use within a runtime; after uncertain input, observe state instead of
retrying. Public activation and production publication were not performed.
