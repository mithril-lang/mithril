# SMT contracts for checked modules (L1 prototype)

Status: prototype behind an explicit entry point (`mithril.verify`,
`mithril.verify-z3`). No existing pipeline calls it. Design reference:
design v0.6 §6 (D5, layer L1) and stage V1.

## Contract surface

Two optional fields on a module `Function`:

| field | type | scope |
|---|---|---|
| `requires` | bool expression | the function's parameters |
| `ensures` | bool expression | the parameters plus `result` (the return value) |

Both are ordinary module expressions. In form text:

```clojure
(mithril/function :name "safe_inc" :params [(rdf/node :name "x" :datatype "i64")] :returns "i64"
  :body (mithril/call :name "add" :args [(mithril/local :name "x") (mithril/literal :datatype "i64" :value 1)])
  :requires (mithril/call :name "not" :args [(mithril/call :name "eq" :args [(mithril/local :name "x") (mithril/literal :datatype "i64" :value "9223372036854775807")])])
  :ensures (mithril/call :name "not" :args [(mithril/call :name "eq" :args [(mithril/local :name "result") (mithril/local :name "x")])]))
```

`verify/check-contract-document` removes the two fields and adds synthetic
declarations `__mithril_requires_<f>` (params → bool) and
`__mithril_ensures_<f>` (params + `result` → bool), then runs the
existing `module/check-document`. Contracts therefore get the same type,
arity, budget and name checks as bodies. `src/mithril/module.cljk` is not
changed:

- A document without contract fields goes straight to `module/check-document`.
  The result is the same, and a test checks this.
- `module/check-document` still refuses contract fields with `invalid-shape`,
  so a contract module cannot reach lowering by accident.
- In contract modules, `__mithril_*` names are reserved: they cannot be
  declared, called from a body, or exported. A function with `ensures` cannot
  have a parameter named `result`.
- The synthetic declarations count toward the existing 128-function and
  4096-node budgets.

Folding the fields into `signature!` later would be a small change. It is left
out so the checker stays byte-for-byte the same.

## Encoding

