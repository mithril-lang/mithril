# Mithril TodoMVC comparison implementation

Serve this directory over HTTP; no compilation is required for the exported browser app. The existing Mithril/Jev harness emits typed completion-toggle and unfinished-count ASTs under logic.json and retained CLJK under sources/. core.js interprets that bounded AST. UI, editing, bulk completion, deletion, hash routing and localStorage are plain host JavaScript, not additional Jev-generated code. policy.wasm digest is verified at startup; it is not used for every UI operation in this standard comparison mode.

The DOM and unchanged official TodoMVC common/app CSS follow https://github.com/tastejs/todomvc/blob/master/app-spec.md. TodoMVC CSS/common packages are pinned in package.json with MIT notices in LICENSE.todomvc. Mithril starter is Apache-2.0; the retained policy artifact license is LICENSE.mithril-policy.

Persistence uses todos-mithril with id/title/completed. Previously saved Mithril sample tasks are migrated once when this key is absent; the old key is retained. New profiles start empty. Editing state is never persisted. Official submission, all-browser support and Speedometer upstream inclusion are not implied by local conformance tests. Runtime measurements must name the benchmark/workload and environment.
