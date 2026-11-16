# Checked optional and variadic tuples

The Mithril declaration checker admits tuple-only optional/rest wrappers and named
rest items. Direct array rests and explicit fixed tuple spreads carry enclosing
optional/array-rest ordering constraints. Generic spreads remain distinct from
unbounded arrays. Existing collection, depth, scope and arity limits still apply.
Ordinary/named tuple output remains unchanged. No raw TypeScript input is admitted.

The hashed original Schemastery source supplies its actual TupleS/T templates.
Explicit identity TypeS/TypeT helpers observe tuple mechanics independently of the
remaining Schema graph. TypeScript 6.0.3 checks strict consumers with skipLibCheck:false:
18 positive and 16 negative original-paired groups for each combination of program/
legacy declaration profiles and js/js-browser CLI targets, 136 logical groups total.
All targets execute in Node. The checker also passes 23 exact-code refusals covering
shape, scope, direct rest syntax, hidden fixed-spread ordering, collection and depth.

The example exposes 13 type aliases and zero runtime values beside the actual checked
empty native ESM fixture. Original fixtures are qualification oracles only. Rest
admission validates structured syntax, names and arity; it does not prove arbitrary
alias/generic/index/conditional types are array-like. Independent strict TypeScript
consumer qualification remains required.

This resolves a tuple prerequisite only. Complete Schemastery typing/runtime,
const generics, global namespace/default Schema and full Harness API/plugin/profile/
Session/browser/native/Q9 equivalence remain pending. Operator authored: zero new
System One inference, adoption or measured gain.

Run the full `scripts/test-native-declarations.mjs` qualification with the pinned
engine, TypeScript and type roots. Child compiler calls use explicit offline config.
