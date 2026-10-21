# MithrilPress domain lifecycle

**Status: design only.** The Worker currently serves a configured tenant on
`*.sites.mithril.love`. Customer-domain onboarding, Cloudflare for SaaS API
operations, DNS changes, DNS import, and domain lifecycle jobs are not
implemented. Do not represent a custom domain as active until the required
provider and live-DNS read-backs succeed.

## Address types

| Type | Setup | Control | Initial availability |
| --- | --- | --- | --- |
| MithrilPress subdomain | MithrilPress assigns one unique label, such as `example.sites.mithril.love` | MithrilPress controls the wildcard zone and hostname registry | First release target; requires the wildcard route and tenant provisioning |
| Customer-owned hostname | Customer adds provider-prescribed CNAME/TXT records; MithrilPress verifies ownership and provisions a Cloudflare for SaaS custom hostname | Customer retains DNS and registrar control | Follow-up; provider entitlement and payment setup may be required |
| Nameserver migration | Customer authorizes moving authoritative DNS to Cloudflare after record inventory and review | Cloudflare becomes authoritative; customer retains account ownership | Optional migration service only; never required to use a custom hostname |

Cloudflare for SaaS custom hostnames and Workers for Platforms solve different
problems. MithrilPress should use SaaS custom hostnames for customer domains;
the renderer runs MithrilPress code and does not execute tenant code. Keep the
default product on the supplied `sites.mithril.love` subdomain if the customer
does not choose or qualify a custom domain.

## Customer hostname state machine

Each hostname belongs to exactly one site and follows these states. Persist
provider IDs, timestamps, the requesting owner identity, the verified DNS
evidence, and every transition in an append-only audit log. Do not infer tenant
identity from a Host header or DNS label.

| State | Entry condition | Allowed next transition |
| --- | --- | --- |
| `requested` | Authenticated site owner requests a fully qualified hostname; normalize IDNA and case, reject public suffixes, reserved names, duplicate mappings, and the platform's own domains | Issue ownership challenge |
| `ownership_pending` | Generate an unpredictable, hostname-scoped TXT token and show exact record name/value; do not change customer DNS | Verify authoritative DNS answer and token, then create provider custom-hostname object |
| `provider_pending` | TXT challenge passes; create Cloudflare for SaaS hostname with the approved tenant origin and record returned provider ID | Poll/read provider state and TLS certificate status |
| `tls_pending` | Provider has accepted hostname but certificate is not active | Wait, retry bounded read-only checks, or return to error for owner action |
| `dns_pending` | Provider hostname and certificate are active; show required CNAME target and any remaining validation record | Verify public authoritative and recursive answers, then activate |
| `active` | CNAME resolves to the expected Cloudflare edge; provider marks hostname active; TLS handshake and tenant mapping read-back pass | Suspend, detach, or start an explicitly approved migration |
| `action_required` | Challenge, provider provisioning, DNS, or certificate failed or timed out | Display the precise next action; allow safe retry or cancel |
| `suspended` | Owner or operator suspends a hostname due to removal, abuse, or unresolved routing | Reactivate only after ownership, provider, DNS, and tenant-binding checks pass |
| `detaching` | Owner confirms detach; remove the tenant mapping from serving before provider cleanup | Complete provider deletion and verify requests no longer serve site content |
| `detached` | Provider object is removed and application no longer resolves the hostname | Terminal; a fresh request must repeat ownership verification |

Serve content only for `active` mappings, after exact normalized hostname
lookup to an enabled site and its current published revision. Unknown,
unverified, suspended, pending, and detached names return a generic not-found
response. Do not redirect or fall back to another tenant. Preview endpoints
remain authenticated and separate from public host routing.

### Ownership and activation controls

1. Require a signed-in site owner with domain-management permission and record
   an authorization receipt scoped to that hostname and site.
2. Display the TXT challenge and the provider's exact CNAME instructions. Never
   ask the customer to share DNS-provider credentials or registrar passwords.
3. Verify the TXT record against authoritative DNS. Bind the challenge to the
   canonical hostname, site, request, and expiry; make it single-use and rotate
   it after cancellation or expiry.
4. Create the Cloudflare for SaaS custom-hostname record only after verification.
   Keep the provider's origin fixed to MithrilPress infrastructure and prevent
   an owner-controlled hostname from selecting an arbitrary origin.
5. Wait for provider TLS activation, confirm expected DNS answers and HTTPS
   behavior, then atomically activate the exact hostname-to-site mapping.
6. Re-read the provider object and DNS state after activation. Store the
   resulting evidence with timestamps; do not treat a successful API write as
   proof of a live route.

Nameserver transfer is a separate, optional workflow with its own approval and
rollback plan. CNAME/TXT verification is the normal path and does not require
transferring a domain or changing mail routing.

## Optional nameserver migration

This operation can affect the entire domain, including web, email, verification,
and security records. MithrilPress must not start it as an implicit side effect
of adding a website hostname.

1. Obtain explicit authorization from an owner who controls the domain and
   document the affected domain, intended cutover window, and rollback contact.
2. Read and export the current authoritative zone through an authorized
   provider integration or customer-supplied export. Record TTLs and preserve
   the source snapshot without exposing secrets in logs.
3. Import into a staging zone and present a complete record-by-record diff.
   Call out MX, SPF, DKIM, DMARC, domain-verification, CAA, DNSSEC/DS, wildcard,
   and other NS records. Preserve mail records exactly unless the owner
   separately requests a documented change.
4. Require owner approval of the diff and cutover. Validate the target zone and
   DNSSEC state before requesting a registrar nameserver update. Never make
   registrar changes on the owner's behalf without separately scoped
   authorization.
5. Monitor authoritative answers, web TLS, mail routing, and verification
   records during propagation. Keep the source provider and zone intact during
   the agreed rollback window.
6. If checks fail, restore the prior nameserver delegation and verify the old
   zone answers again. Record the actual rollback evidence. Do not delete the
   source zone until the owner confirms stable service and the retention window
   expires.

## Removal and incident handling

- On owner-requested removal, stop serving the hostname immediately, then
  remove the provider mapping and verify a request cannot resolve to the site's
  content. Keep the audit record; retain or delete content according to the
  site's separate retention policy.
- If ownership expires, DNS points elsewhere, or the provider/TLS state becomes
  invalid, suspend the host mapping and notify the owner. Never continue serving
  tenant content based solely on a stale database row.
- Rate-limit challenge creation and verification, prevent token reuse, and
  alert on repeated failed ownership checks or hostname reassignment attempts.
- Keep secrets, challenge tokens, provider API credentials, and zone exports
  out of URLs, application logs, analytics, and generated sales messages.

## Rollout gates

Before implementing provider writes, provision a scoped Cloudflare credential,
an owned test hostname and zone, a MithrilPress service owner, and a standalone
qualification profile for hostname onboarding, unknown-host isolation, TLS
activation, suspension, detachment, and rollback. Release evidence must include
provider read-back, public DNS answers, HTTPS verification, a cross-tenant
negative check, and a demonstrated rollback. Track implementation and account
entitlement in Linear issue MITHRIL-293. Cloudflare for SaaS pricing and plan
requirements can change; verify the current [plans](https://developers.cloudflare.com/cloudflare-for-platforms/cloudflare-for-saas/plans/)
and [enablement requirements](https://developers.cloudflare.com/cloudflare-for-platforms/cloudflare-for-saas/start/enable/)
before promising custom domains as part of a free plan.
