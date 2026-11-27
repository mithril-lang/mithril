# RDF, OWL 2, SHACL and SPARQL as S-form

Status: normative v1 draft · 2026-11-26 · decisions **D2** (quad list +
RDFC-1.0, OWL 2 Functional-Style, SHACL and SPARQL as algebra S-forms), building
on **D1** (sform-canonical.md).

## 1. Summary

| Object | Mathematical object | Canonical S-form | Property of the mapping |
|---|---|---|---|
| RDF dataset | Finite set of quads | `(dataset q…)`: a sorted list of `(quad s p o g)` with RDFC-1.0 labels. `(node …)` is display sugar. | Bijective with datasets modulo isomorphism (§2.5) |
| OWL 2 ontology (structure) | Set of axioms | `(Ontology …)` with Functional-Style heads | Bijective with structural specification modulo axiom-set order. Bidirectional with RDF for OWL 2 DL. OWL Full is irreversible (§4.4). |
| OWL 2 semantics | Direct (SROIQ) and RDF-Based | Not encoded: only syntax is mapped, so semantics are preserved by construction | OWL 2 RL also has a `(rule …)` Datalog form (§4.5) |
| SHACL Core | A shapes graph (RDF) | `(NodeShape …)` / `(PropertyShape …)` sugar over the shapes graph | Injective into shapes graphs (§5.4) |
| SPARQL / SHACL-SPARQL | SPARQL algebra | `(bgp …)`, `(filter …)`, … following the Jena SSE precedent | Term-for-term with the algebra (§6) |

## 2. RDF datasets

### 2.1 Grammar

```ebnf
dataset   = "(" "dataset" { quad } ")" ;
quad      = "(" "quad" subject predicate object graph ")" ;
subject   = iri | bnode ;
predicate = iri ;
object    = iri | bnode | literal ;
graph     = iri | bnode | "default" ;
iri       = "(" "iri" string ")" ;             (* IRI atom, sform-canonical.md §2.1 *)
bnode     = "(" "bnode" string ")" ;
literal   = "(" "lit" string ( iri | lang ) ")" ;
lang      = "(" "lang" string ")" ;
```

`default` is the symbol that names the default graph.

### 2.2 Canonical dataset rules

A `(dataset …)` term is **canonical** if and only if all of these hold:

1. **Blank node labels.** Every `bnode` label is the label the RDFC-1.0
   canonical issuer assigned (`c14n0`, `c14n1`, …), computed over the whole
   dataset, using SHA-256 as the RDFC-1.0 hash.
2. **Order.** Quads appear in the order of their canonical N-Quads lines, in
   the Unicode code point order that RDFC-1.0 §4.4.3 uses for its output.
3. **No duplicates.** No two quads are equal, so the dataset is a set.
4. **Literals are explicit** (§3). Every literal carries its datatype IRI or a
   language tag.

With these rules, the existing graph digest is a pure function of the
canonical term:

```
graph-digest(D) = "sha256:" ++ hex(SHA-256( concat( nquad-line(q) for q in D ) ))
```

Here `nquad-line` is the RDFC-1.0 canonical N-Quads serialization of one quad,
ending in `\n`. Implementations MUST compute `graph-digest` and the dataset CID
(ipld-identity.md §5) from the same RDFC-1.0 run. They MUST NOT label blank
nodes twice.

If RDFC-1.0 throws `work-limit-exceeded`, the dataset MUST be refused
(`:mithril.rdf/canonicalization-limit`). It MUST NOT be hashed with fallback
labels.

### 2.3 Display sugar: `node` and `graph`

```ebnf
graph-block = "(" "graph" graph { node } ")" ;
node        = "(" "node" subject { "(" predicate object { object } ")" } ")" ;
```

`(graph g (node s (p o1 o2) (p2 o3)))` desugars to the quads
`(quad s p o1 g)`, `(quad s p o2 g)` and `(quad s p2 o3 g)`. A `node` outside
any `graph` block has `g = default`. Desugaring is followed by RDFC-1.0 and
sorting. So any nesting, ordering or repetition of `node` and `graph` blocks
that denotes the same set of quads yields the same canonical dataset.

`node` and `graph` MUST NOT appear in canonical form. Printers MAY print a
canonical dataset in this sugar for reading. The readable form is not an
identity.

### 2.4 Example

Sugar:

