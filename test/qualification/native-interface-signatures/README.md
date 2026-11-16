# Native interface heritage and signatures

The original Cordis type graph needs inherited interfaces, callable/constructable
Plugin interfaces, computed keys, Context dispatch overloads and explicit receiver
parameters before class/interface/namespace merging can preserve those contracts.
These are checked inert Mithril declaration forms, not constructor facade or any
substitutions and not production TypeScript parsing or source delegation.

An interface optionally adds an exact `extends` vector of at most32 declared
named types. Omission preserves the old declaration AST and emitted bytes.
Heritage checks resolve scope/arity, reject type-parameter bases and cycles,
including interface/class paths, and bound depth64. Cached heights preserve the
same bound when previously visited ancestors are reused. Object/interface members
now admit exact `computed-property`, `computed-method`, `call` and `construct`
forms alongside old properties/methods. Computed names resolve declared values;
no arbitrary expression or raw name interpolation is accepted. Same-key method,
call and construct overloads retain order and require consistent kind/optional
flags; property and mixed member collisions refuse. Existing member256,
parameter64, generic32, node16384 and depth64 budgets remain in force.

The existing signature parameter shape admits the literal name `this` only as a
first, required, non-rest receiver outside constructor signatures. It retains
conditional infer bindings and own-parameter predicates. Other reserved names,
constructor receivers, duplicate/late/optional/rest receivers and borrowed query
scope refuse. Emission keeps genuine TypeScript interface heritage, anonymous
call/construct signatures, computed keys and receiver/overload syntax.

`native-js-cordis-interface-contracts.mith` preserves seven complete original
Events leaves, two complete Inject aliases, five complete Plugin interfaces and
all12 methods in the original Context events augmentation. The latter body is
exposed as the explicit observation interface `DispatchContract`; it is not a
compiled module augmentation. The Plugin namespace intentionally selects those
five interface declarations; its Runtime interface and root Plugin alias are
pending the type graph and declaration merging. The native `cordis.leaves` root
has zero runtime exports and contains only an empty module for type-only
qualification. It does not replace the complete26-value Cordis runtime root.

The oracle pins original fixture hashes and compares all selected declaration
structures, normalizing only name quoting, parentheses, explicit exports and the
DispatchContract observation name/selected namespace scope. Both actual native
declaration CLI targets run strict TSC6.0.3 with full library checking:
13positive/13negative original-paired consumer groups plus9 additional signature
groups per target,70 logical groups total, exact11 public names/zero runtime
values. Cases cover inherited optional fields, receiver inference/parameter
exclusion/calls, event dispatch/listener overloads, plugin function/class/object
configuration, inherited metadata, mapped dependency config and computed service
keys. Negative groups must fail with the same original diagnostic codes.
Additional groups cover anonymous call/construct and computed-method overloads,
computed interface properties and actual receiver-predicate narrowing.
Twenty-seven malformed/scope/receiver/overload/heritage/budget inputs refuse with
exact Mithril error codes. The existing complete original type oracle, class
contracts, full CosmoKit declaration bytes and source/package controls remain.

Imports for Context/Fiber/FiberState/Service/symbols/Dict/Promisify/StandardSchemaV1
are shared pinned external qualification adapters. In particular, original symbol
identity is supplied explicitly; this does not establish independently linked
Mithril Context/Service symbol identity or a standalone usable full Cordis type
graph. Class/interface/namespace merging, full module imports/type-only exports,
augmentation identities and erased enums remain dependencies. Type checks for
the `js-browser` target are Node-run compiler checks, not actual browser/native/Q9
execution. Operator authored; zero new System One inference, repair, adopted
model changes or performance gain claims.
