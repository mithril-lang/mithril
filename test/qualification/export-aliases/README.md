# Export alias qualification

Measured 2026-10-07, operator-authored source. System One's visible public error
was `temporarily_unavailable`; no proposal, completion ID, inference receipt,
tokens or provider latency were observed. This is not a model-only success.
The first operator test file had an unmatched parenthesis; original task and
service error were retained externally, and the test was corrected separately
before successful qualification. No model retry or repair was performed.

`operator-final-verification.json` uses the actual Code refactor verifier and a
trusted image/plan. Existing checks run identically on baseline and candidate
(53 tests / 309 assertions each). Alias checks run only on candidate (7 / 25).
An immutable actual Amu JS artifact supports the separate alias ESM check.
The corrected baseline rejects aliases (7 failures / 6 errors); it parses the
new tests successfully, distinguishing unsupported behavior from syntax failure.

`pipeline-qualification.json` records the actual candidate's lowered Mithril
alias text through normal Amu `bin/amu compile --target ... --jvm-free`.
Compiler tree matches main 811ba4e2db4233c51eeae5eeb2d95930fec8725f. JS and
JS-browser succeed; cljs, wasm32-browser and x86_64 refuse with exit 65 and no
artifact. A forbidden-JVM sentinel remains absent. Each actual artifact/facade
pair executes in pinned offline Node: two alias identity pairs, distinct private
declarations, canonical names/arity/shared prototypes, 120 comparisons,
60 constructions, 8,000 repeated calls and zero property reads. Revoked proxies
and getter-bearing objects remain opaque and preserve identity.

These are finite pure alias foundation checks. JS-browser output was executed
in Node, not a browser host. Node/nbb is bootstrap, not self-host qualification.
The toy identity function does not replace mapValues or any full package. Full
object/callback/async/stateful behavior and Harness API/plugin parity remain.
