# MithrilPress wildcard hosting rollout

**Status: design and rollout gates only. No production DNS record, Worker
Route, certificate, or deployment has been created.** The target is free public
hosting for site owners. This does not make provider usage free for the operator:
application caps stop CMS work, but they do not automatically stop Cloudflare
metering for requests that already reached a Worker or R2. Provider-level hard
stops and any operator budget must be verified before launch.

This runbook covers MithrilPress-controlled hosts under
`*.sites.mithril.love`. It is separate from customer-owned domains and from
full nameserver migration. The tenant renderer executes MithrilPress code only;
tenant-provided code is never run.

## Target topology

Use one proxied DNS wildcard, one Worker Route, and the existing exact D1
hostname registry:

```text
*.sites.mithril.love  -- proxied DNS --> Cloudflare edge
*.sites.mithril.love/* -- Worker Route --> mithrilpress Worker
                                            |
                                            +-- exact hostname lookup in D1
```

The Worker must serve a tenant only when the normalized, one-label hostname
resolves to exactly one active site. Unknown, reserved, inactive, malformed,
and multi-label tenant hosts fail closed. No request may fall back to another
site or to a default tenant. `*.sites.mithril.love` is deeper than the parent
zone's Universal SSL coverage, so the route is unusable until a certificate
explicitly covers that wildcard.

An exact Worker Custom Domain per tenant remains the bounded first cohort and
is capped at 90. Cloudflare currently documents limits of 100 Custom Domains
and 1,000 Routes per zone. One wildcard Route plus one proxied wildcard DNS
record is a candidate scale path for this shared renderer. Cloudflare's Routes
guidance recommends Custom Domains when a Worker is the application origin;
this direct-Worker-origin route is a design exception that must pass
isolated-zone qualification. Cloudflare's wildcard-route guidance for Workers
for Platforms covers a different dispatch model and does not by itself qualify
this topology. Workers for Platforms is not required for the current shared
renderer because tenants do not deploy or execute Worker code.

## Limited invite previews with Worker Previews

Cloudflare Worker Previews offer a separate candidate for short-lived migration
demos. Configure `sites.mithril.love` as a Preview-only custom domain
(`previews_enabled=true`, `enabled=false`); Cloudflare creates wildcard DNS and
an SSL certificate for `*.sites.mithril.love`, then routes
`<preview-name>.sites.mithril.love` to the Preview with that name. This can
provide the requested hostname and TLS for a bounded demo pool without turning
the production tenant route into a Preview route.

Treat each Preview as a branch environment, not as a durable tenant attachment.
Free accounts allow 100 Previews per Worker; paid accounts allow 500. Cloudflare
deletes the least recently deployed Preview when that limit is reached. Enforce
a lower product cap and an explicit expiry/archive flow before creating any
Preview, and do not rely on provider eviction to retain a prospect's demo.

Previews are public by default. Protect them with Cloudflare Access or a
separately reviewed, expiring invite gate, and add `X-Robots-Tag: noindex` to
Worker responses on this custom domain. Preview configuration does not inherit
production settings. Bind demo previews only to demo data/resources; D1, KV and
R2 are shared unless a separate resource is configured. Do not expose an
owner's live WordPress credentials or reuse the production database.

