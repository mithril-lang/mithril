# MithrilPress optional migration service: scope and cost worksheet

This is an internal proposal template for a separately requested migration or
content-operations service. It contains no prices, staffing promise, service
level, or customer offer. Complete it with the owner and Finance before
preparing a quote. The product and hosting remain free to site owners; any
optional human service is separate and requires explicit acceptance.

Use this with the [managed migration handoff packet](mithrilpress-managed-service-handoff.md).

## Guardrails

- Use only a WordPress export or other content the owner supplied and
  authorized. Do not crawl, fetch, or clone a prospect site to create a preview.
- Public content or a public email address is not permission to contact or
  process that site's data. Record the owner's request or other valid contact
  authority and the content-processing scope.
- Record the intended market and supported locale before preparing customer
  copy. Japan is excluded from marketing. Do not infer residence or locale from
  a person's name or domain.
- Describe the supported import subset and known omissions. Do not promise PHP
  theme/plugin, WooCommerce, membership, arbitrary Gutenberg, or full WordPress
  parity. Do not claim MithrilPress is safer or feature-identical without
  reviewed evidence.
- Keep tenant hosting at $0. A separate migration/content-operations service
  may be quoted only after its scope, costs, terms, and approver are recorded.
- Never convert a quota, alert, or application counter into a provider billing
  guarantee. If the provider account cannot enforce a verified hard stop at
  the approved budget, keep onboarding and any metered feature disabled.
- Do not enable automatic plan upgrades or top-ups. Do not charge an owner for
  hosting or service work without a separately accepted proposal.

## 1. Request and service scope

| Field | Record before estimating |
| --- | --- |
| Customer / site owner |  |
| Authorized contact and role |  |
| Contact authority and evidence |  |
| Target market and explicit locale |  |
| Owner-provided export and digest |  |
| Processing, retention, and deletion scope |  |
| Desired migration date and owner reviewer |  |
| Proposal approver and acceptance date |  |

Select and describe only requested work:

| Work item | Included in this proposal? | Deliverable / limit |
| --- | --- | --- |
| Export integrity and supported-content assessment |  |  |
| Import and taxonomy / permalink mapping |  |  |
| Owner-uploaded image mapping |  |  |
| Omission and parity review |  |  |
| Private preview and owner review session |  |  |
| Separate owner approval and publication assistance |  |  |
| Rollback window and restore assistance |  |  |
| DNS record review or owner-guided cutover |  |  |
| Post-publication content operations |  |  |

State exclusions and owner responsibilities:

```text
Unsupported source features:
Third-party licenses or services the owner must retain:
Owner tasks and approval deadlines:
Data retention and deletion date:
Rollback window and exact restore conditions:
Out-of-scope requests:
```

## 2. Provider cost and hard-stop review

Complete this section from the selected Cloudflare account's live plan,
bindings, usage, and billing read-back. A zone's website plan, a free-tier
allowance, or a Dashboard screenshot alone does not prove the Worker plan or a
provider spend cap. Link the actual read-back evidence and its timestamp.

| Cost area | Account / resource | Effective plan and meter | Forecast usage and period | Included allowance | Billable usage and rate source | Hard-stop / fail-closed evidence | Owner and status |
| --- | --- | --- | ---: | ---: | --- | --- | --- |
| Workers requests and CPU |  |  |  |  |  |  |  |
| Workers for Platforms subscription, dispatch requests, CPU, and scripts |  |  |  |  |  |  |  |
| D1 reads, writes, and storage |  |  |  |  |  |  |  |
| R2 storage, Class A/B operations, and retrieval |  |  |  |  |  |  |  |
| Managed `*.sites.mithril.love` wildcard certificate and route |  |  |  |  |  |  |  |
| Customer-owned custom hostnames, including Cloudflare for SaaS overages |  |  |  |  |  |  |  |
| Workers AI or other model use |  |  |  |  |  |  |  |
| Logs, observability, and retention |  |  |  |  |  |  |  |
| TLS, domain, Access, or other add-ons |  |  |  |  |  |  |  |
| Backup, export, or other provider services |  |  |  |  |  |  |  |

Use the provider's current billing units and rate schedule. For a simple
unit-priced row, estimate billable usage as `max(0, forecast usage - included
allowance) × unit rate`; use the provider's actual tiered formula where it
differs. Do not add allowances across unrelated products or billing periods.