```
(graph default
  (node (iri "https://ex.org/alice")
    ((iri "http://xmlns.com/foaf/0.1/knows") (bnode "b"))
    ((iri "http://xmlns.com/foaf/0.1/name") (lit "Alice" (lang "en"))))
  (node (bnode "b")
    ((iri "http://xmlns.com/foaf/0.1/age") (lit "42" (iri "http://www.w3.org/2001/XMLSchema#integer")))))
```

Canonical (blank node `b` relabelled `c14n0`, quads in N-Quads line order):

```
(dataset
  (quad (iri "https://ex.org/alice") (iri "http://xmlns.com/foaf/0.1/knows")
        (bnode "c14n0") default)
  (quad (iri "https://ex.org/alice") (iri "http://xmlns.com/foaf/0.1/name")
        (lit "Alice" (lang "en")) default)
  (quad (bnode "c14n0") (iri "http://xmlns.com/foaf/0.1/age")
        (lit "42" (iri "http://www.w3.org/2001/XMLSchema#integer")) default))
```

The order is the order of the canonical N-Quads lines:

```
<https://ex.org/alice> <http://xmlns.com/foaf/0.1/knows> _:c14n0 .
<https://ex.org/alice> <http://xmlns.com/foaf/0.1/name> "Alice"@en .
_:c14n0 <http://xmlns.com/foaf/0.1/age> "42"^^<http://www.w3.org/2001/XMLSchema#integer> .
```

`<` (U+003C) sorts before `_` (U+005F), so IRI subjects come before blank
node subjects. This is N-Quads line order, not the term order of
sform-canonical.md §2.3. Datasets are the one place where the spec uses
RDFC-1.0's order instead, so that `graph-digest` stays a function of the
canonical term. Conformance tests MUST include a case where the two orders
differ.

### 2.5 Mapping properties

Let `S` be the set of canonical `(dataset …)` terms and `R` the set of RDF 1.1
datasets.

- `⟦·⟧ : S → R` (read a term as quads) is **total and injective**. Different
  canonical terms denote different datasets, because terms are compared
  syntactically and literals keep their lexical forms.
- `canon : R → S` (RDFC-1.0, then sort) is **partial**, because of the RDFC-1.0
  work limit. Where it is defined, `canon(D1) = canon(D2)` holds if and only if
  `D1 ≅ D2` (RDF dataset isomorphism; RDFC-1.0 §4).
- Therefore `canon` is a **bijection between `R/≅` and `S`** on the domain
  where RDFC-1.0 terminates within its limit, with `⟦canon(D)⟧ ≅ D`.
- RDF term equality is lexical. `"01"^^xsd:integer` and `"1"^^xsd:integer` are
  different terms and MUST stay different. Value normalization is **not** part
  of canonicalization. A reasoner MAY treat them as equal values. Identity MUST
  NOT.

## 3. Literals

1. A literal MUST be `(lit LEX (iri DT))` or `(lit LEX (lang TAG))`. The
   second form has datatype `rdf:langString`.
2. Data-profile scalar sugar desugars in object position as follows:

   | Sugar | Canonical |
   |---|---|
   | `"abc"` | `(lit "abc" (iri "…XMLSchema#string"))` |
   | `42` | `(lit "42" (iri "…XMLSchema#integer"))` (canonical decimal, no leading `+` or zeros) |
   | `true` | `(lit "true" (iri "…XMLSchema#boolean"))` |

3. The data profile has **no floats**. The reader refuses float tokens. A literal
   typed `xsd:double`, `xsd:float` or `xsd:decimal` is admitted only in the
   explicit `(lit "…" (iri …))` form. It is carried as its lexical string and is
   never converted to a host number.
4. `LEX` MUST be in the lexical space of `DT` for these datatypes:
   `xsd:integer`, `xsd:boolean`, `xsd:string`, and the bounded integer types.
   Otherwise the literal is refused: `:mithril.rdf/ill-typed-literal`. For
   other datatypes, the literal is carried without checking.
5. A language tag MUST be well-formed BCP 47. It is kept as written (see open
   point 1).

## 4. OWL 2

### 4.1 Grammar (excerpt)

Heads are the OWL 2 Functional-Style Syntax operator names, spelled exactly
as in the W3C structural specification. Entities are wrapped, as in
`vendor/src/owl/functional.cljk`.

