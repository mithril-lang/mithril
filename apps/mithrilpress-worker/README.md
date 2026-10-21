# MithrilPress Worker

This package is the first host adapter for the MithrilPress content
model in `src/mithril/sites_cms.cljk` and `ontology/sites-cms-v1.mith`. It uses
Cloudflare D1 and serves only an explicitly published tenant revision.

## Supported in this slice

- Exact one-label `*.sites.mithril.love` host validation followed by an exact
  D1 hostname lookup. A hostname label never grants tenant identity.
- Owner-scoped WordPress REST record import for posts and pages. Imports are
  bounded, sanitized, immutable revisions that remain private.
- Chat-first MithrilPress Studio for creating one post or page draft, revising it
  in a conversation, opening a private preview, and separately approving and
  publishing it.
- Short-lived, host-only browser sessions exchanged from a scoped owner token;
  conversation messages and AI drafts remain in the tenant's D1 database until
  the owner deletes the conversation.
- Authenticated, `noindex` private preview; separate revision-approval and
  publication actions with audit receipts.
- Read-only WordPress REST-compatible `GET` endpoints for public posts/pages,
  including pagination headers. Public `edit` context is denied.
- A minimal server-rendered page route with a restrictive CSP and no theme,
  plugin, shortcode, script, style, form, media, or dynamic-block execution.

The Worker adapter currently duplicates the pure Mithril module's record
normalization because this repository does not yet package its ClojureScript
runtime for the Workers JavaScript runtime. The Mithril module remains the
semantic model. A later integration should generate or call the Worker
normalizer from a checked Mithril module instead of maintaining two copies.

## Local setup

1. Install this package's Wrangler development dependency.
2. Create a local D1 database and replace the example binding ID in
   `wrangler.example.jsonc` with its returned ID.
3. Apply all migrations in `migrations/` locally, in numeric order.
4. Provision a site and owner tokens using the SQL shapes below. Keep token
   plaintext in a secret manager. Use HTTPS only; the Worker stores only a
   salted SHA-256 digest. The Studio accepts a one-time HTTPS token exchange and
   keeps the resulting session in a Secure, HttpOnly, SameSite=Strict cookie.
5. Run `npm run dev` to work against local D1.

The example config deliberately has no route and disables `workers.dev`. It is
not a production deployment config. Production routing, real D1 IDs, zone
ownership, wildcard DNS, exact-source standalone qualification, rollback, and
live read-back remain release gates.

## Tenant provisioning data

Insert a site with an owner-approved source origin:

```sql
INSERT INTO sites (id, hostname, source_origin, status, created_at)
VALUES ('<site-uuid>', '<one-label>.sites.mithril.love', 'https://wordpress.example', 'active', '<utc-iso8601>');
```

Each owner token has format `<24 lowercase hex token id>.<43 base64url secret>`
and a separate random 16-byte salt. Store the SHA-256 hex digest of
`<salt-hex>.<secret>`, not the full token. Include every generated field except
`token` when inserting the row, including `expires_at`; generated tokens expire
after 24 hours. Allowed scopes are
`content:import`, `content:write`, `revision:preview`, `revision:approve`,
`site:publish`, `site:domains`, and `site:dns-migrate`. The Studio owner token needs `content:write` to create drafts,
`revision:preview` to open previews, `revision:approve` to approve a revision,
`site:publish` to publish it. A domain-only Studio token may use `site:domains`
without granting content editing. Keep import-only automation on a separate
`content:import` token. Revoke early by setting `revoked_at`.
DNS planning is a separate high-impact owner scope. It grants access to private
zone snapshots and owner approval of a manual cutover plan; it does not grant
Cloudflare API or registrar credentials.

Generate the one-time token envelope locally with
`node scripts/create-owner-token.mjs <owner-label> <scope> [<scope> ...]`.
The command prints the bearer token once and the hash material for the
`tenant_owner_tokens` insert. Provision only the hash row through a secured
operator path and deliver the plaintext token through the owner's secret
manager; never commit or log the output. Store scopes as a JSON array such as
`["content:import"]`. The schema's composite foreign keys keep each revision
and content row within its owning site.

