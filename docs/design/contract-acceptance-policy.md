# Contract acceptance policy (Organizer Item 471)

**Status: design note. Source of truth is `ontology/contract-acceptance-v1.mith`.**
This note summarises the Owner's contract-acceptance decision of 2026-11-26 and
maps each rule (R1..R11) to the SHACL shapes that enforce it. It does not
restate the rules: each `CA:PolicyRule` individual in the `.mith` carries its
`statement` in Japanese and English, its `rationale`, and its `enforcedBy`
shape list, and `test/mithril/contract_acceptance_test.cljk` pins all of it.
Nothing here sends, signs, bills or writes to HubSpot / Dropbox Sign /
DocuSign / Stripe; description and validation only.

The ontology extends `ontology/workspace-ops-v1.mith` (Item 323 /
mithril-lang/mithril#176) in a fresh namespace
(`https://mithril.fund/ns/contract-acceptance/v1#`) instead of editing it:
WOPS has no notion of document versions, quotes, signatures, invoices or
change orders, and its enums are closed. `workspace-ops-v1.mith` and its
conforming fixtures are unchanged.

## 1. Rule to shape mapping

| Rule | Owner decision (summary) | Enforcing shapes (`CA:R<...>`) |
|---|---|---|
| R1 | Enterprise contracts execute by e-signature on a HubSpot formal quote that names and attaches the version-fixed English MSA, Order Form and SOW | `R1-QuoteOnHubSpot`, `R1-QuoteSignatureEnabled`, `R1-QuoteStatesFixedVersions`, `R1-QuoteAttachesStatedDocuments`, `R1-ExecutedViaEnterpriseExecution`, `R1-StatedInFormalQuote`, `R1-EnglishText`, `R1-ExecutionViaSentFormalQuote`, `R1-ExecutionChannel` |
| R2 | Both sides sign: a customer signatory and a provider signatory, each with confirmed signing authority | `R2-CustomerSigned`, `R2-ProviderSigned`, `R2-SignatoryAuthorityConfirmed` |
| R3 | DocuSign is not required (and not forbidden) | enforced as a permission: `R1-ExecutionChannel` admits `docusign`; no shape requires it |
| R4 | A public terms URL alone never forms an enterprise contract; the executed versioned text is stored | `R4-EnterpriseGovernedByExecutedMsa`, `R4-ExecutedEnterpriseNotPublicTerms`, `R4-ExecutedVersionFinal`, `R4-ExecutedVersionStated`, `R4-ExecutedCopyStored`, `R4-ExecutedThroughRecognisedPath` |
| R5 | The MSA survives between orders and relates to existing NDA/DPA/orders | `R5-OrderUnderMsa`, `R5-SowUnderOrder`, `R5-MsaHasOwnTerm`, `R5-MsaRelatedAgreements` |
| R6 | Scope, environment and delivery are confirmed before a formal quote; an estimate is not a contract | `R6-PreQuoteConfirmed`, `R6-EstimateHasNoSignature`, plus `R1-ExecutionViaSentFormalQuote` |
| R7 | Stripe billing only after execution, per agreed terms | `R7-InvoiceViaStripe`, `R7-InvoiceBillsExecutedOrder`, `R7-InvoiceMsaExecuted`, `R7-InvoiceSowsExecuted`, `R7-InvoiceMatchesAgreedTerms` |
| R8 | Changes to ordered scope go through a Change Order referencing the order, recording fee, schedule and approval | `R8-ChangeOrderAmendsOrder`, `R8-ChangeOrderRecordsFee`, `R8-ChangeOrderRecordsSchedule`, `R8-ScopeChangeKind`, `R8-ScopeChangeTargetsOrder`, `R8-AppliedChangeAuthorizedByChangeOrder`, `R8-ChangeOrderAmendsSameOrder` |
| R9 | New NDAs take effect on HubSpot-form consent plus our explicit acceptance (authority confirmed); form submission alone is not enough; pre-existing NDAs stay valid | `R9-NdaEnglish`, `R9-NdaAcceptedByProvider`, `R9-PreExistingBeforePolicy` |
| R10 | Self-serve use rests on accepting the public terms, distinct from enterprise deals | `R10-SelfServeAcceptsPublicTerms`, `R10-SelfServeNotEnterprise` |
| R11 | Sending to a customer, signature requests and billing need the owner's approval even when every other rule passes | `R11-QuoteSendApproved`, `R11-InvoiceApproved`, `R11-ApproverIsProviderOwner` |

## 2. Decision questions

`CA:DecisionQuestion` individuals declare, per question, a subject class, the
state-claim class added hypothetically, the gate shapes that block the action,
and (R11) the approval shape. `mithril.contract-acceptance/decide` evaluates
them; `bin/mithril-contract-acceptance.cljk` prints the JSON decision.

| Question key | Subject | Claim | Gate shapes | Approval shape |
|---|---|---|---|---|
| `may-issue-formal-quote` | `FormalQuote` | `SentFormalQuote` | `R6-PreQuoteConfirmed`, `R1-QuoteOnHubSpot`, `R1-QuoteStatesFixedVersions` | `R11-QuoteSendApproved` |
| `may-request-signature` | `FormalQuote` | `SentFormalQuote` | `R6-PreQuoteConfirmed`, `R1-QuoteOnHubSpot`, `R1-QuoteStatesFixedVersions`, `R1-QuoteAttachesStatedDocuments`, `R1-QuoteSignatureEnabled` | `R11-QuoteSendApproved` |
| `may-invoice` | `Invoice` | `IssuedInvoice` | `R7-InvoiceViaStripe`, `R7-InvoiceBillsExecutedOrder`, `R7-InvoiceMsaExecuted`, `R7-InvoiceSowsExecuted`, `R7-InvoiceMatchesAgreedTerms` | `R11-InvoiceApproved` |
| `nda-effective` | `MutualNda` | `EffectiveNda` | `R9-NdaEnglish`, `R9-NdaAcceptedByProvider`, `R4-ExecutedVersionFinal`, `R4-ExecutedVersionStated`, `R4-ExecutedCopyStored`, `R4-ExecutedThroughRecognisedPath` | none |
| `change-order-required` | `ScopeChange` | `AppliedScopeChange` | `R8-ScopeChangeKind`, `R8-ScopeChangeTargetsOrder`, `R8-AppliedChangeAuthorizedByChangeOrder`, `R8-ChangeOrderAmendsSameOrder` | none |

## 3. Fixtures and tests

Fixtures live in `test/fixtures/workspace-ops/contract-acceptance/` and are
checked against **both** workspace-ops-v1 and contract-acceptance-v1
(`owl:imports` is not resolved, so each case is reasoned twice).

Passing: `pass-customer-a-enterprise.nq` (MSA + Order Form + SOW e-signed by
both parties on a HubSpot formal quote, then billed; token change via Change
Order on a second quote), `pass-customer-a-order2-awaiting-approval.nq`
(R11: everything allowed but owner approval still pending),
`pass-prospect-b-nda-and-self-serve.nq` (NDA effective via form consent +
provider acceptance; self-serve on public terms).

Failing, one defect each: `fail-one-sided-signature.nq` (R2),
`fail-version-not-fixed.nq` (R1/R4), `fail-terms-url-only.nq` (R4),
`fail-billed-before-execution.nq` (R7),
`fail-scope-change-without-change-order.nq` (R8), `fail-nda-form-only.nq`
(R9), `fail-quote-unconfirmed.nq` (R6). The test asserts the exact violated
shape set, the rules they belong to, and the focus nodes.

No PII anywhere: persons appear only as `PartyRole`
(`AuthorizedSignatory`, `OwnerApprover`) held by a legal entity; customer
names are anonymised; no real quote/document identifiers.
