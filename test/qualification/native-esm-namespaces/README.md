# Native ESM namespace imports

ESM links may select `:export "*"` to emit a real `import * as local from
specifier`. Source modules retain the ordered dependency list and exact host
capability contract. Named and namespace imports may share one dependency;
multiple namespace aliases use the host's actual cached module namespace. A
namespace link selects the complete host namespace; an external contract's
`exports` inventory governs named selectors rather than hiding namespace members.
Ordinary single-file packages do not admit namespace links. Existing named ESM
artifacts retain their bytes and metadata.

Namespace values have canonical module origins, including external identities.
The compiler does not synthesize an object of exports, install a global resolver,
load a dependency during admission or delegate the candidate to the original
Harness. Host resolution, export descriptors, initialization and live bindings
remain engine-owned.

The runtime qualification executes both actual ESM CLI targets. It compares:

- ESM and CJS namespace identity, null prototype, non-extensibility, own keys and
  every descriptor field, including symbol keys and actual function references.
- Mixed named live bindings, repeated namespace aliases and dynamic import cache.
- Native strict namespace-property assignment refusal, CJS named snapshot versus
  mutable default object, and actual internal cyclic namespace imports.
- The original Include dependency, `js-yaml@4.2.0`, with parser, serializer,
  constructor/default identity and malformed-input diagnostics.

The complete npm package archive is fixed by the original snapshot's lockfile
SHA-512 integrity. It is checked before extraction into the qualification's fresh
private output directory. No npm script executes. The archive is a host dependency
fixture, not a copy of original Include/Loader implementation. Its license is
included both in the archive and beside the fixture. Admission does not fetch it.

Strict TypeScript 6.0.3 consumer programs compare an original ESM facade and the
Mithril-generated `typeof ns` facade on both CLI targets. Two accepted and four
refused consumers preserve named/default types, original alias assignability,
call arity and absent-export refusal. TypeScript accepts property assignment
through a `typeof ns` value alias even though the runtime namespace refuses it;
the qualification preserves this original static/runtime distinction. TypeScript
is an independent oracle, never the candidate compiler.

Both target labels execute under Node. Actual browser testing, the complete
Loader/Include runtime/type closure and full Harness parity remain separate work.
