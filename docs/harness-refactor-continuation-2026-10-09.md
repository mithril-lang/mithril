# Mithril Harness and System One continuation map

Updated: 2026-10-09 (JST). This is a continuation record, not a completion claim.
Verify the current checkout, remote main, CI and public status before relying on
recorded state. Repository documentation uses English; conversation and original
evidence retain their selected language.

## Complete objective

Refactor the original mithril-lang organization DeepSeek Harness into a genuine
Mithril-language Harness with the same API, plugin, profile and Session behavior.
Verify actual browser/native/Q9 behavior and delivery to the intended repository.
Use code.mithril.fund's System One Coding for actual refactor work, then measure
and investigate improvements using fixed inputs, baseline/candidate checks and
real receipts. Renaming, observation helpers or finite passing groups cannot
substitute for this objective.

## Locations and saved state

| Item | Location / identity | State |
| --- | --- | --- |
| Compiler checkout | `/Users/junkawasaki/github/mithril-lang/mithril-harness-language` | `codex/native-property-compound` |
| Saved work checkpoint | `82bd71fbfbf27e4ed3e08ba03898eb9a01a31ed4` | WIP committed and pushed before the requested pause |
| Schema SDK | https://github.com/mithril-lang/mithril/pull/79 | Merged at `34ca28d6524c27a6c11e24c01bddeca9da35763d`; head `b211a8d076bdb85f77859a2563ba3f79ee5e433f` qualified |
| Schema branch CI | `37894254763`, job `113701855514` | Terminal success; full source/package/all 14 declaration stages audited |
| Schema main CI | `37895861420` | Terminal success; all 14 stages audited, exact branch/main tree verified |
| Native module operations | https://github.com/mithril-lang/mithril/pull/80 | Merged at `99981656c7fd026ec0f5c7614bace0bb0dd1d1c7`; main CI `37898609701` terminal success, full log audited |
| Explicit external ESM | https://github.com/mithril-lang/mithril/pull/82 | Merged at `bbf79e27753e40880453af55af5c0b926c6bd64c`; main CI `37903790058` succeeded, 76 tests/338 assertions, package 40/7 and all 15 declaration stages audited |
| Native namespace imports | https://github.com/mithril-lang/mithril/pull/83 | Merged at `bab21a5def4fca240fc26c87e3acd6f6f7e29eaf`; branch CI `37907239872` and main CI `37908420359` succeeded, full logs and changed-file identities audited |
| Loader config leaves | `examples/native-js-loader-leaves-program.mith` | PR #86 merged at `eb05e8e…`; current main `1ff0695…` CI `37914082934` and all 17 stages audited, all 20 changed files match |
| System One checkout | `/Users/junkawasaki/github/mithril-lang/mithril-system-one-refactor` | PR #893 merged; qualified exact source `cc8d1bfb6dcbe30c302d24cbec214c07141e42e7` |
| Operator evidence | `/Users/junkawasaki/github/mithril-lang/mithril-harness-evaluation-2026-10-07` | Logs, receipts and readonly reference |
| Original Harness | Evidence directory's `reference-harness-441416` | Snapshot `441416c0048aa4281bffe59c1c7b5e13e08a9ec1` |

The intended destination Harness repository still requires confirmation. The
accessible catalog does not prove organization-wide absence. Do not create a
substitute repository without resolving the destination.

## Dependency map

Arrows mean prerequisite to dependent work. Resolve prerequisites before using
results to qualify their dependents.

```mermaid
flowchart TD
  A[Native source/compiler foundations] --> B[CosmoKit and Cordis source/types]
  A --> S[Schema runtime, full types and actual default SDK]
  B --> S
  S --> L[Loader / Include and Node module semantics]
  B --> L
  L --> H[Harness API / plugin / profile / Session]
  H --> Q[Actual browser / native / Q9 parity]
  Q --> P[Destination release and user-visible read-back]
  C[System One generic refactor and diagnostics] --> D[Code publication owner and release]
  D --> E[Sealed System One refactor trials]
  A --> E
  E --> H
  E --> F[Measured performance and improvement investigation]
  P --> Z[Requirement-by-requirement completion audit]
  F --> Z
```

