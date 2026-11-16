# Native module operations

`mithril/host-import-meta` has no operands and emits genuine `import.meta`.
`mithril/host-dynamic-import` requires a checked `source` expression and optionally
accepts one checked `options` expression. It emits `import(source[, options])`
directly, without a Promise wrapper, injected resolver, URL replacement or eval.
Operands share existing scope, depth and node budgets; unknown fields and malformed
operands are refused before output. These operations belong to the trusted native
JS profile. The restricted guest context remains separate and refuses this source.

All native outputs are ECMAScript modules. Metadata is owned by the actual emitted
module, including inside its nested functions and package factories. A single-file
bundle has that bundle's metadata; a multi-file ESM leaf has its own emitted URL.
Dynamic imports use the host's actual module resolution, loading, attributes,
namespace identity/cache and Promise behavior. They do not become static links in
Mithril's checked dependency graph or imply an extra sandbox around the native
profile. No runtime import capability is borrowed from the restricted guest.

The independent JavaScript oracle and candidate execute under Node. Both `js` and
`js-browser` CLI artifacts are tested for standalone factory, multi-file ESM,
package library and explicit package factory output. Checks cover actual module
URL and resolve, metadata identity/null prototype/descriptors, relative imports,
module cache and live namespace bindings, top-level await, source coercion and
attribute getter order, exact thrown-object rejection identity, missing-module /
invalid-operand failures, JSON attributes and the original SyntaxError when a
serialized import.meta callback is restored with Function.

Seven malformed/scope cases, the existing depth bound and guest-context refusal
are tested independently. Old source artifacts and admission constraints remain
covered by the full native suite and frozen package contract. These tests establish
Node execution for both target labels, not actual browser/native-Harness parity.

Loader's original `createRequire(import.meta.url)` and Loader/Include's dynamic
imports motivate this source feature. Porting those modules, their native Node
internal loader contracts and the whole Harness remains separate work.
