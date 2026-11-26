# Canonical S-form

Status: normative v1 draft · 2026-11-26 · decisions **D1** (S-form only is
normative; EDN-style forms are input sugar), with consequences for D3 and D11.

## 1. Scope

This document defines:

- the **canonical S-form**: the term language that equality, digests, CIDs and
  proofs are defined over;
- the **input sugar**: EDN-style `{…}`, `#{…}` and `:ns/kw`, and the
  deterministic desugaring of each to canonical S-form;
- the **term order** used wherever the spec says "sorted".

It does not redefine the token layer of the reader (integers, strings, escapes,
comments, refusals by name). That stays with the reader specification in
`site/lang.mithril.fund/grammar.ebnf` and the S-form spec background report. This document starts
from read tokens.

## 2. Canonical term algebra

### 2.1 Terms

A canonical S-form term is exactly one of:

| Kind | Printed form | Notes |
|---|---|---|
| list | `( t1 … tn )`, n ≥ 0 | The only compound kind. |
| symbol | `name` | Reader symbol rules. `nil`, `true` and `false` are not symbols. |
| IRI | `(iri "https://…")` | An atom. The printed form looks like a list, but it reads to the IRI atom. The head `iri` is reserved. The string MUST be an absolute IRI (RFC 3987). |
| string | `"…"` | Unicode scalar values. Encoded as UTF-8. |
| integer | `-12`, `0`, `42` | Exact, range [−2^63, 2^63−1]. |
| boolean | `true`, `false` | |
| nil | `nil` | |

Canonical S-form MUST NOT contain:

- vectors, maps, sets or keywords: these are sugar (§3);
- floating-point values. A data-profile reader refuses float tokens. In the
  code profile, an f64 literal is the list `(f64-from-bits N)`, where N is an
  integer;
- metadata, reader conditionals, discard forms, or anything else resolved by
  the reader;
- source positions or trivia.

### 2.2 Equality is syntactic (free term algebra)

Two canonical terms are **equal** if and only if they are the same term: the
same kind, the same atom value, and lists of equal length with equal elements in
order. No other equations hold. In particular:

- there is no commutativity, idempotence or associativity at the term level.
  Set-like and map-like data reach the term level already ordered and
  deduplicated (§3), so syntactic equality is the intended equality;
- `1` and `(lit "1" (iri "…#integer"))` are different terms. The data profile
  desugars one into the other (see rdf-owl-shacl-sform.md §3), which happens
  before equality is asked.

Digest, CID, receipt and proof obligations MUST be stated over canonical terms.
They MUST NOT be stated over source text, sugar, or a host-language value.

### 2.3 Term order

Wherever this specification says **sorted**, the order is:

> `a < b` if and only if `enc(a)` is lexicographically smaller than `enc(b)` as
> unsigned bytes, where `enc` is the DAG-CBOR encoding of the term
> (ipld-identity.md §3).

This is a strict total order on canonical terms, because `enc` is injective. It
needs no per-kind comparison table, and it is the same in every host. Two terms
are **duplicates** if and only if their encodings are byte-equal.

There is one exception. The quads of a `(dataset …)` term are ordered by
their RDFC-1.0 canonical N-Quads lines instead. This keeps the existing
graph digest a function of the canonical term (rdf-owl-shacl-sform.md §2.2).

## 3. Input sugar and desugaring

The reader MAY accept the forms below. Each one MUST be desugared before Check
and before any identity is computed. Desugaring MUST be deterministic and total
on accepted input. An input that cannot be desugared MUST be refused by name
(§3.5). It MUST NOT be repaired.

### 3.1 Vectors

`[t1 … tn]` desugars to `(vec t1' … tn')`, where each `ti'` is `ti` desugared.
Order is kept. (Data-profile tagged forms keep their existing field meaning: a
vector-valued field becomes the `vec` list.)

### 3.2 Maps

`{k1 v1 … kn vn}` desugars to

```
(map (k1' v1') … (kn' vn'))
```

with the pairs sorted by key term (§2.3).

- The pair count MUST be even. An odd count is refused: `:mithril.sform/map-arity`.
- Keys MUST be unique after desugaring. A duplicate key is refused:
  `:mithril.sform/duplicate-key`. Last-one-wins MUST NOT be applied.
- Keys and values are desugared recursively before sorting.

### 3.3 Sets

`#{e1 … en}` desugars to

```
(set e1' … em')
```

with the elements desugared, sorted (§2.3) and deduplicated (m ≤ n).
Duplicates are removed silently. A set has no multiplicity, so this is
normalization, not repair.

### 3.4 Keywords

A keyword desugars to an IRI atom.

| Input | Canonical | Rule |
|---|---|---|
| `:p/local` | `(iri "<expand(p)>local")` | `p` MUST be a prefix declared in the file's prefix table, or a built-in prefix (§3.4.1). |
| `:local` | `(iri "<base>local")` | `base` is the file's declared base IRI. The default is `https://mithril.fund/ns/v1#`. |

After desugaring, the keyword's spelling is gone. `:xsd/integer` and
`(iri "http://www.w3.org/2001/XMLSchema#integer")` are the same canonical term.

