# Code graph and Mithril language bootstrap

Mithril now declares its own language kernel and codegraph application in
Mithril Form. The local codegraph implementation extracts an inert syntax
tree, resolves indexed names and explicit document links, retains source
evidence, updates an immutable index, detects file communities, and exposes
bounded exploration through a library, JSON CLI, MCP, an offline HTML UI
and a loopback complete-index explorer.
The graph projects into the existing RDF, OWL 2 RL, SHACL and IPLD interfaces.

## Source of authority

- `src/mithril/language.mith`: accepted source formats, the existing compiler
  executable pipeline and imported CLI entrypoints. The main CLI compiles this
  kernel, admits its requested entrypoint, and executes `compile` by reducing
  the declared pipeline over accumulated compiler facts.
- `ontology/language-v1.mith`: RDF vocabulary and SHACL admission for the
  language kernel; `lib/mithril/bootstrap-v1.mith` binds its canonical digest.
- `src/mithril/codegraph.mith`: parser profile, admitted source extensions,
  ordered extraction/resolution/community-detection/projection pipeline, queries
  and budgets (including community and UI limits).
- `ontology/codegraph-v1.mith`: files, definitions, functions, macros, tests,
  documents, sections, semantic entities and reified edges with source spans,
  location precision and provenance.
- `lib/codegraph/operations-v1.mith`: the finite operation catalog imported by codegraph.

Library catalog filenames are descriptive: `lib/**/v1.mith` is reserved by
the existing reverse-domain component discovery convention.

The bootstrap adapters reject unknown fields, operations, mismatched ontology
or library digests and out-of-range budgets. Dedicated inline contexts bind
the new contracts without modifying the shared v1 RDF context or the graph
identities of existing programs. Existing `.mith` and JSON-LD spelling still
use the same compiler projection. `compile-language` emits the language IR.

The language contract executes the declared program pipeline on the existing
Amu-based host. Compiler self-hosting is not a goal. CLJK/CLJS implements the
primitive readers, scope analysis, RDF adapters, index algorithms and
filesystem/protocol effects. The `.mith` files admit orchestration, budgets and
imports. Individual entrypoints retain their own typed contracts; an ontology
compile does not produce a program transaction.

## Executable language kernel

The imported compiler primitives have a closed input/output fact signature:

| Primitive | Requires | Produces |
| --- | --- | --- |
| read-inert | path, source | document, source-format |
| project-jsonld | document | dataset |
| canonicalize-rdf | dataset | graph-digest |
| admit-vocabulary | document | goal, ontology, choices |
| emit-transaction | graph-digest, goal, ontology, choices | artifact |

Every primitive must appear once and be exported as a compiler by the pinned
bootstrap library. Admission checks dependency availability and prevents fact
overwrites. For example, moving vocabulary admission immediately after reading
is valid and changes the kernel identity and actual receipt order while
preserving the compiled transaction. Moving canonicalization before projection
is rejected. Unknown, duplicated, omitted and unimported stages are rejected.
The source-format declaration may be a unique nonempty subset of the two
bootstrap formats; execution enforces it after inert reading.

`compile-trace` emits five actual stage receipts with typed input/output
digests, the artifact, kernel/library identities and a digest of the language,
compiler and Form bootstrap source. It does not expose the source text in the
receipt. The execution adapter recompiles the stored kernel source, compares
the whole artifact, and reconstructs the imported library to verify that its
IR matches its canonical digest. Receipts describe a local execution; they
are not a signed attestation or a CID publication.

The original `compiler/compile-text` remains an independent reference path
for parity tests. The CLI's `compile` now calls the kernel executor. Primitive
reading, RDF expansion and vocabulary algorithms still reside in CLJK; the
`.mith` pipeline orchestrates those primitives.

```sh
kbb --backend sci --classpath src bin/mithril.cljk compile-trace examples/tender.mith
```

## Extraction and resolution

The v3 extractor supports `.clj`, `.cljs`, `.cljc`, `.cljk`, `.mith`,
`.mithril`, `.jsonld`, `.md`, `.markdown` and `.txt`. The inert Edamame reader produces syntax trees
with one-based line/column spans and exclusive end columns. No source or macro
is evaluated; read-eval and unsupported tagged readers are rejected. The
explicit reader profile selects `:cljs` conditional branches. Source strings,
comments, quoted forms and discarded forms do not generate call edges.