This path is suitable only for a capped, expiring sales-demo pool. It does not
provide persistent worldwide tenant capacity, and the current `fund-mithril`
Workers plan and Preview quota are not verified. Validate the actual domain,
certificate, access policy, resource bindings, expiry, deletion, and rollback in
an isolated zone before sending external preview links. No Preview domain,
DNS record, or deployment is provisioned by this runbook. See [Worker Preview
custom domains](https://developers.cloudflare.com/workers/previews/custom-domains/)
and [Preview limits and isolation](https://developers.cloudflare.com/workers/previews/).

## Required gates before production

1. Qualify the exact Worker source with the approved standalone profile, then
   qualify integrated current `main`. Keep both receipts and their source
   hashes.
2. Read back the `fund-mithril` account, `mithril.love` zone, `mithrilpress`
   Worker, D1 binding, and current Routes/DNS/certificate state. Confirm
   Billing Read and the Workers account plan. A zone's `Free Website` label
   does not prove the Workers plan. If the plan or budget cannot be read, keep
   public hosting disabled.
3. Choose and record the operator cost boundary separately from the tenant
   price. The tenant price is $0. The certificate add-on and usage beyond
   provider-included amounts can cost the operator. Do not enable automatic
   upgrades. Application request/storage caps are not provider billing stops;
   a paid Worker still receives and meters each request before application code
   can reject it. A budget alert is a notification, not a technical spend cap.
4. Qualify the Route and originless DNS pattern in an isolated zone first.
   Cloudflare's Routes documentation recommends Custom Domains when a Worker
   is the application origin. Custom Domains attach to exact hostnames rather
   than one wildcard tenant pattern, so this Route-based scale path is a
   deliberate exception. Prove that the Worker directly returns responses
   without reaching an origin, and inspect route precedence with the exact-zone
   setup.
5. Test certificate issuance and renewal, unknown-host isolation, tenant
   separation, abuse limits, app caps, monitoring, rollback, and public HTTPS
   read-back in the isolated zone. Keep the production feature gate disabled
   until every result is recorded.

## Provisioning sequence

All provider changes are manual operator actions until an exact-source,
reviewed provisioning tool is qualified. Never paste API tokens into the
Worker, tenant request, URL, shell history, or a Linear comment.

1. **Certificate first.** Order an Advanced Certificate Manager certificate
   whose hostname list explicitly includes `*.sites.mithril.love`. Wait until
   its certificate pack is `Active`; record its pack ID, covered hostnames, and
   expiry. The parent-zone Universal SSL certificate is insufficient. Creating
   an advanced certificate is a paid action and must follow the approved
   operator budget.
2. **Record the baseline.** Save the current exact DNS records, Routes, Worker
   Custom Domains, and certificate pack metadata. Verify every existing exact
   hostname that must remain available before proceeding.
3. **Create the wildcard DNS record.** In the `mithril.love` zone, add one
   `A` record named `*.sites` with content `192.0.2.0`, TTL Auto, and proxy
   enabled. This reserved address is only an origin placeholder; proxied
   requests must be intercepted by the Worker Route. Do not use it as a
   reachable origin.
4. **Create the route.** Attach the exact pattern
   `*.sites.mithril.love/*` to the `mithrilpress` Worker in the same zone. Set
   the route's request-limit mode to fail closed
   (`request_limit_fail_open=false`) using a Cloudflare-supported control.
   Cloudflare's Workers limits guide says fail-closed mode returns Error 1027
   after the Free-plan daily request limit; verify the selected route's mode in
   the dashboard. The current Routes API OpenAPI schema does not document this
   mode as a request or read-back field, so do not infer its value from a
   successful route-create or read response. If fail-closed mode cannot be
   verified for this exact route, do not enable the wildcard. This pattern
   must not be broadened to `*mithril.love/*`, the apex, or
   `control.mithril.love`.
5. **Read back each object.** Confirm one exact wildcard A record with the
   expected content and `proxied=true`; one exact wildcard Route bound to the
   correct Worker; and an active certificate covering the exact wildcard.
   Then resolve DNS and perform HTTPS requests from outside the account.
6. **Run tenant checks.** Request one known published tenant, one private
   preview without authentication, an unknown label, every reserved label,
   and a multi-label hostname. Known public content must match its exact D1
   tenant; previews stay private/noindex; all other hosts return a generic
   not-found response. Also test WordPress REST reads, per-site/global caps,
   and request-spoofing/cross-tenant controls.

## Rollback and stop conditions

- If the certificate is not active, DNS is not proxied, the Route points to a
  different Worker, HTTPS read-back fails, or an unknown host returns content,
  stop onboarding and disable the wildcard Route. Preserve the recorded
  baseline and reconcile the provider state before retrying.
- Keep exact Worker Custom Domains for the first cohort until the wildcard
  route has passed all live checks. If Route delivery fails during rollout,
  those exact hosts remain the recovery path for that cohort.
- Once tenants beyond the exact-host cohort use the wildcard route, application
  rollback must keep the wildcard DNS, certificate, and Route in place while
  restoring the previous qualified Worker artifact. Removing wildcard
  routing would make those later hosts unavailable; it does not delete their
  content from D1 or R2.
- Keep tenant publishing and processing stopped at the configured product caps.
  If account-level usage or the operator budget cannot be verified, do not
  enable new tenant onboarding or paid provider features.

## Current external limits

Cloudflare currently documents 100 Worker Custom Domains per zone and 1,000
Worker Routes per zone. The wildcard path uses one Route. Route patterns
require a proxied DNS record; the documented wildcard pattern
`*.example.com/*` does not match the parent hostname. Cloudflare's Routes guide
recommends Custom Domains when the Worker is the application origin, so this
runbook treats a wildcard route to the shared renderer as an unqualified design
exception. Advanced Certificate Manager supports deep subdomains; Universal
SSL on `mithril.love` covers only the apex and first-level names.

## Provider hard-stop requirements

These constraints were verified against Cloudflare's documentation on
2026-10-23 and must be rechecked before provisioning:

- Workers Free enforces 100,000 requests per account per UTC day. When reached,
  a route configured to fail closed returns Error 1027; fail-open bypasses the
  Worker. The allowance is account-wide, not isolated to MithrilPress, so do
  not use it as a MithrilPress-only cap on an account that also hosts other
  services. The `request_limit_fail_open=false` route setting is mandatory for
  a Free-plan hard stop.
- Workers Paid has no daily request limit. Its included monthly usage and
  overage billing are shared at the account level. An application quota checked
  in the Worker cannot prevent a request from being metered, and Cloudflare
  budget alerts notify rather than block usage. Do not claim a provider hard
  stop on a Paid account without another verified ingress stop.
- D1 Free-plan row-read and row-write limit violations cause queries to fail
  until midnight UTC; this behavior has been enforced since 2026-09-01. Do not
  assume the same stop applies when the account is on a paid plan.
- R2 includes monthly storage and operation allowances, with overage pricing
  after those allowances. Per-site object caps limit accepted CMS writes, but
  they do not establish a provider-enforced spend ceiling for reads or
  concurrent usage.

The `fund-mithril` account is shared with existing Workers. A Free-plan account
limit could therefore interrupt unrelated services, while a Paid plan can
continue billing beyond included usage. Record the account plan, provider usage,
and operator-approved stop mechanism in Linear before enabling the wildcard.
If the only available control is a budget alert or an application quota, the
cost hard-stop gate is still open.

Sources: [Workers limits](https://developers.cloudflare.com/workers/platform/limits/),
[Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/),
[Worker Routes](https://developers.cloudflare.com/workers/configuration/routing/routes/),
[Worker Routes API](https://developers.cloudflare.com/api/resources/workers/subresources/routes/methods/create/),
[D1 Free-tier enforcement notice](https://developers.cloudflare.com/changelog/post/2026-09-01-d1-free-tier-limit-enforcement/),
[R2 pricing](https://developers.cloudflare.com/r2/pricing/),
[Billable Usage and Budget Alerts](https://developers.cloudflare.com/changelog/post/2026-04-13-billable-usage-dashboard-and-budget-alerts/),
[Custom Domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/),
[Advanced Certificate Manager](https://developers.cloudflare.com/ssl/edge-certificates/advanced-certificate-manager/),
[originless proxied hostname example](https://developers.cloudflare.com/sandbox/sdk/guides/preview-urls-custom-domain/).

Track provider entitlement, account billing, isolated-zone qualification, and
operator cost controls in Linear issue
[MITHRIL-543](https://linear.app/kotobalabs/issue/MITHRIL-543/qualify-wildcard-hosting-scale-and-free-hard-stop-for-mithrilpress).