Record these release checks before estimating a customer-facing amount:

| Check | Evidence / date | Result |
| --- | --- | --- |
| Cloudflare account identity and account ID |  |  |
| Worker usage plan and billing model |  |  |
| Workers for Platforms entitlement, subscription, and usage overages, if selected |  |  |
| Wildcard TLS coverage and certificate cost for `*.sites.mithril.love` |  |  |
| Cloudflare for SaaS hostname allowance, overage price, and wildcard eligibility |  |  |
| D1 database IDs, current usage, and limits |  |  |
| R2 bucket IDs, current usage, and limits |  |  |
| Metered AI and observability features disabled or verified |  |  |
| Provider-enforced stop at the approved limit |  |  |
| No auto-upgrade, top-up, or paid fallback |  |  |
| Alert recipient, alert threshold, and stop operator |  |  |
| Route, certificate, rollback, and live read-back gate |  |  |

If a row is unknown, mark the provider cost estimate **unverified** and do not
present it as $0. Application-level per-site limits control product behavior;
they do not prevent the hosting provider from metering an invocation or
storage operation before the application rejects it.

## Published plan boundaries checked 2026-10-24

These are published plan terms, not a read-back of the Cloudflare account
selected for deployment. Recheck the effective account plan, billing model,
and bindings before release:

| Product path | Published boundary | Impact on a $0 tenant price and stop claim |
| --- | --- | --- |
| Workers Free | 100,000 requests per account per day; Pages Functions share the Workers request quota. | After the daily limit, a fail-closed Worker route returns Error 1027; a fail-open route bypasses the Worker. Verify the selected account and each route's fail mode before treating this as a stop. |
| Workers Paid | $5/month minimum; 10 million requests/month included, then $0.30 per additional million. | There is no daily request cap. App-side quotas can stop tenant work but cannot prevent provider billing for the invocation that checks the quota. |
| Pages static assets | Static requests are free and unlimited when they do not invoke a Function. Free accounts are limited to 100 Pages projects and 100 custom domains per project. | This can serve static content without per-request Function charges, but the project and hostname limits do not establish worldwide tenant capacity. Pages Functions are billed as Workers. |
| Workers for Platforms | $25/month; 20 million requests, 60 million CPU milliseconds, and 1,000 scripts included, with usage overages. | This provides scale for per-tenant Workers, but its custom CPU and subrequest limits are per invocation, not a monthly spend ceiling. |

On the Free WAF plan, rate-limit match expressions support Path and Verified
Bot fields, not Host, and counting is by IP. WAF counters are not global and
enforcement can fail open under infrastructure load. The Workers Rate Limiting
API is also approximate, with counters maintained separately by Cloudflare
location. These controls can reduce abuse but do not prove a strict global
billing cap for `*.sites.mithril.love`. Keep onboarding disabled until the selected account's
actual plan, edge controls, and stop behavior are verified.

## 3. Optional service labor estimate

Enter only Finance-approved rates and the hours agreed for the selected scope.
Do not treat the template as an offer or billable authorization.

| Service task | Unit | Quantity | Hours per unit | Approved rate | Labor subtotal | Estimate basis / owner |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| Assessment and scope confirmation |  |  |  |  |  |  |
| Import preparation and execution |  |  |  |  |  |  |
| Omission and content review |  |  |  |  |  |  |
| Owner preview and approval support |  |  |  |  |  |  |
| Publication, read-back, and handoff |  |  |  |  |  |  |
| Optional DNS/domain assistance |  |  |  |  |  |  |
| Optional post-launch content operations |  |  |  |  |  |  |
| Other accepted work |  |  |  |  |  |  |

```text
Optional service labor subtotal:
Provider costs, if any, with source and pass-through approval:
Taxes or other charges confirmed by Finance:
Total proposed service amount:
Currency and tax jurisdiction:
Estimate expires on:
```

Keep product/hosting charges separate from optional service work. If a provider
charge is passed through, show its source, period, measurement method, and
owner-approved ceiling. Never create an automatic hosting fee or an automatic
charge when a tenant reaches its usage limit.

## 4. Owner approval and stop conditions

| Approval | Name / evidence | Date |
| --- | --- | --- |
| Owner confirms source export and processing scope |  |  |
| Owner accepts supported-content omissions and preview workflow |  |  |
| Finance approves labor rates and any pass-through costs |  |  |
| Platform owner verifies provider plan, hard stop, and rollback |  |  |
| Customer accepts the separate proposal |  |  |

