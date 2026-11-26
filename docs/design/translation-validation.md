# Translation validation for checked modules (L2 design)

Status: design. The L1 prototype it builds on is in `smt-contracts.md`.
Reference: design v0.6 §6 (L2), transpiler design §7.2 (differential tests).

## Goal

Check every emitted function against the checked IR it came from. The check
runs per function and per build. It does not verify the emitter once for all
programs. A run produces one of three answers:

- **equivalent:** proved for all inputs that satisfy `requires`, within the
  bound
- **counterexample:** a concrete input on which the two disagree
- **unknown:** outside the translated subset or past the bound. This is never
  reported as equivalent.

Both sides are encoded into one SMT formula over shared inputs, and the solver
is asked for an input where they differ. The emitter is not trusted, and
neither is any proof about it. Only the encoders and the solver are trusted.

## Observable behavior

For a scalar function `f(x̄)` the outcome is one of:

- `return v`
- `fault k`, where `k` is `overflow` or `call-requires`
- `diverge`, meaning the fuel or bound ran out. This is not observable, so the
  run reports `unknown`.

Two implementations are equivalent when, for every `x̄` where `requires(x̄)`
holds, they give the same outcome. For a fault, only the fault kind has to
match, which is the "error triple shape" of transpiler §7.2. The faults within
one evaluation must also occur in the same order. A backend that wraps on
overflow while the IR faults is a counterexample, unless the target profile
declares wrapping. That target-semantics decision is recorded in the receipt.

## Encoders

| side | encoder | status |
|---|---|---|
| checked IR | `mithril.verify/function-vc`, extended to return `(value, fault?, fault-kind)` instead of obligations | prototype (L1) |
| emitted JS (ESM) | symbolic encoder for the emitter's output vocabulary (below) | to build in M1 |
| Kotoba source for Amu (`module_lower`) | encode the generated `defn`, `let`, `if` and `+ - * = not` forms. The heads are already a closed set in `lowering-contract.md` §1. | first target: smallest gap |
| Python / Rust (M2) | same pattern, one encoder per closed emitter vocabulary | later |
| Wasm (Amu output) | Wasm i64 instructions map one to one to bitvectors. Structured control flow becomes `ite`, and calls are inlined. | later |

The target encoder parses the emitter's own output text, not the emitter's
internal AST. It accepts only the closed vocabulary that the emitter is
specified to produce, and refuses anything else (fail-closed). Restricting the
emitter to a small vocabulary is what makes the encoder small. Examples of
that vocabulary:

- JS: `function`, `const`, `return`, `?:` / `if`, `===`, `!`
- i64 helpers such as `__mithril_i64_add(a, b)`, emitted as calls whose
  semantics are axiomatized once: a BigInt op plus a range check that throws
  `RangeError`
- string literals as JSON

A helper's axiom is the one piece the encoder trusts. Each helper is checked
against its axiom by its own unit and differential tests.

## Query

For each function `f`, with shared input constants `x̄`:

```
assume requires(x̄)
(vIR, fIR) = encodeIR(f)(x̄)
(vT,  fT)  = encodeTarget(emit(f))(x̄)
check-sat: ¬reach_cut ∧ ¬(fIR = fT ∧ (fIR ≠ none ∨ vIR = vT))
```

Cut handling is the same as in L1:

- If the query is satisfiable, the model is a real discrepancy.
- If it is unsatisfiable, a second query asks whether `reach_cut` can be
  satisfied. If it cannot, the result is equivalent. If it can, the
  disagreement models are replayed on both sides (IR replay and the real JS
  runtime). If they disagree, the result is a counterexample. Otherwise it is
  unknown.

Calls are handled by matching callees. When function `g` has already been
proved equivalent, both sides may replace their calls to `g` with the same
uninterpreted function `g♯(x̄)` and the same fault predicate. This is
compositional and needs no inlining. Recursive SCCs are matched by assuming
equivalence of the recursive calls (relational induction). They are bounded by
the same fuel, so they become `unknown` past the bound. Matching calls
requires the emitter to preserve the call structure, which the current
lowering does.

## Fit with differential tests

Differential tests (transpiler §7.2) run the IR evaluator and each backend on
fixtures and compare canonical outcomes. Translation validation adds three
things:

1. **Counterexamples become fixtures.** Each SMT counterexample is written as
   a differential-test fixture: the inputs, the IR outcome and the target
   outcome. It is then run on the real runtime (Node, Python, cargo or Wasm)
   to confirm it. A counterexample that the runtime does not reproduce points
   to an encoder bug, and that is reported too.
2. **Boundary inputs.** For each overflow obligation, the solver gives one
   input that just passes and one that just fails, such as `x = 2^63 - 1`.
   These are added to the differential input set, because random generators
   rarely hit exact boundaries.
3. **Coverage split.**
   - Functions reported `equivalent` need only a smoke fixture.
   - Functions reported `unknown` (bounded or unsupported) keep full
     differential and property testing as the evidence.
   - The receipt records which method covered each function.

The concrete evaluator is `verify/replay` today. It is the IR side of the
differential harness and is also the oracle that confirms L1 counterexamples.
It should become the M1 IR evaluator, or be replaced by it, so that only one
reference semantics exists.

## Receipt

Per function, the receipt records:

- `ir-cid` and `output-digest`
- the target name and its declared overflow semantics
- the result: equivalent, counterexample or unknown, plus the reason
- the bound and fuel
- the solver name and version
- the SMT query digest

Receipts are evidence and are kept (AGENTS rule 5).

## Order of work

1. Change the L1 encoder so it returns `(value, fault)` per function, not
   obligations. This is a small refactor of `function-vc`.
2. Build the Kotoba encoder for `module_lower` output, then compare it with
   the IR on the existing module fixtures. Both encoders already exist in
   closed form, so this proves the method before M1.
3. Build the M1 JS emitter together with its encoder, sharing the closed
   vocabulary list. Run them in CI next to the differential lane.
4. Do Python and Rust in M2. Rust's borrow elaboration (D9) does not change
   scalar semantics, but `i64` must use `checked_*` or a trap to match `fault`.

## Limits

- Only scalar, first-order functions are covered. Closures, host values and
  imports are refused. Equivalence that depends on host effects needs a model
  of the effects, which is out of scope.
- Helper axioms and the encoders are trusted. Their small size is the main
  mitigation, together with replaying every counterexample on the real
  runtime.
- Floating point, aggregates and strings beyond literals plus `=` would each
  need further theories, such as `FloatingPoint`, arrays or sequences, and
  further encoder vocabulary.
