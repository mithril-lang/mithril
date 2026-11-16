# Native source numeric literals

A `mithril/literal` with `:datatype "js-value"` accepts a finite scalar JavaScript
number in Mithril form source. Other fields retain the existing inert form rules;
the native backend still checks module context, node shape and datatype. No new
host import, source evaluator or runtime helper is introduced.

`examples/native-js-numeric-literals.mith` is compiled through the actual standalone
CLI for both `js` and `js-browser`. Each output executes under Node with exact
`Object.is` comparisons for `0.01`, floating negative zero, exponent notation,
`Number.MAX_VALUE`, `Number.MIN_VALUE` and a negative decimal. The fixture uses
`-0.0` and `-0e0`: the existing EDN reader normalizes integer `-0` to zero, while
floating notation preserves its sign. Native emission retains negative zero
instead of losing it through JSON serialization.

The source suite also rejects positive/negative overflow, fractional i64/u32,
fractions in general and RDF fields, nested fractional vectors, and a guest
module's opaque js-value literal. Existing deterministic package/leaf artifacts
and strict declaration contracts remain separate regression gates.

Run `node scripts/test-native-js.mjs --engine <pinned nbb cli.js>`: the registered
suite now has 69 tests and 248 assertions. Both target outputs execute in Node;
this is not browser-host certification, whole Schema equivalence or full Harness
API/plugin/profile/Session/native/Q9 qualification. In particular, serialized
Schema callbacks reconstructing built-in references still require independent
qualification and repair.
