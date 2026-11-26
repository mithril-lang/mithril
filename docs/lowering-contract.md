# Mithril → Kotoba lowering contract (Step A pointer)

**Status:** interface pointer, not a migration. Written for Kotoba
`lang/guest-grammar.edn` to pin (see last section). Owning implementation:
`src/mithril/module_lower.cljk` + `src/mithril/form.cljk`. Nothing here
changes `mithril.ir/v1` (additive-only) or adds code-tier forms: Step A
stays fenced `.mith`.

## 1. What the checked module tier lowers to (the pin target)

The `mithril/module` data form checks (budgets: depth 64, nodes 4096,
functions/exports 128, params 64, `FunctionType` params ≤ 4) and
`module_lower` emits **Amu Kotoba source** over guest-grammar
profile-version 6 (`mithril.form/kotoba-profile-version`):

- Named `defn` per checked function; `(let [x v] body)` single-body;
  `(do ...)` first-class; `(if test then else)` three-args. These are the
  only emission shapes; the same three Shapes are what Kotoba's
  `:core-form-shapes` refuses to truncate (`let-body-multiple-forms`,
  `if-arity`, `do-empty`) — Mithril relies on the refusal, never works
  around it.
- Contract boundary: `[:fn [param-types result-type] ...]` crossing uses
  the `__mithril_contract` / `__mithril_invoke` ABI wrapper; a closure
  value crossing the boundary is the only construct with lowering code.
- Lowered modules are prefixed `mithril.generated.<name>`. Step C retires
  the prefix (lowered modules take their `(ns ...)` names); Step A keeps
  it so digests do not move.

Kotoba-side pin: a `guest-grammar.edn` entry keying on the *emitted*
heads `defn let if do` plus the `__mithril_contract` wrapper name, with
profile-version 6 and the arity bounds above, so a profile bump that
breaks the emission breaks the pin loudly, not silently.

## 2. Restricted-JS profile (named)

`mithril.restricted-js/v1` — the restricted JavaScript surface that
`js-value` and the `mithril/host-*` forms lower to (ESM host calls via
`mithril.native-js`, `native_declaration_*`, `web_lower`). Rules:

- `js-value` never grants host invocation beyond the module's declared
  host imports; it is an opaque value crossing the ABI wrapper, not an
  escape hatch ("raw `:js-value` never grants host invocation" is the
  Kir side of this rule).
- `host-*` source forms map 1:1 to host imports / methods / constructors
  in the ESM emission; no guest word ABI, no runtime fuel ledger.
- The Step C direction is capability-typed `defn` wrappers
  (`cap-call` / `typed-cap-call` over declared `:capabilities`), NOT new
  source forms. Until then, `host-*` stays source-visible and is reviewed
  as a companion profile, never as data-tier vocabulary.

Kotoba-side pin: Kotoba's `docs/lang/*` surface docs name this profile
`mithril.restricted-js/v1` with the `js-value` rule verbatim, so an
author reading either side finds the same restriction statement.

## 3. Reader conditionals are read-time only

`form/parse` option `{:features #{:js ...}}` (with the
`(mithril/form:v1)` marker) resolves `#?`/`#?@` to a target-resolved
tree **before** projection. Backends never re-read source; per-target
digests are valid receipts. The native (Amu) profile has no feature set
and refuses by name (`:mithril.form/reader-cond`).

## 4. Identity (both named, never silent)

- Data: `sha256:` canonical-RDF graph digest over the projected
  document (unchanged by Step A; `digest-baseline.edn` must not move).
- Version: `(mithril/form:v1)` marker parsed to
  `form/language-version` = `"mithril.form/v1"` (absence = `v0`) and
  surfaced via `form/parse-with-meta`
  (`{:document ... :version ... :kotoba-profile 6}`); Kotoba profile 6
  pinned as `form/kotoba-profile-version`.
