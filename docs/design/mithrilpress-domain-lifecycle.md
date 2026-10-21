# MithrilPress domain lifecycle

**Status: custom-hostname onboarding is implemented behind a disabled-by-default
operator gate.** The owner Studio can issue a TXT ownership challenge, create a
Cloudflare for SaaS custom-hostname record after proof, display TLS validation
records, check provider/certificate status, verify a DNS-only CNAME, activate
the exact tenant mapping, and detach a hostname. The code does not write the
customer's DNS. Full zone import, record management, and nameserver migration
remain unimplemented. Do not enable the feature until its dedicated SaaS zone
and route have been provisioned and read back. A five-minute Cron Trigger
rechecks active hostnames in batches of 30; at the 90-hostname deployment cap,
every mapping is checked within 15 minutes. Mismatches suspend immediately;
three consecutive provider/DNS read failures also suspend. An owner must
refresh a suspended hostname after the checks pass.

## Address types

| Type | Setup | Control | Initial availability |
| --- | --- | --- | --- |
| MithrilPress subdomain | MithrilPress assigns one unique label, such as `example.sites.mithril.love` | MithrilPress controls the wildcard zone and hostname registry | First release target; requires the wildcard route and tenant provisioning |
| Customer-owned hostname | Customer adds owner-proof and provider TLS TXT records plus a DNS-only CNAME; MithrilPress verifies ownership and provisions a Cloudflare for SaaS custom hostname | Customer retains DNS and registrar control | Subdomains only; apex and wildcard customer hostnames are excluded from this prototype |
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
| `ownership_pending` | Authenticated site owner requests a hostname with at least three labels; normalize IDNA and case, reject malformed names, duplicates, and the platform's own domains; issue an unpredictable hostname-scoped TXT token | Verify the public DNS answer and token, then create provider custom-hostname object |
| `provider_pending` | TXT challenge passes | Claim a single provider-create operation |
| `provider_creating` | One request owns the provisioning transition | Create the Cloudflare for SaaS custom-hostname record and persist its provider ID |
| `tls_pending` | Provider has accepted hostname but certificate is not active | Wait, retry bounded read-only checks, or return to error for owner action |
| `dns_pending` | Provider hostname and certificate are active; show required CNAME target and any remaining validation record | Verify public authoritative and recursive answers, then activate |
| `active` | CNAME resolves to the configured SaaS target; provider hostname and certificate both report active; exact tenant mapping is active | Suspend, detach, or start an explicitly approved migration |
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

1. Require a signed-in site owner with `site:domains` scope. The browser session
   retains the token's scopes and same-origin mutation checks.
2. Create a 24-hour, hostname-specific TXT challenge with a cryptographically
   random value. Display it in Studio and never ask for DNS-provider credentials
   or registrar passwords.
3. Verify the TXT response using DNS over HTTPS. Store the challenge only while
   it is pending; clear it once verified. Verification is single-use and bound
   to this site and hostname.
4. Claim a `provider_creating` state before calling the fixed Cloudflare API
   endpoint. Use a server-side API token with only `SSL and Certificates Write`
   on the dedicated SaaS zone. The hostname's origin is the zone's fallback
   Worker; tenant selection comes only from MithrilPress's exact D1 mapping.
5. Request a domain-validation certificate with minimum TLS 1.2. Read provider
   details again because the create response may omit TLS validation records.
6. Show the customer's DNS-only CNAME and any provider TXT/CNAME validation
   records. On refresh, read Cloudflare's hostname and certificate state and
   verify the public DNS CNAME matches the configured SaaS target.
7. Activate only when provider hostname status and certificate status are both
   `active` and the CNAME matches. Otherwise serve no tenant content. If a
   previously active hostname no longer passes those checks, suspend its D1
   mapping before returning any content.
8. Recheck active mappings on a five-minute Cron Trigger, up to 30 hostnames
   per invocation. Suspend immediately on an observed mismatch and after three
   consecutive provider/DNS check failures; require an owner refresh before
   reactivation.
9. Record owner and provider state transitions in the domain audit table. Do
   not treat an API write or TLS handshake alone as proof of a live route.

Nameserver transfer is a separate, optional workflow with its own approval and
rollback plan. CNAME/TXT verification is the normal path and does not require
transferring a domain or changing mail routing.

## Optional nameserver migration

This operation can affect the entire domain, including web, email, verification,
and security records. MithrilPress must not start it as an implicit side effect
of adding a website hostname. This workflow is not yet implemented.

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
- If DNS points elsewhere, or the provider/TLS state becomes invalid, suspend
  the host mapping. The Domains panel reports the suspended state on the next
  owner visit; outbound owner notifications are not implemented. Never
  continue serving tenant content based solely on a stale database row.
- Rate-limit challenge creation and verification, prevent token reuse, and
  alert on repeated failed ownership checks or hostname reassignment attempts.
- Keep secrets, challenge tokens, provider API credentials, and zone exports
  out of URLs, application logs, analytics, and generated sales messages.

## Rollout gates

The implementation remains disabled until the following are read back: a
dedicated `sites.mithril.love` SaaS zone delegated safely from `mithril.love`,
an originless fallback DNS record, the fallback Worker, wildcard DNS and a
wildcard Worker route that cannot intercept unrelated Mithril properties, a
scoped Cloudflare token, and at least one verified hostname slot. Set
`CUSTOM_DOMAINS_ROUTING_READY=true` only after this exact topology is confirmed.
The operator must set `CF_SAAS_CAPACITY_REMAINING` from current provider state;
the Worker caps it at 90 to reserve 10 of the current Free plan's 100 included
hostnames. Set `CUSTOM_DOMAINS_MONITORING_READY=true` only after the scheduled
health check has a successful deployed read-back. A standalone qualification
profile must cover onboarding, unknown-host isolation, TLS activation,
suspension, detachment, stale DNS, three consecutive monitor failures, and
recovery. Release evidence must include provider read-back, public DNS answers,
HTTPS verification, a cross-tenant negative check, and a demonstrated rollback.
Track the code gate and account entitlement in Linear issue MITHRIL-293.
Cloudflare for SaaS currently charges $0.10 per hostname beyond the included
100, excludes wildcard custom hostnames and apex proxying from Free, and
requires payment information on non-enterprise accounts to enable the product.
Verify the current [plans](https://developers.cloudflare.com/cloudflare-for-platforms/cloudflare-for-saas/plans/)
and [enablement requirements](https://developers.cloudflare.com/cloudflare-for-platforms/cloudflare-for-saas/start/enable/)
before promising custom domains as part of a free plan.