Code publication and native-language work have independent paths. The missing
Code owner is not a reason to stop meaningful compiler/dependency work.

## Qualified evidence and remaining gates

| Area | Evidence | Remaining gate |
| --- | --- | --- |
| Native finite numeric literals | PR #77/main `4106e9e…`, main CI `37889375930` audited success | Reader normalizes integer `-0`; use `-0.0` or `-0e0` for negative zero |
| Ambient callback references | PR #78/main `92a27a8e…`, main CI `37891594652` audited success | Finite checks are not universal callback equivalence |
| Schema SDK | PR #79; local 14 stages and branch CI succeeded; both actual CLI targets; 54 positive/21 negative type groups, 26 runtime groups, serialized Date and full own static/prototype descriptors | Actual browser behavior and broader inputs |
| Native module operations | PR #80 merged; main CI `37898609701` audited success; 74/306 native, 40-export/7-frozen package and all 14 declaration stages passed | Actual browser and full dependent source closure |
| Explicit external ESM | PR #82 merged; main CI `37903790058` audited success; real builtin/bare import and matching type facade on both target labels | Full dependent Loader/Include closure |
| Native namespace imports | Real named/namespace mixed imports, canonical namespace origin, ESM/CJS/cache/descriptor and internal-cycle contracts; original pinned YAML host fixture; local source 78/354 and package 40/7 passed; strict paired namespace consumers passed both labels | Full dependent Loader/Include closure |
| System One generic refactor | PR #893 merged; selected-source replacement/local edits, baseline/candidate Docker checks, fixed refusal detail, durable receipts, signed Code CI/CD | New diagnostics publication and actual model evaluation |
| Code qualification | Exact `cc8d1bfb…`: Code93/quota34/Python8/CI-release12/hold24/real Docker2/Todo17 plus browser fixtures; verified signature/source/676 assets | Main has advanced; rerun on exact current main before release |
| Public Code | Most recent read: `fca16aec22fc0207ec7d91e863d3384aa92e161e`, ready=true, repository_refactor_proposals=true, durable_refactor_receipts=true | New diagnostics unpublished; arbitrary_repository_execution=false |

Node execution of a `js-browser` artifact and actual browser testing are separate
evidence. Complete type declarations and universal runtime equivalence are also
separate. Candidate runtime cannot delegate to original Schema or dependency code.

## Current source change

