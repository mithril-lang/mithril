# MithrilPress Free Edge Protection

**Status: deployment gate only. No MithrilPress Worker route or DNS record has
been created.** This guide covers the default `*.sites.mithril.love` namespace
in the existing parent zone. It does not authorize changes to customer-owned
DNS or optional Cloudflare for SaaS hostnames.

## Latest read-only account inventory

On 2026-10-22, Cloudflare API reads scoped to the user-confirmed `fund-mithril`
account (`62e1fda53188460698f8c66d3aef59c6`) found the active `mithril.love`
zone (`d9f6a932ebbaa5fc56e1055f910c092d`, Free Website plan), no
`mithrilpress` Worker, no matching Worker route, an empty zone DNS inventory,
and no active certificate covering
`*.sites.mithril.love`. The zone's `http_ratelimit` phase has no entrypoint
ruleset. These reads do not verify the account-level Workers subscription,
current usage, R2 billing stop, or all legacy security settings. The separate
2026-10-21 dashboard record in Linear MITHRIL-292 reported Workers Paid; verify
that account-level subscription again before any release decision.

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
for requests rejected at the app layer. Workers Free has a 100,000 request
daily account-wide limit shared by unrelated Workers; it returns Error 1027
when exhausted. A Worker Route can either fail open (bypass the Worker) or
fail closed (return the 1027 error page). Public hosting must use a route whose
`request_limit_fail_open` value reads back as `false`; otherwise limit
exhaustion could bypass tenant and owner-auth checks. Workers Paid has no
account daily hard stop. D1 and R2 have separate account-wide allowances, and
R2 overages can be billed without a provider hard stop. Site owners pay
nothing, and the service must stop at its cap; that promise does not authorize
operator overages.

The `fund-mithril` Workers subscription remains unverified because Billing
Read is unavailable to the current Cloudflare connection. Do not infer a Free
Workers plan from the parent zone's Free Website plan. Even if the account is
on Workers Free and the route is fail-closed, its request cap is shared with
other Workers in the account; it is not an isolated MithrilPress allowance and
does not stop R2 overages. Keep the public route blocked until the plan and all
provider-cost boundaries are read back.

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
`--confirm-platform-host '*.sites.mithril.love'` are supplied. `enable` remains
blocked even with those flags: the CLI cannot verify a host-aware abuse
control or an enforceable provider-cost stop for Worker, D1, and R2. A WAF rate
limit and application counters are not provider billing stops. The command
checks the exact account/zone, deployed Worker, overlapping routes, and
routing-capable DNS records under the namespace, plus the matching active
certificate for status and planning. It displays `request_limit_fail_open`,
blocks an existing route unless that value is `false`, and checks the same
fail-closed value after route creation. Enable refuses to activate either partial
state: wildcard DNS without the route, or the route without managed wildcard
DNS. Disable may clean up these partial states after a fresh read. For a failed
create, it reads Cloudflare state again and deletes only a
resource whose create response returned its ID, then reads deletion back. If
the response did not provide an ID, the CLI never deletes by a matching guess.
A remaining match is reported as incomplete rollback; if no match is
immediately visible, the ambiguous outcome still requires manual inspection
before retrying. `disable` remains available to remove the route before DNS.

## Cloudflare references

- [Workers routes and wildcard patterns](https://developers.cloudflare.com/workers/configuration/routing/routes/)
- [Workers limits, including Custom Domains per zone](https://developers.cloudflare.com/workers/platform/limits/)
- [Universal SSL limitations](https://developers.cloudflare.com/ssl/edge-certificates/universal-ssl/limitations/)
- [Advanced Certificate Manager](https://developers.cloudflare.com/ssl/edge-certificates/advanced-certificate-manager/)
- [Workers authorization and route permissions](https://developers.cloudflare.com/workers/authorization/workers/)
- [Rate-limiting rule availability and supported fields](https://developers.cloudflare.com/waf/rate-limiting-rules/)
- [Rate-limit request counting and data-center locality](https://developers.cloudflare.com/waf/rate-limiting-rules/request-rate/)
- [Workers Free request limits](https://developers.cloudflare.com/workers/platform/limits/)
- [Workers Routes API response behavior](https://developers.cloudflare.com/changelog/post/2025-04-15-workers-api-fixes/)
- [D1 Free behavior](https://developers.cloudflare.com/d1/reference/faq/)
- [R2 pricing and free allowances](https://developers.cloudflare.com/r2/pricing/)
