# System One repair search (v1 prototype)

Mithril declares a finite candidate catalog; a policy chooses an admitted label;
Amu compiles the resulting Kotoba source and executes its exported tests. A failed
candidate is reverted before another choice. Only a passing compiler/test receipt
retains the edit in a disposable workspace.

```
.mith repair catalog + .kotoba source + failing tests
  -> unique-expression preconditions -> finite legal candidates
  -> Jev Choice (or explicit deterministic replay)
  -> closed distribution + confidence admission
  -> scratch edit -> Amu native compile -> Amu semantic-target tests
  -> verified result OR rollback + exclude failed candidate + choose again
```

The controller and host are `.cljk` running under kbb's SCI host. The repaired
program is `.kotoba`; its compilation uses `amu compile --jvm-free` with the
host-native default target. This is an executable coding-search prototype, not
a completed native/Q9 migration of the controller.

## Run

Run from the Mithril repository. `repair.edn` is a dependency-free host config;
it avoids resolving the unrelated full-project RDF dependencies for this entry.
Use an existing Amu checkout whose native compiler is qualified.

```sh
kbb --backend sci --config repair.edn --classpath src:test test/run_repair.cljk
kbb --backend sci --config repair.edn --classpath src bin/mithril-repair.cljk \
  replay examples/repair/countdown.mith examples/repair /absolute/path/to/amu/bin/amu
kbb --backend sci --config repair.edn --classpath src:test test/run_repair_e2e.cljk \
  /absolute/path/to/amu/bin/amu /tmp/repair-evidence.edn
```

`replay` chooses candidates in catalog order, deliberately causing the first
candidate to fail. It is not a model. `jev` uses the same Choice wire protocol,
endpoint and model identity as Mithril's existing OpenRouter Jev adapter:

```sh
kbb --backend sci --config repair.edn --classpath src bin/mithril-repair.cljk \
  jev examples/repair/countdown.mith examples/repair /absolute/path/to/amu/bin/amu
```

The live mode uses `OPENROUTER_API_KEY`, or the single known Keychain item
`gftd.openrouter` / `OPENROUTER_API_KEY` already used by `mithril-jev`. It never
prints or persists the key. Calling live mode sends the declared edit candidates,
goal, source digests, compiler/test diagnostics and previous attempt receipts to
OpenRouter. No source is sent until the live mode is explicitly invoked.

## Contract and limits

- `mithril/repair-search` and `mithril/repair-candidate` are inert Mithril Form
  data admitted by `compile-catalog`. They do not claim canonical RDF/OWL/SHACL
  compilation through `mithril.compiler` yet. The graph projection is declared
  symbol-to-file metadata, not an extracted AST, CFG or PDG.
- Each candidate binds a label, symbol, relative `.kotoba` path and an exact
  old/new expression template. Only a unique occurrence is legal. The label's
  symbol is descriptive metadata; v1 does not prove AST ownership or types
  before applying the template. Amu verifies types after editing.
- Only catalog labels may be chosen. Distributions must cover exactly the current
  candidate set, contain finite probabilities in [0,1], and sum to one. Low
  confidence, text/extra fields, unknown labels and changed source are refused.
- Search restarts from the original source after a failure and excludes attempted
  labels. It is bounded single-edit best-candidate exploration, not multi-step
  synthesis, beam search or MCTS. Maximum attempts is 100; policy may be smaller.
- The source root is read-only; allowlisted files are copied to a new private
  temporary workspace. Traversal, aliases/symlinks, ambiguous preconditions and
  source budgets are refused. There is no arbitrary shell command from a model.
- Compiler/test process timeout is 60 seconds per command. Failed verification,
  verifier exceptions, budget exhaustion and candidate exhaustion never leave a
  failed edit applied. Diagnostics are bounded to 4096 characters. A successful
  result retains its source and native artifact in scratch for review.
- Multi-file catalogs verify each file as a standalone unit. Module locks,
  dependency discovery, semantic ontology constraints and Lean proof receipts
  are future work. Tests bound the evidence; a passing result is not a proof of
  general behavioral equivalence.
- The v1 receipt includes original/final source hashes, each choice/distribution,
  candidate hashes, verification, acceptance and provider metadata when available.
  It is a local EDN audit, not signed/IPLD persistence or a distributed lease.

## Observed acceptance, 2026-10-05

[Recorded replay](evidence/repair-replay-2026-10-05.edn) used a clean isolated Amu
`origin/main` at `ac99fd3c4` (`ac99fd3c4` was fetched for this run). The primary Amu
checkout had unrelated uncommitted changes and was preserved.

1. Original `(+ n 1)` compiled natively but failed `test-one` and `test-many`.
2. `(- n 1)` compiled, passed `test-one`, failed `test-many`, and was reverted.
3. `(countdown (- n 1))` compiled for `aarch64-macos-kotoba-v1` and passed the
   three exported tests on the KIR interpreter, JS and Wasm semantic targets.
   The historical `:jvm-kir` report key names the interpreter target; the commands
   ran on Amu's Node entrypoint with `--jvm-free`.
4. The original fixture remained byte-for-byte unchanged.

Controller checks: 6 tests / 33 assertions, including rollback, exhaustion,
verifier exceptions, stale source, probability admission, confidence and provider
failure. Existing Mithril Form regression checks: 4 tests / 13 assertions passed.

Live Jev execution was blocked by automatic approval review: explicit permission
was required to send the sample source/state to OpenRouter. No live model result,
latency/token improvement, Lean proof, or production integration is claimed.
