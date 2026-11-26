# IPLD identity: canonicalization, DAG-CBOR and CIDv1

Status: normative v1 draft · 2026-11-26 · decisions **D3** (identity = semantic
canonicalization → DAG-CBOR → CIDv1; the data tier keeps graph-digest next to the CID;
the code-tier Definition CID becomes a real CIDv1), **D4** (evaluation runs on
checked IR; DAG-CBOR is for identity, storage and transfer), **D11** (IR = IPLD
Data Model, bytes = DAG-CBOR, JSON = dag-json view only).

## 1. Pipeline

```
source ─► reader ─► desugar ─► Check ─► semantic canonicalization ─► IPLD Data Model ─► DAG-CBOR bytes ─► CIDv1
                                         (stage 1, §2)                (§3)               (stage 2, §4)
```

An identity is valid only if both stages ran. A hash over source bytes, over
host-language printing (`pr-str`), over JSON text, or over a non-canonical
encoding MUST NOT be presented as a Mithril CID.

## 2. Stage 1: semantic canonicalization

Stage 1 maps every input that means the same thing to one canonical term. What
"the same" means depends on the tier:

| Tier | Equivalence removed | Procedure |
|---|---|---|
| All | Sugar spellings | Desugar (sform-canonical.md §3): maps → sorted `(map …)`, sets → sorted and deduplicated `(set …)`, keywords → IRIs, vectors → `(vec …)`. |
| Data | Blank node renaming and quad order | RDFC-1.0, then N-Quads line order (rdf-owl-shacl-sform.md §2.2). OWL and SHACL terms are canonicalized as in that document. |
| Code | Renaming of bound variables | α-normalization (§2.1). |

### 2.1 α-normalization of code

For a checked definition:

1. Local binders (parameters, `let` names, lambda parameters) are renamed to
   positional indices in binding order: the first binder introduced in a
   pre-order walk is `0`, the next `1`, and so on. A reference to a local becomes
   `(local i)`.
2. A reference to another top-level definition is replaced by a **link** to
   that definition's CID (§6). An exception applies inside a strongly connected
   component (§6.2).
3. The definition's own name and the names of its locals are **not** part of
   the identity block. They are kept in a separate names block (§6.3).
4. Types, literal values, intrinsic names, host-import names and capability
   IRIs are kept as is. They have meaning.

Two definitions that differ only in local names, whitespace, sugar or key order
MUST get the same Definition CID. Two definitions that differ in any type,
literal, operation or callee MUST get different CIDs.

## 3. Canonical S-form → IPLD Data Model (fixed encoding)

This table is the **one** encoding. Implementations MUST NOT use another one.

| S-form term | IPLD Data Model | Example (dag-json view) |
|---|---|---|
| list | list | `[…]` |
| string | string | `"abc"` |
| integer, i64 | int | `-9223372036854775808` |
| `true` / `false` | bool | `true` |
| `nil` | null | `null` |
| symbol | map with one key `"sym"` | `{"sym":"filter"}` |
| IRI atom, including every keyword after desugaring | map with one key `"iri"` | `{"iri":"https://mithril.fund/ns/v1#a"}` |
| set sugar | list `[{"sym":"set"}, e…]`, elements sorted and deduplicated | `[{"sym":"set"},1,2,3]` |
| map sugar | list `[{"sym":"map"}, [k,v]…]`, pairs sorted by key | `[{"sym":"map"},[{"iri":"…#a"},1]]` |
| reference to another block | link (CID, tag 42) | `{"/":"bafyrei…"}` |

Rules:

- In the S-form term encoding, IPLD maps appear **only** as the one-key
  `sym` and `iri` atoms. Any other map in a term-encoded block is invalid
  (`:mithril.ipld/invalid-term`). Typed IR nodes (§7) are records, so they use
  maps. They are a separate, schema-typed layer.
- The IPLD **float** and **bytes** kinds MUST NOT appear in v1 Mithril blocks.
  The code-profile f64 literal is the list `[{"sym":"f64-from-bits"}, n]`.
- Keywords do not have their own kind. A keyword is an IRI after desugaring.
- The `"iri"` value MUST be an absolute IRI string. The `"sym"` value MUST
  satisfy the reader's symbol rules.

## 4. Stage 2: DAG-CBOR bytes and CIDv1

### 4.1 DAG-CBOR

A block MUST be encoded under the DAG-CBOR strictness rules:

- every length is definite; indefinite-length items MUST NOT be used;
- integers use the shortest encoding (major types 0 and 1);
- map keys are strings, unique, and sorted by length first, then by bytes
  (the DAG-CBOR / RFC 7049 §3.9 order);
- the only tag is 42 (CID link), and its byte string starts with `0x00`;
- `undefined`, simple values other than `true`, `false` and `null`, and
  non-finite floats MUST NOT be used. Section 3 already excludes floats.

A decoder MUST refuse non-canonical bytes. For any accepted block `b`,
`encode(decode(b)) = b` MUST hold.

### 4.2 CIDv1

