# Mithril language specification (normative v1 draft)

Status: normative v1 draft, 2026-11-26. Implements owner decisions D1–D11
(2026-11-25). The documents below are the normative text for those decisions.
Where code in this repository differs from them, each document lists the gap
in an **Implementation status** section. Code is not changed to match the spec
in the same pull request.

The key words MUST, MUST NOT, SHOULD, SHOULD NOT and MAY are to be read as in
RFC 2119 and RFC 8174, and only when they appear in capitals.

| Document | Subject | Decisions |
|---|---|---|
| [sform-canonical.md](sform-canonical.md) | Canonical S-form, the EDN-style input sugar and how it desugars, term equality | D1 |
| [rdf-owl-shacl-sform.md](rdf-owl-shacl-sform.md) | RDF datasets, literals, OWL 2, SHACL Core and SPARQL algebra written as S-form | D1, D2 |
| [ipld-identity.md](ipld-identity.md) | Two-stage canonicalization, DAG-CBOR, CIDv1, Merkle DAG rules, the evaluation boundary | D3, D4, D11 |
| [targets.md](targets.md) | Tier A (data) and Tier B (program) outputs, the Amu path, the IR contract | D6, D7, D8, D9, D10, D11 |
| [verification.md](verification.md) | Verification layers L0–L4, and which checks SMT covers versus a DL reasoner, SHACL or a proof assistant | D5 |

## Decisions (2026-11-25)

| # | Decision |
|---|---|
| D1 | Only S-form is normative. EDN-style `{}`, `#{}` and `:ns/kw` are input sugar that desugars deterministically to canonical S-form. |
| D2 | RDF is written as a canonical list of `(quad s p o g)` with RDFC-1.0 blank node labels. OWL follows Functional-Style Syntax. SHACL and SPARQL are written as algebra S-forms. |
| D3 | Identity is computed in three steps: semantic canonicalization, then DAG-CBOR bytes, then CIDv1. The data tier keeps its graph-digest next to the new CID. In the code tier, the Definition CID becomes a real CIDv1. |
| D4 | Evaluation runs on type-checked IR. DAG-CBOR is used for identity, storage and transfer. |
| D5 | Formal verification centres on SMT, plus a DL reasoner and SHACL. The trusted base stays small, and Lean is added when needed. |
| D6 | The HTML emitter ships in M1, together with JS. |
| D7 | Each target language gets readable source only. There are no Wasm-plus-binding packages. Wasm stays as an output of the Amu path. |
| D8 | Tier A (data) is M1. Tier B (program) is M2. |
| D9 | The Rust backend uses borrow-elaboration with real borrow checking. |
| D10 | The work extends mithril-lang/mithril. No new repository is created. |
| D11 | The IR is defined over the IPLD Data Model, its canonical bytes are DAG-CBOR, and JSON is only a dag-json view. |

## Relation to other documents

- `docs/language/README.md` and `site/lang.mithril.fund/grammar.ebnf` describe
  the current data-profile reader. They will link to this directory once the
  open pull request that edits them (#173) has merged. If those files and this
  directory disagree on what is normative, this directory wins. Their text is
  then treated as describing the implementation.
- `spec/v0.1/` is the Mithril Dataset format specification. It is separate and
  is not changed by this directory.
- Token layer authority: `mithril-sform-spec-20261123.md` §2.2 (Organizer
  report) is the table of record for reader tokens (integer, string, symbol,
  keyword, float, comment) and their named refusals. `grammar.ebnf` cites it
  instead of restating it, so there is one token table and no drift.
- Background (design inputs, not normative): `mithril-sform-spec-20261123.md`
  outside §2.2, `mithril-transpiler-design-20261123.md`, and the design note
  v0.6 (2026-11-25).

## Versioning

This is draft `mithril.spec/v1-draft`. A change that alters the canonical
S-form, the IPLD encoding or the CID of an existing input MUST bump the
version and MUST state which identities move. Editorial changes do not need
a bump.
