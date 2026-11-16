# Independent native ESM subpaths

Stage 37 qualifies explicit independent public entry roots in a separate v2
native ESM manifest. Root exports and root module initialization remain those
of the original index. Subpath modules and their real dependency closure must
be explicitly admitted; unused input still fails admission. An external host
cannot be an entry root. Source/module/AST/capability/export budgets are unchanged.

```clojure
(mithril/native-js-esm-entry-package
 :name "package.name" :imports []
 :modules [(rdf/node :name "package.index" :source "index.mith"
                    :dependencies [] :links [])
           (rdf/node :name "package.remote" :source "remote.mith"
                    :dependencies [] :links [])]
 :reexports ["package.index"] :subpath-roots ["package.remote"])
```

The returned `artifact-v2` metadata includes `subpath-files`, mapping admitted
source module identities to actual emitted filenames. The root remains
`index.mjs`. Publishers assign their package subpath specifiers explicitly;
this runtime compiler does not infer or write package exports. Declaration
programs, source-owned composition and the single declaration CLI accept the
checked v2 runtime graph without changing their own source-owner/type checks.

Independent original JavaScript controls compare root exports, shared function
and cache identity, behavior and a requested-entry exception. A throwing private
subpath does not run when the root is loaded. Actual emitted declarations and
runtime routes are installed into a real package. Ordinary strict NodeNext
checks three positive/two negative original-paired consumers with exact diagnostic
codes, including the separate empty entry. Both actual execution labels verify
exact emitted bytes, the single declaration CLI, published runtime identity and
pre-write unknown-entry refusal. Ten exact admission refusals preserve context,
source ownership, reachability and existing root budgets. A root publication alias
retains every original v1 artifact byte.

Both labels execute under Node. Browser-host behavior, complete generated LLM
remote typing, the third-party runtime-host composition contract, full Harness
API/plugin parity and System One performance remain separate qualification gates.