```
CID = CIDv1( codec = dag-cbor 0x71, multihash = sha2-256 0x12 (32-byte digest) )
```

The string form is multibase base32 lower (`b…`), so a CID string starts with
`bafyrei`. Emitted artifacts that are not DAG-CBOR (generated source files,
HTML) are identified as `CIDv1(raw 0x55, sha2-256)` over their exact bytes.

## 5. Data tier: dataset CID next to graph-digest

For a dataset `D` (rdf-owl-shacl-sform.md §2):

| Field | Value | Status |
|---|---|---|
| `graph-digest` | `"sha256:" ++ hex(SHA-256(canonical N-Quads))` | Existing. MUST be kept and MUST NOT change. |
| `dataset-cid` | CIDv1 over the DAG-CBOR encoding of the canonical `(dataset …)` term | New. |

- Both MUST be computed from one RDFC-1.0 run.
- `dataset-cid` MUST NOT replace `graph-digest` in any existing field,
  baseline or import check. Library imports keep `"digest": "sha256:…"`.
- Receipts MUST carry both values as a pair (verification.md §6).

## 6. Code tier: Merkle DAG rules

### 6.1 Definition CID

A Definition CID is the CIDv1 (§4.2) of the α-normalized (§2.1) checked IR of
one definition, encoded per §3 and §7. It replaces today's
`sha256:`-over-printed-projection value.

### 6.2 No cycles. Recursion is hashed per SCC

A Merkle DAG cannot contain a cycle, because a block cannot contain its own
hash. Therefore:

1. Compute the strongly connected components (SCCs) of the definition call
   graph.
2. **Singleton SCC without a self-reference.** The definition is one block.
   Calls to other SCCs are links.
3. **Self-recursive definition.** A self-call is written `(self)` in place of a
   link.
4. **Mutual recursion (SCC of size > 1).** The SCC is hashed as **one block**:
   `[{"sym":"scc"}, m0, m1, …]`. A call to a member of the same SCC is written
   `(scc-ref i)`, where `i` is the member's position. To order the members,
   take each member's encoding with every `(scc-ref …)` replaced by
   `(scc-ref)`, then sort those encodings (sform-canonical.md §2.3). From
   outside, a member is referred to as `[{"sym":"member"}, link(scc-cid), i]`.
5. **Ties.** If two members have equal encodings under step 4, they are
   ordered by their source names, and the tie is recorded in the receipt
   (open point 2).

The resulting graph of blocks is acyclic by construction.

### 6.3 Names are not identity

A **names block** maps human names to CIDs:
`[{"sym":"names"}, ["increment", link(cid)], …]`, sorted by name. A module's
public surface is its names block plus its export list. Renaming a definition
changes the names block, not the Definition CID.

### 6.4 Data: cyclic RDF graphs are one block

RDF graphs may be cyclic (`a knows b`, `b knows a`). Nodes MUST NOT be turned
into blocks that link to each other. A dataset is stored as **one quad-list
block**: the canonical `(dataset …)` term. Splitting large datasets into
several blocks is open point 3.

## 7. IR is defined over the IPLD Data Model (D11)

- The program IR (`mithril.ir/v1`) is specified as an IPLD Schema. Nodes are
  records (maps with string keys). Kinds are named by an `"op"` string. Types
  are encoded as in the M1 implementation: scalar type names as strings
  (`"i64"`, `"bool"`, `"string"`, `"js-value"`), and function types as
  `{"fn": [[param…], return]}`.
- Symbol and IRI values inside IR nodes use the §3 atoms. Integer literals use
  IPLD int (§3). Decimal strings are not used for integers.
- **JSON is never identity.** dag-json is the only JSON view, and it is for
  display and diffs. A CID computed over dag-json bytes (codec 0x0129) MUST NOT
  stand where a DAG-CBOR CID is expected.

## 8. Evaluation boundary (D4)

1. The interpreter and all emitters run on **decoded, checked IR**. They MUST
   NOT run on DAG-CBOR bytes or on dag-json text.
2. A block loaded by CID MUST be verified: the hash of its bytes equals the
   CID. Then it is decoded with the §4.1 strictness rules. A block that did not
   come from this compiler's own checked output MUST pass Check again before it
   is evaluated or emitted.
3. Blocks MAY be loaded lazily, by following links on demand. Evaluation results
   MUST NOT depend on load order.
4. DAG-CBOR is for identity, storage (CAR files, block stores) and transfer.

## 9. Examples

### 9.1 α-equivalence

`(fn [x] (add x 1))` and `(fn [y] (add y 1))` both canonicalize to the block
below (dag-json view, simplified):

```json
{"op":"lambda","params":[{"type":"i64"}],"returns":"i64",
 "body":{"op":"call","name":"add","type":"i64",
         "args":[{"op":"local","index":0,"type":"i64"},
                 {"op":"literal","type":"i64","value":1}]}}
```

Both get the same CID.

### 9.2 Mutual recursion

