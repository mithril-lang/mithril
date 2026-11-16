# Explicit external modules in native ESM

The native ESM manifest may declare `externals` with a qualified `name`, bounded
bare-package or `node:` `specifier`, and explicit `exports`. Source modules list
these identities in their ordered `dependencies` and use ordinary named `links`.
Only Mithril source modules may own entry roots. External modules do not consume
artifact filenames. Absent or empty external declarations preserve the previous
artifact contract.

Admission checks the inert contract without loading dependencies, discovering
exports or fetching packages. At execution, the host ESM engine resolves the
specifier and validates the actual export. These imports are host capabilities;
this profile is not an execution sandbox. Namespace imports remain separate work.

Bounds are 64 external declarations, 128 exports per declaration and 512
characters per specifier. Relative/file/URL specifiers, duplicate declarations,
source identity collisions, unreachable declarations and unmatched host grants
are refused. Generated local imports remain accepted by the original three-argument
compiler API; external paths require the explicit fourth argument.

`test/mithril/native_esm_externals_test.cljk` checks malformed contracts, byte
preservation and both actual CLI targets. The complete pinned Loader `internal.ts`
runtime is expressed in Mithril, imports real `createRequire` from `node:module`,
and is compared with the original erased source with and without Node internals.
The candidate neither imports original source nor installs a global resolver.
Provenance and upstream license are in `test/fixtures/native-esm-externals`.

The declaration qualification executes both ESM and declaration-program CLIs.
An external identity sorting before the source module catches runtime/declaration
filename drift. A real temporary package proves default identity, named live
bindings and shared module cache. Strict TypeScript 6.0.3 programs compare the
native and original ESM facades for a positive consumer and four refusals: wrong
named/default types, wrong call arity and assignment to an imported binding.
Runtime/declaration external specifier mismatch is refused. TypeScript is an
independent consumer checker, not part of native compilation.

Both `js` and `js-browser` artifacts execute under Node in this qualification.
Actual browser behavior, the complete Loader/Include closure and full Harness
API/plugin/profile/Session equivalence remain separate requirements.

The source suite now allows 300 seconds for the expanded actual CLI cases. An
initial full local run exceeded the previous 120-second aggregate limit; admission
and runtime assertions are unchanged. Each child CLI remains independently bounded.
