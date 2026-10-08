# Native JS host module qualification

The checked native-js-module context implements host imports, property access,
value calls, reference/method calls, native arrays and anonymous native arrow
closures with array binding patterns. Bodies are emitted from inert Mithril
expressions. There is no import of the original TS mapValues implementation and
no whole-function host intrinsic. The actual candidate lives in
examples/native-js-map-values.mith; its generated JS is 906 bytes.

This is an explicit native JS backend, separate from the restricted Amu guest
word profile. Native host calls need native receivers, iterator-close behavior,
anonymous nonconstructible callbacks and native lexical lifetime, which the
bounded guest word ABI does not promise. Its runtime uses native JS allocation,
GC and stack behavior, not a reset/disabled guest fuel ledger. Exact named host
grants are required at installation; imports are read live at each expression.
For JS global binding behavior the host provider is
`{get Object(){return globalThis.Object;}}`, not a cached Object reference.
Host operations inspect only properties explicitly named in the source; opaque
arguments, results and thrown values have no codec/protocol inspection.
Granted objects carry native prototype/constructor authority. This trusted host
interop profile is not a sandbox for untrusted guest source. The existing guest
context/compiler continues to refuse these native expressions.

The retained module suite runs 74 tests / 391 assertions (65 / 351 retained plus
9 / 40 added) in frozen offline Node 24.21.0 with read-only source mounts, a
nonprivileged user and shadowed JVM launchers; no marker is written. Cases cover
undeclared imports, invalid exports/locals/fields/types, structural budgets,
JSON/source injection, generated name collisions, own __proto__ export keys,
exact grant sets, live providers, native function/arrow metadata and value versus
method receivers. One closure instance supports 100,000 opaque capture calls,
deferred calls and reentrant calls; six thrown values retain exact identity,
including NaN and a stack-like RangeError. Opaque Proxy reads remain zero in
that dedicated capture fixture. Counts are finite qualification, not benchmarks
or a claim that every possible native lifetime behavior was tested.

The same maintained 24-case verifier body runs against the actual transpiled
CosmoKit baseline and the actual generated Mithril candidate. Both pass, including
getter/Proxy event order, dynamically replaced builtins and map/fromEntries,
callback name/arity/nonconstructibility, destructuring iterator close before the
transform, close-error identity, opaque keys and nonawaited promises, constructor
calls and 2,000 repeated calls. The baseline bytes and upstream source hash are
recorded, with upstream MIT license retained. The isolated mapValues/valueMap
exports are qualified; the full CosmoKit package remains unported.

The dedicated CLI requires an explicit --target and --output. js/js-browser
emit identical source. cljs/wasm32-browser/x86_64 exit 65 before output creation;
missing target exits 64. js-browser is executed by Node, not an actual browser.
This route does not run Amu, verified native Kotoba or native selfhost, and cannot
satisfy whole-component Q9 acceptance. Module linking, remaining CosmoKit exports,
Cordis/plugin lifecycle and the full 341-package harness migration remain open.
No System One model attempt or score is claimed. Local initial retained setup
missed json-ld-api on its classpath; the qualified run uses the fixed dependency
image, not that failed setup. The new native-js-source workflow uses pinned engine 829f0ba1, Node24.21.0 and
import-meta-resolve4.1.0, with install scripts disabled and a closed classpath.
Its strict runner covers 9 tests / 40 assertions and the paired runtime cases.
The retained65/351 suite remains local frozen-image evidence. Exact-head CI and
publication are separate pending gates.

Fresh published baseline 643af runs the unchanged 65 tests / 351 assertions in
the same frozen image. An additional paired case replaces the live global
Object binding during fromEntries lookup, preserving the captured original
receiver while entries uses the replacement binding. An operator-only mutated
artifact replaces the native arrow with an ordinary constructible function;
the same verifier refuses with AssertionError and exit 1. Product source is
unmodified by that negative control. Neither observation is a model score.