## Endpoints

| Method | Path | Auth | Behavior |
| --- | --- | --- | --- |
| `POST` | `/api/wordpress/import` | `content:import` | Import JSON `{ "source_site": "https://…", "records": [...] }` into a private sanitized revision. |
| `GET` / `POST` / `DELETE` | `/_mithrilpress/api/studio/session` | `content:write` for sign-in/status/logout | Exchange a short-lived owner token for a one-hour browser session, inspect it, or revoke it. |
| `GET` | `/_mithrilpress/studio` | public shell; noindex | Open the chat-first post/page Studio. The API requires a site-owner session. |
| `POST` | `/_mithrilpress/api/studio/chat` | `content:write` | Generate or revise one private draft; no model response is published. |
| `GET` | `/_mithrilpress/api/studio/conversations` and `/_mithrilpress/api/studio/conversations/{id}` | `content:write` | Read the signed-in owner's conversation history. |
| `DELETE` | `/_mithrilpress/api/studio/conversations/{id}` | `content:write` | Delete the conversation and its unpublished draft. Published revisions remain intact. |
| `GET` | `/_mithrilpress/api/studio/usage` | `content:write` or `site:domains` | Show this site's retained content estimate and the shared daily app-level AI drafting count. |
| `GET` | `/_mithrilpress/preview/{revision-id}/{slug}` | `revision:preview` | View sanitized revision HTML with `noindex` headers. |
| `POST` | `/_mithrilpress/api/revisions/{revision-id}/approve` | `revision:approve` | Record owner approval for a complete sanitized revision. |
| `POST` | `/_mithrilpress/api/revisions/{revision-id}/publish` | `site:publish` | Make the approved revision the public site revision. |
| `GET` / `POST` | `/_mithrilpress/api/domains` | `site:domains` | List custom hostnames or start a 24-hour ownership TXT challenge. |
| `POST` | `/_mithrilpress/api/domains/{hostname-id}/verify` | `site:domains` | Verify ownership TXT and provision the Cloudflare for SaaS hostname and certificate. |
| `POST` | `/_mithrilpress/api/domains/{hostname-id}/refresh` | `site:domains` | Read provider/TLS status and verify the public DNS-only CNAME. |
| `DELETE` | `/_mithrilpress/api/domains/{hostname-id}` | `site:domains` | Stop serving the hostname, then remove the Cloudflare custom hostname. |
| `GET` / `POST` | `/_mithrilpress/api/dns-migrations` | `site:dns-migrate` | List plans or create a domain-control TXT challenge. NS/DS state is not queried until ownership is proven. |
| `GET` / `DELETE` | `/_mithrilpress/api/dns-migrations/{id}` | `site:dns-migrate` | Read a tenant-private plan, or cancel/archive and erase its zone snapshots. |
| `POST` | `/_mithrilpress/api/dns-migrations/{id}/verify-ownership` | `site:dns-migrate` | Verify the domain TXT challenge before accepting zone files. |
| `POST` | `/_mithrilpress/api/dns-migrations/{id}/source` | `site:dns-migrate` | Validate and retain the source BIND zone and generate a destination import file. |
| `POST` | `/_mithrilpress/api/dns-migrations/{id}/target` | `site:dns-migrate` | Compare a staged destination zone and its assigned nameservers against the source. |
| `POST` | `/_mithrilpress/api/dns-migrations/{id}/approve` | `site:dns-migrate` | Approve the exact diff digest after a required owner confirmation. |
| `POST` | `/_mithrilpress/api/dns-migrations/{id}/verify-delegation` | `site:dns-migrate` | Check destination NS and absence of DS through Cloudflare and Google recursive resolvers. |
| `POST` | `/_mithrilpress/api/dns-migrations/{id}/verify-rollback` | `site:dns-migrate` | Check restored source NS and DS state through the same resolvers. |
| `GET` | `/wp-json/wp/v2/posts` | public | Read the current published posts only. |
| `GET` | `/wp-json/wp/v2/pages` | public | Read the current published pages only. |
| `GET` | `/{slug}/` | public | Render one published page or post. |

