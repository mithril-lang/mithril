# MithrilPress Cloudflare credential boundaries

This document records the least-privilege Cloudflare credential model for
MithrilPress. It does not authorize deployment, enable a feature flag, or grant
access to any Cloudflare account.

## Separate credentials by operation

| Operation | Credential and scope | Handling |
| --- | --- | --- |
| Worker and route deployment | A deployment credential with only the Worker, D1, and route permissions needed for the verified target account and zone. Create or select the D1 database and R2 bucket separately before binding them. | Keep it in the approved local credential store. Never commit it or place it in Studio. |
| Customer media at runtime | The Worker `MEDIA` R2 binding points to the pre-created `mithrilpress-media` bucket. Tenant authorization and random tenant-scoped object keys are enforced in the Worker. | No R2 API token is sent to the Worker. |
| Optional S3-compatible media access | An R2 `Object Read & Write` API token scoped to the single MithrilPress bucket. | Use only for an authorized S3 client. It does not provision a Worker binding. |
| Cloudflare for SaaS hostnames | `CF_SAAS_API_TOKEN` with `SSL and Certificates Write` on the verified SaaS fallback zone only. | Store as a Worker secret. Do not grant customer-zone DNS access. Keep hostname feature flags false until routing, fallback, capacity, certificate monitoring, and rollback are verified. |
| Read an owner DNS zone for migration | An owner-supplied token with `Zone Read` and `DNS Read` on that owner's one zone. | Use only for the read request; do not persist the token. |
| Add missing DNS records during an approved migration | A separate owner-supplied token with `DNS Write` on that owner's one zone. | Use only after the owner reviews the exact diff. The import endpoint stays disabled until isolated-zone qualification. The token is not persisted. |

## Hosting account and zone boundary

Use the Cloudflare account that owns the active parent zone `mithril.love`
for the default platform host. The hostname `*.sites.mithril.love` is served
from that existing zone; it does not require a child zone or NS delegation.
Cloudflare standalone subdomain-zone setup is Enterprise-only. See
[subdomain-zone availability](https://developers.cloudflare.com/dns/zone-setups/subdomain-setup/).

The deployment needs a proxied wildcard DNS record and a Worker route
`*.sites.mithril.love/*` on the parent zone. Scope DNS Write to the parent
zone and validate that automation changes only the platform wildcard record.
Keep Worker, D1, and R2 permissions limited to the selected account and
resources wherever Cloudflare supports that scope. Keep the R2 bucket private
and expose media only through the Worker binding; do not create a tenant-facing
S3 token or public `r2.dev` URL. Workers R2 Storage Write is account-scoped;
review its full blast radius before granting it.

The parent zone also serves unrelated hostnames. Cloudflare Free rate-limiting
rules support path and Verified Bot fields, but not host matching. A path-only
rule on the parent zone would also rate-limit unrelated hosts; do not deploy
one as MithrilPress protection. Keep the public route disabled until a
host-scoped edge guard or an approved isolated hosting zone is available.
Configure the Worker route to fail closed and read back the route, DNS record,
and failure mode before enabling any tenant hostname.

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

Do not create the MithrilPress production bucket, wildcard DNS record, Worker
route, or SaaS hostname configuration until the exact Worker source has passed
its approved standalone qualification and the target zone, account, fallback
origin, and rollback procedure have been read back. Configure the bucket
binding only after the bucket exists. The initial sample Wrangler config keeps
`workers_dev` and customer-domain features disabled and contains no production
route or database identifier.

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
