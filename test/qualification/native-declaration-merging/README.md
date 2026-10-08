# Native declaration merging

Checked Mithril declarations now merge compatible class/interface, repeated
interface, function/namespace, class/namespace, alias/namespace and repeated
namespace groups. Ambient callable class/function groups and const/type-only
namespace groups are admitted. Type, value and namespace visibility are checked
independently; incompatible ownership, duplicate class/alias/const groups,
static collisions and conflicting members refuse. Generic headers retain the
same parameter names and compatible constraints/defaults. Extra merged parameters
require defaults; each source declaration keeps its own generic environment.

Repeated namespace blocks share exported symbols and keep private symbols in
separate lexical scopes identified by source position, including identical
block contents. Nested blocks see their own ancestors. Qualified public
names resolve the public binding even when a private same-name binding shadows
it locally. Class static queries and inheritance reconstruct the defining block,
so a different block cannot lend private/protected identity or redirect a base.
Combined interface members and heritage preserve existing256/32 limits; node,
depth, namespace, parameter and generic budgets remain unchanged. The emitter
preserves separate source declarations, overload order, genuine classes and
TypeScript namespaces, including explicit `export {}` visibility boundaries.

The qualification preserves40 declaration forms: all14 original Service/Utils
forms, all15 Logger forms apart from its erased enum and module augmentation,
complete Inject/InjectKey/Plugin groups including Runtime, complete CordisError
class/Code namespace and an explicit Context class/interface observation scope.
The observation adds two type aliases without a Context runtime substitute.
Original fixture hashes and all selected declaration structures are checked.
Strict TSC6.0.3 runs with full library checking on both actual CLI targets:
14positive/16negative paired original/candidate groups and19 additional groups
per target,98 logical groups total. Twenty-five malformed merge, visibility,
generic, private-scope, inheritance and budget inputs refuse with exact codes.
Consumer diagnostics must agree for paired negative cases. Getter access retains
TypeScript's read-only consumer behavior even when its merged interface uses a
writable property declaration.

The native root exposes19 genuine values from16 compiled Mithril modules.
A qualification selector reexports the actual Fiber CordisError and Registry
Inject bindings; identity and original-paired logger ownership, errors and Inject
normalization are checked. Its exact public surface has30 names/19 values/17
types. It does not replace the complete26-value original Cordis runtime root.
Existing source, package, complete original type baseline, class, interface and
CosmoKit checks remain in the same CI declaration suite.

Pinned external Context/Fiber/service imports, original symbol identities,
inline Disposable import and global Function adapters remain explicit. ContextProbe
is an observation wrapper, not standalone Context linkage. Full module imports,
augmentation identity and erased enums remain dependencies of the independent
Cordis type graph and full Harness parity. `js-browser` qualification runs under
Node, not an actual browser/native/Q9 client. Operator authored; zero new System
One inference, repair, adoption or measured performance gain is claimed.