| IR | SMT-LIB2 (`(set-logic ALL)`) |
|---|---|
| `i64` | `(_ BitVec 64)`, two's-complement literal `#x…` |
| `bool` | `Bool` |
| `string` | `String`. Printable ASCII is written as is, `"` is doubled, everything else is `\u{…}`. Code points above U+2FFFF (the end of z3's alphabet) are refused, never truncated. |
| `add` / `sub` / `mul` | `bvadd` / `bvsub` / `bvmul`, plus an overflow obligation: the wider signed result must equal the sign-extended wrapped result (1 extra bit for add and sub, 64 for mul) |
| `eq`, `not` | `=`, `not` |
| `if` | `ite`. Each branch's path guard is the condition, or its negation, conjoined with the outer guard. |
| `let`, call arguments and compound subterms | a fresh constant with a defining equation, so the formula grows linearly, not exponentially |
| `sequence` | the last value. Every element still contributes its obligations. |
| declared call | inlined: `requires` becomes an obligation at the call site, then the body is inlined |
| lambda, function-ref, invoke, `js_*` | not translated: `unknown` with `:unsupported` |

Overflow counts as a fault. This holds whether a backend wraps or traps, so a
proof of no overflow is valid for both.

### Obligations and queries

Each obligation is `guard ⇒ condition` and has a kind: `:overflow`,
`:call-requires`, `:ensures`, `:requires-overflow` or `:ensures-overflow`.
The function's own `requires` is assumed.

Inlining stops at a cut point when the call depth reaches `:bound` (default 8,
at most 64, the module expression-depth budget) or when inlined calls exceed
`:fuel` (default 256, at most 4096, the node budget). A cut point returns an
unconstrained value, and its path guard is recorded in `reach_cut`.

1. **Counterexample query:** `violation ∧ ¬reach_cut`. If it is satisfiable,
   the run never reaches a cut, so every evaluated step is modeled exactly and
   the fault is real.
2. **Bound query** (only when cut points exist): `violation ∨ reach_cut`. If
   it is unsatisfiable, the result is `proved`: no input violates an
   obligation and no input reaches a cut.
3. **Bounded candidates:** otherwise, one query per obligation (at most 32).
   Each model is replayed by the concrete evaluator (`verify/replay`: BigInt,
   checked arithmetic, the same budgets). If the replay faults or breaks
   `ensures`, the result is a `counterexample` with `:confirmed-by :replay`.
   Otherwise it is `unknown` with `:bound`.

A `proved` result whose `requires` admits no input is marked `:vacuous true`.

Each result has a `:status` of `:proved`, `:counterexample` (with `:model`,
`:violations` and `:replay`) or `:unknown` (with a `:reason` of `:bound`,
`:unsupported`, `:solver` or `:solver-unavailable`). It also lists the
`:cuts`.

## Solver

The `z3` binary is run with `spawnSync` (`-in -smt2 -T:30`). The path comes
from `MITHRIL_Z3` or `PATH`. The pure namespace takes the solver as a
function, so it does not depend on the host. The `z3-solver` npm package was
not used: it is an asynchronous wasm build that needs threads and
SharedArrayBuffer, and it is a large dependency. This repository has no
`package.json` and runs tests through a pinned nbb engine. CI downloads the
pinned z3 4.13.4 release and checks its sha256
(`.github/workflows/smt-contracts.yml`). Locally, z3 4.16.0 passes the same
suite. If no solver is available, every result is `unknown`, never `proved`.

## What is shown possible (tests: `test/mithril/verify_test.cljk`)

Run with `node scripts/test-smt-contracts.mjs --engine <pinned nbb cli.js>`.

- **Proved:** an overflow-guarded increment with its `ensures`. A caller that
  establishes a callee's `requires` through a branch. let, sequence and bool.
  Strings with escapes and non-ASCII. Recursion whose depth is limited by
  `requires` (the cut points exist but cannot be reached). Vacuous proofs are
  flagged.
- **Counterexample:** `add` overflow at `i64` max and `mul` overflow at `i64`
  min, both exact boundary models. A broken `ensures`. A callee `requires`
  that the caller does not establish. A string model with `"`, `\`, CJK and an
  astral code point that round-trips through z3's output. An overflow found
  before a reachable cut, confirmed by replay. Every counterexample is
  replayed concretely.
- **Unknown:** unbounded recursion (`spin`). Depth-limited recursion with
  `:bound 2` or `:fuel 1`, never `proved`. Host values. No solver.

## Limits

- **No ordering intrinsics.** The checked IR has `add`, `sub`, `mul`, `eq` and
  `not`, but no `lt` or `le`. Contracts such as `0 <= n` cannot be written.
  Ranges must be spelled out as disjunctions of `eq`, as in the countdown
  test. Adding `lt`, `le` and `bvslt` is the single most useful next step. It
  needs a change to `module.cljk`.
- **Inlining only, no modular proofs.** Callee bodies are inlined. A callee's
  `ensures` is not used as a summary, and there are no loop or recursion
  invariants. Recursion deeper than the bound always ends as `unknown`, unless
  replay finds a concrete fault.
- **Over-approximated reachability.** Guards are path conditions only and
  ignore earlier faults. This is sound for `proved` and for the reality of a
  counterexample. A reported violation can follow an earlier real fault, and
  replay reports which fault actually happens.
- **Scalar subset only.** Guest closures, host values and imports are outside
  the subset.
- **Trust base.** The verifier trusts the translator, z3 and the module
  checker. Replay cross-checks counterexamples, but nothing cross-checks
  proofs. Proof certificates (z3 proofs or Lean) are future work, per D5.
- **Cost.** One to three solver calls per function, plus up to 32 replays in
  the bounded case. Each call has a 30 s timeout. The function's IR size
  limits formula size, multiplied by the inlining fuel.

See `translation-validation.md` for L2.