```ebnf
ontology   = "(" "Ontology" [ iri [ iri ] ] { import } { annotation } { axiom } ")" ;
import     = "(" "Import" iri ")" ;
entity     = "(" ( "Class" | "Datatype" | "ObjectProperty" | "DataProperty"
                 | "AnnotationProperty" | "NamedIndividual" ) iri ")" ;
axiom      = "(" "Declaration" entity ")"
           | "(" "SubClassOf" classExpr classExpr ")"
           | "(" "EquivalentClasses" classExpr classExpr { classExpr } ")"
           | "(" "DisjointClasses" classExpr classExpr { classExpr } ")"
           | "(" "ObjectPropertyDomain" objProp classExpr ")"
           | "(" "ClassAssertion" classExpr individual ")"
           | … ;                         (* every OWL 2 axiom, same shape rule *)
classExpr  = entity
           | "(" "ObjectIntersectionOf" classExpr classExpr { classExpr } ")"
           | "(" "ObjectSomeValuesFrom" objProp classExpr ")"
           | "(" "ObjectAllValuesFrom" objProp classExpr ")"
           | … ;
```

The shape rule: the Functional-Style production `Op( a1 … an )` becomes
`(Op a1' … an')`. Prefixed names become IRI atoms. Literals use §3.

### 4.2 Canonical ontology rules

1. Axioms and annotations are **sets**. In canonical form they MUST be sorted
   and deduplicated (sform-canonical.md §2.3), and the `Ontology` header fields
   come first.
2. Arguments that OWL 2 defines as sets (the operands of `EquivalentClasses`,
   `DisjointClasses`, `ObjectIntersectionOf`, `ObjectUnionOf`, `ObjectOneOf`,
   `DataOneOf`, `SameIndividual`, `DifferentIndividuals`, …) MUST be sorted and
   deduplicated. Arguments that OWL 2 defines as sequences (property chains,
   `HasKey` lists) keep their order.
3. Anonymous individuals are written `(bnode "…")`. They are labelled by
   running RDFC-1.0 on the ontology's RDF mapping.

### 4.3 Example

```
(Ontology (iri "https://ex.org/pets")
  (Declaration (Class (iri "https://ex.org/Animal")))
  (Declaration (Class (iri "https://ex.org/Cat")))
  (SubClassOf (Class (iri "https://ex.org/Cat")) (Class (iri "https://ex.org/Animal"))))
```

With sugar: `(SubClassOf (Class :ex/Cat) (Class :ex/Animal))`, where `ex` is a
declared prefix.

### 4.4 Mapping properties

- S-form ↔ OWL 2 structural specification: **bijection modulo the order of set
  arguments**. Section 4.2 picks one order, so it is a bijection on canonical
  terms.
- OWL 2 structural → RDF uses the W3C *OWL 2 Mapping to RDF Graphs* `T`. On
  OWL 2 DL ontologies, `T` is injective up to structural equivalence, and the
  reverse mapping recovers the ontology.
- RDF → OWL 2 structural is **partial**. A graph that does not satisfy the
  OWL 2 DL restrictions (OWL 2 Full) has no Functional-Style counterpart. Such
  a graph MUST be kept as a `(dataset …)` term. Admission MUST refuse to
  produce an `(Ontology …)` term for it (`:mithril.owl/not-owl2-dl`). The
  round trip OWL Full → S-form → OWL Full goes through quads only, and
  information that exists only in the Functional-Style view cannot be
  recovered. This is the **OWL Full irreversibility**.

### 4.5 OWL 2 RL as rules

For reasoning, an OWL 2 RL ontology MAY also be written as Datalog:

```
(rule (head (quad ?x (iri "…rdf-syntax-ns#type") (iri "https://ex.org/Animal") default))
      (body (quad ?x (iri "…rdf-syntax-ns#type") (iri "https://ex.org/Cat") default)))
```

The rule form is derived. Identity is always that of the `(Ontology …)` or
`(dataset …)` term it came from.

## 5. SHACL Core

### 5.1 Grammar (excerpt)

