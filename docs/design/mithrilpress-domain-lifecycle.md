# MithrilPress domain lifecycle

**Status: custom-hostname onboarding is implemented behind a disabled-by-default
operator gate. DNS migration planning is owner-guided. Its optional Cloudflare
record-import path is implemented as an owner-confirmed create-only batch
operation, but remains disabled pending isolated-zone qualification.** The
owner Studio can issue a TXT ownership challenge, create a Cloudflare for SaaS
custom-hostname record after proof, display TLS validation records, check
provider/certificate status, verify a DNS-only CNAME, activate the exact tenant
mapping, and detach a hostname. MithrilPress does not change customer registrar,
nameserver-delegation, or DNSSEC state. Owner-guided zone snapshots, record
comparison, cutover approval, and NS/DS propagation checks are implemented;
automatic nameserver changes and registrar transfers are not. Do not enable the
custom-hostname feature until its dedicated SaaS zone and route have been
provisioned and read back. A five-minute Cron Trigger
rechecks active hostnames in batches of 30; at the 90-hostname deployment cap,
every mapping is checked within 15 minutes. Mismatches suspend immediately;
three consecutive provider/DNS read failures also suspend. An owner must
refresh a suspended hostname after the checks pass.

## Address types

| Type | Setup | Control | Initial availability |
| --- | --- | --- | --- |
| MithrilPress subdomain | MithrilPress assigns one unique label, such as `example.sites.mithril.love` | MithrilPress controls the wildcard zone and hostname registry | First release target; requires the wildcard route and tenant provisioning |
| Customer-owned hostname | Customer adds owner-proof and provider TLS TXT records plus a DNS-only CNAME; MithrilPress verifies ownership and provisions a Cloudflare for SaaS custom hostname | Customer retains DNS and registrar control | Subdomains only; apex and wildcard customer hostnames are excluded from this prototype |
| Nameserver migration plan | Owner proves control, uploads or reads source and staged destination zones, reviews exact record diff, approves a digest, then changes registrar settings manually | Owner retains DNS-provider and registrar control; any Cloudflare API token is zone-scoped and request-only | Optional guided plan; provider import is disabled by default pending isolated-zone qualification |

Cloudflare for SaaS custom hostnames and Workers for Platforms solve different
problems. MithrilPress should use SaaS custom hostnames for customer domains;
the renderer runs MithrilPress code and does not execute tenant code. Keep the
default product on the supplied `sites.mithril.love` subdomain if the customer
does not choose or qualify a custom domain.

## Customer hostname state machine

Each active hostname claim belongs to exactly one site and follows these states.
Keep detached historical rows and their audit history, while allowing a
different site to claim the same hostname after the prior mapping is detached
and new ownership proof succeeds. Persist provider IDs, timestamps, the
requesting owner identity, verified DNS evidence, and every transition in an
append-only audit log. Do not infer tenant identity from a Host header or DNS
label.

| State | Entry condition | Allowed next transition |
| --- | --- | --- |
| `ownership_pending` | Authenticated site owner requests a hostname with at least three labels; normalize IDNA and case, reject malformed names and the platform's own domains; issue an unpredictable hostname-scoped TXT token with a 24-hour expiry without globally claiming the name | Verify the public DNS answer and token, then atomically claim the hostname and create its provider object; expire to `detached` if proof is not completed |
| `provider_pending` | TXT challenge passes | Claim a single provider-create operation |
| `provider_creating` | One request owns the provisioning transition | Create the Cloudflare for SaaS custom-hostname record and persist its provider ID |
| `tls_pending` | Provider has accepted hostname but certificate is not active | Wait, retry bounded read-only checks, or return to error for owner action |
| `dns_pending` | Provider hostname and certificate are active; show required CNAME target and any remaining validation record | Verify public authoritative and recursive answers, then activate |
| `active` | CNAME resolves to the configured SaaS target; provider hostname and certificate both report active; exact tenant mapping is active | Suspend, detach, or start an explicitly approved migration |
| `action_required` | Challenge, provider provisioning, DNS, or certificate failed or timed out | Display the precise next action; allow safe retry or cancel |
| `suspended` | Owner or operator suspends a hostname due to removal, abuse, or unresolved routing | Reactivate only after ownership, provider, DNS, and tenant-binding checks pass |
| `detaching` | Owner confirms detach; remove the tenant mapping from serving before provider cleanup | Complete provider deletion and verify requests no longer serve site content |
| `detached` | Provider object is removed, application no longer resolves the hostname, or the unverified 24-hour challenge expires | Terminal for this historical claim; a fresh claim may be created by any site and must repeat ownership verification |

