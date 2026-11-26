# Output targets

Status: normative v1 draft · 2026-11-26 · decisions **D6** (HTML emitter in
M1), **D7** (readable per-language source only; no Wasm + bindings), **D8**
(Tier A data = M1, Tier B program = M2), **D9** (Rust uses borrow-elaboration),
**D10** (extend mithril-lang/mithril), **D11** (IR = IPLD Data Model, bytes =
DAG-CBOR, JSON = dag-json view).

## 1. Overview

```
.mith (data / code profile) · JSON-LD
  │ reader → desugar → canonical S-form            (sform-canonical.md)
  ▼
Check (types, imports, arity, features)
  ├─ Tier A (data):    canonical RDF dataset ──► HTML+CSS · Markdown · JSON-LD/Turtle ·
  │                                              JSON Schema/OpenAPI · type definitions · route tables
  └─ Tier B (program): checked IR (α-normalized) ──► JS/TS ESM (M1 attachments, M2 full) · Python (M2) · Rust (M2/M3)
                                                 └► Amu HIR ──► Wasm · x86-64 · AArch64 (existing)
  ▼
Identity: DAG-CBOR → CIDv1 (+ graph-digest for data) → receipt  (ipld-identity.md, verification.md)
```

D6 puts the HTML emitter in M1, together with JS. D8 puts Tier B in M2. These
two decisions are reconciled in §3.3: in M1, the JS output is the
**behaviour attachment** that Tier A pages reference. The full Tier B JS
backend is M2.

## 2. The IR contract (all targets)

1. The IR is defined over the **IPLD Data Model** (ipld-identity.md §7). Its
   canonical bytes are **DAG-CBOR**. The IR's identity is the CIDv1 of those
   bytes.
2. JSON appears only as the **dag-json view** of an IR block, for display,
   logs and diffs. An emitter MUST NOT read dag-json as its input contract. It
   reads the decoded IR.
3. Emitters are **pure functions** of (IR CID, emitter version, target
   options). The same inputs MUST give byte-identical output on any machine.
   Output MUST NOT contain timestamps, absolute paths or random values.
4. Emitters MUST NOT infer types. Every type an emitter needs is in the
   checked IR. If an emitter cannot honour a type or node, it MUST refuse
   with `:mithril/backend/<reason>`. It MUST NOT approximate.
5. Every emitted file is identified as `CIDv1(raw, sha2-256)` and recorded in
   the receipt next to the IR CID (verification.md §6).

## 3. Tier A: data (M1)

### 3.1 Inputs

Tier A takes a canonical RDF dataset, with its `graph-digest` and
`dataset-cid`, of an admitted data-profile document: ontology, web
application, library, page or form definitions.

### 3.2 Outputs

| Output | From | Rules |
|---|---|---|
| HTML + CSS | Ontology page, form and section terms | Static and readable. Every element that comes from a node SHOULD carry its IRI in a `data-mith-iri` attribute, so that the round trip in verification.md §4 works. |
| Forms with client-side validation | SHACL shapes | Client checks are generated from the **same** shapes graph (same `dataset-cid`) that the server validates against. The client MUST NOT add constraints that are not in the shapes. |
| Markdown | Document and page terms | Readable text. Not an identity. |
| JSON-LD / Turtle | The dataset | Serializations of the same canonical dataset. Re-reading them MUST reproduce `graph-digest`. |
| JSON Schema / OpenAPI | Records, SHACL shapes, route declarations | Derived. The schema `$id` SHOULD be the IRI of the source shape. |
| Type definitions (`.d.ts`, Python stubs) | Records and shapes | Declarations only. No behaviour. |
| Route table | Web-application route terms | A declarative mapping from route to page or handler. Handlers are referenced by Definition CID. |

### 3.3 Behaviour

A Tier A page MUST NOT inline program logic. Behaviour is attached by
reference: a page names a Tier B definition by CID, and the emitter links the
emitted JS (or Amu-path Wasm) module for that CID. In M1, the only behaviour
attachments available are JS modules emitted from checked modules.

## 4. Tier B: program (M2)

### 4.1 Inputs

Tier B takes checked, α-normalized IR (ipld-identity.md §2.1) of code-profile
definitions and `mithril/module` documents.

### 4.2 Readable per-language source (D7)

| Target | Output | Rules |
|---|---|---|
| JS/TS | ES modules (`.mjs`, plus `.d.ts` or `.ts`) | No CommonJS. `i64` follows the existing safe-integer rule (refuse `:mithril/backend/js-unsafe-int`) until a BigInt lowering is specified. Host imports come only from the declared import list. |
| Python | Python ≥ 3.10 package, type-annotated | IR `Error` nodes become named exception classes. Unimported host calls are refused. |
| Rust | Crate source | **Borrow-elaboration (D9).** The emitter elaborates ownership and borrows and MUST check them itself. A program it cannot elaborate is refused with a span (`:mithril/backend/borrow`). It MUST NOT fall back to clone-everything. Emitted code MUST also pass `rustc`'s borrow checker, which is a second, independent check. `js-value` in a Rust target is refused. This may slip to M3. |

