# Native exported namespaces and YAML public ESM declarations

Declaration program modules accept `namespace-exports`, a bounded vector of
`local`, `export` and `runtime-export` records. The local must be a value namespace
import from an internal module with an actual native runtime identity. The selected
runtime export must exist, and ordinary module/root origin checks remain required.
The emitted declaration exports that namespace alias. Its children preserve the
source type/value/namespace spaces, canonical class owners and private visibility;
no object-shaped default replacement or untyped substitute facade is authored.

The YAML source API view retains all 18 original @types/js-yaml 4.0.9 declarations.
The public wrapper exports their namespace as default, matching the original ESM
type wrapper's synthetic CommonJS namespace. There are 11 typed value exports
(including default), 10 top-level type exports and 15 actual runtime exports.
The three legacy safe functions and the `types` runtime symbol remain absent
from the original public types. UMD namespace metadata remains on the source API module,
so `jsyaml.default` is not invented as a global type member.

Portable controls qualify both actual CLI labels under Node:

- 20 exact-code shape/name/budget/origin/collision/private-owner refusals and four
  native qualified/import/typeof namespace queries, including inline queries.
- 13 positive and 11 negative strict original-paired default consumers, exact
  public symbol spaces and default namespace members, actual NodeNext package
  self-reference resolution and conditional UMD globals.
- Complete own 29-module YAML runtime, exact actual CLI bytes and 304 original-paired
  runtime groups per label. Native declarations are copied from the actual own
  declaration CLI artifact into the own runtime package; original YAML type files
  are used only by the original oracle.
- Actual own 25-module Include runtime and 19-module declarations, with the YAML
  dependency resolved to the complete own native public declarations. Original-paired
  6 positive/8 negative Include consumers preserve exact diagnostic codes and symbol
  spaces. Separate real NodeNext package consumers use standard resolution and the
  canonical own Context/Loader files, without virtual resolvers or substitute
  dependency classes. All 32 original-paired Include runtime groups remain required.

This qualifies the original YAML public ESM declaration closure and its actual
Include composition. CommonJS/other package modes, real browser/native/Q9 execution,
full Harness API/plugin/profile/Session parity, deployment and System One model
performance remain separate gates. This port is operator-authored.
