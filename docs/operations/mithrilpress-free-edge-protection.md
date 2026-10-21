# MithrilPress Free Edge Protection

**Status: deployment guide only. No WAF rule or production route has been
created.** This guide covers the default `*.sites.mithril.love` platform zone;
it does not authorize changes to customer-owned DNS or optional Cloudflare for
SaaS hostnames.

## Request and quota boundary

Place the child zone `sites.mithril.love`, the MithrilPress Worker, and its D1
database in the isolated Cloudflare Workers Free account. Delegate only that
child zone from `mithril.love`. Do not add the edge rule to the parent zone.

Cloudflare evaluates WAF rate-limiting rules before Worker execution. A zone-
level rule can reject a burst at the edge, before it reaches the shared Worker.
Keep the application request caps as a separate tenant and deployment stop;
they run after the Worker starts and do not replace the provider's Free-plan
hard stops.

Cloudflare's current Free WAF plan permits one rate-limiting rule per zone. Its
rule expression can match the request path, its counter characteristic is the
client IP, and both the counting period and mitigation timeout are 10 seconds.
The rate counters are local to Cloudflare data centers, not a global account
counter. This rule reduces single-IP bursts; it is not a global traffic budget,
a fair per-tenant quota, or a guarantee against a distributed flood. A shared
NAT or proxy address can also combine otherwise legitimate visitors.

## Initial zone rule

Use one rule on the dedicated child zone so it covers the platform's routed
hostnames without needing a host-field match, which the Free rule expression
does not provide. The following is the starting candidate; review it against
legitimate canary traffic before opening public onboarding.

```json
{
  "description": "MithrilPress platform ingress burst limit",
  "expression": "(http.request.uri.path matches \"^/\")",
  "action": "block",
  "ratelimit": {
    "characteristics": ["cf.colo.id", "ip.src"],
    "period": 10,
    "requests_per_period": 100,
    "mitigation_timeout": 10
  }
}
```

The value of 100 requests per 10 seconds is an initial operating threshold, not
a measured capacity claim. The `cf.colo.id` characteristic is required when
creating a rule through the API. Do not enable cached-asset exclusion: every
request reaching the platform host should count toward this burst guard.

## Provision and verify

1. Read back the exact child-zone ID, Workers Free plan, delegated nameservers,
   and the absence of unrelated routes before making changes.
2. Give the provisioning operator a token scoped only to the `sites.mithril.love`
   child zone with `Zone WAF Write`. Use a separate narrowly scoped token for
   DNS delegation and Worker deployment. Never store either token in the
   application or in this repository.
3. Read the zone's existing `http_ratelimit` entry-point ruleset first. Create
   the rule there, after existing rules. Do not replace an existing ruleset or
   create a duplicate rule. The Free plan has one rule slot.
4. Read back the saved expression, IP characteristic, 10-second period,
   request threshold, block action, and 10-second timeout. Confirm that the
   WAF rule applies to the delegated child zone and that a blocked request does
   not invoke the Worker.
5. Before public onboarding, test one request below the threshold and one over
   it in the canary zone. Check the WAF event and Worker request evidence, then
   verify that normal site, Studio, REST, preview, and media routes still work.
   Tune the threshold if legitimate traffic is blocked.
6. Keep the route fail-closed and record the rule read-back, Worker/D1 plan,
   current quota state, rollback action, and responsible owner in the release
   record. If the rule or the Free plan cannot be verified, keep the wildcard
   route disabled.

## Limits that remain

The Free WAF rule has per-IP, per-data-center counters and can be bypassed by
traffic distributed across many source IPs or locations. Cloudflare Workers
Free and D1 Free quotas remain the account-wide no-overage stop; a quota can
still make all hosted sites unavailable until reset. R2 has separate monthly
included allowances and usage-based billing, so retain its app-level storage
and operation bounds, keep the bucket isolated, and disable media writes and
delivery if those bounds cannot be maintained. A plan change, other account
workloads, or a new access path invalidates these assumptions.

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

Revalidate the plan and rule before each release. Keep production routing off
until the provider state and blocked-request behavior have been read back.

## Cloudflare references

- [WAF feature availability by plan](https://developers.cloudflare.com/learning-paths/application-security/rate-limiting/features/)
- [Rate-limit request counting and data-center locality](https://developers.cloudflare.com/waf/rate-limiting-rules/request-rate/)
- [Create a zone rate-limiting rule with the API](https://developers.cloudflare.com/waf/rate-limiting-rules/create-api/)
- [Worker execution follows the Cloudflare WAF](https://developers.cloudflare.com/learning-paths/mtls/mtls-workers/)
- [Workers Free request limits](https://developers.cloudflare.com/workers/platform/limits/)
- [D1 Free behavior](https://developers.cloudflare.com/d1/reference/faq/)
- [R2 pricing and free allowances](https://developers.cloudflare.com/r2/pricing/)
