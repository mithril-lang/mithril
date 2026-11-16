# Native index signatures

Inert interface and object members can declare string, number or symbol index
signatures using `kind: "index-signature"`, a parameter `name`, a keyword `key`,
boolean `readonly` and value `datatype`. The compiler emits the corresponding
TypeScript index signature without parsing or delegating to TypeScript source.
Literal, union and template key domains remain unsupported here.

Identity uses the key domain, independently of parameter spelling. Duplicate
domains refuse within a body or across merged interfaces; ordinary properties
can share the index parameter's spelling. The parameter does not introduce a
type/value binding. Raw code, extra fields and unknown value type references
retain the existing shape/scope/arity guards.

Declaration qualification stage 19 checks eleven exact-code refusals, exact bytes
from both actual CLI target labels and independent TypeScript 6.0.3 consumers:
eight positive and nine negative groups with exact diagnostic codes, strict
checking and no skipLibCheck. The original declaration fixture is independent
operator-authored TypeScript. Cases cover generic maps, readonly number keys,
symbol keys, mixed number/string domains, inline objects and interface merging.
These declarations are erased; the existing checked Cordis leaf runtime supplies
the host surface, and the control adds no runtime exports.

The prerequisite comes from the pinned Include source's public `PatchOptions`
string index signature. Full Include declarations, YAML dependency closure,
actual browser execution and full Harness contracts still need qualification.
This is operator-authored work, with no new System One model trial or performance
gain claimed.
