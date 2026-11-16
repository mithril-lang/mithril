# Native CosmoKit misc and actual System One evaluation

The operator implementation adds eight generic checked native JS expressions
and an inert `examples/native-js-misc.mith` module implementing all ten runtime
exports of the original CosmoKit `misc.ts`. It is part of the separate trusted
native JS host backend, not the bounded Amu guest context. Imports are exactly
Object/Array/Reflect and are read through live provider getters. Native spread,
computed properties/assignment, short-circuit logic and for-of supply original
JavaScript evaluation, setters and IteratorClose behavior.

## Actual System One request

2026-10-08: authenticated Code Web refactor on production status version
f96bc4009e7daa4daa4cc9e56affb816502523fc (HTTP200/ready). Model
`qwen/qwen3.8-27b`, one attempt, repair budget0. The exact selected task is
`task.json`; normalized identity is
6bfeb7dbdd4460136b83ab35c0da8051035d7742eb15a439c0c95701dcd72fcd.
Task83,340 bytes; nine complete selected files, full native product source
closure(native_js/form/module), three editable paths. The complete approved
repository seed was supplied to offline verification, not to inference.

`live-failure.json`: 7.869 seconds, 25,263 prompt tokens, five completion tokens,
`invalid_refactor_proposal/empty_changes`, completion
chatcmpl-29ab7df7-6f05-4547-a19f-004c1c6d26df. Monetary cost is unknown. No
materialized candidate was returned; model acceptance is0/1 for this task, and
runtime success cannot be scored. No automatic retry or model repair occurred.
The succeeding source changes are **operator authored**, not model output.

## Fixed verification

Immutable pre-inference controls and image:
sha256:cb146775a9f7f7721cf256cbabf573b57d6dc5d78fba440212cfffad4cb848b3.
Complete seed Mithril main7a6a186ed4a153650d35d62fd4040c7aee9c78c4,
frozen dependencies from image4b95fd6683bb82364f70e799b4507e61d3834f86068da9ee8f05cdabe0195772.
Node24.21.0, no network, unprivileged user, read-only image, bounded temp files,
no caller checkout/credentials, all four JVM launchers shadowed with marker checks.
Classpath explicitly starts `/workspace/src`, `/workspace/test`,
`/workspace/resources`, then frozen dependencies; an old absolute image-source
classpath would falsely test baseline code for the candidate and is not used.

The operator proposal uses the production schema/admission and the same
`verifyRefactor` runner: unchanged baseline/candidate74 tests/391 assertions;
candidate-only11 primitive admissions, nine structural/operator/scope refusals,
eight Form tags, native runtime primitive checks; same24 runtime contract groups
on the actual transpiled TypeScript baseline and generated Mithril artifact.
All four declared checks passed. `operator-verification.json` marks these exact
checks verified; its limited scope is not universal API equivalence.

Transpiled original baseline SHA1bc8cfd971ad220437dc6d4de235c8dd5587084eefc61e4aa8c92c23de72edd0,
original TypeScript SHA117617943074ea57c15f216905dacd2f6d1c4c2ff16586f97a7a7a87dbf2141f.
MIT license is retained at `test/fixtures/COSMOKIT-LICENSE`.
Contracts include all export names/lengths/constructibility/alias identity,
undefined/raw-falsy/nullish/foreign-realm/opaque/proxy values, own string/symbol
keys and spread, pick's separate source reads and key coercions, __proto__ native
assignment versus own spread, iterator closing on abrupt completion,
noncallable filters, descriptor flags/order and live builtin receivers.

Normal native CLI emits identical js/js-browser module bytes SHA
b2e52089674875efa3b5a8c135e4fccd37b258c8d5d72adcfc05338f38c0a4fb;
the actual CLI artifact passes the paired runtime verifier. This is Node runtime
qualification, not an actual browser session.

The maintained source runner adds these contracts: local frozen native suite
11/48 and combined suite76/399 pass without JVM launch. The source CI uses the
existing pinned nbb engine829f0ba1 and Node24.21.0; CI and main publication are
recorded separately after actual completion.

## Improvement investigation

The current production source prompt explicitly permits `{"changes":[]}`
when the selected scope cannot achieve the goal. A five-token empty response
matches that branch, but a receipt without a model explanation does not establish
why the model declined. The operator passing the same controls establishes this
specific scope was implementable, not that a prompt alteration improves the model.
Possible follow-up experiments: split generic primitive support from the complete
module port; make absent editable file creation and the approved full seed explicit
in generation context; retain exact rejection details and budgeted attempts. These
are hypotheses, not measured improvements. Keep fail-closed scope/hash admission;
do not relax validation to accept an empty proposal or silently count operator
repairs as model success.

## Remaining scope

This is the complete runtime of one CosmoKit source file. Type-only declarations,
its five other source modules, public package linking/types, Schemastery and the
Cordis/Include/Loader cycle, and all remaining Harness API/plugin/Session behavior
remain open. Native JS output does not establish real browser execution or
non-JS/Q9 whole-component qualification. The original TypeScript Harness is not
replaced by this change.
