# MithrilPress Worker

This package is the first host adapter for the MithrilPress content
model in `src/mithril/sites_cms.cljk` and `ontology/sites-cms-v1.mith`. Platform
tenant hostname validation is authored in Mithril at
`apps/mithrilpress-worker/src/platform_hostname.mith` and compiled to the
checked-in Worker module. It uses Cloudflare D1 and R2, and serves only an
explicitly published tenant revision.

## Supported in this slice

- Exact one-label `*.sites.mithril.love` host validation followed by an exact
  D1 hostname lookup. A hostname label never grants tenant identity.
- Owner-scoped WordPress REST and WXR 1.2 subset import for posts and pages.
  Imports are bounded, sanitized, immutable revisions that remain private.
  Standard WXR categories, tags, category parents, and term IDs are retained;
  a small static SEO field allowlist is retained, while other custom fields,
  page-parent links, and source media files require manual migration. Every
  import returns link, block, asset, and SEO metadata reconciliation counts.
- Chat-first MithrilPress Studio for creating one post or page draft, revising it
  in a conversation, opening a private preview, and separately approving and
  publishing it.
- Owner-provided JPEG, PNG, GIF, and WebP image uploads to tenant-scoped R2,
  with byte and dimension checks, per-site and deployment storage caps, daily
  per-site and shared read caps, daily upload/delete caps, and explicit
  featured-image selection. One site cannot exhaust the shared image delivery
  allowance by itself. Uploads never fetch URLs from WordPress or elsewhere.
- Short-lived, host-only browser sessions exchanged from a scoped owner token;
  conversation messages and AI drafts remain in the tenant's D1 database until
  the owner deletes the conversation.
- Authenticated, `noindex` private preview; separate revision-approval and
  publication actions with audit receipts.
- Read-only WordPress REST-compatible `GET` endpoints for public posts/pages,
  categories/tags, and published featured or inline media, including
  pagination headers. Public `edit` context is denied.
- A minimal server-rendered page route with a restrictive CSP and no theme,
  plugin, shortcode, script, style, form, or dynamic-block execution. Only
  separately validated owner-uploaded R2 media may render inline or as a
  featured image.
- A `site:publish`-scoped immutable snapshot endpoint and local Pages artifact
  exporter for the current owner-approved publication. The exporter verifies
  the snapshot digest and every media object's SHA-256, then writes static HTML,
  taxonomy archives, a sitemap, an RSS feed, robots.txt, and referenced images.
  It creates local files only; it does not call the Cloudflare Pages API or
  publish a deployment.

The checked-in Mithril native-JS modules own platform subdomain validation,
WordPress post/page record admission, individual taxonomy-term admission, and
the private chat-draft proposal envelope. The Worker calls those contracts at
the hostname, import, taxonomy, and AI proposal boundaries. It retains host
responsibility for cross-record taxonomy references and cycles, D1/R2 and AI
I/O, HTML sanitization, language-tag canonicalization, and slug collision
resolution. The `.cljk` model remains the platform-neutral reference boundary;
the `.mith` modules are the executable Worker contracts. Regenerate all
checked-in modules from the repository root or this package directory with
`npm run build:mithril` after changing their `.mith` source. The build uses the
Mithril workspace's `kbb` compiler.

## Local setup

1. Install this package's Wrangler development dependency.
2. Use Wrangler's local D1 state for development. Keep the all-zero example ID
   in `wrangler.example.jsonc`; remote D1 setup uses a separate operator-owned
   config with real account and database IDs.
3. Apply all migrations in `migrations/` locally, in numeric order.
4. Provision a site and its first chat-first owner token with the operator CLI
   below. Keep the one-time token in the owner's secret manager. Use HTTPS only;
   the Worker stores only a salted SHA-256 digest. The Studio accepts a one-time
   HTTPS token exchange and keeps the resulting session in a Secure, HttpOnly,
   SameSite=Strict cookie.
5. Run `npm run dev` to work against local D1.

The example config deliberately has no route and disables `workers.dev`. It is
not a production deployment config. Production routing, real D1 IDs, zone
ownership, wildcard DNS, exact-source standalone qualification, rollback, and
live read-back remain release gates.