```ebnf
shapes        = "(" "shapes" { shape } ")" ;
shape         = node-shape | property-shape ;
node-shape    = "(" "NodeShape" ( iri | bnode ) { target } { constraint } ")" ;
property-shape= "(" "PropertyShape" ( iri | bnode ) path { constraint } ")" ;
target        = "(" ( "targetClass" | "targetNode" | "targetSubjectsOf"
                    | "targetObjectsOf" ) ( iri | literal ) ")" ;
path          = "(" "path" path-expr ")" ;
path-expr     = iri
              | "(" "seq" path-expr path-expr { path-expr } ")"
              | "(" "alt" path-expr path-expr { path-expr } ")"
              | "(" ( "inverse" | "zeroOrMore" | "oneOrMore" | "zeroOrOne" ) path-expr ")" ;
constraint    = "(" component-name { argument } ")" ;   (* SHACL Core §4 names *)
```

`component-name` is the local name of a SHACL Core constraint parameter, such as
`class`, `datatype`, `minCount`, `maxCount`, `pattern`, `node`, `property`, `in`,
`and`, `or`, `xone`, `not` or `qualifiedValueShape`.

### 5.2 Desugaring

A `(shapes …)` term desugars to a shapes graph: quads in the SHACL vocabulary
(`sh:NodeShape`, `sh:property`, `sh:path`, RDF lists for `sh:in`, `sh:and`,
`seq` and `alt`), then canonicalizes as a dataset (§2.2). The shapes graph is
the identity. The `(shapes …)` term is sugar.

SHACL-SPARQL, SHACL Advanced Features and any non-Core `sh:` term MUST be
refused by name at admission (`:mithril.shacl/unsupported-sparql`,
`:mithril.shacl/unsupported-constraint`). They MUST NOT be ignored.

### 5.3 Recursive shapes

SHACL 1.0 leaves the validation of recursive shapes undefined. Mithril v1
rule: **recursive shapes are refused at admission.** The shape-reference graph
has an edge from a shape to every shape it reaches through `sh:node`,
`sh:property`, `sh:qualifiedValueShape`, `sh:and`, `sh:or`, `sh:xone` or `sh:not`.
If that graph has a cycle, the shapes graph MUST be refused
(`:mithril.shacl/recursive-shape`) before any data is validated. The check
depends only on the shapes graph, never on data. Owner decision, 2026-11-27.

A validator MAY also keep a runtime guard that refuses a shape that reaches
itself on the same focus node. That guard is defense in depth. It does not
replace the admission check.

### 5.4 Mapping properties

`(shapes …)` → shapes graph is **injective**. Section 5.2 preserves every
parameter, and §2.5 makes the dataset step injective. Shapes graph →
`(shapes …)` is partial. It is defined only on graphs that use SHACL Core
vocabulary and that are not recursive under §5.3.

### 5.5 Example

```
(shapes
  (NodeShape (iri "https://ex.org/PersonShape")
    (targetClass (iri "https://ex.org/Person"))
    (property (PropertyShape (bnode "p")
      (path (iri "http://xmlns.com/foaf/0.1/name"))
      (minCount 1)
      (datatype (iri "http://www.w3.org/2001/XMLSchema#string"))))))
```

Integer arguments such as `minCount 1` desugar to `xsd:integer` literals (§3).

## 6. SPARQL algebra

### 6.1 Grammar (excerpt; Jena SSE precedent)

```ebnf
op     = "(" "bgp" { triple } ")"
       | "(" "join" op op ")"
       | "(" "leftjoin" op op [ expr ] ")"
       | "(" "filter" expr op ")"
       | "(" "union" op op ")"
       | "(" "minus" op op ")"
       | "(" "graph" ( iri | var ) op ")"
       | "(" "extend" "(" var expr ")" op ")"
       | "(" "group" "(" { var } ")" "(" { aggregate } ")" op ")"
       | "(" "order" "(" { order-key } ")" op ")"
       | "(" "project" "(" { var } ")" op ")"
       | "(" ( "distinct" | "reduced" ) op ")"
       | "(" "slice" integer integer op ")"
       | "(" "table" { row } ")" ;
triple = "(" "triple" term term term ")" ;
var    = "(" "var" string ")" ;          (* sugar: ?x *)
```

The operators are those of SPARQL 1.1 §18.2 (algebra) and §18.5, one head per
algebra operator. Expressions are `(op arg…)` with SPARQL function names
(`=`, `<`, `&&`, `bound`, `regex`, …).

### 6.2 Rules

- A query is identified by its **algebra term**, not its query text. Two query
  texts that translate (SPARQL 1.1 §18.2) to the same algebra term have one
  identity.
