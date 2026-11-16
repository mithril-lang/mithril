# Whole CosmoKit types runtime and System One evaluation

examples/native-js-types.mith ports the complete executable types.ts runtime into
checked Mithril native JS forms: is, mutable Binary namespace, four exact aliases,
clone and deepEqual. It imports actual compiled Mithril misc/volatile functions.
Original MIT source is vendor/cosmokit/src/types.ts; license and TypeScript
transpile provenance are retained under post-spreads/controls. No source-function
delegates, raw JS or eval are used. Public TypeScript declarations are not ported.

Original System One benchmark is frozen separately in task.json, plan.json,
original-controls and pre-inference records: source main4f33eef, six complete files,
81,605 task bytes, one model attempt and zero repairs. Actual authenticated
code.mithril.fund request used qwen/qwen3.8-27b and failed after170 seconds with
incomplete_refactor_stream. No admitted proposal/source, completion id, usage or
cost is available. Unassisted acceptance0/1. The supplied guide incorrectly used
Call.function and HostSpread.values; the checker source was correct. This is an
input defect, but there is no evidence it caused the stream failure.

Operator-authored drafts and failed verification are retained independently.
The initial draft used those incorrect fields; the corrected draft then exposed
missing ordered multiple object spreads in the language. PR29 published that
prerequisite. No operator implementation is scored as a successful model result.

post-spreads is a NEW OPERATOR qualification, not the original unchanged model
plan and not a model retry. It pins published main35877ee114f240982cc41c105672c1507199fcf3,
complete offline seed and image3ee5b6d6f842336cbb90b7bb6fc9b6fcea8f3a5779918379841a7b587c0c2b36.
Controls were corrected after inference: the Buffer grant adapter now performs one
native global read instead of an accidental typeof-plus-read. All100 assertions
remain; test timeouts increased120→240 seconds, plan300 seconds. Both changes are
explicitly excluded from model benchmark claims. No new model requests occurred.

Official verifyRefactor passed all5 checks: paired retained85 tests/435 assertions,
paired original source100 groups, candidate actual CLI js and js-browser compiled
byte equality and each100 runtime groups with real Mithril misc/volatile artifacts.
All four previous generated artifact hashes remain exact. Execution is offline,
read-only, uid65534, resource bounded, workspace-first; four JVM launchers are
shadowed and their marker is absent. New maintained source suites separately pass
21 tests/93 assertions and full86 tests/444 assertions with zero failures/errors.

Runtime groups run in fresh Buffer-present and Buffer-absent Node VM realms and
cover names/arity/constructibility, alias identity and namespace mutation, original
zero/one/two-argument is behavior, prototype/tag/instanceof exceptions, views and
SharedArrayBuffer, native Buffer lookup order, base64/hex coercion,150k inputs,
clone cycles/sharing/sparse arrays/descriptors/accessors/symbols/prototypes,
deepEqual strict/nullish/cycles/ancestor cleanup/opaque exceptions/property order,
and real volatile cross-copy symbol behavior. js-browser output is run in Node VM;
actual browser execution is not established.

Public declaration/package linking, string/time/index and downstream Harness
API/plugin/Session/native/Q9 remain open. Format conformance, complete large-output
stream handling and smaller dependency-first tasks are improvement hypotheses;
there is no matched before/after System One performance experiment here.
CI/merge/current-main evidence is a separate publication gate.