`even?` calls `odd?` and `odd?` calls `even?`. They form one SCC block
`[{"sym":"scc"}, mA, mB]`, where `mA` and `mB` reach each other through
`(scc-ref 1)` and `(scc-ref 0)`. A caller of `even?` holds
`[{"sym":"member"}, link(scc-cid), i]`, where `i` is `even?`'s position after
the step-4 sort.

## 10. Implementation status (2026-11-26)

| Spec rule | Code today | Gap |
|---|---|---|
| DAG-CBOR + CIDv1 codec (§4) | `vendor/src/ipld/core.cljc` (`node->block`, strict `decode`, tag 42 only, string keys) and `multiformats.core`, used by `checkpoint_ipld.cljk`, `reason_ipld.cljk` and `mithril.ipld-identity`. The vendored CBOR codec carries a local change so a `js/BigInt` encodes and decodes exactly (vendor/PROVENANCE.md, "Local modifications"). | Matches. The vendor data model admits floats; `ipld-identity/term->ipld` and `check-term!` refuse them (§3). |
| Symbol and IRI atoms (§3) | `mithril.ipld-identity/term->ipld`: symbol → `{"sym"}`, `(iri "…")` and keywords (sform-canonical.md §3.4, built-in and declared prefixes, default base) → `{"iri"}`, vectors → `vec` lists, sets → sorted (§2.3 encoding order) deduplicated `set` lists, maps → sorted `map` pair lists with duplicate keys refused. `check-term!` refuses any other map in a decoded term block. | No reader path produces S-form terms for identity yet: the code tier hashes typed IR records (§7) and the data tier hashes the quad list below. |
| Data tier `graph-digest` and `dataset-cid` (§5) | `ipld-identity/dataset-identity` runs RDFC-1.0 once and returns both. `compiler/graph-identity` exposes the pair for a source document. `compiler/graph-digest` is unchanged, and the test suite checks every `test/fixtures/digest-baseline.edn` entry against the pair's digest. | Artifacts and receipts do not carry `dataset-cid` yet: bootstrap artifacts must equal the `.mith` kernel pipeline output, whose `canonicalize-rdf` stage declares only `graph-digest`, so adding it is a kernel change. A literal without a datatype is written `(lit v (iri xsd:string))`, as RDF 1.1 defines it. |
| Definition CID is a CIDv1 (§6.1) | `module/check-document` `:definition-cids` = `[{:name … :cid "bafyrei…"}]`, computed by `ipld-identity/definition-cid` over `definition-node`: the checked IR of one definition as a `lambda` record (§7), α-normalized (§2.1). The definition's own name and all local names are absent. Locals are `{"op":"local","index":i}` with indices in pre-order (parameters first; a `let` binder after its value; lambda parameters on entry). Integer literals are IPLD int, exact over the whole i64 range. A self-call is `[{"sym":"self"}]` (§6.2 step 3). `VariantMatch` cases are sorted by case name before the walk, because they form a map. | Calls to other definitions are the callee's `{"sym"}` atom, not a link to its CID, and there is no SCC hashing (§2.1 step 2, §6.2 steps 2 and 4) and no names block (§6.3). Choices this spec does not fix yet and the code makes: sum types are `{"sum":[name,[case…]]}` with cases in declared order; intrinsic calls keep `"op":"intrinsic"` with a `"name"` string. |
| Program IR over IPLD (§7) | #180 (open) `mithril.transpiler-ipld`: whole checked module → **one** DAG-CBOR block, `format "mithril.transpiler-ipld/ir-v1"`, CIDv1 dag-cbor sha2-256, dag-json for display only. | Matches D11 for the codec and the display rule. It differs in three ways: i64 literals are **decimal strings**, not IPLD int; local and function names are in the identity block (no α-normalization, no names block); there are no per-definition blocks, links or SCCs. |
| Evaluation on checked IR (§8) | There is no IR evaluator yet (M1). Checkpoint and reason blocks are decoded before use. | — |

**P-CID.** The first step has landed: the Definition CID is a CIDv1 over
α-normalized DAG-CBOR, the §3 atoms are fixed, and the dataset CID sits next
to an unchanged `graph-digest`. `test/mithril/ipld_identity_test.cljc` checks
key-order, whitespace and α-renaming invariance, round trips through the
vendored verifying decoder, the vendor DAG-CBOR corpus, and the digest
baseline. Still open: callee links with SCC hashing and the names block.

## 11. Open points

1. Integer literals as IPLD int (§3, §7) versus #180's decimal strings. The
   spec chooses int, because DAG-CBOR holds the full i64 range exactly. The
   decimal string was a workaround for JS `Number` in the host. Moving #180 to
   int changes its CIDs. #180 is unmerged, so no published CID would move.
2. SCC member ties (§6.2, step 5): accept name order, or refuse.
3. A block-size limit and chunking for large datasets (a single block above
   1 MiB is a transfer hazard). A prolly-tree split is a candidate for v2.
4. Whether type names should become IRIs (`mith:i64`) or stay short strings.
   This draft keeps the strings, to match #180.
