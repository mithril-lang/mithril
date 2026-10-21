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
limits stop MithrilPress operations after a cap; they do not disable or cap the
Cloudflare account bill. Keep deployment-level metering, alerting, and an
operator-controlled shutdown path as release requirements. Never imply that a
Cloudflare application quota guarantees zero infrastructure charges.
