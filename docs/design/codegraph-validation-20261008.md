# Local validation — 2026-10-08

The compiler remains based on Amu. These are Nbb/SCI compatibility results,
not native Amu, CI, deployment or installed-client evidence.

## Passing checks

- Final codegraph/language/documents suite: **27 tests, 202 assertions**, zero
  failures/errors. Includes lexical/default initializer shadowing, renamed
  refers, unknown classification, reverse invalidation, entire clean/incremental
  snapshot equality, canonical RDF digest equality, deletion/restore/ambiguity,
  document links, content spans, paging/revision refusal, component hierarchy,
  cache stability, compressed persistence and bounded inflation.
- Broader compiler/Form/graph/codegraph/language/documents regression before the
  final two lexical-default assertions: **38 tests, 265 assertions**, zero
  failures/errors. The final extractor-only adjustment is covered by the final
  suite above; this broader suite was not rerun afterward.
- Real HTTP subprocess fixture, including 2,005 definitions in one file:
  complete-index search/catalog pages beyond the offline 2,000-node cap, source
  evidence, neighbors, stale revision HTTP 409, explicit refresh/delete,
  cross-origin/foreign Host refusal, request-size limit and closed refresh
  fields passed. Repeated after compressed persistence was introduced.
- `git diff --check`, JavaScript syntax and MCP shell syntax passed.
- Actual browser: full-index search, exact source inspection, direct relations,
  bounded impact and literal content matches with exact line/column evidence.

## Real repository snapshot

Observed before adding this validation document:

- Snapshot: `sha256:cb26f6d0d6b28bcdb592cd9f07a48449b6a8276a2750a72758d16d6c8fa77c86`
- 216 files, 2,468 nodes, 11,334 relations.
- Unresolved classifications: 15,520 builtin candidates, 3,252 external
  dependencies, 133 missing project definitions, 97 external IRIs, 22 ambiguous
  targets, 19 ambiguous owners, 2 missing document targets. These counts are
  coverage diagnostics, not proven source defects.
- Parse/scope diagnostics: 42 unsupported top-level forms, 9 unsupported require
  specifications; no extraction-failed entry in this observed snapshot.
- Component modularity v2: 50 connected components, 92 communities, 4 passes,
  converged, no edge-budget truncation; whole-network modularity 0.5174343434.
  This measurement is not a comparative clustering-quality benchmark.
- Private compressed state: approximately 8 MB on disk / 73 MB expanded EDN.
  No source text or index was uploaded.

Later explicit refresh changes the snapshot identity and may change these
counts. The browser/API show their admitted revision, independently of this
historical record.

## Unfinished delivery gate

The whole-suite attempt encountered filesystem ENOSPC, failing temporary Git
creation and CLI child-process startup. It was stopped after those failures;
a retry initially could not even create its output log. This is not a passing
whole-suite result. A scoped final rerun succeeded after capacity recovered.
Capacity varied sharply during the session. A read-only disk audit observed
near-full APFS Data capacity and approximately 9 GiB in the VM volume; no system,
Docker, repository or unrelated cache data was deleted to force a result.

The exact intended patch boundary is in `codegraph-change-manifest.md`.
Unrelated simulation-stack changes remain untouched. Commit/PR, native Amu,
full-suite/CI and release remain separate delivery actions.

## Mithril persistence follow-up

Saved dataset round trips cover named/default graphs, blank nodes, typed and
Japanese language literals. Revision fixtures verify full originals, deletion
history, canonical graph equality, separate OWL inference, no-op identity and
refusal after premise edits/missing files. Generic CLI output protects inputs
and refuses symlinks. The Japanese declared-claim CLI example writes a real
`natural-language-reasoned.mith` and infers `tama rdf:type Animal` in `inferred`.
The HTTP integration fixture also passes after persistence was added.

The whole-suite/native/CI gate above remains open; arbitrary prose semantic
extraction has not been implemented. Full repository OWL materialization has
not been run; small saved-premise reasoning is verified.

Final persistence regression: **59 tests, 421 assertions**, zero failures/errors
(compiler, Form, graph, codegraph, language, documents, RDF Form, generic reason).
Actual CodeGraph CLI demo: code plus Japanese text saved, then `reason` replayed
from the archive; `conforms`, zero violations/inconsistencies, result `.mith` saved.
