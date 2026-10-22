# MithrilPress Free Edge Protection

**Status: deployment gate only. No MithrilPress Worker Custom Domain, DNS
record, or public hostname has been created.** This guide covers the default
`*.sites.mithril.love` address namespace in the existing parent zone. It does
not authorize changes to customer-owned DNS or optional Cloudflare for SaaS
hostnames.

## Exact-host routing

The selected Cloudflare account is `fund-mithril` and the active
`mithril.love` zone is Free Website. Cloudflare Workers Custom Domains is the
default-host routing model: attach one exact hostname, and Cloudflare creates
its DNS record and certificate and routes the entire hostname to the Worker.
The current limit is 100 Custom Domains per zone. Do not create a wildcard DNS
record or wildcard Worker route. An unregistered label has no MithrilPress DNS
record and cannot invoke the Worker.

An attached hostname is public as soon as Cloudflare enables it. Before
attaching, verify the exact tenant mapping, owner publication approval,
exact-source standalone qualification, Workers account plan, provider-cost
boundary, and rollback. The operator CLI requires `--apply` and an exact
`--confirm-hostname`; `attach` also requires `--confirm-publication` after
checking owner approval. Its read-only `status` action checks the Worker Domain
and DNS records. See [domain lifecycle](../design/mithrilpress-domain-lifecycle.md)
and [Cloudflare credential boundaries](../design/mithrilpress-cloudflare-auth.md).

## Active-host abuse and cost boundary

Exact-host routing does not rate-limit an attached hostname. The shared
MithrilPress request counter executes after Worker invocation, so requests
rejected at the application cap can still consume Worker and D1 resources.
Cloudflare Free rate-limiting expressions support Path and Verified Bot fields,
but not Host matching. A path-only rule on the parent zone would affect
unrelated `mithril.love` hosts; do not use one for MithrilPress protection.

The `fund-mithril` zone plan read is not the account-level Workers plan. The
subscription endpoint could not be read with the current Cloudflare connection;
a prior dashboard snapshot recorded Workers Paid. Workers Paid has no
account-wide daily request hard stop. Workers Free has an account-wide daily
limit, but the account shares it with unrelated Workers. D1 and R2 have separate
account-wide quotas, and R2 excess usage can be billed without a provider
hard-stop. Application caps do not establish a zero-cost provider boundary.
Site owners pay nothing, and MithrilPress must stop processing at its caps;
that promise does not authorize provider overages.

## Gate before public hostname attachment

1. Keep `workers.dev` disabled and do not create wildcard DNS or a wildcard
   Worker route.
2. Read back the account-level Workers subscription and current shared usage
   through an authorized Cloudflare connection. Confirm that the selected plan
   and its behavior can enforce the service's stop policy.
3. Verify a control that limits floods to attached hostnames before they
   consume unbounded provider resources, or keep public onboarding disabled.
   Do not deploy a parent-zone Free path-only rate-limit rule.
4. Qualify the exact Worker source and verify the tenant mapping and owner
   publication approval before attaching a hostname. Canary application caps
   and confirm that capped requests return the expected response.
5. Record exact hostname, account, zone, Worker, DNS/TLS read-back, cap canary,
   rollback, and responsible operator. To roll back, suspend serving first,
   detach the exact Worker Domain, then verify it and its DNS record are gone.

The product namespace currently fits within Cloudflare's documented 100 Custom
Domains per zone. Plan another hosting topology before reaching that limit.
Recheck provider quotas and pricing before each release.

## Cloudflare references

- [Workers Custom Domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/)
- [Workers limits, including Custom Domains per zone](https://developers.cloudflare.com/workers/platform/limits/)
- [Workers authorization and route permissions](https://developers.cloudflare.com/workers/authorization/workers/)
- [Rate-limiting rule availability and supported fields](https://developers.cloudflare.com/waf/rate-limiting-rules/)
- [Rate-limit request counting and data-center locality](https://developers.cloudflare.com/waf/rate-limiting-rules/request-rate/)
- [Workers Free request limits](https://developers.cloudflare.com/workers/platform/limits/)
- [D1 Free behavior](https://developers.cloudflare.com/d1/reference/faq/)
- [R2 pricing and free allowances](https://developers.cloudflare.com/r2/pricing/)
