# Verification

Status: normative v1 draft · 2026-11-26 · decision **D5** (SMT is the main
tool, alongside a DL reasoner and SHACL; the trusted base stays small; Lean
when needed). Uses identities from ipld-identity.md (D3) and outputs from
targets.md (D6–D9).

## 1. Layers

| Layer | Name | Question it answers | Required at |
|---|---|---|---|
| L0 | Admission | Is the input well-formed, closed-world and well-typed? | Every compile |
| L1 | SMT contracts | Does each definition meet its stated pre- and postconditions and refinements, with no overflow? | Definitions that declare contracts (V1, after M1) |
| L2 | Translation correctness | Does each emitted output mean what the IR means? | Every emitter, in CI |
| L3 | Capability | Does the program reach only the authority it declared? | Every compile and emit |
| L4 | Traceability | Can every output be traced to its design ontology by CID? | Every receipt |

A layer that does not run MUST be recorded as `not-run` in the receipt. It
MUST NOT be recorded as passed.

## 2. L0: admission

An input is admitted only if all of the following hold. Each failure is a
named refusal (closed world):

1. **Reader.** Tokens and dispatch follow the reader spec. Unknown tags,
   metadata, reader conditionals in the data profile, and floats in the data
   profile are refused by name.
2. **Desugaring** is total on the input (sform-canonical.md §3.5).
3. **RDF canonicalization** finishes within the RDFC-1.0 work limit
   (rdf-owl-shacl-sform.md §2.2).
4. **SHACL.** The shapes graph uses only SHACL Core and is not recursive
   (rdf-owl-shacl-sform.md §5.3). The data conforms to its declared shapes.
5. **Check.** Types, arity, imports, features and budgets pass (depth 64,
   4096 nodes, 128 functions and exports, 64 parameters, closures of
   arity ≤ 4).

## 3. L1: SMT contracts

- Contracts (`requires`, `ensures`, refinements on `i64`, `bool` and
  `string`) are translated to SMT-LIB. `i64` is encoded as 64-bit bitvectors,
  so overflow is exact. LIA MAY be used where no overflow is possible.
- **Termination** is handled by the existing fuel and budget bounds, not by
  SMT. Bounded model checking unrolls loops and recursion up to those bounds.
- **Results.** `unsat` (proved), `sat` (a counterexample, which MUST be
  reported with the input values), or `unknown` or timeout, which MUST be
  reported as `unknown`, never as passed. A model is not a proof. Only `unsat`
  of the negated obligation counts.
- **Solver** name, version and options are pinned in the receipt.
- **Loop and recursion invariants** written by a person are checked by SMT as
  induction obligations (base case and step). Invariants are not inferred.

## 4. L2: translation correctness

Each emitted output MUST be checked by at least one of these methods. The
receipt names which ones ran.

| Method | Applies to | Rule |
|---|---|---|
| Translation validation | Tier B functions | For each function, the emitted function equals the IR function, encoded to SMT at bounded depth. Done one function at a time, not as a proof of the whole compiler. |
| Differential testing | Tier B | The IR evaluator, JS, Python, Rust and Amu/Wasm all produce the same observable results and error kinds on the same inputs. Any difference is a defect. |
| Golden files | All emitters | Checked-in expected output, with its source, IR and output CIDs in a header. The CIDs are checked **before** the text is compared. |
| HTML round trip | Tier A HTML and forms | Parsing the emitted HTML and reading its `data-mith-iri` elements back MUST give the source dataset (same `graph-digest`) for the part that was rendered. Client form checks MUST accept and refuse exactly what server-side SHACL validation does on the shared test set. |
| Serialization round trip | JSON-LD / Turtle | Re-reading MUST reproduce `graph-digest`. |
| Identity round trip | Every block | `encode(decode(b)) = b`. The CID recomputes to the same value. |

## 5. L3: capability

1. Host imports MUST be on the module's declared import list. An emitter
   refuses any other host call (`:mithril/backend/unimported-host`).