Clojure extraction covers a namespace, ordinary vector require specifications,
aliases, explicit `:refer` lists, top-level def/defonce/defn/defn-/defmacro/deftest
definitions, direct invocation sites and symbol references. Function parameters,
named functions, sequential let/loop bindings and destructuring are scoped.
Comprehensions, letfn, conditional bindings, as-> and destructuring default
expressions have explicit scope handling. Renamed refers are admitted. Prefix
libspecs, protocols, multimethods, dynamic dispatch, macro expansion, visibility
checks and JVM branches are
not qualified by this profile. Unsupported and malformed source retains a file
node and a parse diagnostic rather than fabricated definitions.

Each definition ID includes project identity, relative file path and full name.
An explicit source edge is tagged `extracted`; a uniquely resolved import,
reference or invocation is tagged `resolved`. Only an invocation targeting an
indexed function becomes `calls`; macro uses remain references. `resolved` is
static name resolution, not OWL entailment or proof of a runtime invocation.
Zero or multiple candidates remain unresolved with a reason. Calls to code
outside this repository and higher-order calls are not invented.

Mithril documents contribute their declared identity, type and library imports.
They retain their original semantic document in the file cache. Form locations
cover the source form; JSON-LD locations explicitly cover the whole document.
Nested `.mith`/JSON-LD entities with explicit `@id` plus descriptive fields
are indexed; `@id` references and explicit library/operation/symbol/candidate
IRIs become located `documents` edges when uniquely resolved. Nested entity
locations cover the semantic document; token-level JSON entity spans are not
fabricated. Declaration aliases from different files may remain ambiguous.

Markdown ATX headings have section spans and deterministic Unicode anchors;
duplicate anchors receive numeric suffixes. Root-to-section structure, inline
relative links (including local heading or full code-symbol fragments), and
single-backtick `namespace/name` references outside fenced blocks become
explicit document relations. Inline-code links, external/absolute URLs and
paths escaping the repository are ignored; no content is fetched. Markdown reference-style links and Setext headings are also admitted; HTML
and arbitrary prose semantics are not parsed. Plain text contributes a located
document node. Name search covers names, heading labels and paths; `content`
search returns exact single-line literal source matches. No semantic text
ranking is claimed.
Document relations participate in path/impact traversal and re-resolve when
code or linked documents change. Other programming-language/media parsers and
embeddings remain separate adapter work.

## Differential index and local effects

The pure `sync-index` API takes a complete manifest of relative paths to source
texts, an admitted codegraph artifact and a project identity. It caches parsed
files by source digest. Added/changed files are parsed; removed files disappear;
reverse dependents of changed names, namespaces and paths are re-resolved
against the resulting definition set. A no-op keeps the same snapshot and
parses/resolves/projects zero files. Named-node RDF partitions are rebuilt only
for affected source files. Global manifest, definition-table, file-network and
digest assembly work remains; this is not a mutable RDF database.

The filesystem adapter chooses only the selected Git root's cached and
untracked, nonignored supported files. Deleted tracked files disappear; the
private index directory is excluded even without a gitignore rule. Paths must
be relative and free of traversal. Internal symlinks, invalid UTF-8, nonfiles,
over-budget files and concurrent writers are refused. Index files are private
and written through an exclusive lock, flushed temporary file and atomic
rename. No source is modified. A failed update retains the previous index.
Queries refresh the manifest automatically before returning a result; there
is no background daemon or filesystem watcher in v1.

The index is `.mithril-codegraph/index.edn` and contains source text. Its digest
binds its full typed contents, contract, bootstrap implementation and project
identity. The bootstrap digest binds the extractor and index implementation
sources plus the document extractor and community implementation, so an
adapter change requires rebuilding the cache. The snapshot format is
`mithril.codegraph/index-v4-mith`; older snapshots are refused until explicit rebuild. Source digests use
Mithril's existing canonical typed-string digest (not a raw-file SHA-256).
Native SHA-256 is tested against the existing hash implementation. The RDF
graph digest uses the existing RDFC-1.0 canonical serializer and the same hash.
Changing the contract/profile invalidates a saved cache; `index --rebuild`
explicitly creates a replacement while preserving the old index until success.

An index digest detects accidental corruption; it is not a signed extraction
proof. Opt-in `verify` applies the actual OWL 2 RL and SHACL engines. `evidence`
uses the existing `reason-ipld` semantic/provenance blocks and returns their
local CIDs and bytes. Those blocks replay RDF reasoning and validation; they do
not prove that the extractor completely modeled source semantics. No new
remote store, network authority or production binding is introduced.

## Structural communities and offline UI

