# MithrilPress Cloudflare credential boundaries

This document records the least-privilege Cloudflare credential model for
MithrilPress. It does not authorize deployment, enable a feature flag, or grant
access to any Cloudflare account.

## Separate credentials by operation

| Operation | Credential and scope | Handling |
| --- | --- | --- |
| Worker and route deployment | A deployment credential with only the Worker, D1, and route permissions needed for the verified target account and zone. Create or select the D1 database and R2 bucket separately before binding them. | Keep it in the approved local credential store. Never commit it or place it in Studio. |
| Default platform hostname attachment | Cloudflare requires Editor access to the Worker and `Workers Routes Write` scoped to the affected `mithril.love` zone. The API also needs account, zone, Worker, and exact-host preflight reads. | Use the `fund-mithril` account and the exact active zone. Cloudflare currently does not support per-Worker roles for Custom Domains. If the required Editor grant cannot be isolated to `mithrilpress`, treat its wider Worker access as a blocker and leave `--apply` disabled. |
| Verify platform hostname registration | A separate `D1 Read` token limited to the `fund-mithril` account. Cloudflare scopes D1 permissions at the account level, not per database. | The attachment CLI first verifies the deployed Worker's `DB` binding matches the named `mithrilpress` database. It then uses the read token only to check that the exact hostname maps to one active row. It runs one parameterized `SELECT`, checks that the D1 API reports no writes, and never writes to D1. Store the token separately from the Worker attachment credential. |
| Customer media at runtime | The Worker `MEDIA` R2 binding points to the pre-created `mithrilpress-media` bucket. Tenant authorization and random tenant-scoped object keys are enforced in the Worker. | No R2 API token is sent to the Worker. |
| Optional S3-compatible media access | An R2 `Object Read & Write` API token scoped to the single MithrilPress bucket. | Use only for an authorized S3 client. It does not provision a Worker binding. |
| Cloudflare for SaaS hostnames | `CF_SAAS_API_TOKEN` with `SSL and Certificates Write` on the verified SaaS fallback zone only. | Store as a Worker secret. Do not grant customer-zone DNS access. Keep hostname feature flags false until routing, fallback, capacity, certificate monitoring, and rollback are verified. |
| Read an owner DNS zone for migration | An owner-supplied token with `Zone Read` and `DNS Read` on that owner's one zone. | Use only for the read request; do not persist the token. |
| Add missing DNS records during an approved migration | A separate owner-supplied token with `DNS Write` on that owner's one zone. | Use only after the owner reviews the exact diff. The import endpoint stays disabled until isolated-zone qualification. The token is not persisted. |

## Hosting account and zone boundary

Use the `fund-mithril` Cloudflare account and its active parent zone
`mithril.love` for the default platform host. The requested URL pattern remains
`*.sites.mithril.love`, but each registered `label.sites.mithril.love` hostname
is attached as one exact Worker Custom Domain to the shared `mithrilpress`
Worker. Cloudflare creates the exact DNS record and managed certificate for
that hostname; no wildcard DNS record, wildcard Worker Route, child zone, or
NS delegation is part of this topology. An exact Custom Domain routes all paths
for that hostname to its Worker, and an existing conflicting CNAME prevents
creation. See [Custom Domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/).

## Global audience and hosted-site capacity

