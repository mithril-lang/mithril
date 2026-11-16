# Explicit native ambient imports

Native modules may opt selected existing `imports` into `ambient_imports`.
Those references emit native free identifiers, so callbacks reconstructed by
`new Function` resolve the current realm's globals, including ordinary getter
order, rebinding and missing-binding ReferenceError behavior. Other imports keep
the existing lazy injected-grant semantics. No source evaluation, helper that
reconstructs a lost closure, or runtime callback-string rewriting is added.

The selection must be a bounded unique vector of declared nonreserved identifiers.
Named function/class self bindings and module declarations cannot shadow selected
ambient imports. An ambient name cannot also be a linked dependency. Native
package manifests still require the complete declared unlinked capability set;
artifacts additionally disclose `required-ambient-imports`. Standalone factories
require exact keys only for the remaining injected grants. Explicit package
factories keep their root capability contract. Native targets execute host code;
this feature is not added to the restricted guest context.

Compiler-owned bindings avoid selected ambient names. Public factory names retain
native function metadata through a computed property and export alias when their
name would otherwise shadow a selected global. Modules without ambient imports,
including an explicit empty vector, retain their original artifacts.

The registered source suite contains 72 tests / 279 assertions. The new tests
cover standalone and multi-file ESM CLI outputs, the single-file package library
CLI and explicit package factories. Both target labels execute in Node. A native
JavaScript oracle compares real callback `toString` / `new Function` round-trips,
live Date/isNaN getter order and rebinding, deleted Date references, compiler-prefix
and public-factory-name collisions, and injected closures that remain lost after
serialization. Unknown, duplicate, reserved, excessive and relinked selections,
self-name collisions and guest context are refused.

This removes the observed serialized Date/isNaN dependency of the full Schema
source. Separate source CLI qualification passes the prior 22 finite Schema
runtime groups on each target with genuine compiled Mithril CosmoKit. Complete
Schema value/type/default SDK integration, user/private closure fidelity, Loader
and Include, whole Harness API/plugin/profile/Session and browser/native/Q9 remain
separate requirements. No System One model gain is implied.
