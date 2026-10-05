# Mithril workspace coding: implementation and evaluation — 2026-10-05

## New executable behavior

The Mithril/CLJK harness can now retain a verified edit in an explicitly declared
Git repository. A local CLEF choice selects a supplied replacement, and a
hash-bound caller-declared verifier runs on an isolated staged copy. A failing
candidate leaves the repository unchanged. Passing edits get a durable intent
before atomic publication, followed by the correlated session receipt.

Sessions have UUID-scoped call IDs, exclusive ownership, atomic/fsynced state,
profile/task/kernel binding and journal reconstruction. Explicit resume preserves
committed results. Invented facts/counters, checksum drift, changed profiles and
live owners refuse restoration. Pending edits require explicit reconciliation;
pending native OS effects refuse automatic replay. A crashed owner may leave a
stale lock, which requires checking its PID before manual removal.

## Improvement experiment and measured boundaries

The first restricted-environment attempt failed because MLX could not access a
Metal device. Those failures are environment failures, excluded from model
accuracy. No cloud fallback was used.

In the first GPU-enabled pilot, all three distinct tasks chose `finish` before
verification. The host refused these decisions and retained no changes. This is
a real negative result, preserved separately from the final trials. The
hypothesis was that the policy should offer only actions that the current host
state can admit. `finish` is now absent until verified facts exist; sole legal
choices are recorded as host admission, with no model forward. The patch-choice
turn still offers three candidates to actual CLEF. This changes the controller,
not model weights; no training improvement is claimed.

Final measurement results and restart qualification follow. Reproduction is
documented in `../../ports/README.md`.

## Final results

| Mechanism | Exact retained repair + verified completion | Successful end-to-end median | Range of successful episodes | API cost |
| --- | --- | --- | --- | --- |
| Actual offline CLEF | 9/9 (100% on this small known-task suite) | 22.578 s | 21.600–24.934 s | JPY 0 |
| Fixed-first reference | 3/9 (33.3%) | 13.894 s | 13.459–14.790 s | JPY 0 |

CLEF's actual model-forward median was 7.789 seconds including process startup,
snapshot validation and loading. Model load median was 3.050 seconds; inference
median was 1.314 seconds. Median input was 394 tokens. There were nine actual
model forwards and 18 deterministic host singleton admissions. The 1.0 singleton
probabilities are not measured model accuracy. Loading/startup and two compiler
verification passes account for much of the total latency; pure inference time
alone does not describe coding speed.

Each passing episode had native compilation and four assertions on all three
test backends (12 backend assertions). All nine retained sources exactly matched
their declared expected patch. The six unsuccessful fixed-first episodes
retained no edit. The historical `:jvm-kir` report target label is compatibility
naming; the successful runs invoked the Node `--jvm-free` compiler route.

The reference is faster per successful episode but succeeds only when the correct
candidate is first. It is not a competing model. These observations do not prove
CLEF is faster or cheaper than any other LLM, nor that it can author these
candidates autonomously. Human-written harness code and candidate construction
are outside the timed coding episodes and are not free total development cost.

## Restart and native compatibility qualification

- Actual terminal workspace resume: `done`, 74.163 ms in-process wall time,
  zero new model forwards, preserved one tool call / two steps. The retained file
  was checked against its durable intent before accepting the saved result.
- Interrupted-effect experiment: a separate process durably saved a pending
  tool transition, verified and published the edit, then intentionally exited
  with code 71 before settlement. This fault-injection fixture chose its patch
  by deterministic replay, not CLEF. Its dead PID was checked before removing
  only the experiment-owned stale lock.
- Normal resume refused with `uncertain-pending-effect`. Explicit `reconcile`
  inspected the retained file, reran actual native compilation and KIR/JS/Wasm
  tests and reached `done` in 6.728 s. The source was not selected or published
  again; one tool call remained recorded. No model forward was used.
- Existing native computer CLI: one real `list_apps` observation reached `done`;
  explicit resume remained at one call/two steps with an empty fresh driver
  journal, so no duplicate native call was made. App names are not in evidence.
- Final focused suite: 16 tests / 111 assertions, zero failures/errors. Covers
  old port behavior plus ownership, binding/hash tampering, journal reconstruction,
  saved-result resume, pending-effect refusal, literal verified file publication,
  failed-candidate preservation, symlinks/traversal, verification-input drift,
  changed retained files, explicit reconciliation, nested verification-input
  paths, literal replacements and host-singleton provenance.

Raw final/pilot/environment receipts, verification diagnostics, intents, resume
and reconciliation results are retained under `workspace-2026-10-05/`.
`metrics.json` distinguishes successful timing from the reference's failed
episodes; `runs.json` contains all 18 final episodes. No entire Git directories,
desktop inventories or native accessibility trees are committed.

## Evaluation design

- Machine: Apple M1 Max, 32 GiB memory, actual macOS MLX/Metal execution.
- Model: pinned offline TrevorJS CLEF 4-bit snapshot
  `6d4dc3ff7f43fba6065f1caef5c7a135315dfc8d`, existing hash-checked adapter.
- Tasks: positive, nonnegative and negative integer boundary predicates; four
  assertions per task on KIR/JS/Wasm, plus x86_64 Linux native compilation.
  The generated native binary is not executed.
- Each task is repeated three times. Candidate order is rotated; all nine
  episodes have separate Git repositories and sessions. These are three small
  known tasks, not nine independent unseen problems.
- Reference: fixed-first `replay`, same supplied candidates and verification
  pipeline. It is not another LLM and should not be reported as a model comparison.
- Success: terminal `done`, compiler/tests passing, retained repository source
  matching the expected patch exactly. A quick refusal is not counted as a
  successful fast solution. Time statistics must separate successful runs from
  failed runs where appropriate.
- API cost is JPY 0 with offline execution. Electricity, device amortization,
  human implementation and candidate-authoring cost are not measured.
- This is an exploratory controller improvement on known tasks. A preregistered
  held-out suite and comparisons with other models remain necessary before
  general coding or cost-efficiency claims.

## Remaining scope

This implements declared single-file edits, not arbitrary generated patches or
multi-file transactions. It does not provide a full OS sandbox, DSH durable inbox,
parallel scheduler, streaming, subagents, complete plugin ABI/UI parity, or a
Cua native OS backend rewrite. No production site, model weights or native
permissions/installations were changed. The three draft PRs remain unmerged.