Unverified challenges do not reserve a hostname or shared custom-hostname
capacity. The global unique index applies only after TXT ownership is proven;
if multiple pending requests for one name verify concurrently, only one can
claim it. Before checking per-site pending limits, the Worker releases expired
`ownership_pending` rows and records an append-only expiration event. The
scheduled hostname monitor also runs this cleanup. Detached historical rows
do not reserve the hostname, so another site can claim it after fresh proof.

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
transferring a domain or changing mail routing. The DNS migration planner is
available only to owner tokens with `site:dns-migrate` scope.

## Optional nameserver migration

This operation can affect the entire domain, including web, email, verification,
and security records. MithrilPress must not start it as an implicit side effect
of adding a website hostname. The owner-guided planning and propagation-check
steps are implemented. A Cloudflare zone can be read with a zone-scoped token
supplied for one request. The code includes an owner-confirmed create-only
batch path for missing source records. It sends only `posts`, refuses record
types and values it cannot preserve, and verifies an exact zone export after
the write. Cloudflare documents database transaction handling for batch
operations but says DNS propagation is not atomic. Provider writes stay disabled
by default until the create-only request and readback behavior are qualified
against an isolated zone. The automatic path also requires a pending destination
zone and current public NS/DS answers that still match the source snapshot.
Cloudflare states that pending zones answer queries sent to their assigned
nameservers, so keep the source zone active and do not change registrar
delegation during a write. Registrar changes remain manual.

1. Require a `site:dns-migrate` owner token and prove control with a TXT record
   at `_mithrilpress-migration.<zone>` that expires after 48 hours. Expired
   pending plans are cancelled and their challenges cleared when that owner
   starts another plan or a tenant requests a plan for the same zone. Pending
   plans do not reserve a zone globally; the first owner to prove control claims
   it. Only after proof, capture the
   current nameserver and DS RRsets from Cloudflare and Google public recursive
   resolvers for rollback. Those providers receive the domain lookups.
2. Upload the current provider's BIND export. Zone snapshots are private to the
   site because TXT data can contain verification secrets. The parser caps
   input at 256 KiB and 2,000 records, accepts `$ORIGIN` and `$TTL`, and rejects
   unsupported directives rather than guessing their expansion. NAPTR records
   are checked for their six standard fields, quoted character strings, and a
   fully qualified replacement name (or `.`), following [RFC 3403](https://www.rfc-editor.org/rfc/rfc3403.html).
3. Import the generated source records into a destination staging zone by hand,
   or connect a Cloudflare zone using a zone-scoped token. The token is sent
   only with the read request and is not saved. For Cloudflare, a separate
   import request uses its token for pre-write and post-write reads as well as
   the write; scope it to `Zone Read`, `DNS Read`, and `DNS Write` on that zone.
   After separate owner confirmation, it submits only missing source records
   through batch `posts`; updates and deletes are never sent. The feature remains
   disabled until isolated-zone
   qualification. The live zone must still match the staged snapshot, and the
   destination must contain no extra or changed records. Upload the destination
   export manually for other providers. The create-only converter supports
   `A`, `AAAA`, `CAA`, `CNAME`, `MX`, `NAPTR`, `NS`, `OPENPGPKEY`, `PTR`, `SRV`,
   `TXT`, and `URI` records with validated field formats and TTLs. If any
   missing source record cannot be represented safely, the entire automatic
   batch is rejected before the provider write. The diff compares record owner, type,
   TTL, class, RDATA, and supported Cloudflare proxy/flatten metadata. It excludes
   provider-managed apex SOA/NS and generated DNSSEC records. A non-exact diff
   cannot be approved.
4. Require an explicit owner confirmation bound to the source hash, target
   export hash, destination nameservers, and exact diff. The owner separately
   reviews MX, SPF, DKIM, DMARC, verification TXT, CAA, wildcard and any other
   security/service records.
5. Before changing registrar nameservers, remove the old DS record when source
   DNSSEC is enabled. The owner performs the registrar update manually, keeps
   both DNS providers active, and asks MithrilPress to compare the exact target
   NS set and confirm that no DS record is visible through both recursive
   resolvers. This checks recursive propagation only; it does not verify email,
   HTTP, TLS, authoritative health, or every geographic resolver.
6. If service checks fail, restore the captured source nameservers at the
   registrar and restore the captured source DS state after the source becomes
   authoritative again. MithrilPress can verify that NS/DS state through the
   same resolvers. Keep the source provider and zone intact through the rollback
   window.
7. After the owner verifies destination service or source rollback, the owner
   can erase snapshots. Hashes and append-only audit receipts remain. Do not
   delete the source zone until the owner confirms stable service and the
   retention window expires.

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
  out of URLs, application logs, analytics, and generated sales messages. A
  Cloudflare API token is accepted only in a request header, is never written
  to D1, and should be revoked after use. The explicit additive import token
  also performs zone and record reads, so grant `Zone Read`, `DNS Read`, and
  `DNS Write` only on the exact target zone.

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