**Data-profile field names.** Data-profile field names (`:name`, `:datatype`,
…) are tag-local field selectors. The tag's contract resolves them through its
closed key table to the IRIs used in the projected RDF. Since this already
happens in the JSON-LD projection, it does not change any graph digest.

#### 3.4.1 Built-in prefixes

| Prefix | Expansion |
|---|---|
| `rdf` | `http://www.w3.org/1999/02/22-rdf-syntax-ns#` |
| `rdfs` | `http://www.w3.org/2000/01/rdf-schema#` |
| `xsd` | `http://www.w3.org/2001/XMLSchema#` |
| `owl` | `http://www.w3.org/2002/07/owl#` |
| `sh` | `http://www.w3.org/ns/shacl#` |
| `mith` | `https://mithril.fund/ns/v1#` |

A file MUST NOT redefine a built-in prefix (`:mithril.sform/prefix-redefined`).

### 3.5 Refusals

| Code | When |
|---|---|
| `:mithril.sform/map-arity` | The map literal has an odd number of forms. |
| `:mithril.sform/duplicate-key` | Two map keys are equal after desugaring. |
| `:mithril.sform/unknown-prefix` | The keyword's prefix is neither declared nor built in. |
| `:mithril.sform/prefix-redefined` | The file declares a built-in prefix. |
| `:mithril.sform/not-absolute-iri` | An IRI atom's string is not an absolute IRI. |
| `:mithril.sform/reserved-head` | Source uses `iri` as a list head with anything other than one string. |

Profile limits on the sugar (for example, whether the data profile admits
`{}` and `#{}` at all, and the item caps) are reader-profile rules. They are
outside this document. This document fixes only what the sugar means once it is
admitted.

## 4. Examples

| Input | Canonical S-form |
|---|---|
| `#{3 1 2 1}` | `(set 1 2 3)` |
| `{:b 2 :a 1}` | `(map ((iri "https://mithril.fund/ns/v1#a") 1) ((iri "https://mithril.fund/ns/v1#b") 2))` |
| `[:xsd/string "x"]` | `(vec (iri "http://www.w3.org/2001/XMLSchema#string") "x")` |
| `{"k" 1 "k" 2}` | refused, `:mithril.sform/duplicate-key` |

In the second row, `#a` sorts before `#b` because the two encodings are equal
up to the last byte. The CBOR header carries the length, so among strings a
shorter one sorts before a longer one: `"zz"` < `"aaa"`. This is deliberate.
The order is "by encoding", not "alphabetical".

## 5. Rationale: S-form only versus S-form + EDN

| Aspect | S-form only (adopted as normative) | S-form + EDN as normative |
|---|---|---|
| Algebra | Free term algebra. Equality is syntactic identity. | A quotient by commutativity and idempotence. Terms must be normalized before they can be compared. |
| Sets | Need a canonical order rule (§2.3). | Written directly as `#{}`. |
| Literals | Explicit: `(lit "1" (iri xsd:integer))`. | EDN numbers and xsd datatypes drift apart: there is no lexical form, and floats appear. |
| Normal form and identity | One spelling per term, so identity is simple. | Many spellings per value, so more rules. |
| Grammar and verification | Small, and injectivity proofs are short. | Open-world `#tag` conflicts with the closed-world reader. |
| Ergonomics | Verbose. | Pleasant. This is why EDN forms are kept as sugar. |
| Kir alignment | It is the kir core. | Kir also treats map and set literals as sugar it desugars. |

Making EDN forms sugar keeps the ergonomic gain without its cost. Equality,
ordering and identity are defined once, on the free algebra. The sugar is a
total function into it.

## 6. Implementation status (2026-11-26)

| Spec rule | Code today | Gap |
|---|---|---|
| Canonical S-form has no vectors (§3.1) | `mithril.form/parse` returns host vectors. Data-profile tagged forms are host lists. | The `vec` head is not materialized. Identity today goes through the RDF projection (data) or the checked IR (code), so this does not move any existing digest. |
| Maps and sets desugar to sorted `(map …)` and `(set …)` (§3.2–3.3) | The data profile refuses `{}` and `#{}`. #173 (open) `canonical-value` sorts map keys, and sorts sets by `pr-str`. | `pr-str` order is not §2.3 order. P-CID (ipld-identity.md §8) must switch to encoding order. |
| Keywords desugar to IRIs (§3.4) | Field keywords resolve through the compiler key table (`compiler.cljk`) into the JSON-LD projection. Keyword values are refused in the data profile. | A general keyword→IRI desugar for the code profile is not implemented. |
| Term order is DAG-CBOR byte order (§2.3) | `rdf_form.cljk` sorts by `pr-str` for display. | Display-only, so no identity impact. |
| Duplicate map key is refused | Not reachable today: there are no map literals. | — |

## 7. Open points

1. Whether code-profile keyword *values* used as enum tags or capability names
   should also become IRIs (this draft says yes), or stay a separate atom kind.
   Choosing a separate kind would add one row to ipld-identity.md §3.
2. The syntax of the prefix declaration (`(prefix p "…")` header form versus a
   field of `(ns …)`). This waits for the code-profile `ns` form.
3. The sugar caps (kir: set ≤ 32 items, map ≤ 128 keyword or 31 i64/string
   entries) are inherited as reader-profile limits. Whether the data profile
   adopts them is not decided.
