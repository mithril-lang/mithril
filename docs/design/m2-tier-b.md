# M2 design: Tier B program IR, JS / Python / Rust emitters, differential testing

**Status: design only. No code changes.** Written 2026-11-26 for review by Jun.
Builds on PR #180 (M1 Tier A: mith -> IPLD IR -> DAG-CBOR -> CIDv1) and on the
Organizer reports `mithril-transpiler-design-20261123.md` (here: "the transpiler
design", §-numbers refer to it), `mithril-sform-spec-20261123.md`, and the
language design v0.6 (2026-11-25, decisions D1–D11).

Owner decisions this document follows (not reopened here):

| # | Decision | Effect on M2 |
|---|---|---|
| D3 / D11 | IR canonical form is the IPLD Data Model, bytes are DAG-CBOR, identity is CIDv1. dag-json is for display only. The code-tier Definition CID becomes a real CIDv1. | §2: every Tier B identity is a DAG-CBOR block hashed to CIDv1 |
| D4 | Evaluation runs on the checked IR. DAG-CBOR is for identity, storage and transport. | The IR evaluator is the reference for differential tests (§5) |
| D7 | Per-language output is readable source only. There are no Wasm + language bindings. Wasm stays an output of the Amu path. | §3: JS / Python / Rust emit source text. Amu-Wasm takes part only as a differential lane |
| D8 | Tier A = M1, Tier B = M2 | This document |
| D9 | Rust uses borrow-elaboration with a real borrow check. This overrides the move+clone recommendation in transpiler design §5.2. | §4 |
| D10 | Extend mithril-lang/mithril. No new repository. | All paths below are in this repository |

Plain summary of the schedule risk, given up front: **the IR, identity, JS,
Python and the differential harness fit M2. Full Rust borrow-elaboration does
not.** M2 can ship Rust for the scalar + string subset with real borrow
elaboration. Closures, records, sums and vectors under borrow-elaboration
will most likely slip to M3 (§4.8, §6).

---

## 1. Starting point and scope

### 1.1 What PR #180 provides

- `mithril.transpiler-ipld` lowers a *checked* module (`mithril.module/check-text`)
  to one self-contained IPLD node:
  `{"format" "mithril.transpiler-ipld/ir-v1", "name", "exports", "functions", "call-graph"}`.
  It is encoded with `ipld.core/node->block` (DAG-CBOR, CIDv1 codec 0x71, sha2-256).
- Expression ops: `literal`, `local`, `call`, `intrinsic`, `lambda`,
  `function-ref`, `invoke`, `let`, `sequence`, `if`. Every node has a string
  `"op"` discriminator and a `"type"`.
- Encoding choices that M2 keeps: string map keys only (DAG-CBOR sorts them),
  i64 as a canonical decimal string, types as strings or `{"fn" [[params] ret]}`.
- `mithril.transpiler-rust` is a stub that always throws
  `:mithril.transpiler-rust/tier-b`. Its docstring promises that M2 will not
  change the Tier A node shape.

### 1.2 What #173 (open) adds that M2 must align with

- `:enum-case` checked op over `[:sum Name [case …]]` (nullary cases).
- `definition-cid` = `sha256:` over a key-sorted projection of the checked
  definition. It is not yet a CIDv1, and it has no multihash and no multicodec.
  §2.4 defines the scheme that replaces it. That replacement is the content of
  the pending P-CID proposal (v0.6 §4). M2.0 implements P-CID; it must not be
  done twice.

### 1.3 In scope / out of scope

In scope: the Tier B IR vocabulary and its DAG-CBOR identity; the IR evaluator
extended to the new nodes; JS/TS ESM, Python and Rust emitters; differential
and golden testing across all lanes.

Out of scope: CLI, stdlib, `fmt` and receipts as a product (M3); SMT contracts
(V1); multi-language ingest (I1); Wasm bindings (refused by D7); any change to
existing lowerers (`module_lower`, `program_lower`, `web_lower`, `native_js`).
These keep their current behavior. The new emitters are new namespaces next to
them, as #180 did.

---

## 2. Tier B IR on the IPLD Data Model

### 2.1 Layering: three block kinds

Tier A is one block, keyed by names. Tier B needs per-definition identity,
sharing and mutual recursion, and readable emitters need names. So Tier B
splits a module into three kinds of blocks:

```text
module root  (format "mithril.ir/v1", kind "program")
  ├─ exports:      { "<public name>": Link(named-def) }
  ├─ definitions:  [ Link(named-def) … ]          sorted by Definition CID
  └─ types:        [ Link(type-def) … ]           records / sums
named-def    (format "mithril.ir/named-v1")
  ├─ definition:   Link(def)                      the identity block
  ├─ name:         "increment"
  └─ binders:      ["value", "tmp", …]            local names in binder order
def          (format "mithril.ir/def-v1")         -> Definition CID
  ├─ kind:  "function" | "constant" | "foreign"
  ├─ type:  <type node>
  ├─ body:  <α-normalized expression>             locals as indices, no names
  └─ deps:  [ Link(def) … ]                       sorted, deduplicated
```

- **Definition CID** = CIDv1(dag-cbor, sha2-256) of the `def` block. Renaming a
  function or a local changes only `named-def`, never the Definition CID
  (Unison-style). Emitters read `named-def` + `def` together, so the output
  keeps the source names (D7, readable source).
- **Tier A stays byte-identical.** A module that uses only Tier A ops still
  lowers through `transpiler-ipld/ir-v1` with an unchanged CID. Regression gate:
  every Tier A fixture CID in `test/mithril/transpiler_ipld_test.cljk` is
  unchanged after M2. The Tier B root is a new format string, not a mutation of
  ir-v1. The *named view* of a definition is derived, not stored: denormalize
  the `def` body using `named-def.binders` for locals and the target
  `named-def.name` for each `ref`. For Tier A ops, the named view uses the
  #180 node shapes exactly, so it equals #180's `expr-node` output for the same
  checked expression. Tests assert this. Emitters and the evaluator consume the
  named view.
- Unknown `format` or unknown `op` causes a refusal (`:mithril.ir/unknown-format`,
  `:mithril.ir/unknown-op`), never a best guess. Ops are only ever added
  (transpiler design §4.8).

### 2.2 Node vocabulary

All nodes are maps with string keys, an `"op"` discriminator and a `"type"`.
**Bold** marks nodes that are new in M2. The others are the Tier A shapes from
#180, unchanged.

| op | Fields (besides `op`, `type`) | Notes |
|---|---|---|
| `literal` | `value` | i64 as decimal string; bool; string; **`nil` → `null`** |
| `local` | `name` (named) / `index` (def block) | de Bruijn index in `def`. See §2.3 |
| `call` / `intrinsic` | `name`, `args` | In `def`, `call` carries `"ref": Link(def)` instead of `name`. Intrinsics stay by name (closed table in `module.cljk`) |
| `lambda` | `params`, `returns`, `body` | params keep types; names live only in `named-def` |
| `function-ref` | `name` / `ref` | as `call` |
| `invoke` | `function`, `function-type`, `args` | |
| `let` | `bindings`, `body` | sequential `let*` scoping; each binding opens one index |
| `sequence` | `expressions` | |
| `if` | `condition`, `then`, `else` | condition is `bool` (checked) |
| **`function`** | `params`, `returns`, `body` | The top-level definition body shape (`def.kind = "function"`). Equals #180's `function-node` minus `name` |
| **`rec`** | `index` | Reference to a member of the same SCC (§2.4). Only inside `def` blocks |
| **`vector`** | `items` | `{"vector": T}` type; ordered, immutable |
| **`record`** | `type`, `fields` | construction; `fields` is a list of `[name, expr]` pairs in the record type's declared order |
| **`record-field`** | `target`, `field` | field access on `{"record": IRI}`; checked at Check |
| **`enum-case`** | `sum`, `case`, `fields` | #173's `:enum-case`, extended with optional payload fields |
| **`match`** | `target`, `arms`, (no default) | Required to *consume* `enum-case`. Exhaustive by Check; arms sorted by case name. Not in the task's node list, but without it sums cannot be used |
| **`dispatch-call`** | `protocol`, `method`, `target`, `args`, `impl: Link(def)` | Single static dispatch on the checked type of `target` (§4.7). Check resolves `impl`, so backends never dispatch dynamically |
| **`foreign-import`** | `catalog`, `symbol`, `type` | The only FFI seam. `def.kind = "foreign"`. `catalog` names a reviewed per-target catalog entry (§3.4) |
| **`error`** | `code`, `fields` | Raises a named Mithril error. `code` is a namespaced string (e.g. `"mithril/integer-overflow"`) |
| **`host-*`** | as `form.cljk` | The 55 `host-*` forms in `form.cljk` (`host-method`, `host-get`, `host-try-catch`, `host-for-of`, …), one op each, same field names. **JS-only**: Python and Rust refuse them (§3) |

Types (extending #180's `type-node`): `"i64" "bool" "string" "nil" "js-value"`,
`{"fn" [[T…] R]}` (unchanged), and new `{"vector" T}`, `{"record" IRI}`,
`{"sum" IRI}`. Records and sums are nominal: the IRI names a `type-def` block
`{"format" "mithril.ir/type-v1", "iri", "kind": "record"|"sum", "fields"|"cases"}`.
The block has its own CID, and the root links to it.

**Spans and TraceId are not part of identity.** Spans are stored in a sidecar
`debug` block keyed by Definition CID + node path. The receipt links it, but no
`def` block links it. Moving a function within a file therefore does not change
its CID. `TraceId` (transpiler design §6.3) is
`(Definition CID, node path)` and is computed, not stored.

Checker dependency: `vector`, `record`, `record-field`, payload-carrying
`enum-case`, `match` and `dispatch-call` need `mithril.module` Check support
that does not exist today. Today Check knows `i64/bool/string/js-value/fn`, and
#173 adds `:sum` with nullary cases. Adding them is M2.0 work. It is the main
reason the IR milestone is not small (§6).

### 2.3 α-normalization

- Locals become de Bruijn indices (`{"op" "local" "index" n "type" T}`, where
  n = 0 is the innermost binder). Function params, `let` bindings,
  `lambda` params and `match` arm bindings each open binders in source order.
- Binder names go to `named-def.binders` in the same pre-order, so
  `named-def + def → named expression` is a total, deterministic function.
  Emitters use it, and tests check `denormalize(normalize(e)) == e`.
- `call` / `function-ref` to another top-level definition carries
  `"ref": Link(def)`. Display text (dag-json) shows the CID, never a name.
- Required invariants (property tests, §5.4): identical CID under (a) renaming
  any local, (b) renaming any definition, (c) reordering definitions in the
  source, (d) map key order and whitespace in the source.

### 2.4 Definition CID and SCC hashing (mutual recursion)

A `def` block cannot contain its own CID, and two mutually recursive
definitions cannot each contain the other's. The approach follows Unison:

1. Build the dependency graph over top-level definitions. #180 already emits
   `call-graph`. Add `function-ref` and `dispatch-call.impl` edges.
2. Compute SCCs with Tarjan, then process them in reverse topological order,
   so every non-cycle dependency already has a CID and can be a `Link`.
3. **Singleton without self-edge**: hash the `def` block directly.
4. **SCC with k ≥ 1 members and at least one cycle edge** (this includes
   self-recursion):
   - For each member, build its `def` block with intra-SCC references written
     as `{"op" "rec" "index" ?}` with a placeholder index of 0 for all. Hash it
     to get a *provisional hash* h_i.
   - Order members by h_i (byte order of the CID). That order assigns the real
     `rec` indices. Rebuild the member blocks with real indices.
   - The SCC block `{"format" "mithril.ir/scc-v1", "members": [def…]}` (inline
     members, in that order) is hashed to the **SCC CID**.
   - Each member's **Definition CID** is the CIDv1 of
     `{"format" "mithril.ir/scc-member-v1", "scc": Link(SCC), "index": i}`.
     Every definition, including cycle members, therefore has a real CIDv1 that
     can be used anywhere a `Link(def)` is expected.
5. **Ties.** If two members have equal provisional hashes, they are
   structurally identical modulo cycle references. The order is then broken by
   the members' source names, and the SCC block records
   `"tiebreak": "name"`. This is the one case where a name affects identity. It
   is documented, and a test covers it.

Determinism: the provisional order depends only on α-normalized content.
Permuting SCC members in the source does not change any CID (test (c) above).

Relation to #173: `definition-cid` changes from `sha256:<hex>` over a
key-sorted projection to the CIDv1 above. `compiler/pair-definition-cids` keeps
its `{:name :cid}` shape, so receipts change only in the value format. The data
tier keeps `graph-digest` (v0.6 §3.5). P-CID verification criteria (v0.6 §4)
apply: digest baseline unchanged, same IR → same CID, matches the vendor
DAG-CBOR corpus.

### 2.5 IR evaluator

The reference evaluator is a CLJC namespace (`mithril.ir-eval`, new) that walks
the *named* IR (D4). It is the oracle for §5.

- Semantics per node are written down in `docs/language/` as part of M2.0 and
  are normative for every emitter.
- i64: `add/sub/mul` outside [−2⁶³, 2⁶³−1] raise `mithril/integer-overflow`.
  Overflow is never wrap and never promote (transpiler design R2).
- Fuel: the evaluator uses the existing budget model (`module_lower` fuel). Fuel
  exhaustion is `mithril/fuel-exhausted`. Native targets have no fuel, so test
  vectors that need deep recursion are tagged and the harness skips them for
  lanes without fuel (§5.2).
- `host-*` nodes are evaluated only against a declared JS host stub. Elsewhere
  the evaluator refuses them with `mithril.ir-eval/host-node`.

---

## 3. Readable-source emitters: JS/TS ESM and Python (transpiler design §5.1, §5.3)

Shared rules for all emitters:

- Input is the Tier B root CID plus its blocks (read through the named view, §2.1). Output is a pure function of
  (root CID, emitter version, target options). There are no timestamps and no
  absolute paths. The same CID always produces the same bytes (golden-tested).
- Emitters never re-infer types. They consume IR annotations.
- Every IR node is either lowered or rejected with a named refusal
  `:mithril.transpiler-<target>/<reason>` carrying the TraceId. No node is ever
  accepted silently (M2 exit criterion).
- A file header comment carries the root CID, emitter version and the
  Definition CID of each emitted function (one line per function). The golden
  runner verifies the header before diffing text (§5.3).
- Runtime errors raised by generated code carry the IR error triple (§5.1).
  Message text is free.
- Each target has one small hand-written runtime file
  (`mithril_rt.mjs`, `mithril_rt.py`, `mithril_rt.rs`), checked in and
  golden-tested. It holds the i64 helpers and the error class.

### 3.1 JS / TS (ESM)

Module `a.b` emits `a/b.mjs` plus `a/b.d.ts` (TS declarations from IR types).
Exports are named ESM exports, and private definitions are not exported.
Identifiers go through `mithril.js-identifier`, and an unmappable name is
refused with `:mithril.transpiler-js/identifier`. The emitter is a new
namespace `mithril.transpiler-js` that reuses `native_js` helpers (escaping,
identifiers). It does not modify `native_js`.

| IR | JS |
|---|---|
| `i64` | **`bigint`** with a checked helper `$rt.add(a, b)` that throws `mithril/integer-overflow` outside the i64 range |
| `bool` / `string` / `nil` | `boolean` / `string` / `null` (never `undefined`) |
| `vector` | `Object.freeze([...])` |
| `record` | frozen plain object with exact keys |
| `enum-case` / `match` | `{kind: "Ok", …}` / `switch (x.kind)` with a `default:` that throws `mithril/nonexhaustive` (unreachable after Check, kept as a guard) |
| `lambda` / `invoke` | arrow function / call |
| `let` / `sequence` / `if` | `const` in an IIFE-free block form: the emitter lifts expression-position statements into temporaries so the output stays readable |
| `dispatch-call` | direct call to the resolved impl function (static) |
| `foreign-import` | `import { sym } from "<catalog module>"` taken from the reviewed JS catalog |
| `host-*` | the existing `native_js` lowering for that form |
| `error` | `throw new $rt.MithrilError(code, trace, def)` |

**Change against transpiler design §5.1:** §5.1 refuses i64 arithmetic whose
safe-integer range cannot be proven (`js-unsafe-int`). That would refuse almost
every `add` in the corpus, so this design uses `bigint` for `i64` instead.
`bigint` is exact, and with the range check it matches Rust and Python
semantics. The cost is that JS callers pass `1n` rather than `1` at module
boundaries. The `.d.ts` file states this. Owner question Q1 (§7).

The DOM / Node split stays at module level through declared `host-import`.
An unavailable host fails with `:mithril.transpiler-js/host-unavailable` as a
catchable error.

### 3.2 Python

Module `a.b` emits `a/b.py` plus `a/__init__.py` re-exporting public names.
The target is Python 3.10+ with type annotations from IR types (erased at
runtime, kept for readers and for `mypy --strict` in CI).

| IR | Python |
|---|---|
| `i64` | `int`, wrapped by `_rt.i64(x)` after each `add/sub/mul`, which raises `IntegerOverflowMithrilError` outside the i64 range (Python ints never overflow, so the check is explicit) |
| `bool` / `string` / `nil` | `bool` / `str` / `None` |
| `vector` | `tuple[T, ...]` |
| `record` / `sum` | `@dataclass(frozen=True, slots=True)`; sums are a union of case classes with a `kind` discriminator |
| `match` | `match x:` (3.10 structural pattern matching) on case classes, ending in `case _: _rt.nonexhaustive(...)` |
| `let` / `if` | local assignments / `if` statements. Expression-position `if` uses the conditional expression only when both branches are pure expressions |
| `lambda` | nested `def` (not `lambda`, so multi-statement bodies stay readable) |
| `error` | `raise _rt.<Kind>MithrilError(code, trace, def)`. Host failures are wrapped with `raise … from e` |
| `foreign-import` | real `import` from the reviewed Python catalog |
| `host-*`, `js-value` | **refused**: `:mithril.transpiler-python/host-node`, `:mithril.transpiler-python/js-value` |

Python-specific gap: the default recursion limit (1000) is far below IR fuel.
The emitter does not call `sys.setrecursionlimit`. Deep-recursion vectors are
skipped for the Python lane and say so (§5.2), and the gap is listed in
`spec/conformance/backends/python.md`.

### 3.3 Things no emitter does

There is no Wasm output and there are no bindings (D7). No emitter routes
through Amu (transpiler design R4). There is no runtime type probing, no
dynamic dispatch, and no silent `undefined` / `None` defaults.

### 3.4 Foreign catalogs

`foreign-import` resolves against one reviewed catalog per target:
`spec/foreign/{js,python,rust}.edn`. Each catalog entry maps a symbol to its
module and declared IR type. A symbol missing from a target's catalog is refused
with `:mithril.transpiler-<target>/foreign-unlisted`. Adding a catalog entry is
a reviewed change (transpiler design §5.2).

---

## 4. Rust with borrow-elaboration (D9)

### 4.1 Why this is tractable at all

General borrow inference for arbitrary programs is a research problem. The
Mithril Tier B core is much easier: **it has no mutation.** `let` binds
immutable values, and no Tier B node outside `host-*` mutates anything. Rust
refuses `host-*` anyway. So:

- Aliasing is always semantically safe. A clone and a shared borrow are
  observationally equal, which means borrow-elaboration is a *representation*
  choice and cannot change meaning. That makes P4 below a lemma, not a search.
- The only borrow errors possible in the output are use-after-move, a borrow
  outliving its owner, and a by-reference closure capture escaping. There is no
  `&mut`, so the aliasing-XOR-mutation half of the borrow checker is vacuous in
  v1.
- Copy types (`i64`, `bool`, `nil` → `()`) need no analysis. Only heap types
  matter: `String`, closures, and later `Vec`, records and sums.

### 4.2 Chosen approach: elaborate, then check independently

```text
named IR ─R0 gate─► R1 repr ─► R2 mode inference ─► R3 use-site elaboration ─► RIR
                                                                              │
                                     R4 borrow check (Datalog, NLL-equivalent)◄┘
                                          │ ok                     │ reject
                                          ▼                        ▼
                                     R5 emit .rs            targeted clone fallback
                                          │                  (bounded, reported) ─► R4
                                     rustc gate (CI)          or named refusal
```

- **R0. Subset gate.** Refuse `host-*`, `js-value`, unlisted `foreign-import`,
  and dynamic dispatch (§4.5).
- **R1. Representation.** `i64→i64`, `bool→bool`, `nil→()`, `string→String`
  (owned) / `&str` (borrowed), `{"fn"}`→ see closures, `vector→Vec<T>`,
  `record→struct`, `sum→enum`. Fallible functions return
  `Result<T, MithrilError>`. A small fixpoint over the SCC graph marks a
  function fallible if it contains a checked-overflow intrinsic, an `error`
  node, or a call to a fallible function. Infallible functions return `T`.
  Integer arithmetic uses `checked_add(..).ok_or(..)?`. Overflow never panics
  or wraps (transpiler design R2). Generated crates also set
  `overflow-checks = true` as a second net.
- **R2. Parameter mode inference** (interprocedural, per SCC, fixpoint). Every
  non-Copy parameter gets a mode in the lattice `Borrow ⊑ Own`. A parameter is
  `Own` if any path makes it *escape*: it is returned, put into a constructed
  value (`record`, `vector`, `enum-case`), captured by an escaping closure, or
  passed to an `Own` parameter. Otherwise it is `Borrow`. The lattice is finite
  and the transfer functions are monotone, so the fixpoint terminates; the
  budget guard is the module node budget (4096). Return values are always
  owned. **v1 emits no reference-returning functions**, so no lifetime
  parameters appear in signatures. This is a deliberate restriction (R-2
  below).
- **R3. Use-site elaboration.** Liveness runs over the expression tree, with
  `if`/`match` branches joined. At each use of a non-Copy local:
  - passed to a `Borrow` position → `&x` (`x.as_str()` for strings)
  - passed to an `Own` position and it is the last use on every path through
    that point → move
  - passed to an `Own` position and still live afterwards → `x.clone()`,
    recorded in the **clone report** with TraceId and reason
    (`:clone/live-after-owned-use`, `:clone/escaping-capture`, …).

  String literals in `Borrow` position are `"…"` (`&'static str`). In `Own`
  position they become `String::from("…")`.
- **Closures.** A non-escaping `lambda` (only invoked locally, or passed to a
  `Borrow` fn-typed parameter) captures by reference and is passed as
  `&impl Fn(..) -> ..` (generic, monomorphized). An escaping lambda (returned,
  stored, or passed to an `Own` position) is `move`. Captured values still live
  afterwards are cloned and reported, and the closure is boxed as
  `Box<dyn Fn(..) -> ..>` with owned captures. That is `'static`, so no
  lifetime inference is needed. The `dyn` here is for closure erasure only;
  protocol dispatch stays static (§4.5).
- **R4. Borrow check on the elaborated program (RIR).** This is the "real
  borrow check" D9 asks for. It is *independent* of R2/R3: the elaborator
  proposes and the checker verifies, in translation-validation style. The
  checker encodes RIR as Polonius-style facts (`loan_issued_at`,
  `loan_killed_at`, `var_used_at`, `var_moved_at`, `cfg_edge`, `origin_live_at`)
  and runs the rules on the in-tree Datalog engine (`vendor/src/datalog`).
  **The rules are NLL-equivalent (location-insensitive), not full Polonius.**
  Full Polonius accepts programs that stable `rustc` NLL rejects. The checker
  must be at most as permissive as the rustc version pinned for generated
  crates, or it will approve code that rustc rejects.
- **Fallback.** When R4 rejects at a site, the elaborator turns *that site*
  into an owned use (clone), or for a closure capture into a `move` capture,
  and re-runs R4. It retries at most N = 8 times per definition. Every fallback
  is a clone-report entry with reason `:clone/checker-fallback`. If R4 still
  rejects, the definition is refused with
  `:mithril.transpiler-rust/borrow-unprovable` and the TraceId. **There is no
  module-wide "clone everything" mode.** Owner direction: fall back only where
  it is proven necessary, and report it.
- **`Rc<T>`.** Because values are immutable, `Rc` is never needed for
  correctness. It is a cost policy: when the clone report shows a clone of a
  record or vector type inside a recursive SCC, that type is represented as
  `Rc<T>` throughout the module, and the switch is reported
  (`:repr/rc-recursive-clone`). v1 ships the report but not the switch. The
  switch lands with records and vectors (R-d).
- **R5. Emit + rustc gate.** Output is a `lib.rs` per module plus a generated
  `Cargo.toml` (pinned edition, `overflow-checks = true`, no dependencies other
  than `mithril_rt`). CI compiles every golden with the pinned toolchain. **Any
  rustc borrow or type error on emitted code is a compiler bug**
  (`:mithril.transpiler-rust/rustc-rejected`, internal). It fails CI, and it is
  never shown to users as their mistake.

### 4.3 What the compiler must prove (per definition, before emission)

| # | Obligation | Discharged by |
|---|---|---|
| P1 | No use after move: each owned local is moved at most once per path, with no use after the move | R4 (`var_moved_at` / `var_used_at`) |
| P2 | Every borrow's region stays inside its owner's live range. No borrow escapes its function | R4 + the "returns are owned" rule (structural) |
| P3 | No mutable aliasing. Emitted code contains no `&mut` and no `unsafe` outside `foreign-import` glue | Structural scan of RIR (cheap, total) |
| P4 | Elaboration preserves meaning: for immutable values, clone ≡ borrow ≡ move-at-last-use | Lemma from §4.1. Checked empirically by §5 |
| P5 | Signature consistency: every call site agrees with the callee's inferred modes across the SCC | R2 fixpoint + R4 call-edge facts |
| P6 | Every clone is justified: no clone where the analysis shows a last-use move is possible. Each clone has a report entry | R3 invariant + report completeness test |
| P7 | rustc agrees | CI gate (R5). This is the final oracle; P1–P6 make P7 failures compiler bugs |

The clone report and the refusal list go into the receipt alongside the
Definition CIDs. Clone count per module is golden-tested, so a regression that
adds clones is review-visible.

### 4.4 Named refusals (Rust)

| Code | When |
|---|---|
| `:mithril.transpiler-rust/tier-b` | Existing #180 stub code. Kept only for IR the M2 emitter does not yet cover (for example closures before R-c), so "not yet" stays distinct from "never" |
| `:mithril.transpiler-rust/host-node` | any `host-*` node |
| `:mithril.transpiler-rust/js-value` | a `js-value`-typed node outside `foreign-import` (transpiler design §5.5) |
| `:mithril.transpiler-rust/foreign-unlisted` | `foreign-import` missing from `spec/foreign/rust.edn` |
| `:mithril.transpiler-rust/dynamic-dispatch` | `dispatch-call` whose `impl` Check could not resolve statically |
| `:mithril.transpiler-rust/borrow-unprovable` | R4 still rejects after the bounded fallback |
| `:mithril.transpiler-rust/returned-borrow` | reserved for M3 (reference-returning signatures). Not raised in v1, because v1 never elaborates a returned borrow |
| `:mithril.transpiler-rust/identifier` | name that cannot be a Rust identifier after `r#` escaping |
| `:mithril.transpiler-rust/rustc-rejected` | internal compiler bug (P7). CI-only |

### 4.5 Traits / dispatch

`dispatch-call` lowers to a trait method call with `&self` (the one borrow
transpiler design §5.5 already allows). The impl is resolved by Check, so the
call is static. There is no `dyn Trait` for protocols in M2.

### 4.6 Research risks (honest list)

| # | Risk | Why it is hard | Mitigation / fallback |
|---|---|---|---|
| R-1 | Higher-order mode polymorphism | A fn-typed parameter's mode depends on the closures passed in, and those differ per call site. True mode polymorphism needs either generics over capture modes or per-call-site specialization | v1: monomorphic modes. Fn-typed params are `&impl Fn` if all known callers pass non-escaping closures, else `Box<dyn Fn>` with owned captures. Costs clones, which are reported |
| R-2 | Returned references (lifetime parameters) | Idiomatic Rust often wants `fn f(s: &str) -> &str`. Needs region inference on signatures and elision rules | Excluded from v1 (returns owned). Single-input-lifetime elision is an M3 candidate |
| R-3 | Field borrows / partial moves on records | `&r.f` versus moving a field out of a borrowed record needs place-sensitive (path) analysis, which location-insensitive facts approximate poorly | Treat a record as one place in v1 (borrowing a field borrows the whole record). Precision comes later. This is where a richer Polonius-style analysis may become necessary |
| R-4 | `match` binding modes on borrowed enums | Rust default binding modes (`match &e { Ok { x, .. } => … }` gives `x: &T`) must be modeled exactly, or R4 and rustc disagree | Emit explicit `ref` patterns rather than relying on default binding modes. Golden-test each shape against rustc |
| R-5 | Checker more permissive than rustc | Any mismatch turns into a P7 failure in CI | NLL-equivalent rules only. Pin rustc. Fuzz small RIR programs through both R4 and rustc |
| R-6 | Toolchain drift | Newer rustc (including Polonius on stable someday) changes acceptance | Pin toolchain in the receipt. Upgrading the pin is a reviewed change that re-runs all goldens |
| R-7 | Datalog engine cost | The fact count grows with node count × live origins | The 4096-node module budget bounds it. Measure in R-b. Fall back to a direct NLL dataflow implementation if `vendor/src/datalog` is too slow |
| R-8 | Native recursion depth | Rust has no fuel. Deep recursion overflows the stack (an abort, not an error triple) | Deep vectors are tagged and skipped for the Rust lane (§5.2). The gap is documented in `backends/rust.md` |

### 4.7 Staged plan

| Stage | Content | Effort (focused engineer-weeks) | Lands in |
|---|---|---|---|
| R-a | Copy-only programs (i64 / bool / nil): R0, R1, `Result`-based overflow, fallibility fixpoint, emitter, Cargo/rustc CI lane, `mithril_rt.rs`. No borrow questions yet | 2–3 | M2 |
| R-b | `String`: R2 mode inference, R3 liveness + move/borrow/clone, clone report, R4 Datalog checker v0 (P1/P2/P3/P5/P6), bounded fallback, rustc gate | 3–5 | M2 (at risk) |
| R-c | Closures: capture modes, escaping vs non-escaping, `&impl Fn` / `Box<dyn Fn>`, R-1 monomorphic policy | 3–5 | **M3 (likely)** |
| R-d | Records, sums, vectors, `match`: field places (R-3), explicit `ref` patterns (R-4), `Rc` switch policy, checker v1 | 4–7 | **M3** |
| R-e | Optional: returned references with single-input elision (R-2) | 3–5 | M3+ / gated by owner |

**Total for borrow-elaboration Rust: about 12–20 focused engineer-weeks
(R-a to R-d)**, against about 3–4 for the move+clone design it replaces. The
range is wide because R-b and R-d each contain one open question (R-7
performance, R-3 precision) that only implementation will settle.

### 4.8 Does Rust slip to M3? Yes, most of it.

Realistically, **M2 can exit with Rust R-a done and R-b done or nearly done**.
That means scalar and string programs compile to idiomatic, borrow-checked Rust
with a clone report. Closures, records, sums and vectors under
borrow-elaboration (R-c, R-d) are M3. Until then, Rust refuses those programs
with `:mithril.transpiler-rust/tier-b` ("not yet"), not with a silent
move+clone fallback. M2 exit criterion for Rust: the R-a + R-b subset
passes the differential suite. Owner decision Q2, 2026-11-27 (§7).

---

## 5. Differential testing and golden files

### 5.1 Lanes, vectors, error triples

**Lanes:** `ir-eval` (reference, CLJC) · `js` (Node, ESM) · `python`
(CPython 3.10+, plus `mypy --strict` on the output) · `rust` (pinned rustc,
offline `cargo test`) · `amu-wasm` (the #179 AOT path. Runs only modules Amu
accepts, meaning scalar-only with no `js-value` guest).

**Shared vectors** live in `test/fixtures/transpiler/vectors/*.edn`. EDN
follows the `digest-baseline.edn` precedent. One file per module:

```clojure
{:module   "test/fixtures/transpiler/src/choose.mith"
 :root-cid "bafyrei…"                 ; Tier B root CID, verified before running
 :cases
 [{:export "choose" :args [true]       :expect {:ok "7"}}       ; i64 as decimal string
  {:export "increment" :args ["9223372036854775807"]
   :expect {:error {:code "mithril/integer-overflow"
                    :def  "bafyrei…"     ; Definition CID of the failing definition
                    :path [ "body" ]}}}  ; node path inside it (TraceId)
  {:export "deep" :args ["100000"] :tags #{:deep} :expect {:ok "…"}}]
 :refusals {:rust   :mithril.transpiler-rust/host-node    ; expected, reviewed
            :python :mithril.transpiler-python/host-node}}
```

- **Error triple** = `(code, Definition CID, node path)`. Message text is not
  compared. The Definition CID makes the triple stable under renames and
  reformatting, unlike line numbers or names.
- **Value comparison.** Each lane prints its result as dag-json. The harness
  decodes it to the Data Model, re-encodes it as DAG-CBOR and compares CIDs. So
  no lane-specific printer can hide a difference (for example `1` vs `1n` vs
  `1.0`).
- **Refusals are expected data.** A lane either runs a case or refuses with
  exactly the code listed in `:refusals`. A new or missing refusal fails the
  run, so coverage cannot shrink silently.
- **Tags.** `:deep` skips lanes without fuel (Rust, Python, Amu-Wasm if its
  fuel model differs), and the skip is counted and printed. Vectors that skip
  every non-reference lane fail the suite.

### 5.2 Harness

`tools/parity/` (transpiler design §7.2) contains one runner per lane that
takes `(root CID, export, args)` and prints the dag-json result or the error
triple. The driver lives in the existing modules runner (`test/run_modules.cljk`),
so `ir-eval`, `js` and the comparison logic run in the current CI job. The
`python`, `rust` and `amu-wasm` lanes are new jobs in `.github/workflows/`
(new workflow `transpiler.yml`) with pinned toolchains, run without the cache
(transpiler design R3).

### 5.3 Golden files

```text
test/golden/transpiler/
  ir/   <name>.dag-json      named Tier B IR (display form) + header: root CID, Definition CIDs
  js/   <name>.mjs  <name>.d.ts
  py/   <name>.py
  rs/   <name>.rs   <name>.clones.edn      clone report is golden too
  rt/   mithril_rt.{mjs,py,rs}
```

- The header carries source sha256, root CID, emitter version and Definition
  CIDs. The runner checks the header first, so a CID change without a text
  change, or the reverse, is flagged (transpiler design §7.1).
- Goldens update only through an explicit script (`--update-goldens`). CI never
  rewrites them.
- The `ir/` golden is dag-json for review readability. The identity check uses
  the DAG-CBOR CID in the header, never the dag-json bytes (D11).

### 5.4 Determinism and property tests

- Identity invariants (§2.3): local rename, definition rename, definition
  reorder, SCC member permutation, key order → identical CIDs.
- Tier A non-regression: #180 fixture CIDs unchanged.
- Emitter determinism: same root CID → byte-identical output across two fresh
  checkouts (macOS + Linux CI).
- Round trip: `decode(bytes) == node`, re-encode reproduces the CID (as in #180),
  and `denormalize(normalize(e)) == e`.
- Generated programs (M2.3, optional for the M2 exit): a bounded random
  generator of well-typed Tier B IR, run through all lanes with a shrinker.
  Every failure is minimized into a new vector file.

---

## 6. Milestone breakdown

Effort is in focused engineer-weeks, with the range stated. Stages within M2
can overlap where noted.

| Stage | Content | Effort | Exit criteria |
|---|---|---|---|
| **M2.0 IR + identity** | Check support for `vector`/`record`/`record-field`/`match`/`dispatch-call`/`foreign-import`/`error`/payload `enum-case`. Tier B IPLD Schema. Lowering to `named-def`/`def`/root. α-normalization. SCC hashing. Definition CID = CIDv1 (P-CID, replacing #173's `sha256:` value). `mithril.ir-eval` covering all nodes. Node semantics in `docs/language/` | 4–6 | (a) all §5.4 identity invariants pass; (b) #180 Tier A CIDs unchanged; (c) digest baseline unchanged; (d) every Tier B corpus module lowers and evaluates, with refusals named; (e) Definition CIDs validated against the vendor DAG-CBOR corpus |
| **M2.1 JS/TS** | `mithril.transpiler-js`, `.d.ts`, `bigint` i64, `mithril_rt.mjs`, goldens | 2–3 (after M2.0 IR shapes freeze) | (a) JS goldens for the corpus; (b) the `js` lane agrees with `ir-eval` on every vector, including error triples; (c) zero silently accepted nodes |
| **M2.2 Python** | `mithril.transpiler-python`, `mithril_rt.py`, `mypy --strict` on output | 2–3 (parallel with M2.1) | as M2.1, plus `mypy --strict` clean; `host-*`/`js-value` refusals listed in vectors |
| **M2.3 Differential harness** | `tools/parity/`, vector format, `transpiler.yml` CI with Python/Rust/Amu-Wasm jobs, error-triple comparison, golden header checks; optional generator | 2–3 (starts with M2.1) | (a) all lanes run in CI without the cache; (b) Amu-Wasm lane runs every scalar-only vector; (c) a deliberately broken emitter is caught (mutation smoke test) |
| **M2.4 Rust R-a + R-b** | §4.7 R-a and R-b | 5–8 | (a) the scalar + string subset passes the differential suite; (b) rustc gate green, with zero `rustc-rejected`; (c) clone reports golden-tested; (d) unsupported IR refuses with `tier-b`, never a silent fallback |
| **M3 (Rust part)** | R-c closures, R-d records/sums/vectors, `Rc` policy, optional R-e | 7–12 | every Tier B corpus module emits Rust or refuses with a reviewed code, and the differential suite passes |

**M2 total: about 15–23 focused engineer-weeks**, of which Rust R-a + R-b is
5–8. If M2 must be shorter, cut M2.4 back to R-a only. Do not weaken the
borrow check.

M2 exit, overall: transpiler design §9 M2 criteria (a)–(c), restated as:
conformance features 004–008 pass; every Tier B corpus module emits to JS and
Python and passes the differential suite with error triples; Rust passes for
the R-a + R-b subset; every unhandled node is a named refusal in every backend.

---

## 7. Owner questions: decisions and what stays open

Jun decided Q2–Q4 on 2026-11-27. Q1 is still open. Where a decision differs
from the text above, the decision wins.

| # | Question | Status | Decision and effect |
|---|---|---|---|
| Q1 | **JS i64 representation.** Use `bigint` with a range check (§3.1, exact) instead of transpiler design §5.1's "refuse unless safe-integer range is provable" (which refuses most arithmetic)? | **Open** | Not decided. §3.1 and M2.1 keep `bigint` as the working assumption. If Q1 is decided otherwise, the M2.1 emitter and its JS goldens change. |
| Q2 | **Rust M2 exit scope.** | **Decided 2026-11-27** | Rust in M2 covers the **scalar + string** subset (§4.7 R-a and R-b, M2.4). Everything else moves to **M3**: closures (R-c), records / sums / vectors / `match` (R-d) and the optional R-e. In M2 those programs refuse with `:mithril.transpiler-rust/tier-b`, never with a silent fallback (§4.8). |
| Q3 | **Runtime error identity.** | **Decided 2026-11-27** | A runtime error is identified by the triple **(code, Definition CID, node path)**, not by source spans. Triples survive reformatting and renames. The differential suite compares these triples (§5.1). |
| Q4 | **Checker extensions.** | **Decided 2026-11-27** | Check support for records, vectors, `match` and `dispatch-call` belongs to **M2.0** (§6), not to a separate language milestone. Emitters depend on it. |

## Appendix: traceability

| Section | Source |
|---|---|
| §1.1, §2.1 Tier A shapes | PR #180 `src/mithril/transpiler_ipld.cljk`, `transpiler_rust.cljk` |
| §1.2, §2.4 Definition CID | PR #173 `definition-cid`, `pair-definition-cids`; v0.6 §3.4, §4 |
| §2.2 nodes | transpiler design §4.2–4.3, `form.cljk` `host-*` table, `module.cljk` checked ops |
| §3 | transpiler design §5.1, §5.3, §5.5 |
| §4 | D9; replaces transpiler design §5.2 |
| §5 | transpiler design §7.1–7.2; v0.6 §6 (L2) |
| §6 | transpiler design §9 M2; v0.6 §7 |
