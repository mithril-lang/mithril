# MithrilPress wildcard hosting rollout

**Status: design and rollout gates only. No production DNS record, Worker
Route, certificate, or deployment has been created.** The target is free public
hosting for site owners with product caps that stop new work at the limit. The
operator still pays Cloudflare charges and must approve an explicit budget.

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
is capped at 90. It is not the worldwide scale path: Cloudflare documents 100
Custom Domains per zone and recommends wildcard Routes above that limit. A
single wildcard Route does not create a Worker per tenant, so Workers for
Platforms is not needed for the current shared renderer.

## Required gates before production

1. Qualify the exact Worker source with the approved standalone profile, then
   qualify integrated current `main`. Keep both receipts and their source
   hashes.
2. Read back the `fund-mithril` account, `mithril.love` zone, `mithrilpress`
   Worker, D1 binding, and current Routes/DNS/certificate state. Confirm
   Billing Read and the Workers account plan. A zone's `Free Website` label
   does not prove the Workers plan.
3. Approve operator spend for the certificate and shared account usage. The
   certificate add-on is an operator cost; tenant accounts stay free. Do not
   enable automatic upgrades. Product request caps do not cap provider-billed
   Worker invocations by themselves.
4. Qualify the Route and originless DNS pattern in an isolated zone first.
   Cloudflare's Routes documentation recommends Custom Domains when a Worker
   is the application origin. Custom Domains cannot use wildcard records, so
   this Route-based scale path is a deliberate exception. Prove that the Worker
   directly returns responses without reaching an origin, and inspect route
   precedence with the exact-zone setup.
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
   `*.sites.mithril.love/*` to the `mithrilpress` Worker in the same zone.
   This pattern must not be broadened to `*mithril.love/*`, the apex, or
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
Worker Routes per zone. The wildcard path uses one Route. Cloudflare documents
that `*.example.com/*` matches subhosts, not the parent hostname, and requires
a proxied DNS record. Advanced Certificate Manager supports deep subdomains;
Universal SSL on `mithril.love` covers only the apex and first-level names.

Sources: [Workers limits](https://developers.cloudflare.com/workers/platform/limits/),
[Routes](https://developers.cloudflare.com/workers/configuration/routing/routes/),
[Custom Domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/),
[Advanced Certificate Manager](https://developers.cloudflare.com/ssl/edge-certificates/advanced-certificate-manager/),
[originless proxied hostname example](https://developers.cloudflare.com/sandbox/sdk/guides/preview-urls-custom-domain/).

Track provider entitlement, account billing, isolated-zone qualification, and
operator cost controls in Linear issue
[MITHRIL-543](https://linear.app/kotobalabs/issue/MITHRIL-543/qualify-wildcard-hosting-scale-and-free-hard-stop-for-mithrilpress).
