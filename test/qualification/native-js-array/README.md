# Complete native CosmoKit array runtime and System One evaluation

`examples/native-js-array.mith` implements all seven runtime exports of the
original `vendor/cosmokit/src/array.ts` as checked inert Mithril Form source:
contain, intersection, difference, union, deduplicate, remove, makeArray.
Its isNullable grant is provided by the actual compiled Mithril misc module.
The candidate never imports or delegates these functions to the TypeScript
baseline. Array/Set grants use live getters for the native builtins.

Three generic expression nodes add native construction, ordered plain/spread
array items, and receiver-only optional method calls. >= is added to the
existing explicit binary-operator whitelist. Existing guest context/budgets
remain intact. This is the separate trusted native JS host profile.

## Actual authenticated System One runs, 2026-10-08

Each task was sealed before inference, one proposal attempt, model repairbudget0.
The inference receipts and exact tasks are included, with raw candidates retained.

| Task | Model seconds | Prompt tokens | Completion tokens | Raw result |
| --- | ---: | ---: | ---: | --- |
| Language prerequisites |30.497|23907|958|Two source changes returned; parse failure due to missing closing delimiters|
| Complete array source |50.525|23747|1688|New module returned; rejected unsupported lambda parameter maps|

Modelqwen/qwen3.8-27b, ordinary authenticated production Code refactor. Monetary
cost is unknown for both. Source/hash/scope admission alone did not qualify either
candidate: unmodified acceptance0/2 for these two specific tasks, no model repair
or inference resubmission. Earlier complete misc request returned empty_changes
in7.869s/25263prompt/5completion; the different task scopes are not a matched
performance experiment or general success-rate estimate.

The export button's download observation timed out. No inference was restarted.
Materialized changes and inference receipts were read from the visible public
DOM and reconstructed into standard proposal files; both normalized task hashes
matched the fixed local input before applying/verifying. This is not a claim
that a download completed.

The resulting implementation is **operator repaired model output**. Exactly two
closing delimiters and constructor-expression grouping were corrected in the
language source; exactly three unsupported callback parameter name maps were
changed to the supported string pattern in the new module. The checker was not
relaxed to accept the invalid model output. Native constructor grouping is a
semantic fix: a syntax-only control with the model's original emission passes
retained76/399 but fails the fixed runtime check for a constructor resolved by
an expression. `syntax-only-negative-verification.json` records that rejection.

## Fixed qualification

Language-step approved complete seed: Mithril mainbc6fb04301e320b419c8748cb03951c148d19939,
image9fa47d43e69b00515e95806498cb773500f53c4423c05ab7e98f77a421db3c63.
Module-step imageec4f85b493c6549709ecf0f5b3e0331e4bb0994b9827e8bd1e6154f8b5a0b0da
contains that complete main plus exact operator-verified prerequisite overlays,
recorded in module/seed-overlay.json. The seed is an approved operator snapshot;
these overlays were not yet published when inference occurred. Only the stated
selected files were sent to inference, not the full repository.

The production proposal schema and same offline verifyRefactor runner were used.
Both raw and operator variants use the same fixed plans. Networknone, digest
pinned, read-only image, unprivileged uid65534, bounded tmpfs/CPU/memory, no host
checkout or credentials. Classpath starts /workspace sources and then frozen
dependencies. Java/javac/clojure/clj launchers are shadowed and marker checked.
Node24.21.0; the baseline source is transpiled using installed TypeScript6.0.3
(target/moduleES2022). Only its relative misc dependency filename is changed;
source/transpiled/executable SHA-256 values are in transpile-receipt.json.
MIT copyright/license retained at test/fixtures/COSMOKIT-LICENSE.

- Unchanged baseline/candidate source preservation:76 tests/399 assertions.
- Generic feature contracts:4 admissions,13 malformed refusals,2 shared-budget
  refusals,3 Form tags,20 actual native runtime groups.
- The SAME30 complete array runtime groups pass on actual transpiled TypeScript
  and the generated Mithril candidate linked to actual generated Mithril misc.
- Maintained native source suite13/57 and full registered suite78/408 pass in the
  frozen image. The existing misc emitted bytes remain exactlyb2e52089674875efa3b5a8c135e4fccd37b258c8d5d72adcfc05338f38c0a4fb.
- Normal native CLI js/js-browser array artifacts are byte-identical SHA
  d2de5ed22d8b5afe5dea4c0125af71805573541a7156c55efc19b34672c26db8.
  The actual CLI artifact passes the same paired runtime verifier.

Runtime coverage includes export set/name/length/constructibility, sparse arrays,
SameValueZero/NaN/negative zero, order/duplicates, custom iterators/methods/opaque
returns, anonymous nonconstructible callbacks and retained captures, laziness,
exact receiver/lookup/constructor-before-spread order, builtin rebinding,
receiver-only optionality, original index result/coercion/exception identity,
foreign arrays/proxies/revocation and2000 native calls. Native constructor tests
include classes, custom new.target/prototype, foreign constructors, Proxy
construction, abrupt completion and constructor-valued expression resolution.

## Improvement investigation and remaining scope

Splitting the language foundation and module source changed empty withdrawal
into materialized output, but both remained invalid. The observed issues point
to delimiter preservation/expression precedence for code edits and exact Form
vocabulary for module generation. Possible follow-ups: a before-inference minimal
closed NativeLambda string-parameter example, staged syntax/admission diagnostics,
and an explicitly budgeted model repair experiment. None is measured as an
improvement here. Keep rejection, source hashes, scope and immutable new-feature
contracts; do not count operator repair as unassisted model success.

misc and array runtime files are qualified individually. Four remaining CosmoKit
modules(string,time,volatile,types), public TypeScript types/package ESM linking,
Schemastery, Cordis/Include/Loader SCC and the rest of the341 Harness packages,
API/plugin/Session parity remain open. This direct native JS profile establishes
Node execution, not actual browser/nonJS/Q9 whole-component qualification.
Source CI and main publication are recorded separately after actual completion.