The R2 adapter stores objects with random site-scoped keys and keeps metadata
and ownership references in D1. The application caps storage at 250 MiB per
site and 8 GiB per deployment, image reads at 5,000 per site and 50,000 across
the deployment per UTC day, and uploads/deletes at 10,000 across the deployment
per day. Cloudflare's R2 Standard free tier currently includes
10 GB-month storage, 1 million Class A operations, and 10 million Class B
operations per month; those allowances are account-wide and shared with other
workloads. The application caps do not guarantee a zero bill when the account
has other R2 usage. No paid fallback is configured. See [R2 pricing](https://developers.cloudflare.com/r2/pricing/).

### Static publication artifact

After a site owner separately approves and publishes a revision, a publisher
with a short-lived `site:publish` token can read the current snapshot and its
referenced media. Load `MITHRILPRESS_OWNER_TOKEN` from the approved local secret
store into the process environment; do not put it in a command argument or
commit it. Select the exact site origin and a new, nonexistent output path:

```sh
MITHRILPRESS_CONTROL_URL=https://control.mithril.love \
MITHRILPRESS_SITE_ID=00000000-0000-4000-8000-000000000000 \
MITHRILPRESS_OUTPUT_DIR=/tmp/example-pages \
npm run export:pages
```

The site ID and token must belong to the same tenant. Set the token in the same
process environment before running the command. The control-plane origin must
route the authenticated site publication endpoint; no such Cloudflare route is
provisioned by this package. The exporter accepts only the exact
`https://control.mithril.love` origin so the bearer token is not sent to an
arbitrary tenant hostname or `workers.dev` endpoint. An optional
`MITHRILPRESS_EXPECTED_REVISION` makes the exporter fail if the published
revision changed before the snapshot read.
The output is a local artifact only. A standalone publisher must re-read the
current revision and digest immediately before any future Pages upload, verify
the exact Pages deployment and host afterward, and retain the previous
known-good deployment. Pages credentials and R2 objects are never sent to the
tenant-facing Worker.

## Tenant provisioning data

### Operator provisioning

Install the package dependencies, apply the D1 migrations, then provision a
tenant. The target must be explicit. Local mode uses Wrangler's local D1 state;
remote mode also requires the exact hostname to be repeated as a write guard:

```sh
cd apps/mithrilpress-worker
npm ci
npx wrangler d1 migrations apply mithrilpress --config wrangler.example.jsonc --local
npm run provision:site -- --target local --config wrangler.example.jsonc \
  --database mithrilpress --hostname preview-example.sites.mithril.love \
  --owner-label "Example site owner"
```

For a remote database, use an operator-owned Wrangler config containing the real
account ID and D1 ID, authenticate a dedicated Wrangler profile with the
approved operator credential, and repeat the exact hostname for confirmation:

```sh
npm run provision:site -- --target remote --config wrangler.production.jsonc \
  --database mithrilpress --hostname preview-example.sites.mithril.love \
  --owner-label "Example site owner" \
  --wrangler-profile mithrilpress-provision \
  --confirm-hostname preview-example.sites.mithril.love
```

The remote command refuses all-zero example account and database IDs. It only
writes the tenant and owner-token rows; it does not deploy a Worker or create
DNS/routes.
It checks the hostname before writing and verifies the exact salted token row
before returning the plaintext token. If the final read-back fails, the token
is withheld and an incomplete empty tenant is removed where safe. Reconcile D1
before retrying after an ambiguous provider error. The owner token is printed
once as JSON; send it directly to the owner's secret manager and do not save
terminal logs. Its chat-first scopes are `content:write`, `media:write`,
`revision:preview`, `revision:approve`, and `site:publish`. It expires after 24
hours; a separate least-privilege token is needed for importing or domain/DNS
management. The CLI preauthorizes no import or domain-management scope.

An optional `--source-origin https://wordpress.example` records an
owner-approved HTTPS WordPress origin for a later import. It does not fetch or
copy any source content. Current provisioning is operator-driven; account
registration, email verification, and direct self-service tenant signup are not
implemented yet.

### Manual D1 reference

The operator CLI is preferred. For controlled recovery, the equivalent site
record shape is:

```sql
INSERT INTO sites (id, hostname, source_origin, status, created_at)
VALUES ('<site-uuid>', '<one-label>.sites.mithril.love', 'https://wordpress.example', 'active', '<utc-iso8601>');
```

Each owner token has format `<24 lowercase hex token id>.<43 base64url secret>`
and a separate random 16-byte salt. Store the SHA-256 hex digest of
`<salt-hex>.<secret>`, not the full token. Include every generated field except
`token` when inserting the row, including `expires_at`; generated tokens expire
after 24 hours. Allowed scopes are
`content:import`, `content:write`, `media:write`, `revision:preview`, `revision:approve`,
`site:publish`, `site:domains`, and `site:dns-migrate`. The Studio owner token needs `content:write` to create drafts,
`revision:preview` to open previews, `revision:approve` to approve a revision,
`site:publish` to publish it. A domain-only Studio token may use `site:domains`
without granting content editing. Keep import-only automation on a separate
`content:import` token. Image upload and library management use the separate
`media:write` scope. An owner can combine it with `content:write` to select
featured images. This scope does not grant content editing or publication.
Revoke early by setting `revoked_at`.
DNS planning is a separate high-impact owner scope. It grants access to private
zone snapshots and owner approval of a cutover plan. Cloudflare access is
separate: the owner may provide a zone-scoped API token for one request. The
Worker forwards it to Cloudflare only for that request, does not persist it,
and never accepts registrar credentials. DNS Write is used only for an
explicit additive import request containing source records missing from an
unchanged staged zone; MithrilPress does not send record update or delete
operations.

Generate a one-time token envelope separately with
`node scripts/create-owner-token.mjs <owner-label> <scope> [<scope> ...]`.
The command prints the bearer token once and the hash material for the
`tenant_owner_tokens` insert. Provision only the hash row through a secured
operator path and deliver the plaintext token through the owner's secret
manager; never commit or log the output. Store scopes as a JSON array such as
`["content:import"]`. The schema's composite foreign keys keep each revision
and content row within its owning site.

### Owner-provided WXR media bundle

The local migration CLI accepts a WordPress WXR 1.2 export and the matching
local `wp-content/uploads` directory. It never requests the source WordPress
site or follows attachment URLs. The media directory must preserve the paths
recorded in WXR's `_wp_attached_file` metadata. The tool checks referenced
attachments, image signatures, dimensions, duplicate WordPress media IDs,
symlinks, and package limits before uploading. Unreferenced WXR attachments are
reported and skipped.

Run a dry-run plan first; this does not need an owner token and makes no network
requests:

```sh
npm run import:wordpress -- --site https://example.sites.mithril.love \
  --wxr /path/to/wordpress-export.xml \
  --media-dir /path/to/wp-content/uploads
```

After reviewing the plan, save a short-lived owner token with only
`content:import` and `media:write` scopes in a local file readable only by its
owner, then add `--token-file /path/to/owner.token --apply`. `--apply` uploads
only referenced local images and creates a private preview revision. It never
approves or publishes the revision. The owner must inspect the saved migration
report, approve the complete revision, and publish it in a separate action.
The report lists ready/mapped media, missing references, rejected files, and
unreferenced attachments. The worker enforces the tenant's existing daily media
write and storage caps; reaching a cap stops the import without a paid fallback.

## Endpoints

| Method | Path | Auth | Behavior |
| --- | --- | --- | --- |
| `POST` | `/api/wordpress/import` | `content:import` | Import JSON `{ "source_site": "https://…", "records": [...] }` or a raw `application/rss+xml`, `application/xml`, or `text/xml` WXR 1.2 export into a private sanitized revision. WXR source origin is read from `<channel><link>`. |
| `GET` / `HEAD` | `/_mithrilpress/api/revisions/{revision-id}/migration-report` | `revision:preview` | Read the saved Gutenberg block, internal-link, asset mapping, and source omission report before approving a migrated revision. |
| `GET` / `POST` / `DELETE` | `/_mithrilpress/api/studio/session` | `content:write`, `media:write`, `site:domains`, or `site:dns-migrate` | Exchange a short-lived owner token for a one-hour browser session, inspect it, or revoke it. |
| `GET` | `/_mithrilpress/studio` | public shell; noindex | Open the chat-first post/page Studio. The API requires a site-owner session. |
| `POST` | `/_mithrilpress/api/studio/chat` | `content:write` | Generate or revise one private draft; no model response is published. |
| `GET` | `/_mithrilpress/api/studio/conversations` and `/_mithrilpress/api/studio/conversations/{id}` | `content:write` | Read the signed-in owner's conversation history. |
| `DELETE` | `/_mithrilpress/api/studio/conversations/{id}` | `content:write` | Delete the conversation and its unpublished draft. Published revisions remain intact. |
| `GET` | `/_mithrilpress/api/studio/usage` | `content:write`, `media:write`, or `site:domains` | Show this site's retained content, public request use, R2 image storage, and daily app-level usage. |
| `GET` / `POST` | `/_mithrilpress/api/media` | `media:write` | List the tenant's image library or upload a bounded JPEG, PNG, GIF, or WebP image directly to R2. |
| `DELETE` | `/_mithrilpress/api/media/{id}` | `media:write` | Hide and remove an image; published content referencing it will render without the image. |
| `GET` / `HEAD` | `/_mithrilpress/media/{id}` | public only when referenced by the published revision; owner preview otherwise | Serve an image only while referenced by published content or the authenticated owner's preview/library. |
| `GET` | `/_mithrilpress/preview/{revision-id}/{slug}` | `revision:preview` | View sanitized revision HTML with `noindex` headers. |
| `POST` | `/_mithrilpress/api/revisions/{revision-id}/approve` | `revision:approve` | Record owner approval for a complete sanitized revision. |
| `POST` | `/_mithrilpress/api/revisions/{revision-id}/publish` | `site:publish` | Make the approved revision the public site revision. |
| `GET` / `HEAD` | `/_mithrilpress/api/control/sites/{site-id}/publication/current` | `site:publish` | Read a digest-bound snapshot of only the current owner-approved published revision on the separate control-plane origin. |
| `GET` / `HEAD` | `/_mithrilpress/api/control/sites/{site-id}/publication/revisions/{revision-id}/media/{id}` | `site:publish` | Read a referenced media object only while that revision is still current; reads count against existing image-delivery caps. |
| `GET` / `POST` | `/_mithrilpress/api/domains` | `site:domains` | List custom hostnames or start a 24-hour ownership TXT challenge. Unverified requests do not reserve hostnames or shared capacity. Expired claims are released before per-site capacity checks; a detached hostname can be claimed by another site after fresh proof. |
| `POST` | `/_mithrilpress/api/domains/{hostname-id}/verify` | `site:domains` | Verify ownership TXT and provision the Cloudflare for SaaS hostname and certificate. |
| `POST` | `/_mithrilpress/api/domains/{hostname-id}/refresh` | `site:domains` | Read provider/TLS status and verify the public DNS-only CNAME. |
| `DELETE` | `/_mithrilpress/api/domains/{hostname-id}` | `site:domains` | Stop serving the hostname, then remove the Cloudflare custom hostname. |
| `GET` / `POST` | `/_mithrilpress/api/dns-migrations` | `site:dns-migrate` | List plans or create a 48-hour domain-control TXT challenge. Pending requests do not reserve a zone globally; the first owner to prove control claims the plan. Expired pending plans are cancelled when the owner starts another plan or a tenant requests the same zone. NS/DS state is not queried until ownership is proven. |
| `GET` / `DELETE` | `/_mithrilpress/api/dns-migrations/{id}` | `site:dns-migrate` | Read a tenant-private plan, or cancel/archive and erase its zone snapshots. |
| `POST` | `/_mithrilpress/api/dns-migrations/{id}/verify-ownership` | `site:dns-migrate` | Verify the domain TXT challenge before accepting zone files. |
| `POST` | `/_mithrilpress/api/dns-migrations/{id}/source` | `site:dns-migrate` | Validate and retain the source BIND zone and generate a destination import file. |
| `POST` | `/_mithrilpress/api/dns-migrations/{id}/target` | `site:dns-migrate` | Compare a staged destination zone and its assigned nameservers against the source. |
| `POST` | `/_mithrilpress/api/dns-migrations/{id}/cloudflare-target` | `site:dns-migrate` plus a transient zone-scoped Cloudflare token | Read a full Cloudflare zone export and stage its assigned nameservers and record diff. |
| `POST` | `/_mithrilpress/api/dns-migrations/{id}/cloudflare-import` | `site:dns-migrate`, explicit confirmation, and a transient token with zone-scoped `DNS Write` | Recheck the staged zone, add only missing source records, then export and verify the readback. |
| `POST` | `/_mithrilpress/api/dns-migrations/{id}/approve` | `site:dns-migrate` | Approve the exact diff digest after a required owner confirmation. |
| `POST` | `/_mithrilpress/api/dns-migrations/{id}/verify-delegation` | `site:dns-migrate` | Check destination NS and absence of DS through Cloudflare and Google recursive resolvers. |
| `POST` | `/_mithrilpress/api/dns-migrations/{id}/verify-rollback` | `site:dns-migrate` | Check restored source NS and DS state through the same resolvers. |
| `GET` | `/wp-json/wp/v2/posts` | public | Read published posts with bounded search, date, order, slug, and pagination filters. |
| `GET` | `/wp-json/wp/v2/pages` | public | Read published pages with bounded search, date, order, slug, and pagination filters. |
| `GET` / `HEAD` | `/wp-json/wp/v2/posts/{id}` or `/wp-json/wp/v2/pages/{id}` | public | Read one published post or page by its WordPress source ID or MithrilPress API ID. |
| `GET` | `/wp-json/wp/v2/media/{id}` | public | Read metadata for a currently published featured or inline image. |
| `GET` | `/{slug}/` | public | Render one published page or post. |

The HTML sanitizer keeps a small semantic tag allowlist, removes all attributes
except validated HTTP(S) or relative anchor links, removes comments, and drops
active content subtrees. An inline image is retained only when its `wp-image-N`
class maps to an active R2 image uploaded by the site owner with WordPress media
ID `N`. Unmapped image elements are removed and counted. Owners must transfer
media themselves; MithrilPress never fetches WordPress URLs or arbitrary source
media. Links on the admitted WordPress host are rewritten only when their
source permalink matches an imported post or page. Unmatched source-host links
remain pointed at the source and are counted for owner review; unsafe schemes
are removed and counted. The private import response and `migration-report`
endpoint classify static, layout-degraded, dynamic, and unknown Gutenberg
blocks, count source omissions, link mappings and image mappings, and flag
revisions for owner review. The report does not make dynamic blocks, themes,
plugins, shortcodes, or PHP compatible; their code is never executed.
Only static Yoast SEO title/description and Rank Math title/description fields
are retained. Dynamic template tokens, duplicate fields, mixed-plugin metadata,
and other custom fields remain omitted and are counted for owner review. These
text values are escaped in rendered HTML and exposed through the read-only
WordPress `meta` response; SEO plugin code and schema graphs are not imported.
The Worker enforces a conservative 1.8 MB encoded-size budget for each content
row, below Cloudflare D1's documented 2 MB maximum row/string size.
Imported non-public WordPress statuses remain available only in the private
owner preview; public routes expose records whose source status was `publish`.
Chat-created entries are draft-only until their containing revision is approved
and explicitly published. Workers AI receives the bounded conversation and
current draft to generate a proposal. The prototype caps Studio generation at
eight requests per UTC day across the deployment. Studio AI is disabled in the
example deployment and only runs through an explicitly configured, named AI
Gateway; the implicit `default` gateway is rejected. Before enabling it, the
operator must configure and verify a spend-limit rule for MithrilPress on that
gateway. The app-level request cap is not a neuron or dollar cap. Cloudflare
Workers AI bills usage above its daily free neuron allocation on a Workers Paid
account, and other workloads share that allocation. AI Gateway spend limits
block requests after their configured budget, but enforcement is eventually
consistent, so concurrent requests may briefly exceed the target. The prompt
and output are bounded to limit that exposure, and a gateway rejection returns
an unavailable response without saving or publishing a draft. See [Workers AI
pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/) and
[AI Gateway spend limits](https://developers.cloudflare.com/ai-gateway/features/spend-limits/).

The Worker also enforces a 16 MiB retained-import content cap per site,
including entries and taxonomy terms, and a 256 MiB cap across the deployment.
D1 triggers maintain these counters
across immutable revisions and reject writes that exceed either cap; the Studio
Usage view shows the per-site estimate and the shared daily AI request count.
The byte estimate counts retained entry text, taxonomy text, and allowlisted
SEO metadata, not SQLite indexes, other database metadata, conversations, DNS
migration snapshots, audit rows, or the physical D1 database size. It is an
application guardrail rather than provider storage telemetry, and the deployment
cap reserves room for database overhead without guaranteeing that other writes
cannot consume the provider limit.

## Hosting and custom domains

The intended runtime is one Worker, D1, and a proxied wildcard route for
`*.sites.mithril.love`. Hosting is free to site owners; the operator pays the
provider bill. Cloudflare's Workers Paid plan currently has a $5/month minimum,
10 million included requests per month, and metered overages. D1, R2, and
Workers AI have separate account-level allowances and pricing. MithrilPress
does not bill site owners or automatically upgrade a plan.

MithrilPress does not use Workers for Platforms in the initial design. That
product's dispatch namespaces isolate and route customer-authored Worker code;
MithrilPress runs one reviewed renderer over tenant content and does not execute
tenant code. Workers for Platforms is a separately paid service (listed at
$25/month plus usage overages when checked on 2026-10-21), so it is not the
mechanism for a free site-owner tier or a provider-level hard stop. Revisit it
only if tenant-authored code becomes a product requirement. See the
[Workers for Platforms overview](https://developers.cloudflare.com/cloudflare-for-platforms/workers-for-platforms/),
[how dispatch works](https://developers.cloudflare.com/cloudflare-for-platforms/workers-for-platforms/how-workers-for-platforms-works/),
and [pricing](https://developers.cloudflare.com/cloudflare-for-platforms/workers-for-platforms/reference/pricing/).

MithrilPress enforces 5,000 HTTP requests per active site per UTC day and
25,000 HTTP requests across the deployment. Every routed request counts,
including public pages, WordPress REST, Studio, previews, DNS, media, and
unsupported routes. The shared counter increments before hostname resolution,
so unresolved hosts also consume the shared cap and requests after the shared
cap are rejected before the hostname registry is read. Resolved active sites
then consume their site allowance. The request that reaches a cap is handled;
later requests receive 429 for a site cap or 503 for the shared cap until 00:00
UTC. These application counters limit MithrilPress routes; they do not stop
Worker invocations at Cloudflare's billing layer. The Worker invocation and
one D1 counter write still occur before a request can receive the shared-cap
response, and unrelated workloads in the same Cloudflare account consume the
same provider allocations. The Studio shows MithrilPress app counters, but does
not measure all account-wide Worker requests, D1 reads/writes/storage, or
Workers AI neuron usage. Cloudflare's Workers Paid plan has no request ceiling
and meters usage beyond included allocations; budget alerts notify but do not
pause or cap usage. A strict provider-level stop therefore requires a dedicated
Workers Free deployment or an independently operated route shutdown, with the
account and hostname-routing boundaries verified before launch; it is not
provided by these app counters. On Workers Free, D1 daily read/write exhaustion
or a D1 storage ceiling is returned as a clear 503 and requests fail closed.
Import and rendering workloads have not been qualified against the current CPU
limit. Usage monitoring and release gates are tracked in Linear MITHRIL-292.
See [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/),
[Workers limits](https://developers.cloudflare.com/workers/platform/limits/),
[D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/), and
[Cloudflare budget alerts](https://developers.cloudflare.com/billing/manage/budget-alerts/),
[Workers AI pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/)
again before each release.

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

Full nameserver migration remains a separate, optional owner workflow. It
includes domain TXT proof, capture of the current NS/DS state, private source
and destination BIND snapshots, record diff, generated import text,
digest-bound owner approval, and post-cutover NS/DS checks through two public
recursive resolvers. For Cloudflare, an owner may submit a zone-scoped token
for a single read request (`Zone Read` and `DNS Read`). An explicit second
request may use a scoped `DNS Write` token to submit only records missing from
an unchanged staged zone. The request does not contain update or delete
operations; the deployment keeps the import endpoint disabled until its
behavior is qualified against an isolated Cloudflare zone. MithrilPress stops
if the live zone changed, the destination has extra or changed records, or the
post-import readback is not an exact match. The token is not persisted.
Registrar nameserver changes, DNSSEC, and service checks for web, TLS, and mail
remain manual owner operations. See [Cloudflare DNS import](https://developers.cloudflare.com/api/resources/dns/subresources/records/methods/import/)
and [export](https://developers.cloudflare.com/api/resources/dns/subresources/records/methods/export/).
Provider writes are disabled by default with
`CLOUDFLARE_DNS_IMPORTS_ENABLED=false`; set it to `true` only after the exact
import and readback behavior is qualified against an isolated Cloudflare zone.

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
its API supports BIND import with `DNS Write` and export with `DNS Read` or
`DNS Write`. See [Cloudflare zone import/export](https://developers.cloudflare.com/dns/manage-dns-records/how-to/import-and-export/).

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

Before provisioning a zone or enabling a provider integration, review the
[Cloudflare credential boundaries](../../docs/design/mithrilpress-cloudflare-auth.md).
DNS migration tokens are supplied by an owner for one operation; the SaaS
hostname token is a separate operator secret; and the Worker accesses media
through its R2 binding rather than an R2 API token.

## WordPress REST subset

Public post/page list requests support `page`, `per_page` (1–100), `slug`,
`search`, `after`, `before`, `modified_after`, `modified_before`, `order`, and
`orderby` (`date`, `modified`, `id`, `title`, `slug`, or `relevance`; relevance
requires a search term), plus `context` `view`/`embed`. Search matches the
published title and sanitized content. Relevance descending ranks exact title
matches, title substrings, then content-only matches. Dates accept ISO 8601
calendar dates or timezone-qualified date-times; date-only `before` and
`modified_before` values include the full UTC calendar day. Results remain
restricted to published entries.
Single-item `GET` and `HEAD` routes accept a positive numeric ID. Imported
entries resolve by their WordPress source ID; MithrilPress-authored entries
resolve by their MithrilPress API ID. They return only an entry in the active
published revision, so drafts, private previews, superseded revisions, and IDs
of another post type return 404.
Category/tag lists also support
`search` and `hide_empty`, and individual terms can be fetched by source ID.
Responses include standard `X-WP-Total`, `X-WP-TotalPages`, and pagination
`Link` headers. Category/tag archives render published-entry lists. Editing
contexts, term and media writes, media listings, users, comments, custom post
types, and WordPress authentication plugins are not implemented here.

The importer also accepts WordPress WXR 1.2 exports. It imports up to 500
posts/pages per file, with the channel origin, source IDs, slugs, title/body,
status, dates, permalinks, category/tag IDs, and featured-media IDs. The owner
must use a `content:import` token, and the WXR channel link must match the
site's configured source origin. Imports stay in a private preview until the
owner approves and publishes them. DTDs, custom entities, non-UTF-8 files,
unknown taxonomy references, and malformed XML are rejected. The parser caps
the upload at 12 MB, 2,000 WXR items, 100,000 XML nodes, nesting depth 64, and
250,000 characters per XML text node.

REST JSON imports may include a `taxonomy_terms` array. Every referenced
category or tag ID must resolve to an imported term. Term descriptions are
sanitized before storage and are readable only through the published revision.

WXR attachment files are not copied: the importer retains featured-media IDs
and counts attachment/media references but does not fetch remote files. To map
an inline image, an owner uploads the corresponding image to the tenant library
with its original WordPress media ID before import. Source-host links are
rewritten only for imported permalinks; unresolved links remain visible in the
report and still point to the source site. The report shows which image
references were rewritten or omitted. Apart from the static SEO field allowlist
above, the importer does not preserve custom fields, page-parent relationships,
users, comments, or custom taxonomies.
Unsupported post types and password-protected posts/pages are skipped and
counted in the import report; protected content is never silently turned into
ordinary public content. Review the report and private preview before
publication.