Emitted source MUST be readable: it uses names from the names block
(ipld-identity.md §6.3), has a module structure that mirrors the source
modules, and contains no minification.

### 4.3 No Wasm bindings (D7)

The project MUST NOT ship "compile to Wasm, then generate JS, Python or Rust
bindings to it" as a target. Each language gets its own readable source.

### 4.4 Amu path

The existing path through Amu HIR to Wasm, x86-64 and AArch64 stays. It is
**the** way to get Wasm and native code. The Amu guest refuses `js-value`
fail-closed. Amu output is identified and receipted the same way as other
outputs (§2.5).

## 5. Placement (D10)

All emitters live in this repository under `src/mithril/`. No new repository is
created for targets.

## 6. Comparison with PR #180 ("M1 Tier A")

PR #180 (open, head `com-junkawasaki/feat-transpiler-m1-tier`) adds
`mithril.transpiler-ipld` and a `mithril.transpiler-rust` stub. Reviewed
against this document:

| Topic | PR #180 | This spec | Difference |
|---|---|---|---|
| What "Tier A" means | Checked **program modules** (`mithril/module` functions) lowered to an IPLD IR node | Tier A means **data** outputs (HTML, JSON-LD, schemas, …) from the RDF dataset. Checked modules are Tier B inputs. | **Naming differs.** #180 implements the shared IR foundation (D11): checked IR → IPLD → DAG-CBOR → CIDv1. Under this spec that is the Tier B IR layer, built early. #180 adds no Tier A data emitter (HTML and the others). |
| Codec and identity | `ipld.core/node->block`: CIDv1, dag-cbor 0x71, sha2-256. A decode round trip is tested. | Same (ipld-identity.md §4) | Matches. |
| JSON | `display-string` = dag-json, documented as never identity | Same (§2.2) | Matches. |
| i64 literals | Decimal strings | IPLD int (ipld-identity.md §3, §7) | Differs. Open point 1 in ipld-identity.md. |
| Type encoding | `"i64"` / `"bool"` / `"string"` / `"js-value"`, and `{"fn": [[params] ret]}` | Adopted as is (ipld-identity.md §7) | Matches. |
| Format tag | `"format": "mithril.transpiler-ipld/ir-v1"` | `mithril.ir/v1` | The names need to converge before M1 closes. |
| Granularity | One block per module. Names (function names and locals) are in the block. `call-graph` is keyed by name. | One block per definition, or per SCC. α-normalized. Names in a names block. Callees are links. | Differs: no α-normalization, no Merkle links. A later change (P-CID) can be layered on without changing the node vocabulary. |
| Rust | Stub: `lower` throws `:mithril.transpiler-rust/tier-b`. No fallback. | D9 borrow-elaboration in M2. A refusal before then is correct. | Consistent. The code name differs from `:mithril/backend/…`. |
| `js-value` | Kept in types | Allowed for the JS target; refused for Rust and the Amu guest | Consistent: per-target refusal happens at emit time, not at IR time. |

Summary: #180 complies with D11 for its codec and display rules. It differs
from this spec in the meaning of "Tier A", in how i64 is encoded, and in not
having α-normalization or per-definition identity. None of these needs #180 to
be reverted. The renaming and the i64 change are cheapest to make before #180
merges.

## 7. Implementation status (2026-11-26)

| Target | Code today |
|---|---|
| HTML | Not a generic emitter. `web_lower.cljk` lowers web applications to Amu dispatch code. MithrilPress static export and the codegraph HTML UI exist separately. |
| JSON-LD | `compiler.cljk` projects JSON-LD. Turtle is not emitted. |
| JSON Schema / OpenAPI / `.d.ts` / route table | `.d.ts` comes from native declarations (`native_declaration_emit.cljk`), which belong to the native-js maintenance path. The others are not implemented. |
| JS ESM | `native_js.cljk` / `native_esm.cljk` emit for checked host-call modules (maintenance-only, #178). There is no IR-based JS emitter. |
| Python | Not implemented. |
| Rust | Stub only in #180 (open). |
| Amu | `module_lower.cljk` → Amu source. AOT bundle and guest fail-closed in #179 (open). |

## 8. Open points

1. Whether the M1 behaviour attachment (§3.3) is the full M2 JS backend
   brought forward, or a restricted JS subset.
2. The BigInt lowering for JS `i64`, which would replace the safe-integer
   refusal.
3. The `data-mith-iri` attribute name and whether it is required (SHOULD in
   this draft).
