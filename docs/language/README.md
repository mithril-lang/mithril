# Mithril language reference

This is the public-facing reference for Mithril source syntax and execution
architecture. It is a living draft and follows the implementation on the
repository's default branch. Mithril Form is its own source representation;
it is distinct from, and mutually convertible with, JSON-LD 1.1 under the
pinned context. This is separate from the Mithril Dataset format specification.

- [Language reference site source](../../site/lang.mithril.fund/index.html)
- [Form surface grammar](../../site/lang.mithril.fund/grammar.ebnf)
- [Mithril compiler and language kernel](../../README.md#mithrils-own-language-kernel-and-code-graph)
- [Form reader implementation](../../src/mithril/form.cljk)
- [Kotoba and Amu architecture](../../README.md#semantic-core-and-execution-core)

The intended public URL is `https://lang.mithril.fund/`. Publishing that host
requires its own approved static publisher and domain binding; this source tree
does not imply that the host is live.

## S-form canonical spec §7 (approved package)

Design: the Kotoba kir S-form grammar is the canonical authority for the
language surface; the EDN catalog is an implementation artifact (a pinned,
machine-checked mirror of the EBNF, never the spec itself). The grammar is
[`grammar.ebnf`](../../site/lang.mithril.fund/grammar.ebnf). Owner-approved
recommendations below; IR stays `mithril.ir/v1` (additive-only, no bump).

### Data-profile reader conditionals (opt-in, data profile only)

`#?`/`#?@` are admitted only in the data profile, only with the
`(mithril/form:v1)` marker and an explicit feature set
(`{:features #{:mithril :js :rust :py :kotoba}}` via `form/parse-with-meta`);
first matching clause wins with `:default` as the final clause
(`:default` may also carry other keywords). Resolution happens at read time;
backends never re-read source. The native (Amu) profile refuses them by name
(`:mithril.form/reader-cond`); `lower-native-*` inherits that refusal.
Per-target digests are valid receipts: one source may expand to one digest
per target.

### `:sum` spelling and encoding

`[:sum Name Case…]` is code-profile sugar over the variant descriptor
(`variant-new`/`variant-match`); the two spellings share one Definition
CID (the CID is over checked typed IR, so the sugar itself never moves a
CID). In the JSON-LD module tier the type is spelled as a map
(mirroring `FunctionType`):
`{"@type":"SumType","name":"Outcome","cases":["ok","err"]}`; construction
is `{"@type":"EnumCase","sum":<SumType>,"case":"ok"}` (lowers to
`(variant-new :Outcome :ok)`); matching is `{"@type":"VariantMatch",
"scrutinee":E,"cases":[{"case":"ok","body":E}…],"default":E?}` (lowers to
an `if`/`variant-tag` chain — `variant-new`/`variant-match`/`variant-tag`
are the IR-side spelling of the v1 `EnumCase` node). Unknown cases,
duplicate cases, and non-exhaustive matches (no default, cases not covering
the sum) are refused. Native Amu and public-library profiles refuse sums
(scalar-only vocabulary); the pure code profile carries them end to end.

### Identity: Definition CID for code, graph digest for data

Two identities, scoped: data (ontology blocks, data-profile files) keeps
the `sha256:` canonical-RDF graph digest; each code definition takes a
Definition CID (`sha256:` over the checked typed IR of the definition —
parse shape, desugars, types; never source bytes or trivia). Receipts
(`emit-transaction`) carry both side by side — `:graph-digest` for the data
tier, `:definition-cids` (`{:name … :cid …}` per definition) for the code
tier. No unlabeled hash field means one thing on one side and the other on
the other. Checked modules and their lowerings expose `:definition-cids`;
digests of existing data files are untouched.

### Pure-core posture

The guest surface (`defn`/`call`, profile-6 Amu Kotoba) is the code
profile now. The pure-form `(lam …)`/`(app …)`/`(ref "…")` core is
prospective: `defn`/`call` count as sugar with a known desugar contract,
so a future re-spelling is mechanical, not a semantic break. Nothing in
this package changes the pure core; desugar rules land with the
code-profile reader work.

### `host-*` endgame

`host-*` typed tags are the legacy FFI surface. The endgame is capability
lowering: each `host-*` expression becomes a capability-typed `defn`
wrapper (one line per import, via `cap-call` / `typed-cap-call` over a
declared `:capabilities` list — the guest-grammar vocabulary), and the
restricted-JS profile is named for that capability boundary. FFI stays an
IR/backend concern (the IR `HostImport`/`HostMethod` nodes are its
direct surface); it never becomes a source form. This package only records
the direction; the per-tag migration is mechanical and out of scope here.
