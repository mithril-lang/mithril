# Pending System One refactor investigation

The public UI initiated one Time trial at 2026-10-08T05:20:59.846Z and then
reported outcome_unknown. Repeated retrieval used the SAME request, never a new
model attempt. The last saved public observation is trial_in_progress. No terminal
receipt, completed source, server-confirmed input hash, usage or cost was returned.
This trial is unscored. Do not call it a model coding failure, stream timeout,
verified proposal or known provider cause. live-observation.json is a timestamped
observation, not a permanent claim about current service state.

Local Fund snapshot e95a770fe8ad5825be2e29381dcb6d614984d7d8, read-only investigation:
apps/code/worker.mjs reserves in TrialQuota, awaits proposeRefactor within the
request, then saves action finish. No executionContext.waitUntil in this file.
apps/code/trial.mjs reserve stores fingerprint only; if a reserved entry lacks
result it returns trial_in_progress with no age/deadline recovery. Daily rollover
clears the ledger. apps/code/refactor.mjs uses AbortSignal.timeout(170000) on the
provider request; its stream admission requires full terminal evidence. These
facts describe local source, not verified deployed source or this request's cause.

Next harness prerequisite: persist bounded reservation timestamps and diagnostic
states and decouple execution/receipt persistence from client observation lifetime.
An expired observation must become an explicitly unknown outcome, without refund,
automatic new inference, false token/cost reports or partial-source admission.
Preserve request identity and exactly-once reservation; late completion must not
be overwritten by an observation expiry. Test client disconnect, provider abort,
receipt save failure, duplicate same-ID polling and cross-day completion before
shipping. Safe stream diagnostics should distinguish local deadline, EOF and
missing terminal metadata without retaining provider content or credentials.

This milestone implements the independently prequalified Time source. No harness
change, deployment, causal improvement or matched model performance gain is claimed.
