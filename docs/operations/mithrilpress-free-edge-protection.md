# MithrilPress Free Edge Protection

**Status: deployment gate only. No WAF rule or production route has been
created.** This guide covers the default `*.sites.mithril.love` platform host
in the existing parent zone; it does not authorize changes to customer-owned
DNS or optional Cloudflare for SaaS hostnames.

## Request and quota boundary

The default host `*.sites.mithril.love` shares the existing parent zone with
unrelated hostnames. A Cloudflare route can match the platform wildcard, but a
Free WAF rate-limiting rule cannot safely protect it by itself.

Cloudflare's current Free rate-limiting rules support only Path and Verified Bot
fields in the rule expression. They do not support host matching. A path rule
on the parent zone would count and block requests to unrelated hosts whenever
their paths match. Do not create or enable the previously proposed path-only
MithrilPress rule on the parent zone.

Cloudflare documents standalone subdomain-zone setup as Enterprise-only. The
default hostname therefore cannot be isolated into a child zone under the
current parent-zone arrangement. Keep the public Worker route and onboarding
disabled until a host-scoped edge guard or an approved isolated hosting zone is
available.

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
   the wildcard route disabled.

## Limits that remain

Application request caps execute after the Worker starts. The shared deployment
counter now runs before tenant lookup and counts unknown-host requests; even a
request rejected at that cap still invokes the Worker and runs the D1 counter
check. Since the cap is shared across all hosts, anonymous unknown-host traffic
can exhaust it and deny service to every hosted site. Workers Free has an
account-wide daily request hard limit, but Workers Paid has no daily request
limit. D1 Free rejects queries after its daily row
limits only while the deployment is verified as Workers Free. R2 allowances are
account-wide and usage above them is billed without a provider-enforced hard
stop. A plan change, other account workloads, or a new access path invalidates
application-level budget assumptions.

## R2 included-usage envelope

The Worker currently caps media storage at 8 GiB deployment-wide, media writes
(uploads and deletes) at 10,000/day, and media reads at 50,000/day. Cloudflare's
Standard R2 free allowance is 10 GB-month of storage, 1 million Class A
operations/month, and 10 million Class B operations/month. Using decimal units,
8 GiB is about 8.59 GB, below the included storage allowance if sustained for a
full month. The daily operation caps correspond to at most 310,000 writes and
1.55 million reads over a 31-day month. Even budgeting two Class A operations
for each counted write (one upload plus one later cleanup) yields at most
620,000, below the included 1 million. Any extra cleanup retries or other
operator-initiated bucket activity fall outside this envelope and must be
accounted for separately.

This is a source-level budget calculation, not Cloudflare usage telemetry or a
bill guarantee. R2 allowances are account-wide. The calculation is valid only
for an isolated account where no other bucket or workload consumes those
allowances; read back provider usage before and during any canary. Keep R2
disabled if the account is shared, the plan is not verified, or observed usage
does not leave the stated margin. Do not activate the R2 subscription merely
because the application has these caps: Cloudflare bills usage above its
included monthly allowances.

Failed media uploads retain their private D1 reservation and any R2 object for
operator reconciliation. Do not release that reservation until object removal
is confirmed; otherwise an object left behind after a failed delete could fall
outside the application storage ceiling.

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