The file projection merges cross-file calls, references, imports and document
relations into undirected weighted edges. Same-file edges do not affect this
projection. The implementation performs deterministic local moves maximizing
modularity, starts from singleton files, and retains isolated files as singleton
communities. It optimizes each connected component independently and reports
a component/community hierarchy. It is not Louvain/Leiden or a global optimum
guarantee. Communities are derived structural suggestions and are kept
apart from asserted RDF facts and OWL entailment. IDs bind project and sorted
membership; moving files can change membership and IDs.

`.mith` admits up to 100,000 cross-file source edges and 16 passes by default.
Results include considered/total edge counts, `truncated`, `passes` and
`converged`. Limit exhaustion is visible. Unchanged indexes reuse the same
analysis; source changes reuse component results whose content signatures
are unchanged and recompute changed components. Queries are available through CLI and
MCP and carry the snapshot identity.

`codegraph ui <root> [--rebuild]` writes
`.mithril-codegraph/explorer.html` atomically with private file permissions.
The standalone page embeds local data, CSS and JavaScript. No remote library,
server, account or network request is required. HTML data escapes markup,
script separators and ampersands; DOM output uses text content. A CSP pins the
embedded scripts/styles by hash and denies network access.

The UI has community/kind filters, literal node/heading/path search, a file
relationship map, source/location inspection, adjacent-node navigation, and
path/impact exploration with copyable API requests. The default export contains
at most 2,000 nodes and 6,000 semantic/file edges, with 1,024-character source
excerpts, and refuses output over 8 MiB. The `.mith` contract sets those export
budgets. The map shows up to 100 files and 500 edges and the list shows at most
100 matching nodes; counts disclose the scope. Community analysis belongs to
the complete index (or its explicitly bounded projection), while UI walks run
only over the embedded semantic subset. An absent path does not prove absence
in the full index. Rerun `ui` to refresh; this is an offline snapshot, not a
watching web service.

```sh
kbb --backend sci --classpath src bin/mithril.cljk codegraph ui . --rebuild
kbb --backend sci --classpath src bin/mithril.cljk codegraph query . \
  '{"operation":"communities","limit":20}'
```

## Exploration interface

`mithril.codegraph/dispatch` accepts a verified snapshot, compiled artifact and
a JSON-shaped request. Queries are selected by the `.mith` contract:

| Operation | Input | Result |
| --- | --- | --- |
| search | query | Names and located definitions matching literal text |
| node | full name or ID | Located node, bounded verbatim source and unresolved references |
| callers / callees | node | Direct static call edges and endpoint metadata |
| impact | node, depth | Reverse reachability through calls, references, defines and imports |
| path | from, to, depth | Bounded directed shortest path with located edges |
| explore | query | Matching definitions with source, adjacent edges and unresolved references |
| status | optional limit | Counts and bounded parse/scope/unresolved diagnostics |
| communities | optional limit | File communities, algorithm, modularity, convergence and coverage |
| community | community ID | Member files and weighted internal file relationships |
| catalog | kind, offset, limit | Page of nodes from the complete index |
| content | query, offset, limit | Exact literal source matches with spans and source digests |
| neighbors | node, offset, limit | Page of incident edges and endpoint nodes |
| rdf | none | Expanded JSON-LD named graph, for explicit export |

Every result carries snapshot, graph and contract digests. Ambiguous node
selectors are refused. Result count, traversal depth, visited-node count and
verbatim source length are bounded. Cycles terminate; incomplete traversals,
result lists and source snippets have explicit truncation markers. Impact is
conservative reachability, not a guaranteed set of runtime effects or tests.
The pure API works against the supplied immutable revision; filesystem queries
refresh it first. These are literal name/content searches, not natural-language GraphRAG.

The MCP stdio adapter exposes `mithril_codegraph` against the root fixed at
startup. It implements initialization, ping, tools/list and tools/call; protocol
versions are 2025-06-18 and 2025-03-26. Export of the entire RDF dataset remains
in the library/CLI rather than the retrieval tool. Standard output contains
newline-delimited JSON-RPC only. No assistant settings are changed by this code.

## Running locally

Run from the Mithril package, with its pinned Kbb dependencies available:

```sh
kbb --backend sci --classpath src bin/mithril.cljk compile-language
kbb --backend sci --classpath src bin/mithril.cljk codegraph compile
kbb --backend sci --classpath src bin/mithril.cljk codegraph index .
kbb --backend sci --classpath src bin/mithril.cljk codegraph query . \
  '{"operation":"explore","query":"mithril.compiler/compile-document","limit":5}'
kbb --backend sci --classpath src bin/mithril.cljk codegraph query . \
  '{"operation":"callers","node":"mithril.compiler/compile-document"}'
kbb --backend sci --classpath src bin/mithril.cljk codegraph verify .
kbb --backend sci --classpath src bin/mithril.cljk codegraph index . --rebuild
kbb --backend sci --classpath src bin/mithril.cljk codegraph serve .
```

`bin/mithril-codegraph.cljk` is the isolated codegraph entrypoint with the same
subcommands. For an MCP client, use the absolute path to
`scripts/codegraph-mcp.sh` as its command and pass the absolute chosen repository
root as its only argument. The wrapper selects the package working directory
and pinned dependencies. Source extraction is local. Returning evidence bytes
or RDF for the whole repository can be large;
use the bounded retrieval operations for normal agent queries.

```sh
kbb --backend sci --classpath src:test test/run_codegraph.cljk
kbb --backend sci --classpath "$(kbb -Spath):test" test/run.cljk
```

The targeted suite checks source spans, inert parsing, lexical shadowing,
reader branches, rename/delete invalidation, ambiguity, malformed-source
diagnostics, immutable digests, bounded/cyclic traversal, .mith contract and
kernel admission, RDF/SHACL refusal and CID replay, Git freshness, symlink
refusal, retained snapshots after failures, and MCP lifecycle/tool behavior.

## Validation on 2026-10-06

- Initial codegraph/kernel suite: 13 tests, 76 assertions, zero failures/errors.
- Executable language pipeline tests: 3 tests, 29 assertions, included in the
  regression suite below. Output parity covers JSON-LD and Mithril Form, valid
  reordering, dependency failures, import removal, format restrictions, library
  and kernel tampering, and primitive refusals.
- CLI `compile` and `compile-trace` produced identical tender artifacts, with
  five stage receipts from the latter.
- Compiler, Form, graph, codegraph, component catalog, twin simulation and
  stack regression suite, including the executable language pipeline:
  44 tests, 336 assertions, zero failures/errors.
- MCP subprocess launched from outside the package: initialize, tools/list
  and tools/call returned valid JSON-RPC and exact located definition source.
- The actual Mithril repository was indexed and its
  `mithril.compiler/compile-document` definition was retrieved at
  `src/mithril/compiler.cljk` line 369 with the exact source span.

- Document/community/UI regression: 49 tests, 383 assertions, zero failures/errors.
  This includes exact document/section spans, fenced-code exclusion, explicit
  entity references, code rename/delete/readdition, deterministic separated
  file clusters and isolated files, pass/edge limits, MCP query schema, inert
  HTML embedding, export truncation, Git document refresh and UI symlink refusal.
- Browser verification: literal search, exact source display, community
  filtering, document-to-code paths and reverse impact including documents
  passed with no browser warning/error messages.
- The generated Mithril explorer contains a snapshot of 213 files, 2,439
  nodes, 10,715 relations and 83 documents; structural analysis found 91
  communities in 4 passes (converged, modularity approximately 0.515).
  The 4.8 MiB HTML embeds 2,000 nodes and 6,000 semantic relations; its partial
  coverage, source excerpts, 16,922 unresolved references and 272 diagnostics
  are explicitly disclosed. External dependencies and unsupported scope forms
  remain outside the static extractor's model.

The first whole-suite run reported 2 failures and 14 errors because the new
library was initially named `lib/codegraph/v1.mith`, which component discovery
treated as a component. Renaming it to `operations-v1.mith` resolved that
collision; all affected suites are included in the passing regression run.
The full slow suite was not repeated after the naming fix. Existing unrelated
stack changes in the checkout were retained. No production deployment or
publication was performed.

## 2026-10-08 complete-index and incremental extension

The v3 extractor adds comprehension/conditional/letfn/as-> scopes, qualified
core scope handling, renamed refers and destructuring-default references.
Unresolved records distinguish builtin candidates, external dependency/IRI,
missing project/document targets and ambiguous owner/target/namespace. Reader
and runtime limitations remain explicit; no macro expansion or source evaluation
is introduced.

Index v3 stores reverse dependencies and canonical named-node RDF partitions.
Only changed/dependent source files are resolved/projected. Delete, duplicate
namespace/definition, restore, new document, empty corpus and Unicode fixtures
compare the entire incremental snapshot with a clean rebuild and its full RDF
canonical digest. Global manifest reads, definition tables, file-network
projection, sorting and snapshot hashing remain global operations.