Stop before receiving customer content if authority or retention terms are
unclear. Stop publication if the owner has not approved the exact revision.
Stop onboarding and metered features if provider cost controls, hostname/TLS,
tenant isolation, rollback, or live read-back are unresolved. A quote or
proposal acceptance does not itself qualify or enable production hosting.

## Current provider references

Re-check these pages when an estimate is prepared; rates, plans, and included
allowances can change:

- [Workers pricing and limits](https://developers.cloudflare.com/workers/platform/pricing/)
- [Workers runtime and account limits](https://developers.cloudflare.com/workers/platform/limits/)
- [Pages Functions pricing](https://developers.cloudflare.com/pages/functions/pricing/)
- [Pages platform limits](https://developers.cloudflare.com/pages/platform/limits/)
- [Pages Functions routing and static request behavior](https://developers.cloudflare.com/pages/functions/routing/)
- [Workers for Platforms pricing and included usage](https://developers.cloudflare.com/cloudflare-for-platforms/workers-for-platforms/reference/pricing/)
- [Workers for Platforms custom limits](https://developers.cloudflare.com/cloudflare-for-platforms/workers-for-platforms/configuration/custom-limits/)
- [WAF rate-limiting rules and plan availability](https://developers.cloudflare.com/waf/rate-limiting-rules/)
- [WAF request-rate calculation](https://developers.cloudflare.com/waf/rate-limiting-rules/request-rate/)
- [WAF fail-open behavior](https://developers.cloudflare.com/waf/rate-limiting-rules/troubleshooting/)
- [Workers Rate Limiting API](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/)
- [Workers for Platforms hostname routing](https://developers.cloudflare.com/cloudflare-for-platforms/workers-for-platforms/configuration/hostname-routing/)
- [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/)
- [R2 pricing](https://developers.cloudflare.com/r2/pricing/)
- [Workers Preview domains and access controls](https://developers.cloudflare.com/workers/previews/custom-domains/)
- [Cloudflare for SaaS hostname allowances and wildcard availability](https://developers.cloudflare.com/cloudflare-for-platforms/cloudflare-for-saas/plans/)
- [Advanced Certificate Manager requirements and deep-subdomain coverage](https://developers.cloudflare.com/ssl/edge-certificates/advanced-certificate-manager/)
- [Universal SSL hostname limitations](https://developers.cloudflare.com/ssl/edge-certificates/universal-ssl/limitations/)
- [Cloudflare child-zone delegation availability](https://developers.cloudflare.com/dns/zone-setups/subdomain-setup/)
- [Wildcard Worker Routes](https://developers.cloudflare.com/workers/configuration/routing/routes/)

For `*.sites.mithril.love`, a wildcard route can provide one shared Worker
attachment, but the full `mithril.love` zone's Universal SSL certificate does
not cover that hostname depth. Advanced Certificate Manager is a paid add-on.
A delegated `sites.mithril.love` child zone would put the wildcard one level
below its own apex, but Cloudflare documents subdomain-zone setups as
Enterprise-only. Do not record either path as zero-cost or available until the
selected account's entitlement and billing are read back.

Cloudflare for SaaS is a separate path for customer-owned domains. Its
published plan table includes 100 hostnames and lists $0.10 per additional
hostname, with wildcard custom hostnames limited to Enterprise. Keep customer
domain costs separate from the managed MithrilPress hostname and from the $0
site-owner price.

Workers for Platforms is an optional paid runtime for platforms that execute
tenant-authored or AI-generated code. Its current published Paid plan starts
at $25/month and includes 20 million requests, 60 million CPU milliseconds,
and 1,000 scripts; additional requests, CPU time, and scripts are billed at
the listed rates. Recheck these values when estimating. MithrilPress renders
owner-approved content in one shared Worker and does not execute tenant code,
so per-tenant Workers are not required for the shared-renderer design. A
wildcard route to that shared Worker remains a separate hostname and TLS
decision. Choosing Workers for Platforms does not itself demonstrate a
provider-wide spending hard stop; record the selected account's enforced
budget boundary before enabling onboarding or metered features.

This worksheet is not a provider quote, customer contract, security guarantee,
or statement that MithrilPress is staffed for managed operations.
