# MithrilPress Free Edge Protection

**Status: deployment gate only. No MithrilPress Worker route or DNS record has
been created.** This guide covers the default `*.sites.mithril.love` namespace
in the existing parent zone. It does not authorize changes to customer-owned
DNS or optional Cloudflare for SaaS hostnames.

## Wildcard routing model

The selected Cloudflare account is `fund-mithril`, and its active
`mithril.love` zone is Free Website. Global subdomain hosting requires one
proxied wildcard DNS record and one Worker Route for
`*.sites.mithril.love/*`. Cloudflare limits Worker Custom Domains to 100 per
zone and recommends wildcard routes for larger sets; MithrilPress does not
need per-site Worker Custom Domains because one Worker resolves exact tenant
hostnames in D1.

The latest read-only certificate inventory found Universal SSL coverage for
`mithril.love` and `*.mithril.love`, but not `*.sites.mithril.love`. A wildcard
route must stay disabled until an active certificate covers that deeper name.
The certificate option and its cost require an explicit operator decision.
The Cloudflare account Workers subscription also needs an authorized read-back
before public hosting.

Wildcard DNS sends arbitrary labels, including unregistered names, to the
Worker. MithrilPress currently increments its shared D1 request counter before
hostname resolution. Unknown-host floods can therefore consume Worker
invocations and D1 writes before the app returns 404 or reaches its cap. A
wildcard route is not safe to expose until the service has a host-aware edge
abuse control and a verified provider-cost stop.

## Active-host abuse and cost boundary

Cloudflare Free rate-limiting expressions support Path and Verified Bot fields,
but not Host matching. A path-only rule on `mithril.love` would also affect
unrelated websites in the parent zone, so do not use it as MithrilPress
protection. Pro provides host matching, but its request counting still uses IP
characteristics and does not itself stop account charges. Verify the actual
plan, rule scope, and enforcement behavior before relying on it.

MithrilPress caps requests per site and across its deployment. Those app caps
run after a Worker invocation and D1 counter write, so they do not limit cost
for requests rejected at the app layer. Workers Free has a daily account-wide
hard request limit shared by unrelated Workers; Workers Paid has no account
daily hard stop. D1 and R2 have separate account-wide allowances, and R2
overages can be billed without a provider hard stop. Site owners pay nothing,
and the service must stop at its cap; that promise does not authorize operator
overages.

## Gate before public route enablement

1. Keep `workers.dev`, wildcard DNS, and the wildcard Worker Route disabled.
2. Read back the account-level Workers subscription, shared usage, R2 and D1
   allowances, and the `*.sites.mithril.love` certificate. Resolve the
   certificate entitlement and cost before ordering or enabling it.
3. Establish a host-aware abuse control that protects the wildcard endpoint
   without changing unrelated `mithril.love` sites. Confirm that unknown-host
   traffic cannot cause unbounded D1 work or provider charges.
4. Verify the stop-at-cap behavior for Worker, D1, R2, and AI usage. Account
   budgets and application counters alone are not provider hard stops.
5. Qualify the exact Worker source, then verify the wildcard DNS record, route,
   certificate, tenant isolation, owner publication approval, and rollback.
   Only then may the operator enable the platform route.
6. Record account, zone, Worker, certificate, route, DNS, cap canary, rollback,
   and responsible operator. To roll back, suspend public tenant mappings,
   remove the wildcard route, then remove its DNS record and read back both.

The CLI in `apps/mithrilpress-worker/scripts/provision-platform-route.mjs`
is read-only unless `--apply` and the exact
`--confirm-platform-host '*.sites.mithril.love'` are supplied. It checks the
exact account/zone, deployed Worker, overlapping routes, routing-capable DNS
records under the namespace, and a matching active certificate before it
plans writes. It creates the route before DNS, removes the route before DNS,
and verifies cleanup of newly created resources if final read-back fails.
The CLI cannot buy a certificate, change the account plan, approve tenant
publication, or supply the missing abuse and cost controls.

## Cloudflare references

- [Workers routes and wildcard patterns](https://developers.cloudflare.com/workers/configuration/routing/routes/)
- [Workers limits, including Custom Domains per zone](https://developers.cloudflare.com/workers/platform/limits/)
- [Universal SSL limitations](https://developers.cloudflare.com/ssl/edge-certificates/universal-ssl/limitations/)
- [Advanced Certificate Manager](https://developers.cloudflare.com/ssl/edge-certificates/advanced-certificate-manager/)
- [Workers authorization and route permissions](https://developers.cloudflare.com/workers/authorization/workers/)
- [Rate-limiting rule availability and supported fields](https://developers.cloudflare.com/waf/rate-limiting-rules/)
- [Rate-limit request counting and data-center locality](https://developers.cloudflare.com/waf/rate-limiting-rules/request-rate/)
- [Workers Free request limits](https://developers.cloudflare.com/workers/platform/limits/)
- [D1 Free behavior](https://developers.cloudflare.com/d1/reference/faq/)
- [R2 pricing and free allowances](https://developers.cloudflare.com/r2/pricing/)
