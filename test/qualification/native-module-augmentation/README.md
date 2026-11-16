# Native module augmentation

Declaration modules may carry a finite optional `augmentations` vector. Each group
names an admitted internal module and public interface declarations. The checker
merges each interface into the target module's type table while retaining an
independent source lexical frame for its imported and private types/values. It
emits real `declare module` blocks through the admitted native file path map.
No AST name rewriting, TypeScript production parser or runtime facade is used.
Augmentation targets contribute dependency edges; newly introduced interfaces
are visible from the target and through reexports. Interface bodies retain the
existing arity/member/depth/node and merge/heritage checks. Source-local binding
visibility is separate from canonical defining scope and unique-symbol identity.

Groups are bounded by128 per source and256 total module/augmentation wrappers;
there are at most256 declarations per block and merged namespace. Unknown or
external targets, empty groups, noninterface declarations, hidden augmentation
interfaces, incompatible members/generics, unknown source types and cyclic
heritage refuse before output. Other augmentation declaration kinds remain
unsupported; all five pinned Cordis augmentation blocks contain interfaces.

The qualification admits the complete original Context class/interface and all
five original Events/Logger/Reflect/Registry/Fiber augmentation structures. The
native16-module graph exports the actual Context binding, with no constructor
facade. Nine emitted files contain three full selected Cordis modules (Context/Service/
Utils), five augmentation-only modules and a pure root barrel.
The Service/Utils declarations also link to the actual Context and index; their
14 original structures and Context static-to-computed symbol identity are checked.
A genuine native selector imports Context and Service and reexports the original
Context binding, keeping Service reachable without constructing a facade.
The exact Context module surface has two type names and one runtime value.
The qualification root additionally exposes Service as an erased type-only value
binding (three root types/two TS value bindings/one actual runtime value).
Both actual CLI targets run22 original-paired strict consumer groups plus eight
additional original-paired private-type/unique-symbol groups:60 logical groups.
TSC6.0.3 uses strict and full library checking. All source structures are compared
to hashed pinned originals; negative diagnostics must match. Twelve exact-code
admission cases cover target/shape/visibility/merge/scope/heritage/budget failures.
Real Context event, reflection, child/root identity and disposal behavior is
compared against the original runtime. Existing declaration/source/package
controls remain required. Both target runtime labels execute under Node.

Context computed symbols now reference admitted Mithril Utils and the actual
Context static symbols, rather than an external Utils symbol adapter. External
plugin/event/Fiber/Logger/Reflect/Registry types remain finite qualification
contracts resolved to pinned original modules. This verifies linked augmentation
of the genuine Context binding, not the complete independent nine-module Cordis
type graph. The two erased enums and full26-value index still need admission and
independent linkage. Complete Harness API/plugin/profile/Session/browser/native/
Q9 equivalence remains pending. Operator authored; no new System One inference,
repair/adoption or measured performance gain is claimed.