Community algorithm `file-component-modularity-local-v2` runs weighted local
modularity moves within each connected component. A content signature caches
unchanged components. The hierarchy is connected components containing their
communities; it is not a multi-resolution Louvain/Leiden algorithm. A weighted
two-clique bridge plus isolated-file fixture tests separation, determinism,
pass/edge budgets and hierarchy/cache stability.

Markdown admits reference/collapsed/shortcut links and Setext headings outside
fences. JSON-LD entity spans continue to state `document` precision. `content`
returns case-sensitive literal, single-line matches with exact UTF-16 source
columns, source digest and bounded snippets. `catalog`, `search`, `neighbors`,
`content` and `communities` accept offset/limit. Requests may bind `revision` to
the snapshot digest; mismatches refuse `stale-revision`.

`web ROOT [--rebuild]` binds a random port on 127.0.0.1. It admits only fixed UI
assets, JSON queries and a field-free refresh request against the fixed Git
root. Host/Origin checks, no CORS, a restricted CSP and 16 KiB request budget
bound the HTTP surface. The server retains one immutable snapshot until
explicit refresh; older revisions then return HTTP 409. It does not serve
arbitrary filesystem paths or fetch external assets. The offline exporter stays
available and keeps its visible subset limits.

When native `kbb` is unavailable, `scripts/run-sci.mjs` resolves `deps.edn` via
`clojure -Spath` and provides temporary `.cljs` aliases for `.cljk` sources to
Nbb/SCI. It leaves source files intact and cleans up after normal termination.
This is compatibility validation, not proof of native Amu execution. The full
suite attempt encountered ENOSPC and CLI child-process startup failures;
full-suite completion remains a delivery gate.

Large private snapshots are transparently stored as `gzip-edn-v1` wrappers in
`index.edn`. Snapshot/graph identities continue to bind the uncompressed typed
contents; reads bound both the on-disk and decompressed size. Compression uses
Node's bundled zlib, preserves private/atomic writes, and reduces repeated RDF
IRI storage. Small snapshots remain plain EDN for inspection.

## Saved Mithril premises and reasoning (2026-10-08)

The authoritative revision is a private `.mithril-codegraph/revisions/<snapshot>/`
bundle. `asserted.mith` preserves the canonical located graph, `sources.mith`
preserves full originals and source identities, `ontology.mith` preserves the
admitted schema, and `manifest.mith` binds their exact bytes plus semantic,
contract, bootstrap and revision identities. An inert `rdf/dataset` form keeps
named/default graphs, blank nodes, IRIs, datatypes and language literals.
It performs no evaluation. This is data persistence on the existing Amu host.

The v4 EDN cache references the manifest digest. Missing or edited premises
refuse cached queries. Explicit rebuild migrates old caches. Archive publication
precedes the atomic cache replacement; failed publication keeps the old cache.
New revisions retain historical originals even after source deletion.

`codegraph reason <root>` checks and reads the saved premises/schema, runs the
existing OWL 2 RL and SHACL engines and atomically writes `reasoned.mith`.
The output retains asserted, entailed, inferred, report and metadata graphs.
OWL rule facts with literal subjects cannot be RDF triples; a separate quoted
rule-fact graph preserves their typed EDN records without inventing RDF triples.
Reason results are regenerable and returned with byte and graph digests.
`verify` and `evidence` use this saved-input path too.

Generic `reason ontology.mith data.mith --save-mith result.mith` also persists
these layers. The Japanese natural-language example declares a sourced claim
about a cat and infers its animal type. Original prose is evidence; automatic
prose-to-claims extraction, model-based GraphRAG and other media adapters remain
separate work. Archive serialization is global per revision; incremental
extraction does not imply incremental archive or OWL materialization.

## System One local bridge (2026-10-09)

`bin/mithril-system-one-graph.cljk` is a closed JSON-input adapter used by
System One's owner-configured process. Context returns source/revision identities
and located graph evidence. A compiled candidate is checked against the current
revision, copied with immutable admitted originals into a private candidate Git
root, incrementally indexed, persisted in Mithril and replayed through OWL/SHACL.
The original source is retained. Candidate conformance checks the CodeGraph
ontology; System One's existing compiler and behavioral verification remains
required. No model-selected executable, root or command is accepted.

The sibling System One repository provides task/workflow integration, CLI/MCP
and opt-in Hermes adapter configuration; see its `docs/codegraph-integration.md`.
Existing runtime/compiler pins and Amu host behavior are unchanged. Native
profile activation and production consumer migration remain separate.
