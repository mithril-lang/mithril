# Native property compound assignment

`mithril/host-compound-assign` accepts checked `object`, `key`, `value` operands
and exactly twelve arithmetic, shift and bitwise assignment operators: `+=`,
`-=`, `*=`, `/=`, `%=`, `**=`, `<<=`, `>>=`, `>>>=`, `&=`, `|=`, `^=`.
The emitter produces the actual JavaScript property reference expression. The
engine owns evaluation order, property-key conversion, getter/setter receiver,
numeric/string/BigInt coercion, strict failures and suspension. No repeated
reference expansion, helper evaluator or runtime source delegation is used.

Three source tests cover closed shape/operator/local/import/context/budget
admission, actual output preservation on CLI refusal, and whole original Loader
`config/tree.ts` admission. The pinned original source and upstream license are
in `test/fixtures/loader-tree`. This removes the actual CLI refusal at original
line 120 (`info.offset += 3`) and preserves both original dynamic imports.
Whole Loader SCC runtime, public types and Include remain pending.

The independent operation fixture runs 208 groups for each of four output forms
and two actual target labels (1664 paired groups). It compares all twelve
operators with original JavaScript expressions, including string/numeric/BigInt
values, NaN/negative zero, computed keys, proxy/accessor traces, thrown identity,
strict failures and retained references across await/yield. Rejection and
generator throw paths do not perform the assignment. Both target labels execute
under Node; actual browser/native/Q9 qualification remains separate.

The existing package suite checks seven frozen prior artifacts, and all seventeen
declaration stages remain required. TypeScript is not part of candidate native
compilation. These finite observations do not establish universal equivalence
or full Harness compatibility.
