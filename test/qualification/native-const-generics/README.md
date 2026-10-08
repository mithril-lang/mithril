# Checked const generic parameters

Eligible signature and class parameter forms now accept an optional boolean `const`
field. Functions, methods (including computed/static), call/construct signatures,
function/constructor types and classes preserve const modifiers in emitted declarations.
Type alias/interface parameters retain their exact previous fields and refuse the
const field, even when false. Class variance remains independently checked. Existing
arity, default ordering, name/scope and collection/depth controls remain in force.
Missing or false const flags emit the previous bytes, verified by the focused control.

The hashed original Schemastery source contributes all four actual Static signatures:
const, tuple, union and intersect. Complete source syntax fingerprints compare their
const modifiers, constraints, parameters and returns. Explicit Schema input/output
and identity TypeS/TypeT/IntersectS/IntersectT helpers observe generic inference; these
are qualification helpers, not the original complete Schema semantics. Actual original
TupleS/T structures are retained as checked Mithril declarations.

TypeScript 6.0.3 strict consumers with skipLibCheck:false compare 30 positive and23
negative logical groups for each program/legacy profile and js/js-browser CLI target,
212 original-paired groups total. All execute in Node. Calls are assigned to intermediate
variables before key literal/default comparisons, avoiding contextual return inference
that could hide a missing const modifier. Readonly literal/object/tuple inference,
mutable tuple constraints, explicit generic overrides, plain/false-flag widening,
default/dependent parameters, callable/constructable/computed forms, class variance,
class/interface merging and private function/class declaration queries are exercised.
Sixteen exact-code refusals cover invalid contexts/flags/fields/defaults/scope/names/
variance/collection. The example exposes21 types and zero runtime values beside an
actual checked empty native ESM fixture; private declarations supply type metadata only.

This resolves a const-generic prerequisite. Global namespace/default Schema, complete
Schemastery declaration/runtime behavior and Harness API/plugin/profile/Session,
actual browser/native/Q9 equivalence remain pending. Operator authored: zero new
System One inference, adoption or measured gain. Independent TypeScript remains a
qualification tool, not a production compilation dependency. No raw TS/JS delegation.

Run the full `scripts/test-native-declarations.mjs` with pinned engine/TypeScript/type
roots. Every child compiler uses explicit offline config and preserves launcher guards.
