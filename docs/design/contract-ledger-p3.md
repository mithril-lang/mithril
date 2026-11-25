# Contract ledger (P3): contractual obligations on workspace-ops-v1

**Status: design note + first example fixture (staging only).**
Implements Organizer Item 323 P3 of `reports/mithril-self-ontology-plan-20261125.md`.
This note does not change the workspace-ops-v1 vocabulary (`ontology/workspace-ops-v1.mith`,
Item 323 P0, mithril-lang/mithril#176) and does not ingest anything into production.
The only runtime artifact is the example fixture
`test/fixtures/workspace-ops/contract-zdr-fund-mithril.nq`; it is exercised by
`test/mithril/workspace_ops_test.cljk` and by `mithril reason` directly.

## 1. Purpose and non-goals

P3 is complete when one contractual obligation can be traced end-to-end:

```text
Obligation <- Policy -> Implementation (Service / ApiOperation / Route) -> Evidence
```

Example: "inference on api.mithril.fund is zero data retention (ZDR) by default"
(policy) -> route/provider configuration (implementation) ->
CI and read-back records (evidence).

Non-goals, restated from the plan:

- Contract bodies (DPA / ToS PDFs) are never ingested. Only a human-approved
  **summary** and the enumerated obligations enter the graph. Bodies stay in
  private storage (R2 / Drive) and are not referenced by file content here.
- No PII. Parties are legal entities (organizations / sub-processors) only.
  Humans appear only as `PartyRole` with a role kind; no names, IDs, addresses,
  or contact details.
- No secret values. `SecretRef` carries a secret **name** plus its **location**
  only. The closed `SecretRefShape` makes any value-carrying property a SHACL
  violation.
- No production writes. Everything here is staging/fixture. Automation is
  created stopped (`automationEnabled "false"^^xsd:boolean`, never implied).
- Evidence is never fabricated. A node with `evidenceKind "ci"` or
  `"production-verification"` in a fixture is a **slot** (a kind assertion),
  not a measurement claim. Anything not actually measured is recorded as
  **unmeasured** in the fixture comments and in section 7 below. A local
  read-back is never independent provider proof.

## 2. Vocabulary mapping

All classes and properties are from workspace-ops-v1
(`https://mithril.fund/ns/workspace-ops/v1#`). IS-A: `ApiOperation`, `Route`,
and `Service` subclass `Implementation`; `Evidence` subclasses bot-domain-v1
`Fact`. `Policy` is DM2 `Rule` by term name (no pinned DM2 file exists in
this repository, so no new DM2 IRIs are introduced). Common-vocabulary changes
require a git PR and are out of scope here; the gaps in section 7 are for
MITHRIL-2801, not fixed inside this note.

| Design element | Vocabulary | Required fields (SHACL) | Notes |
|---|---|---|---|
| Contract / agreement (summary only) | `Agreement` | `name`, `workspace` | `name` is the human-approved summary label, e.g. "Inference provider DPA (summary only)". No body text, no document content, no attachments. |
| Counterparty (legal entity) | `Party` | `name`, `partyKind`, `workspace` | `partyKind` in {`organization`, `sub-processor`}. Inference providers are `sub-processor`. Corporate names only ("DeepInfra", "OpenRouter", "Xiaomi", "PrimaLabs"); never a person. |
| Human (role only) | `PartyRole` | `roleKind`, `workspace`; optional `holder` -> `Party` | `roleKind` in {`agreement-owner`, `steward`, `approver`}. No PII: this is the entire person model. A role may name an owning `Party` via `holder`, but never an individual. PII exclusion is by convention here, not SHACL (see 7). |
| Duty (ZDR / retention / SLA / sub-processor) | `Obligation` | `name`, `obligationKind`, `workspace`; optional `agreement` -> `Agreement` | `obligationKind` in {`zdr`, `retention`, `sla`, `sub-processor`}. `name` states the duty *including its stated exception* (see 3). One `Obligation` per duty; do not merge the ZDR duty and its safety-retention exception into a "ZDR-only" claim. |
| Validity window | `Term` | `agreement`, `validFrom`, `workspace`; `validTo` 0..1 | `validFrom`/`validTo` are `xsd:string` with pattern `^-?[0-9]{4}(-[0-9]{2}(-[0-9]{2})?)?$` (year, year-month, or full date; `validTo` omitted = open-ended). Steward confirms real dates before any staging ingestion (see 4). |
| Company rule that answers a duty | `Policy` | `name`, `workspace`, `addresses` -> `Obligation` (exactly 1), `implementedBy` -> `Implementation` (0..8192) | `addresses` is exactly 1 in this vocabulary, so one policy per duty. `implementedBy` is any `Implementation`: a `Service`, an `ApiOperation`, or a `Route`. |
| Implementation | `Implementation` (superclass) | `provenBy` -> `Evidence` (0..8192) | `Service` (required: `name`, `workspace`, `environment`), `Route` (required: `routeHost`, `workspace`), `ApiOperation` (required: `name`, `operationId`, `workspace`) all subclass it. `Service.environment` is a required `Environment` (`staging` here). `Route.targetService` is optional but should name the serving `Service` when known. |
| Proof / measurement slot | `Evidence` | `name`, `evidenceKind`, `workspace` | `evidenceKind` in {`ci`, `test`, `production-verification`, `manual-approval`}. A fixture node asserts the kind of record that *would* prove the chain; it does not assert the record exists (see 7). |
| Secret reference | `SecretRef` | `secretName`, `secretLocation`, `workspace` (closed shape) | Name + location only, never a value. `secretLocation` in {`wrangler-var`, `cloudflare-secret`, `github-secret`, `external-vault`}. There is deliberately no property linking a `SecretRef` to a `Service`/`Route`; the name appears in the config of the implementation, and the graph records that a name exists, not where its value lives beyond the location enum. |

### The chain, precisely

```text
Agreement --(Obligation.agreement)--> Obligation
                      ^                    |
                      |                    | (exactly one incoming Policy)
                      |                    |
Policy --(addresses)--> Obligation      |
Policy --(implementedBy)--> Implementation --> Evidence
                                          (Service / ApiOperation / Route) (provenBy)
```

Reading forward from an `Obligation`: find the (single) `Policy` whose
`addresses` points at it, follow `implementedBy` to the implementations that
satisfy it, then `provenBy` to the evidence kinds that would prove it. Reading
backward from an `Evidence` (e.g. a CI check) answers "which duty does this
check support". Both directions are single-hop SPARQL / graph walks over the
same triples; no inference is needed beyond the subclass entailments above.

## 3. Booking rules (owner decisions, Item 321)

Owner decisions (2026-11-25, carried via Items 321/323 into MITHRIL-2796,
MITHRIL-2750, MITHRIL-2800) constrain how obligations are worded:

- **Safety retention is recognized as ZDR-with-exception, not ZDR-only.** Flagged
  prompts may be retained up to 90 days by the safety classifier path
  (OpenRouter). The account is therefore *not* set to "ZDR only" (which would
  also disable models such as muse-ember). In the graph this is two
  obligations: a `zdr` duty whose name states the exception up front, plus a
  `retention` duty carrying the 90-day cap. Never book a bare "ZDR-only"
  obligation for this account.
- **qwen3.8-27b (self-hosted HF) is switched off** for the default paths. It
  is not an eligible ZDR route target and must not appear as a Policy's
  implementation for the ZDR duty.
- **Norbert (MiMo, Xiaomi-pinned) moves off Xiaomi under ZDR.** Under ZDR,
  traffic goes to a DeepInfra / PrimaLabs route; Xiaomi remains only for
  non-ZDR traffic if the requester explicitly opts out.
- **Provider order: DeepInfra preferred, fallback ZDR-only, otherwise
  fail-closed.** Non-ZDR routes and non-ZDR fallbacks fail closed
  (MITHRIL-2796). The policy name records all three halves so the chain can be
  audited without opening the DPA.
- **Opt-out is explicit.** A caller may opt out of ZDR; the default stays ZDR.
  The graph does not model the opt-out switch - it models the default duty and
  its implementation. Opt-out behaviour belongs in the `ApiOperation`'s own
  spec/config, cited by its `operationId`, not in the contract ledger.

These rules are *content* constraints on `name` fields and on which
implementations a policy may name. SHACL cannot check them (see 7); the
steward review below is the check.

## 4. Human approval flow and Term dating

1. **Steward drafts a summary.** The ZDR & Data Lifecycle Steward (contract
   owner per Item 323) writes an `Agreement` (`name` = summary label) and one
   `Obligation` per duty, with the exception stated in the name. No body text,
   no clause quotations, no personal data.
2. **Approver confirms.** A second human approves the summary wording. Intended
   booking: an `Evidence` with `evidenceKind "manual-approval"` for the
   approval record. Note (section 7): the vocabulary gives `Evidence` an
   incoming link only from `Implementation` (`provenBy`), so a manual-approval
   record for the *summary itself* is currently an orphan node. It is recorded
   here as intended process, and the fixture intentionally contains no
   `manual-approval` node rather than a fabricated approval.
3. **Term is dated.** `Term.validFrom` is the date the approved summary takes
   effect; `validTo` is the expiry/renewal date (omit only when genuinely
   open-ended). Renewal review is driven off `validTo`: a `Term` whose
   `validTo` is within the review window, or already past, is a finding even if
   every SHACL check passes. A new `Term` (not an edit) is booked on renewal,
   so the history of approved summaries is visible.
4. **Only then staging ingestion.** The approved summary + duties + dated term
   flow to the workspace's named graph (section 5). The fixture's dates
   (`2026-01-01`/`2027-01-01`, the same illustrative values as
   `conforming.nq`) are placeholders that stand in for this approval; they are
   not a claim about any real contract's dates.

## 5. Scope, graph IRI, and staging-only rules

| Rule | Binding |
|---|---|
| Tenant | `fund_mithril`, `organization` (D1 `workspaces`, migration 0075). Every tenant node carries `workspace` -> the `Workspace`. (`Environment` is the one exception the shape tolerates without `workspace`; fixtures follow `conforming.nq` and omit it there.) |
| Named graph | One private named graph per workspace (`WorkspaceGraph`, `visibility "private"`, `graphIri` pattern `^graph/[a-z0-9][a-z0-9-]{1,63}$`, e.g. `graph/fund-mithril`). Staging ingestion writes only the workspace's own named graph; no cross-workspace triples. ADR 0046's `urn:mithril:graph:workspace:{id}` form is a separate IRI derivation owned by that ADR; reconciling the SHACL literal pattern with it is open (section 7) and does not change fixture validation. |
| Secrets | Name + location only. Values never enter the graph. `SecretRef` names in fixtures are illustrative; the steward confirms real binding names from `wrangler.jsonc` before staging ingestion. |
| People | `PartyRole` role kinds only. `Party` is a legal entity. No classifier, no free-text person names. |
| Automation | Created stopped. `Automation.automationEnabled` is an explicit `false`, never implied. Nothing in P3 runs on a schedule. |
| Environment | `staging` in every fixture/example. `production` is a valid `Environment.environmentCode` but is never instantiated by P3 artifacts. |
| Production | No production writes, no D1 writes, no deploy, no deletion. Fixture files under `test/fixtures/` are the only artifacts. |

## 6. Auto-generating the sub-processor list

`routes` that `Service`s expose (`Route.routeHost` + `Route.targetService`)
each carry a provider in their config (wrangler vars / route settings in git).
That config - not the ledger - is the ground truth for *which provider a given
route actually calls today*. The auto-generation is a read-only diff:

1. Collect the provider named by each `Route`/`Service` implementation in the
   workspace graph (staging read of declared config, cross-checked against
   observed state).
2. Collect the `Party` nodes with `partyKind "sub-processor"` that are reachable
   from the `sub-processor` duty (the `Obligation` with that kind, via its
   `Policy.addresses`).
3. Report three sets:
   - **Covered**: provider in config *and* a matching sub-processor `Party`
     (the DPA separate-paper set; the steward checks DPA coverage offline -
     DPA bodies are not in the graph, per section 1).
   - **Orphan provider**: in config but no ledger `Party` -> drift finding
     (route added without a contract check). This is the user-visible alarm.
   - **Stale party**: ledger `Party` with no route -> review finding (provider
     retired but still on the contract list; check `Term`/`agreement` currency).
4. The report is a query result over the staging graph, never a hand-maintained
   spreadsheet. Hand-maintained lists are the failure mode this replaces.

The fixture shows the target state, not the query: `Route` (`api.mithril.fund`,
`/v1`) -> `Service` (inference) with `Party` rows for DeepInfra (primary),
OpenRouter (gateway), Xiaomi (non-ZDR only), and PrimaLabs (ZDR fallback), all
under the `sub-processor` obligation's policy. A route whose config names a
provider with no `Party` row would be the orphan case; fixtures must not ship
one, because fixtures validate as-conforming.

## 7. What the fixture does and does not prove (unmeasured)

- **No measurement exists behind the Evidence nodes.** `ev-ci` (`evidenceKind
  "ci"`) and `ev-readback` (`evidenceKind "production-verification"`) are
  kind-assertions: "a CI check of this shape would prove this link". Their
  `name`s say so ("... slot — unmeasured"). Do not read them as test results,
  and do not read any local read-back as independent provider proof of ZDR.
- **The chain is complete by construction, not by SHACL.** `PolicyShape`
  requires `addresses` (exactly 1) but allows `implementedBy` 0..8192, and
  `ImplementationShape` allows `provenBy` 0..8192. A graph with a policy and no
  implementation, or an implementation and no evidence, still conforms.
  Chain completeness (every obligation -> policy -> implementation -> evidence)
  must be checked by the steward's query/review above, or by a future
  chain-completeness shape. The fixture is built to be complete, and the test
  only pins conformance - reviewers must not treat the test as a chain proof.
- **No PII, no secret values - by discipline, only partly by shape.**
  `SecretRefShape` is closed and does enforce names-only. There is *no* shape
  that forbids a PII string in a `Party.name` or personal data smeared into an
  `Agreement.name`. "No PII" is enforced by steward review of the summary
  wording (section 4), not by the reasoner.
- **Term dates are illustrative.** `2026-01-01`/`2027-01-01` match
  `conforming.nq` so the values are recognizably placeholders. Real dates
  require steward confirmation per section 4 (this is look-and-feel, not a
  vocabulary gap).
- **Two vocabulary gaps are left open for MITHRIL-2801** (do not fix them here;
  common vocabulary changes only via git PR):
  1. `Policy.addresses` is exactly 1, so one policy per duty. If a single
     published rule ever must answer two duties, that needs a vocabulary
     change, not a fixture workaround.
  2. `manual-approval` `Evidence` has no incoming link from `Agreement` or
     `Obligation`, so the approval record (section 4, step 2) is an orphan
     node. A future `approvedBy`-style link (or allowing `provenBy` domain
     widening) belongs to MITHRIL-2801.
  3. The `WorkspaceGraph.graphIri` literal pattern (`graph/{id}`) and ADR 0046's
     `urn:mithril:graph:workspace:{id}` derivation are not yet reconciled in
     the fixture; the fixture follows the SHACL pattern, ADR 0046 owns the
     staging IRI form.
- **Not proven at all by this PR:** that any live route actually serves ZDR,
  that fail-closed triggers work (MITHRIL-2796), or that the provider account
  settings match the paper. Those need Platform Engineering read-back
  (`evidenceKind "production-verification"` against real staging), which is
  P1/P2 territory and must not be backfilled into fixtures.

## 8. Verification

```sh
mithril reason ontology/workspace-ops-v1.mith test/fixtures/workspace-ops/contract-zdr-fund-mithril.nq
# expect CONFORMS, exit 0

node scripts/run-sci.mjs test/run.cljk   # full suite (includes workspace_ops_test)
```

`test/mithril/workspace_ops_test.cljk` gains one deftest pinning the new
fixture's conformance alongside the existing `conforming.nq` /
`violating.nq` pair. The pre-existing P0 fixtures are untouched; this PR does
not replace `conforming.nq`'s skeleton with the realistic chain.

## 9. References

- Plan (with SaaS appendix): `reports/mithril-self-ontology-plan-20261125.md`
  (P3 completion: ZDR duty traceable "policy -> route -> evidence" in one hop;
  summary + duties only, no bodies, no PII, staging/fixture only).
- Vocabulary: `ontology/workspace-ops-v1.mith` (Item 323 P0, #176).
- Decisions: Item 321 (ZDR defaults for api.mithril.fund), MITHRIL-2796
  (fail-closed), MITHRIL-2750 (contract survey), MITHRIL-2800 (P3 parent),
  MITHRIL-2801 (vocabulary follow-ups). Owner decisions of 2026-11-25 are
  summarized in section 3.
- Positive skeleton (unchanged): `test/fixtures/workspace-ops/conforming.nq`.
- This fixture: `test/fixtures/workspace-ops/contract-zdr-fund-mithril.nq`.