- Variables are **not** alpha-normalized. Projected variable names are
  observable in results.
- Algebra rewrites (filter placement, join reordering) are optimizations. They
  MUST NOT be applied before identity is computed.

### 6.3 Example

`SELECT ?n WHERE { ?p foaf:name ?n FILTER(lang(?n) = "en") }`:

```
(project ((var "n"))
  (filter (= (lang (var "n")) (lit "en" (iri "http://www.w3.org/2001/XMLSchema#string")))
    (bgp (triple (var "p") (iri "http://xmlns.com/foaf/0.1/name") (var "n")))))
```

## 7. Implementation status (2026-11-27)

| Spec rule | Code today | Gap |
|---|---|---|
| RDFC-1.0 + SHA-256 graph digest (§2.2) | `compiler/graph-digest` = `"sha256:" ++ rdf-canon/canonical-hash` over the JSON-LD → RDF dataset. `vendor/src/rdf_canon` implements full RDFC-1.0 with a work limit. | Matches. |
| `(dataset (quad …))` canonical term | `mithril.rdf-form/write-quads` prints `(rdf/dataset (rdf/graph g (rdf/description s (rdf/property p o…))))`, grouped and sorted by `pr-str`. Terms are `(rdf/iri …)` and `(rdf/literal lex :datatype …)`. | The existing form is the §2.3 display sugar under other head names. A canonical `(quad …)` writer and reader are not implemented. Identity is unaffected, because the digest is computed from the dataset, not from this text. |
| Default graph symbol `default` | `rdf-form` uses `nil` as the graph key. | Head and atom naming only. |
| Literals always explicit (§3) | `rdf/literal` omits the datatype for plain strings. | Printer-level difference. RDF semantics are the same, since a plain literal is `xsd:string`. |
| `:mithril.rdf/canonicalization-limit` | `rdf-canon` throws `:rdf-canon/work-limit-exceeded`. | Same behaviour, different code name. |
| OWL Functional-Style S-form (§4) | `vendor/src/owl/functional.cljk` uses the same heads and entity wrappers as EDN vectors (`[:SubClassOf [:Class iri] …]`). There is no text reader. | Same tree shape. A canonical set-ordering rule (§4.2) is not applied. Data-profile `owl/*` tags project through JSON-LD instead. |
| `:mithril.owl/not-owl2-dl` | Not implemented. | — |
| SHACL Core coverage (§5) | `src/mithril/shacl.cljk` evaluates SHACL Core and refuses SHACL-SPARQL and advanced features by name (`:unsupported-shacl-sparql`, `:unsupported-shacl-constraint`). Every refusal also carries `:mithril/error :mithril.shacl/<reason>`. | The `:mithril/error` names (`:mithril.shacl/unsupported-shacl-sparql`, …) keep the `shacl` infix, so they differ from the §5.2 names. There is no `(shapes …)` sugar reader. |
| Recursive shapes refused at admission (§5.3) | `shacl/compile-shapes` builds the shape-reference graph over every shape root and refuses any cycle with `:recursive-shape` (`:mithril/error :mithril.shacl/recursive-shape`, detail `:phase :admission` and the `:cycle`) before any data is read. `validate-shape` keeps the (shape, focus node) guard as defense in depth (`:phase :validation`). | Matches. All 98 W3C SHACL Core entries still pass. None of them has a cycle in the shape-reference graph. The shacl-shacl shapes reach nested shapes through targets (`sh:targetObjectsOf`), not through reference edges. |
| SPARQL algebra S-form (§6) | `vendor/src/sparql/core.cljk` evaluates maps keyed `:sparql/op` (`:bgp`, `:filter`, `:join`, `:union`, `:optional`, …). | Same algebra as data maps. It uses `:optional` where SPARQL and SSE use `leftjoin`. There is no S-form reader. |

## 8. Open points

1. Language tag case. RDF says tags compare case-insensitively, while RDFC-1.0
   keeps the lexical tag. This draft keeps tags as written so that no existing
   digest moves. Lowercasing at admission would be a versioned change.
2. RDF 1.2 (triple terms, base direction) is out of scope for v1.
3. Recursive shapes. Decided 2026-11-27: refused at admission (§5.3).
4. Whether `xsd:decimal` should get a lexical-space check in v1 (§3, item 4).
