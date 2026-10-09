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
| Compiler checkout | `/Users/junkawasaki/github/mithril-lang/mithril-harness-language` | `codex/native-yaml-type-frontier`; YAML source merged in PR #94 at `ff21a958fd7e3b756c385497a6d90609ff67d395` |
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
(PR #86) are delivered through audited main CI. PR #87 added checked
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
   package and all-stage regressions passed. PR #88 merged at `0ebbba72…` after
   successful branch Native JS/CodeGraph CI and full log audit; all 54 changed
   files match merged main. Main Native JS CI `37924754878` and CodeGraph CI
   `37924754946` succeeded at exact `0ebbba72ef76a06dd4b03d48bfc02b406f4805f1`;
   full logs confirm 81 tests/409 assertions, package 40 exports/7 frozen
   artifacts, all 18 declaration stages, 25 paired runtime groups per label,
   8 positive/7 negative strict consumers per label and CodeGraph 33/239 plus
   its HTTP contract. Evidence: `loader-sdk-main-ci-audit.json`.
   PR #89 extends paired runtime controls from
   25 to 40 groups per label with actual Node imports/file plugins, self-disposal,
   service providers, local/shared realms and inject dependencies. It preserves
   an original store-transfer/disposer-key quirk rather than changing behavior.
   It merged at `b4ff673c6abb738a44aaf7ab75e73ee1746634f9`; branch and main
   Native JS/CodeGraph CI succeeded. Full main logs confirm all 18 stages,
   81/409 source, 40-export/7-frozen package, 40 paired runtime groups per label,
   strict 8 positive/7 negative type groups per label and CodeGraph 33/239 with
   HTTP contracts. All four changed files match main. Evidence:
   `loader-lifecycle-main-ci-audit.json`, `loader-lifecycle-main-file-match.json`.
   An external operator probe also passes 42 paired groups per label with real
   Node 26.7.0 `--expose-internals`, v2 shape classification, relative module
   resolution and load-cache namespace identity. This is not v1/HMR qualification.
   The complete Include body is authored and admitted as native Mithril; staged
   runtime probes pass 24 paired groups per label, including real YAML/JSON
   files, patch composition, invalid refresh retention, readonly refusal, actual
   rename failure and queued recovery. YAML remains the pinned external 4.2.0
   dependency in these probes. Pinned @types/js-yaml 4.0.9 matches original lock
   integrity; complete original Include declaration emission has zero diagnostics.
   Native string/number/symbol index signatures now remove the PatchOptions
   representation prerequisite. Dedicated strict consumers pass 8 positive/
   9 negative groups and eleven exact-code AST refusals on both actual CLI labels;
   stage 19 is registered. Both actual Include CLI SDKs reach 25 own runtime/19
   type modules, with 4 runtime/3 type exports. Their finite original-paired
   controls pass 24 runtime groups and 6 positive/8 negative strict consumer
   groups per label, exact rejection codes and public type/value symbol spaces,
   without skipLibCheck. These are staged operator artifacts outside the repo;
   YAML runtime/types are explicitly external pinned dependencies. Evidence:
   `include-sdk-staged-qualification.json`. Register and deliver the full source,
   provenance, controls and declarations before treating Include as delivered.
   Source regression retry passes 81/409 and package checks pass 40/7.
   Declaration stages 1–17 passed in the broad run, but repeated dependency
   checking timed out at Loader stage 18. Its consumers now retain separate
   original/candidate programs and isolated case modules while checking the
   shared dependencies once; the actual SDK stage 18 passes 40 runtime and
   8 positive/7 negative strict groups per label. Stage 19 passes separately.
   These are separate local runs; complete-suite CI and index-signature PR
   delivery remain pending. The timed-out runs are not successful runs.
   PR #90 subsequently passed exact-head Native JS and CodeGraph CI with full
   logs audited: all 19 stages, source 81/409, package 40/7, Loader 40 runtime and
   8 positive/7 negative type groups per label, new index 8 positive/9 negative
   groups and eleven refusals, CodeGraph 33/239 plus HTTP contracts. It merged at
   `1d53b68ad4645ec54808fa3933d3f0bcca443630`; main Native JS CI `37932701284`
   and CodeGraph CI `37932701102` succeeded. Full logs confirm all 19 stages
   and unchanged source/package/Loader/index/CodeGraph counts; all eleven changed
   files match main. Evidence: `index-signatures-main-ci-audit.json` and
   `index-signatures-main-file-match.json`.
   The `codex/include-sdk` change now brings complete Include source/types and
   pinned original fixtures into the repo. Stage 20 qualifies 25 own runtime/19
   public declaration modules, 6 positive/8 negative strict consumers, and 32
   original-paired Node runtime groups per actual CLI label with exact artifact
   bytes. Extended groups cover class descriptors, root insertion identity,
   unchanged-path config patch update/removal and actual host rename retries for
   EACCES/EBUSY/EPERM, real delay progression and eleven-attempt exhaustion.
   These controls passed locally and exact-head branch Native JS CI `37933126224`
   and CodeGraph CI `37933126261` succeeded, with all 20 stages and source 81/409,
   package 40/7, Include 32 runtime and 6 positive/8 negative types per CLI label
   audited. PR #91 merged at `f8c453a27d9358c623b0b268169b91ae04ab19f2`;
   main Native JS CI `37934592393` and CodeGraph `37934592400` succeeded.
   Full logs confirm all 20 stages, source 81/409, package 40/7, Include 32 runtime
   and 6 positive/8 negative strict type groups per label, and CodeGraph 33/239
   plus HTTP contracts. All twenty changed files match main. Evidence:
   `include-sdk-main-ci-audit.json` and `include-sdk-main-file-match.json`;
   YAML runtime/types remain pinned external dependencies, and full YAML source
   closure, further lifecycle/HMR and actual browser/native/Q9 remain unqualified.
   The next source dependency is complete pinned YAML 4.2.0. Its monolithic
   591974-character AST correctly refuses the unchanged 262144-character leaf
   budget. An operator prototype preserves owner-scoped var allocation, ordered
   initializer assignments and block function declarations across 26 own source
   modules; the largest leaf is 256336 characters. This is authoring, not runtime
   qualification. Actual native admission then refuses the original `!=` operator.
   Separately, `arguments[index]` originally refused unknown-tag. The new
   `HostArguments` / `mithril/host-arguments` primitive emits the actual source
   normal function's arguments object and refuses absent function contexts.
   Both actual CLI labels pass 24 original-paired Node groups; source regression
   passes 83 tests/412 assertions; package qualification retains 40 exports and
   seven frozen artifacts. PR #92 passed exact-head Native JS `37936109560` and CodeGraph `37936109602`,
   with full logs audited: all 20 declaration stages, source 83/412, package 40/7,
   paired arguments 24 groups per label, Include 32/6+/8-, and CodeGraph 33/239
   plus HTTP. It merged at `5dfbfcf51d7a80fcf1535f993ef25d1bddbb177c`;
   main Native JS `37937697382` and CodeGraph `37937697291` succeeded.
   Full 20-stage logs, source 83/412, package 40/7, paired feature/runtime/type
   groups and CodeGraph 33/239 plus HTTP were audited; all eight files match
   main. Evidence: `native-arguments-main-ci-audit.json` and
   `native-arguments-main-file-match.json`.
   Native abstract equality/inequality now passes 2490 original-paired groups
   per actual CLI label, including coercion order and exact abrupt completion;
   source regression passes 85 tests/415 assertions and package checks retain
   40 exports/seven frozen artifacts. Two previous unsupported-`==` tests now
   retain malformed-operator refusal coverage with `<>`. Its PR/main delivery
   passed all 20 branch stages and merged in PR #93 at
   `ac01dec12611b83275db09ebab6063502f9139bd`. Main Native JS `37939630145`
   and CodeGraph `37939630106` succeeded, with full log audit and all ten files
   matching main. Source 85/415, package 40/7, paired equality 2490 groups per
   label, all existing SDK stages and CodeGraph 33/239/HTTP were retained.
   Evidence: `native-abstract-equality-main-ci-audit.json` and
   `native-abstract-equality-main-file-match.json`.
   The operator YAML prototype now admits all 29 own modules
   and 15 original runtime exports through the actual native ESM CLI. This keeps
   the original character/node budgets: alpha-renamed lexical bindings and
   immutable primitive literal sharing reduce source size, while 44 original
   private Loader functions become own native modules with getter-backed captures
   of their original lexical bindings. Fresh actual CLI controls now pass 304
   original-paired YAML groups per label, including full export aliases/metadata,
   four schemas, anchors/merge/cycles, dump options, custom Type/Schema and exact
   error marks. The whole source and portable qualification are in the repo as
   stage 21. Include's 25-module source and YAML's 29-module source exceed the
   unchanged 1 MiB bound if put in one package, so each is compiled independently
   and the own YAML artifact is imported as `@mithril/native-yaml`. Both actual
   Include runtime/declaration CLIs pass exact artifact bytes, all 32 original
   Include groups and 6 positive/8 negative strict consumers per label. The full
   pinned original YAML type facade is shipped separately and qualifies actual
   NodeNext default namespace/class resolution plus exact rejection codes; it is
   not native YAML type closure. These portable controls passed locally and on the exact PR #94 head; all
   21 declaration stages passed before merge to main
   `ff21a958fd7e3b756c385497a6d90609ff67d395`. Current-main CI is being audited. Evidence:
   `yaml-source-include-facade-repo-qualification.log`. Next qualify the complete
   original YAML declaration graph, default namespace alias, omitted runtime-only
   symbols and UMD namespace semantics without inventing public types.
   UMD namespace emission now has explicit admission and output support with
   single/program CLI strict consumer controls. This isolates one prerequisite;
   native YAML types still require explicit runtime-only export accounting and
   a default alias that retains both value and type namespace members.
   Preserve the four original mutable schema declarations and do not invent
   typed safe-load functions or an object-only default facade.
   Evidence: `yaml-source-audit.json`, `yaml-source-frontier.json`,
   `yaml-inequality-frontier-before.log`, `native-arguments-source-regression-final.log`.
   Qualify remaining module-loader internals/HMR, persistence failures and lifecycle paths;
   register qualification and complete PR/current-main CI. Extend the delivered
   Include source and public type closure with actual YAML source qualification.
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
