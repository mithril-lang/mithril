# System One stream failure investigation

Observed public receipt:170.001seconds, incomplete_refactor_stream, no completed ID,
usage, source or monetary cost. One attempt, zero model repairs. Input feasibility
was independently proved before inference, so no malformed-control attribution.

Read local Fund snapshot e95a770fe8ad5825be2e29381dcb6d614984d7d8:
apps/code/refactor.mjs requests streaming JSON with include_usage, max_completion_tokens
12288 and AbortSignal.timeout(170000). completion is assigned only after
readRefactorStream returns complete. apps/code/refactor-stream.mjs requires ID,
stop, post-stop usage and DONE; reader exception or EOF both become
incomplete_refactor_stream. These local source observations are consistent with
receipt timing but do not prove deployed source identity or upstream cause.

Next bounded improvement experiment: retain safe progress telemetry (first frame
latency, frame count, content-byte count, whether stop/usage/DONE seen, validated
partial ID) on refusal, distinguish deadline/EOF/missing terminal metadata, and
measure identical-task trials under explicitly budgeted limits. Never admit partial
source, fabricate token usage/cost, retain credentials/provider bodies, or silently
increase timeout/retry attempts. Completion receipt requirements must remain.

No harness source modification/deployment or matched model-performance gain is
claimed in this language prerequisite milestone. Independent operator feasibility
preflight succeeded; public model stream completion did not.