The HTML sanitizer keeps a small semantic tag allowlist, removes all attributes
except validated HTTP(S) or relative anchor links, removes comments, and drops
active content subtrees. Images/assets are intentionally omitted in this
slice; imported source HTML is retained for reconciliation. Sanitization does
not make WordPress themes, dynamic Gutenberg blocks, plugins, or PHP compatible.
The Worker enforces a conservative 1.8 MB encoded-size budget for each content
row, below Cloudflare D1's documented 2 MB maximum row/string size.
Imported non-public WordPress statuses remain available only in the private
owner preview; public routes expose records whose source status was `publish`.
Chat-created entries are draft-only until their containing revision is approved
and explicitly published. Workers AI receives the bounded conversation and
current draft to generate a proposal. The prototype caps Studio generation at
eight requests per UTC day across the deployment; the Cloudflare account-wide
free AI allowance can be exhausted earlier by other workloads, in which case
draft generation stops rather than switching to paid usage.

The Worker also enforces a 16 MiB retained-entry payload cap per site and a
256 MiB payload cap across the deployment. D1 triggers maintain these counters
across immutable revisions and reject writes that exceed either cap; the Studio
Usage view shows the per-site estimate and the shared daily AI request count.
The byte estimate counts stored text values, not SQLite indexes, database
metadata, conversations, DNS migration snapshots, audit rows, or the physical D1 database size. It is an
application guardrail rather than provider storage telemetry, and the deployment
cap reserves room for database overhead without guaranteeing that other writes
cannot consume the provider limit.

## Hosting and custom domains

