# Intended local change boundary

2026-10-08. The checkout also contains unrelated simulation-stack work. This
manifest makes the codegraph/language work reviewable without staging or
modifying that work. No commit or publication is asserted.

## New files belonging to this work

- `src/mithril/codegraph*` — contract, extraction, documents, incremental index,
  communities, filesystem, CLI, MCP, offline UI and loopback web adapters.
- `src/mithril/language.cljk`, `src/mithril/language.mith` — language kernel admission
  and execution trace adapters on the existing Amu host.
- `ontology/codegraph-v1.mith`, `ontology/language-v1.mith`.
- `lib/codegraph/operations-v1.mith`, `lib/mithril/bootstrap-v1.mith`.
- `resources/codegraph/*` — standalone offline and complete-index local UI.
- `bin/mithril-codegraph.cljk`, `scripts/codegraph-mcp.sh`, `scripts/run-sci.mjs`,
  `scripts/test-codegraph-web.mjs`.
- `test/mithril/codegraph_test.cljk`, `test/mithril/codegraph_documents_test.cljk`,
  `test/mithril/language_test.cljk`, `test/run_codegraph.cljk`.
- `src/mithril/rdf_form.cljk`, `src/mithril/rdf_form_fs.cljs`,
  `test/mithril/rdf_form_test.cljk`, `examples/codegraph/natural-language*.mith`.
- `docs/design/codegraph-*.md` — design, work map, boundary and validation.

## Intended hunks in existing files

- `.gitignore`: private `.mithril-codegraph/` state.
- `README.md`: final “Mithril's own language kernel and code graph” section.
- `bin/mithril.cljk`: kernel admission/compile trace routes and codegraph delegation.
- `src/mithril/compiler.cljk`: closed compiler-stage fact signatures/host adapters.
- `src/mithril/form.cljk`: language/codegraph contract forms and inert RDF dataset forms.
- `src/mithril/reason.cljk`, `src/mithril/reason_cli.cljk`: saved Mithril input/output.
- `test/run.cljk`: register the new test namespaces.

Review these hunks individually; a whole-file stage of README is not this
manifest's boundary.

## Explicitly excluded

`examples/stacks/{aws,azure,google,aws-ledger}.mith`,
`src/mithril/{stack,twin_sim}.cljk`,
`test/mithril/{stack_test,twin_sim_test}.cljk`, and prior README hunks outside the
language/codegraph section. These existing changes are preserved untouched.

Mission/interop files appearing from other work are also excluded from this boundary.
