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
| Cloudflare for SaaS hostnames | `CF_SAAS_API_TOKEN` with `SSL and Certificates Write` on the dedicated SaaS zone only. | Store as a Worker secret. Do not grant customer-zone DNS access. Keep hostname feature flags false until routing, fallback, capacity, certificate monitoring, and rollback are verified. |
| Read an owner DNS zone for migration | An owner-supplied token with `Zone Read` and `DNS Read` on that owner's one zone. | Use only for the read request; do not persist the token. |
| Add missing DNS records during an approved migration | A separate owner-supplied token with `DNS Write` on that owner's one zone. | Use only after the owner reviews the exact diff. The import endpoint stays disabled until isolated-zone qualification. The token is not persisted. |

## Hosting account and zone boundary

Run the MithrilPress Worker, D1 database, and R2 bucket in a dedicated
Cloudflare account on the Workers Free plan. Do not use the existing
`fund-mithril` Workers Paid account for the site-hosting runtime. Add
`sites.mithril.love` as a separate child zone in the dedicated account, then
delegate that child zone from the existing `mithril.love` parent with NS
records. Cloudflare supports moving a subdomain zone to a different account;
see [Migrate subdomain to a new account](https://developers.cloudflare.com/dns/zone-setups/subdomain-setup/move-to-new-account/).

The parent-zone credential needs DNS Write on `mithril.love` only to add or
remove the exact `sites.mithril.love` NS delegation. Worker, D1, and route
credentials belong to the dedicated child-zone account. Keep its R2 bucket
private and expose media only through the Worker binding; do not create a
tenant-facing S3 token or public `r2.dev` URL. The R2 free allowance is shared
across the Cloudflare account and overage is billed, so no unrelated workloads
or external clients may use this account or bucket. The application media caps
are sized below the current Standard free allowances, but Cloudflare does not
enforce an R2 hard-stop at those allowances.

On the child-zone wildcard Worker route, select fail-closed behavior at the
Workers Free daily request limit. A fail-open route would bypass the Worker.
Read back the account's Workers plan, child-zone nameservers, proxied wildcard
record, route pattern and route failure mode before enabling any tenant or
public hostname. If the account is on Workers Paid or any read-back differs,
keep hosting disabled.

Cloudflare's R2 S3 API supports bucket-scoped object tokens, while its Workers
R2 Storage Write permission is account-scoped. The bucket-scoped S3 token is
not a substitute for a Worker R2 binding. See [R2 API token permissions](https://developers.cloudflare.com/r2/api/tokens/).

Cloudflare API tokens can limit `DNS Write` to a selected zone. Select the
exact resource in the token policy; do not select every zone or use a global
API key. See [API token templates](https://developers.cloudflare.com/fundamentals/api/reference/template/)
and [API token permissions](https://developers.cloudflare.com/fundamentals/api/reference/permissions/).

## Reconnection and provisioning gates

The current Wrangler OAuth login scope list for this project includes Worker,
D1, zone-read, and SSL certificate scopes, but no DNS Write or R2 storage
scope. Re-running `wrangler login` therefore does not create the required
zone- and bucket-scoped access. The Cloudflare connection in the Codex app must
also be healthy before it can be used for resource readback; an internal
connector error is not evidence of access.

Do not create the MithrilPress production bucket, wildcard DNS record, Worker
route, or SaaS hostname configuration until the exact Worker source has passed
its approved standalone qualification and the target zone, account, fallback
origin, and rollback procedure have been read back. Configure the bucket
binding only after the bucket exists. The initial sample Wrangler config keeps
`workers_dev` and customer-domain features disabled and contains no production
route or database identifier.

The site-owner free tier has application request, storage, and AI limits. Those
limits stop MithrilPress operations after a cap; rejected requests still reach
the Worker until Cloudflare's Workers Free account limit is reached. D1 Free
also rejects queries after its daily quota. Workers AI requires an explicit
`STUDIO_AI_FREE_PLAN_CONFIRMED=true` deployment flag after the operator reads
back the exact account plan. MithrilPress also limits prompt bytes, output
tokens, generations per day, and a conservative shared Neuron reservation; the
reservation is not Cloudflare provider metering and can be wrong if model
pricing changes. R2 usage above its included monthly
allowances is billed rather than automatically stopped; the deployment caps
bound usage below those allowances only if this account has no other R2 traffic
and the limits are revalidated before release. Keep the dedicated account,
application quotas, provider-plan read-back, and an operator-controlled
shutdown path as release requirements. Never imply that an application quota
alone guarantees zero infrastructure charges.