The intended free-plan starting point is one Worker, D1, and a proxied wildcard
route for `*.sites.mithril.love`. Cloudflare's free Workers plan currently has a
100,000-request daily limit and 10 ms CPU per request. D1 Free currently
includes 5 million rows read per day, 100,000 rows written per day, 5 GB total
account storage, and a 500 MB maximum size for one free database; Workers AI
includes 10,000 neurons per day. The prototype does not use a paid fallback.
The Studio does not measure account-wide Worker requests, D1 row reads/writes or
storage, or Workers AI neuron consumption. Those provider metrics must be
monitored in Cloudflare; provider limits can stop service before MithrilPress's
own content or request caps are reached. Provider failures outside AI generation
can still surface as generic errors. The import and rendering workloads have
not been qualified against the 10 ms CPU budget. Usage monitoring and free-tier
guardrails are tracked in Linear MITHRIL-292. See [Workers limits](https://developers.cloudflare.com/workers/platform/limits/),
[D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/), and
[Workers AI pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/)
for the current provider limits before each release.

The default address is an owner-provisioned hostname under
`*.sites.mithril.love`. Studio custom-hostname onboarding is implemented behind
a disabled-by-default feature gate. It asks the owner to publish a short-lived
TXT proof, creates the Cloudflare for SaaS hostname only after that proof
resolves, returns the provider's TLS validation records, and activates the
tenant mapping only after Cloudflare reports an active hostname and
certificate and public DNS shows the expected CNAME. The customer adds a
DNS-only CNAME; MithrilPress never asks for their DNS-provider password and
does not write to their DNS zone.

To enable the feature, the operator must supply `CF_SAAS_API_TOKEN` as a Worker
secret and configure `CF_SAAS_ZONE_ID`, `CF_SAAS_CNAME_TARGET`,
`CF_SAAS_CAPACITY_REMAINING`, `CUSTOM_DOMAINS_ENABLED`,
`CUSTOM_DOMAINS_ROUTING_READY`, and `CUSTOM_DOMAINS_MONITORING_READY`. Scope the
API token to the dedicated SaaS zone with `SSL and Certificates Write`; the
Worker does not need customer-zone DNS write access. Set routing ready only
after a dedicated `sites.mithril.love`
SaaS zone, fallback origin, wildcard Worker route, wildcard DNS, and safe
delegation from `mithril.love` have been configured and read back. The SaaS
zone's catch-all route must not intercept unrelated `mithril.love` websites.
Set the hostname capacity to the verified remaining quota, capped at 90 in this
deployment; the other 10 places are reserved for platform operations. Without
all of these settings, the Domains panel remains disabled.

An enabled Worker also runs a five-minute Cron Trigger that checks up to 30
active custom hostnames per invocation. At the configured limit of 90, every
hostname is checked at least once per 15 minutes. It suspends a mapping when
the provider hostname, certificate, or DNS-only CNAME no longer matches, and
after three consecutive provider/DNS check failures. A suspended hostname
must pass an owner-triggered refresh before it serves content again. Set
`CUSTOM_DOMAINS_MONITORING_READY=true` only after the deployed Cron Trigger has
completed successfully and its run is visible in Cloudflare. This prototype
accepts subdomains with at least three labels; apex domains and wildcard
customer hostnames are not supported.

Cloudflare currently includes 100 custom hostnames on Free, charges $0.10 per
additional hostname, and excludes wildcard custom hostnames and apex proxying
from Free. Enabling Cloudflare for SaaS on non-enterprise plans requires
payment information. Therefore custom domains are not part of the zero-cost
promise. See [Cloudflare for SaaS plans](https://developers.cloudflare.com/cloudflare-for-platforms/cloudflare-for-saas/plans/)
and the [enablement requirements](https://developers.cloudflare.com/cloudflare-for-platforms/cloudflare-for-saas/start/enable/).

Full nameserver migration remains a separate, optional workflow. MithrilPress
does not automate provider or registrar operations. MithrilPress now supports an
owner-guided DNS migration plan: domain TXT proof, capture of the current NS/DS
state, private source and staged-destination BIND snapshots, record diff,
generated destination import text, digest-bound owner approval, and post-cutover
NS/DS checks through two public recursive resolvers. The owner creates the
destination zone, imports DNS records, changes registrar nameservers, handles
DNSSEC, and checks web, TLS, and mail service manually. MithrilPress never
receives DNS-provider or registrar credentials and never writes customer DNS.

The parser accepts a documented BIND zone-file subset up to 256 KiB and 2,000
records. It supports `$ORIGIN`, `$TTL`, explicit or inherited owners, and
standard TTL suffixes; unsupported directives such as `$GENERATE` must be
expanded before upload. The parser does not support escaped owner-name labels
or non-IN record classes, so review and normalize exports that use them before
uploading.
Comparison excludes provider-managed apex SOA/NS and generated DNSSEC records,
and retains Cloudflare `cf-proxied` and `cf-flatten-cname` settings where the
zone export includes them. Generated imports default A/AAAA/CNAME records to
DNS-only when the source export does not provide proxy state. Provider settings,
free-form comments, glue, mail delivery, TLS, and application health still need
separate owner review. Cloudflare's official zone-file import limit is 256 KiB;
its API supports BIND import/export with `DNS Write` and `DNS Read`/`DNS Write`
respectively. See [Cloudflare zone import/export](https://developers.cloudflare.com/dns/manage-dns-records/how-to/import-and-export/).

Zone snapshots contain DNS TXT values that may include verification or service
secrets. They remain tenant-scoped in D1 until the owner cancels the plan or
archives a verified cutover/rollback, at which point snapshots and challenge
values are erased while hashes and append-only audit receipts remain. Keep the
source DNS zone active through the rollback window. After TXT ownership proof,
MithrilPress sends DNS queries for the domain to Cloudflare and Google public
resolvers to capture and check nameserver/DNSSEC state. A registrar transfer is
separate and may incur at-cost renewal charges.

Cloudflare's [Workers-as-fallback-origin guide](https://developers.cloudflare.com/cloudflare-for-platforms/cloudflare-for-saas/start/advanced-settings/worker-as-origin/)
documents routing customer hostnames through a wildcard Worker route.

## WordPress REST subset

Public list requests support `page`, `per_page` (1–100), `slug`, and `context`
`view`/`embed`. Responses include standard `X-WP-Total`, `X-WP-TotalPages`, and
pagination `Link` headers. Only posts/pages are implemented. Editing contexts,
media, terms, users, comments, custom post types, search, writes, WXR/XML, and
WordPress authentication plugins are not implemented here.
