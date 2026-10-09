# Source-owned declaration composition

Stage 35 admits a bounded set of complete native ESM runtime packages and
complete Mithril declaration programs before emitting declarations into separate
owner directories. Actual published producer entries bind external runtime
imports; declarations resolve cross-owner imports through those exact entries.
Bodies and private class declarations stay in their source owner's package.
No TypeScript declaration input, runtime facade or arity-only type contract is
used to admit a producer.

The independent fixture installs three packages and chains two producers. Named
and default function exports retain the original runtime reference through a
producer root with no direct runtime module, a differently named external
binding and a consumer. Ordinary strict NodeNext resolution admits the positive
consumer and returns exactly TS2345 for the negative consumer. Six independently
written JavaScript observations compare behavior. Standalone producer `.d.mts`
bytes match the existing declaration-program compiler exactly. An additional
source-backed empty subpath probe verifies that its runtime route admits a real
side-effect import while retaining its complete type declarations.

Twenty-one exact admission refusals cover traversal, versions, entry identities,
unknown/unbound/unpublished entries, duplicate owners/programs, missing/extra
sources, foreign runtime owners, mismatched source identities and aggregate
limits. Both CLI execution labels additionally verify exact artifact bytes,
pre-write graph and symlink refusals, and preservation of an existing output
sentinel. Both labels execute under Node; they do not prove browser behavior.

## Input contract

```clojure
(mithril/native-js-declaration-composition
 :name "consumer.package"
 :consumer-program "consumer-program.mith"
 :consumer-package "@probe/consumer"
 :consumer-version "1.2.3"
 :consumer-entries [(rdf/node :module "consumer.types" :specifier "@probe/consumer")]
 :producers [(rdf/node :package "@probe/base" :version "1.0.0"
              :program "base-program.mith"
              :entries [(rdf/node :module "base.root" :specifier "@probe/base")])])
```

All program, runtime-manifest and leaf sources are distinct local `.mith`
basenames. Every runtime package is first checked by the existing native ESM
compiler. Every declaration's explicit runtime module belongs to its own
package. Published entry specifiers must use their owner's exact bare package
identity or its subpaths. Multiple published specifiers may alias the same
source document and runtime body. The first specifier is its canonical emitted
cross-owner declaration import; repeated specifiers are refused. A complete declaration module must be supplied for
cross-owner types; external arity metadata is refused. Versions are explicit
source metadata, not a remote registry verification or package publication.
One package identity has one owner/version within a composition.

Admission derives root binding references from the actual checked ESM exports.
It validates each producer's complete root surface and binding origins, and
requires every cross-owner declaration reference to use a published entry.
Source declarations are emitted once per owner. The returned `packages` metadata
contains exact declaration and runtime filenames for each requested entry;
`runtime: null` denotes an entry without an admitted runtime route. A publisher
must use these routes and the corresponding independently emitted native ESM
artifact. This CLI emits declarations, not `package.json` or runtime bodies.

Limits are one consumer plus 1–8 producers, 64 aggregate runtime source modules,
64 declaration modules, 64 published entries per package, 2 Mi characters of
runtime source, 1 Mi characters of declaration source and 4 Mi characters of
all input source. Existing per-package/per-leaf, declaration AST and 128 symbols
per-space limits still apply. Output is limited to 73 declaration files and
8 Mi characters. CLI reads require regular non-symlink files of at most 1 MiB.
Whole graph admission precedes output creation; only a newly created output is
cleaned up after a write failure.

```sh
node /path/to/nbb/cli.js --config offline.edn -cp src \
  bin/mithril-native-declaration-composition.cljk composition.mith \
  --target js --output-directory new-types
```

The complete Core/LLM probe is separate evidence: actual Core 30 and LLM/Schema
14 runtime modules, 42 declaration documents, 146 public names (92 types and 66
values), strict NodeNext with zero errors, 12 positive/15 negative original-paired
consumer groups and 2 same-owner/2 different-version checks. Its operator-authored
inputs and receipts remain in the local evaluation workspace. This fixture does
not qualify every original LLM subpath, generated host/client API, streaming,
cancellation, Session/Harness parity or System One inference performance.
