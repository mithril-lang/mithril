# Native Scope public root SDK

The complete original two-file Scope declaration graph from pinned Harness
commit `441416c0048aa4281bffe59c1c7b5e13e08a9ec1` is expressed as inert
Mithril declarations. All 19 original declarations are compared structurally,
including every private member, class `implements` clause, generic constraint,
predicate, computed unique-symbol brand and all four private `readonly` fields.
Only parentheses, identifier/string member spelling and redundant top-level
`declare`/`export` modifiers are normalized. Readonly modifiers are preserved.
The original strict TypeScript emission has zero diagnostics; its sources and
result hashes are retained. TypeScript is an authoring/oracle tool only.

The declaration AST now permits an optional boolean `readonly` on an opaque
named private class member. Eleven exact-code refusals retain the original
private/named restriction, reject malformed flags and extra fields, and protect
the old absent/false output. Static readonly modifier ordering is also checked.

The genuine Scope source cycle imports the full own Cordis root so its public
Context and disposer types retain canonical owners. This SDK contains 18 own
runtime and 13 declaration modules, exactly 11 public values and nine types.
Each actual CLI label must reproduce every checked artifact byte, pass all 21
unchanged upstream runtime groups, and pass independent original/candidate strict
programs with 10 positive/18 negative consumer groups and exact diagnostic codes.
Negative consumers cover invalid arguments, forged opaque carriers, hidden
subject properties, generic constraints, private members and readonly global
state. Public type/value/namespace symbol spaces must match.

Real NodeNext package self-reference adds one positive/four exact-code negative
consumers without virtual resolution and executes the actual bare package under
Node. The package's `types` points to the actual checked Scope index declaration
module, as the original package does. The generic compiler entry barrel has the
same public surface and ordinary diagnostics but emits diagnostic 2305 for an
attempt to import private `ScopedBrand`; the actual source entry preserves the
original diagnostic 2459. Both are checked explicitly. Private symbols are never
exported or widened to make a consumer pass. Cordis's package adapter only
re-exports actual own files, with no duplicate class declarations. Filesystem
paths are canonicalized before standard package resolution so macOS's `/var`
alias does not create two unique-symbol owners.

This qualifies the public root under the tested ESM/Node contracts. Development
source wildcard subpaths, publication, real browser/native/Q9 execution and the
complete Harness migration remain pending. The port is operator authored and
does not constitute a System One model trial.