Native import metadata/dynamic import (PR #80), explicit external ESM (PR #82),
namespace imports (PR #83) and complete Loader utils/diff runtime/public types
(PR #86) are delivered through audited main CI. The current change adds checked
property compound assignment using native JavaScript reference semantics. The
actual refusal in complete Loader tree source at `info.offset += 3` is removed.
Four output forms and both CLI target labels have passed 1664 paired operation
groups. Full regressions and PR #87/current-main CI delivery are audited successful.
See `test/qualification/native-property-compound/README.md`.

The full Loader/Include source and type closure remains pending. The original
source graph has nine files. Prerequisite-first runtime SCCs are `internal`,
`config/utils`, `config/diff`, the five-file Loader index/entry/group/isolate/tree
SCC, and Include. This is a work order, not an assertion that every pair has a
direct edge. Preserve YAML dialect, config persistence, Node host resolution and
original dynamic-expression semantics.

Original dependency sites:

- `vendor/loader/src/internal.ts:109`: `createRequire(import.meta.url)`.
- `vendor/loader/src/config/tree.ts:124,126`: URL/specifier dynamic import.
- `vendor/include/src/index.ts:222`: filename dynamic import.

Retain Node internal-loader v1/v2 classification, no-internals fallback, actual
host capabilities, YAML dialect and config persistence contracts. A fixed URL or
replacement resolver does not establish identical module semantics.

## Next work

1. Schema and native module operations, external ESM and namespace imports main
   CI are audited successfully.
2. Property compound is delivered in PR #87 at main
   `640cadcd03c8706e7a50f1163c587f15fb1e1484`. Branch/main native and CodeGraph CI
   succeeded with full logs audited: native 81 tests/409 assertions, package
   40 exports/7 frozen artifacts and all 17 declaration stages.
3. The complete eight-file Loader runtime is saved on `codex/loader-scc`, with
   a 24-module own Cordis/CosmoKit closure. Both actual CLI labels pass 25 paired
   Node groups covering real plugin lifecycle, persistence, nested Group and
   actual Schema volatile updates. Full original eight-file declaration emission
   has zero diagnostics with the pinned Loader options/dependencies. See
   `test/qualification/native-loader-sdk/README.md` for reproducible controls and
   remaining scope. This is a local checkpoint, not delivered Loader parity.
   Canonical augmentation resolution now preserves reexported Context/Fiber
   class bindings and source lexical scope. Both declaration CLI targets admit
   the complete public graph: 18 modules, 13 runtime/23 type exports, 8 positive/
   7 negative original-paired strict consumers without skipLibCheck and exact
   rejection codes. The non-public diff declaration retains independent full
   Loader-leaves qualification. The SDK is registered as stage 18; source,
   package and all-stage regressions and PR/current-main delivery are in progress.
   Qualify extended host/isolation/injection/lifecycle paths;
   register qualification and complete PR/current-main CI. Then port Include by
   complete source and public type closure.
   Then port Harness API/plugin/profile/Session and verify actual browser/native/Q9.
4. Resolve the Code owner, qualify current main, publish through the dedicated
   guarded CI owner and read back source/status/assets.
5. Run separately sealed real System One tasks against the current compiler and
   independent baseline/candidate checks. Record actual attempts, repairs,
   completion/usage/latency, acceptance and adoption. Investigate measured failures.
6. Verify the destination release and audit every original requirement before
   marking the full objective complete.

Pinned local commands (compiler checkout):

```sh
node scripts/test-native-js.mjs --engine ../mithril-harness-evaluation-2026-10-07/compiler-image/engine/cli.js
node scripts/test-native-package.mjs --engine ../mithril-harness-evaluation-2026-10-07/compiler-image/engine/cli.js
node scripts/test-native-declarations.mjs --engine ../mithril-harness-evaluation-2026-10-07/compiler-image/engine/cli.js --typescript ../mithril-harness-evaluation-2026-10-07/native-js-declarations-system-one/image/typed-deps/node_modules/typescript/lib/typescript.js --type-roots ../mithril-harness-evaluation-2026-10-07/native-js-declarations-system-one/image/typed-deps/node_modules/@types
```

Evidence files include `schema-sdk-full-declarations.log`,
`schema-sdk-branch-ci.log`, `native-ambient-main-ci.log`,
`schema-sdk-qualification.json` and `native-ambient-blocker-frontier.json`.

## System One owner and evaluation inputs

The dedicated Code deployment host/checkout and existing narrow CI credential
reference remain unknown. Do not put credential values in chat/tasks/receipts/Git.
Docker on gad does not establish deployment ownership. The last observed
`MITHRIL_CODE_PUBLISHER` repository variable was absent (404). Retain real owner
coordination, drained competing main jobs, clean exact live main, Code-specific
signed receipt, actual compatible rollback, unchanged quota namespace, all
migration holds and full public asset read-back. Follow Fund's own AGENTS.md and
standalone publisher contract; another product's receipt cannot publish Code.

Historical real trial: `chatcmpl-ea230788-d0e3-40a9-93cb-00ee136cbea6`,
140.266 seconds, 26706 prompt / 5261 completion tokens, one attempt, zero repairs,
`invalid_refactor_edits`, missing detail, no admitted candidate or performance
gain. Do not infer its missing cause or retry an unknown historical outcome.
New trials require a separate sealed contract and real receipts; include repairs
in measurement and distinguish source/CI/publication/live/installed evidence.
