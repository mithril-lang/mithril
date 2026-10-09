# Declaration symbol spaces and runtime-owned private modules

Declaration program reexport tables admit up to 128 symbols in each TypeScript
symbol space: types, values, and namespaces. A class or erased const enum is
charged in every space it occupies. Distinct names across spaces may exceed 128;
the combined table remains bounded by 384 names. Existing collection, source,
module, AST node, depth, graph round, runtime export and process limits remain.

Private declaration modules may be reached through the actual checked runtime
module order as well as through declaration imports, reexports, augmentations
and inline imports. The checked ESM graph already establishes reachability from
real package roots, including empty public surfaces and side-effect imports.
Unknown runtime owners, unrelated type-only modules, invalid private types,
surface mismatches and binding origin mismatches are still refused. This does
not implement multi-package declaration composition or external type owners.

The controls use real checked Mithril runtime graphs. They cover 127/128
admissions and 129 exact budget refusals independently in each space, 192 mixed
names, 128/129 dual-space erased const enums, private runtime dependencies,
empty export roots, unknown owners, unrelated declarations and private type
validation: ten admissions and seven exact-code refusals.

Both actual `js` and `js-browser` CLIs produce exact independently checked
runtime and declaration artifacts. Independent TypeScript 6.0.3 declarations
verify all 192 names with four positive and four negative strict consumers,
including type-only value queries. Internal 64-function behavior and empty
public runtime exports are verified under Node. Over-budget CLI admission
refuses before creating an output directory. Both labels execute under Node;
these controls do not establish browser execution or full LLM SDK parity.