The product may serve eligible owners worldwide; that audience target does not
mean an unlimited number of sites can be hosted at once. Keep the default
free-to-site-owners first cohort capped at 90 exact hostnames and stop new
onboarding when the cap is reached. This leaves headroom below Cloudflare's
documented 100 Worker Custom Domains per zone limit. It is not the worldwide
scale end state: Cloudflare recommends a wildcard Worker Route beyond 100
domains. A shared wildcard route with exact D1 tenant resolution could preserve
the requested URL pattern, but `*.sites.mithril.love` needs a deep wildcard
certificate. Advanced Certificate Manager is a paid add-on; its one-level
wildcard fits this hostname. Keep that scale path unselected until TLS,
host-aware abuse controls, provider-enforced no-overage behavior, rollback, and
the operator budget are verified. Do not silently switch to paid resources or
charge owners. See [Workers limits](https://developers.cloudflare.com/workers/platform/limits/),
[hostname routing](https://developers.cloudflare.com/cloudflare-for-platforms/workers-for-platforms/configuration/hostname-routing/),
[Universal SSL limitations](https://developers.cloudflare.com/ssl/edge-certificates/universal-ssl/limitations/), and
[Advanced Certificate Manager](https://developers.cloudflare.com/ssl/edge-certificates/advanced-certificate-manager/).

Cloudflare for SaaS is not an approved zero-cost scale-up for this account.
Its current public plan table lists 100 included custom hostnames, a 50,000
hostname maximum, and $0.10 per additional hostname; wildcard custom hostnames
are Enterprise-only. The `fund-mithril` quota read returned 403, so its SaaS
entitlement and usable hostname quota are not verified. Universal SSL also
covers only the zone apex and one subdomain level; each
`label.sites.mithril.love` needs its own valid certificate path. Keep SaaS as an
unselected architecture option until the exact hostname flow, entitlement,
cost boundary, and rollback are qualified. Do not present its 50,000-host
maximum as free capacity. See [Cloudflare for SaaS plans](https://developers.cloudflare.com/cloudflare-for-platforms/cloudflare-for-saas/plans/), [quota and billing](https://developers.cloudflare.com/cloudflare-for-platforms/cloudflare-for-saas/quotas-and-billing/), and [Universal SSL limitations](https://developers.cloudflare.com/ssl/edge-certificates/universal-ssl/limitations/).

Pages is not an unbounded fallback: Cloudflare documents a 100-project account
limit. If the exact-host cohort fills, hold new onboarding requests in a manual
waitlist. Do not ingest source content until an approved hosting slot is
available and the owner authorizes the import. Resume onboarding only after
the separately gated wildcard scale path or another capacity plan is
qualified and explicitly funded; do not create extra projects or hostnames
automatically. See [Pages limits](https://developers.cloudflare.com/pages/platform/limits/).

Do not grant DNS Write for default-host attachment: Cloudflare manages the
exact DNS record as part of the Custom Domain operation. Keep customer-owned
DNS migration permissions separate; those remain owner-supplied and zone-scoped.
Keep Worker, D1, and R2 permissions limited to the selected account and
resources wherever Cloudflare supports that scope. Keep the R2 bucket private
and expose media only through the Worker binding; do not create a tenant-facing
S3 token or public `r2.dev` URL. Workers R2 Storage Write is account-scoped;
review its full blast radius before granting it.

The parent zone also serves unrelated hostnames. Cloudflare Free rate-limiting
rules support path and Verified Bot fields, but not host matching. A path-only
rule on the parent zone would also rate-limit unrelated hosts; do not deploy
one as MithrilPress protection. Exact Custom Domains avoid attaching unknown
labels to the Worker, but they do not replace abuse controls or a verified
account-level cost boundary. Keep public host attachment disabled until those
controls and the exact-host rollback procedure are qualified. Read back the
Custom Domain, DNS record, certificate, and HTTPS response before marking a
tenant hostname active.

Cloudflare's R2 S3 API supports bucket-scoped object tokens, while its Workers
R2 Storage Write permission is account-scoped. The bucket-scoped S3 token is
not a substitute for a Worker R2 binding. See [R2 API token permissions](https://developers.cloudflare.com/r2/api/tokens/).

Cloudflare API tokens can limit `DNS Write` to a selected zone. Select the
exact resource in the token policy; do not select every zone or use a global
API key. See [API token templates](https://developers.cloudflare.com/fundamentals/api/reference/template/)
and [API token permissions](https://developers.cloudflare.com/fundamentals/api/reference/permissions/).

## Reconnection and provisioning gates

Verify the deployment identity and exact resource scope before provisioning.
An authenticated identity or a successful read request does not prove that
DNS, Worker, D1, R2, or WAF writes are authorized.

Do not create a production bucket, Worker Custom Domain, Pages project, or SaaS
hostname configuration until the exact Worker source has passed its approved
standalone qualification and the target account, zone, host, cost boundary, and
rollback procedure have been read back. Configure the bucket binding only
after the bucket exists. The platform-host CLI requires the separate,
account-limited D1 Read credential above and fails closed if it cannot verify
the exact active site mapping. The initial sample Wrangler config keeps `workers_dev`
and customer-domain features disabled and contains no production route or
database identifier. Keep the exact-host provisioning command in dry-run mode
until a reviewed credential can perform only the required operation.

Hosting is free to site owners; this is not a zero-cost provider commitment.
Workers Free has an account-wide daily request hard limit, while Workers Paid
has no daily request limit and can bill usage. The Free limit is shared with
other Workers in the account. D1 Free rejects queries after its daily row
limits, but only when the account is verified as Workers Free. R2 allowances
are account-wide and usage above them is billed without a provider-enforced
hard stop. Application quotas run after the Worker starts and do not guarantee
zero infrastructure charges. Read back the Workers plan and shared usage,
verify an enforceable cost boundary, and keep production routing and media
writes disabled until those conditions and rollback are confirmed.
