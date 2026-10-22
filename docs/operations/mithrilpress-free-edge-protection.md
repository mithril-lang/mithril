# MithrilPress Wildcard Worker Route Gate

**Status: not selected for the default static site plane. No WAF rule or
production route has been created.** This guide records why the older shared
`*.sites.mithril.love` Worker-route candidate remains disabled. The current
candidate is one Pages project and exact custom domain per site; see
`docs/design/mithrilpress-static-publication.md`. This file does not authorize
changes to customer-owned DNS or optional Cloudflare for SaaS hostnames.

## Request and quota boundary

The legacy wildcard Worker route would share the existing parent zone with
unrelated hostnames. A Cloudflare route can match the platform wildcard, but a
Free WAF rate-limiting rule cannot safely protect it by itself. Pages exact
custom domains do not need this wildcard ingress.

Cloudflare's current Free rate-limiting rules support only Path and Verified Bot
fields in the rule expression. They do not support host matching. A path rule
on the parent zone would count and block requests to unrelated hosts whenever
their paths match. Do not create or enable the previously proposed path-only
MithrilPress rule on the parent zone.

Cloudflare documents standalone subdomain-zone setup as Enterprise-only. Keep
the legacy wildcard Worker route and onboarding disabled. The Pages candidate
instead binds each exact hostname to its own static project and still requires
isolated-zone TLS and account-cap qualification.

## Gate before provisioning

1. Do not create a parent-zone Free rate-limit rule for MithrilPress. Its
   path-only expression would affect unrelated `mithril.love` hosts.
2. Verify a host-scoped ingress control that can match only platform hostnames,
   or approve a separate zone and plan that supports it. Do not create a child
   zone for `sites.mithril.love` on a plan that does not support subdomain-zone
   setup.
3. Read back the Workers plan and shared usage, exact wildcard DNS record and
   Worker route, fail-closed setting, and the account-wide cost boundary.
4. For any future guard, read back its expression and scope. Before public
   onboarding, canary one request below and one above its threshold; confirm
   blocked requests do not invoke the Worker and unrelated parent-zone hosts
   still behave normally.
5. Record the provider read-back, canary evidence, rollback action, and owner.
   If host scoping, plan, cost boundary, or rollback cannot be verified, keep
   the wildcard route disabled. For the Pages candidate, follow the separate
   project, exact-domain, static-asset, and capacity gates in the design doc.

## Limits that remain

Application request caps execute after the Worker starts. Workers Free has an
account-wide daily request hard limit, but Workers Paid has no daily request
limit. D1 Free rejects queries after its daily row limits. R2 allowances are
account-wide and usage above them is billed without a provider-enforced hard
stop. A plan change, other account workloads, or a new access path invalidates
application-level budget assumptions.

Revalidate the plan and any approved host-scoped guard before each release.
Keep production routing off until the provider state and blocked-request
behavior have been read back.

## Cloudflare references

- [Rate-limiting rule availability and supported fields](https://developers.cloudflare.com/waf/rate-limiting-rules/)
- [Rate-limit request counting and data-center locality](https://developers.cloudflare.com/waf/rate-limiting-rules/request-rate/)
- [Create a zone rate-limiting rule with the API](https://developers.cloudflare.com/waf/rate-limiting-rules/create-api/)
- [Worker execution follows the Cloudflare WAF](https://developers.cloudflare.com/learning-paths/mtls/mtls-workers/)
- [Workers Free request limits](https://developers.cloudflare.com/workers/platform/limits/)
- [D1 Free behavior](https://developers.cloudflare.com/d1/reference/faq/)
- [R2 pricing and free allowances](https://developers.cloudflare.com/r2/pricing/)