2. `ForeignImport` seams are per module, declared and reviewed.
3. The Amu guest refuses `js-value` fail-closed. Rust targets refuse `js-value`.
4. No ambient authority: `eval`, `require`, `load` and similar heads are
   refused at admission. Typed capability calls name an IRI capability.
5. The receipt lists the capabilities used, and each one MUST be a subset of
   those declared.

## 6. L4: CID traceability

Every compile produces a **receipt**: a DAG-CBOR block with links to:

```
design ontology  (dataset-cid + graph-digest)
  → source        (CIDv1 raw over source bytes)
  → canonical IR  (CIDv1 dag-cbor; Definition CIDs / SCC CIDs; names block)
  → outputs       (CIDv1 raw per emitted file, per target)
  + verification  (L0–L3 results with tool versions; not-run where skipped)
```

- Every output MUST be reachable from the design ontology through links in the
  receipt. An output that is not reachable is not traceable and MUST NOT be
  published as Mithril output.
- Where the data tier is involved, the receipt MUST carry `graph-digest` next
  to `dataset-cid` (ipld-identity.md §5).
- Receipts and proofs are evidence. They MUST NOT be garbage-collected as
  caches.

## 7. What SMT covers, and what needs other tools

| Obligation | Tool | Is SMT enough? |
|---|---|---|
| Pre- and postconditions, overflow and refinements per definition | SMT (bitvector or LIA) plus bounded model checking | **Yes**, within the depth 64 / 4096 node / fuel bounds |
| Termination | Fuel bounds | SMT is not needed |
| Correctness of each emitted output | Translation validation (SMT) plus differential testing | **Yes**, per function and bounded |
| Loop and recursion invariants | Person-written invariant, checked by SMT | **Partly**: SMT checks invariants, it does not find them |
| Ontology consistency, classification, entailment | OWL 2 DL reasoner; OWL 2 RL as Datalog | **No**: SROIQ reasoning is not a good fit for SMT |
| SHACL conformance | SHACL validator (`shacl.cljk`) | SMT is not needed |
| SPARQL query results | SPARQL engine (`vendor/src/sparql`) | SMT is not needed |
| Trusted base: reader correctness, injectivity of canonicalization, meaning preserved by desugaring, IR semantics | Property and differential tests now; a proof assistant (Lean) later | **No**: these are meta-theorems about the language, not facts about one program |

**Trusted base.** The trusted computing base is: the reader, the desugarer,
RDFC-1.0, the DAG-CBOR codec, Check, and the SMT encoding. It MUST stay small
and documented. Until a Lean development exists, each component is covered by
property tests: for example, for desugaring, `canon(desugar(x))` is
idempotent, and equal inputs give equal encodings. Lean is introduced for these
meta-theorems when the owner asks. It is not a prerequisite for v1.

## 8. Implementation status (2026-11-26)

| Layer | Code today | Gap |
|---|---|---|
| L0 | `form.cljk` (closed reader, named refusals), `module.cljk` (Check and budgets), `shacl.cljk` (SHACL Core; recursion is refused dynamically, not at admission), `rdf-canon` work limit | The static recursive-shape check, and the desugaring refusals for sugar not yet admitted |
| L1 | There is no SMT integration in the repository | All of it (milestone V1) |
| L2 | `test/fixtures/digest-baseline.edn` golden digests. #180 tests the IPLD round trip and CID stability. | No emitter goldens with a CID header. No differential harness. No HTML round trip. |
| L3 | Declared host imports in native-js lowering. Guest js-value fail-closed in #179 (open). | No capability list in receipts. |
| L4 | Artifacts carry `graph-digest` (`compiler/graph-identity` computes the `dataset-cid` beside it). `pair-definition-cids` pairs CIDv1 `definition-cids` on artifacts. | No receipt block with CIDv1 links from source to IR to outputs. |
| Lean | None | Later, by owner decision |

## 9. Open points

1. Which SMT solver to pin (Z3 is assumed), and whether the solver runs in CI
   or only in a dedicated lane.
2. How Tier B checks behave on inputs outside the safe-integer range in the
   JS target, before a BigInt lowering exists (targets.md open point 2).
3. Where receipts are stored and how long they are kept (CAR files in
   the repository versus an external block store).
