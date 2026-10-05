# Mithril Harness v3 development

The product and maintained agent fork are named **Mithril Harness**. Profile
identifiers use `/port/agent/`; profiles with the old IDs are not aliases. Existing
bound sessions with changed profile IDs refuse resume. Keep prior evidence/state
with its pinned v2 runtime rather than editing checkpoints or inventing a silent
migration. Upstream origin and legally required MIT copyright notices remain in
`upstreams.edn` and `resources/ports/AGENT-SOURCE-LICENSE`; immutable measured
receipts preserve their original identities.

The active implementation goal is in `full-goal.edn`. Its full UI inventory is
`ui-compatibility.edn`, generated from all 63 pinned upstream client modules.
Every operation and state/transport behavior still requires actual compatibility
evidence; an inventory entry or rendered placeholder is not completion.

`bin/mithril-agent.cljk` introduces actual offline generation of repository
source with no supplied code candidates, plus multi-file verification and
recoverable publication. Task JSON declares `root`, `goal`, `context`, pinned
`inputs`, ordered `verifiers`, `max-files`, `max-bytes`, `max-attempts` and
`parallelism`. Each verifier has `id`, absolute `executable`, fixed `argv` and
`timeout-ms`. Model output supplies source text, not paths/commands for the
verifier. The verifier executable is a caller-granted capability and staging is
not an OS sandbox.

The generation adapter uses the existing pinned CLEF model's autoregressive
backbone, rather than claiming its finite-choice head generates source. Outlines
1.2.12 / outlines-core 0.2.14 constrains JSON transport only; code content is
freely generated and must pass real checks. File planning and source generation
are logged separately. Earlier invalid outputs are retained as negative evidence.

Independent verifiers run in separate staging directories with bounded
concurrency. Results preserve declaration order regardless of completion order.
Timeout, cancellation, exit status and output limits are reported independently.
On macOS/Linux a bounded job owns its process group and checks group quiescence
before success; Windows descendant completion is not yet qualified.

Multi-file publication is recoverable, not one atomic filesystem-wide swap.
A durable intent contains preimages and verified changes; partial publication
must be reconciled without regenerating or overwriting external drift. The full
UI, general concurrent tool scheduling, production integration and broad model
qualification remain active work and are not marked complete by these APIs.
