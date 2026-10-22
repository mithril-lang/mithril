# MithrilPress: WordPress-compatible migration CMS

**Status: OSS implementation prototype, published in PRs #114 and #115 on
2026-10-21.** The Mithril content ontology and pure import/chat boundaries,
Cloudflare Worker/D1 adapter, bounded WordPress import and read-only
REST-compatible subset, chat-first owner Studio, and supervised sales-process
docs are in the public repository. The exact Worker source passed its approved
standalone qualification before integration. No production Worker, D1
database, R2 bucket, wildcard DNS record, or public route has been provisioned
and read back. This is not a production release or full WordPress parity.

## Product boundary

“WordPress compatible” means importing an explicitly owner-authorized subset of
posts and pages, preserving source IDs, slugs, dates, taxonomy IDs, media
references, and source permalinks, and serving a documented read-only subset of
the WordPress REST API. It does not include PHP, themes, plugins, shortcodes,
custom post types, or arbitrary Gutenberg rendering.

WordPress REST post records carry `content` and `title` objects. Raw content is
provided in the `edit` context, so the importer needs owner-authorized API access
or an owner-provided export; a public `view` response is not an equivalent
editable backup. Gutenberg stores serialized blocks in HTML with comment
delimiters and may represent dynamic blocks with placeholders. See the official
[Posts REST API schema](https://developer.wordpress.org/rest-api/reference/posts/)
and [block markup specification](https://developer.wordpress.org/block-editor/getting-started/fundamentals/markup-representation-block/).

## Migration flow

1. Verify site ownership and record an import authorization receipt scoped to
   content import. Prefer an owner-provided export or authorized REST API
   access. Never discover and clone prospect sites from their public pages.
2. Import selected posts/pages as a private revision. Keep the source HTML inert
   for reconciliation and generate sanitized render HTML from a limited semantic
   tag allowlist. Remove scriptable subtrees, comments, attributes, embedded
   media, and styles.
3. Allow only an authenticated owner to read the private preview. Send `noindex`
   and `nofollow`; previews require an owner token and are not prospect pages.
4. Record an explicit revision approval, then a separate publication action.
   Public requests resolve only the site's current published revision. Older
   revisions remain stored, but a guided rollback flow is future work.
5. Compare the migrated site with the owner-provided source and report omitted
   assets, unsupported blocks, and URL changes before the owner publishes.
6. Owners can also create and revise a draft through MithrilPress Studio. The
   AI response stays private; the owner must review the preview, approve the
   revision, and then take a separate publish action.

## Mithril content model

`ontology/sites-cms-v1.mith` defines sites, revisions, content entries,
taxonomy terms, assets, import receipts, hostnames, and owner approvals.
`src/mithril/sites_cms.cljk` implements the pure tenant and import boundary:

- validate a single-label `*.sites.mithril.love` hostname and resolve it by an
  exact host registry lookup;
- require a shape-checked owner import receipt;
- accept bounded WordPress REST `post` and `page` records and preserve their
  identifiers, content provenance, dates, permalink and taxonomy/media refs;
- keep source HTML marked untrusted; admit a one-to-one sanitized result with a
  bounded SHA-256 digest before opening the render gate; and
- force imports into private drafts and deny publication until a separate
  tenant-bound owner approval is present.

The Worker runtime contracts are authored in
`apps/mithrilpress-worker/src/platform_hostname.mith` and
`apps/mithrilpress-worker/src/content_boundary.mith`, compiled with Mithril's
native JavaScript emitter, and called at the hostname, WordPress record,
taxonomy-term, and chat-proposal boundaries. The chat contract returns an
untrusted, blocked, private-draft envelope; the host attaches bounded sanitized
HTML before opening the rendering gate. The pure `.cljk` boundary remains the
platform-neutral reference model. The Worker keeps host I/O and stateful work
in JavaScript, including cross-record taxonomy integrity, D1/R2 and AI calls,
HTML sanitization, language-tag canonicalization, slug collision resolution,
and publication transactions.

The adapter does not fetch WordPress itself: owners provide the content through
a scoped token. The importer accepts a
bounded WordPress WXR 1.2 subset as well as REST records. It retains posts and
pages, source IDs, dates, permalinks, category/tag IDs, and featured-media IDs.
WXR attachments, media bytes, custom fields, page-parent relations, users,
comments, custom post types, password-protected posts/pages, and custom
taxonomies remain outside the supported slice. Standard category/tag terms and
category parent links are preserved. The importer reports omitted attachments
and metadata and rejects DTDs, custom entities, malformed XML, and unresolved
category/tag references. Owner-provided media upload and delivery are
implemented; broad Gutenberg support remains follow-up work.

Studio uses a short-lived owner token exchange, a one-hour `HttpOnly`, `Secure`,
`SameSite=Strict` cookie session, same-origin mutation checks, prepared D1
queries, bounded chat history, HTML sanitization, and a daily AI generation cap.
It stores conversations in D1 until the owner deletes them. Workers AI processes
the conversation and current draft to produce a proposal; the proposal is not
fact-checked and must not be published without owner review. The current Studio
UI requires owner scopes for content writing, private preview, approval, and
publishing. Owner identity provisioning remains out of band.

## Cloudflare hosting

The current prototype is a MithrilPress Worker, D1, and R2. Public delivery is
not deployed. The candidate publication design uses one Cloudflare Pages
Direct Upload project per site and an exact Pages custom domain such as
`example.sites.mithril.love`; see the
[static publication design](mithrilpress-static-publication.md). It avoids a
shared wildcard route and does not require site owners to move nameservers.
Cloudflare-managed DNS can create the exact CNAME when the Pages custom domain
is confirmed. Deep-host TLS, the per-account Pages cap, paid control-plane
usage, and rollback still require qualification before provisioning.

Do not create a wildcard DNS record or Worker route for
`*.sites.mithril.love`. Each Pages project is static-first and has its own
asset root. A Pages Function may serve only explicitly supported WordPress REST
paths after `_routes.json` proves other public requests bypass Functions.
Keep private preview, chat, import, and owner APIs on the authenticated
MithrilPress Worker. A Pages project's `*.pages.dev` hostname is also public,
so only owner-approved published revisions may be deployed there.

Keep `workers.dev` disabled for the control Worker. It normalizes the hostname,
rejects reserved and unknown labels, then looks up the complete hostname in
D1. Host labels never grant tenant identity. Content queries carry both site
and revision IDs and use prepared statements. Owner credentials are per-site
salted SHA-256 token hashes with narrowly scoped permissions; plaintext tokens
are provisioned out of band. A separate Pages Function or control-plane
request can still consume account Workers usage. The candidate Pages REST
Function uses MithrilPress D1 counters to stop returning content at application
caps, but every over-cap attempt still invokes a metered Function. The account
plan is not verified, so do not enable those paths until the provider usage
boundary is read back. The Pages API `fail_open` field concerns deployment
configuration failures; it is not the Pages Free daily request-exhaustion
setting.

The parent zone serves unrelated hostnames. Cloudflare Free rate-limiting rules
support path and Verified Bot fields, but not host matching. A path-only rule
would also affect unrelated hosts, so no parent-zone Free rate-limit rule is a
safe MithrilPress edge guard. Pages static delivery avoids a shared wildcard
Worker ingress, but does not make control-plane, Pages Function, D1, AI, or R2
usage free. See the
[edge-protection gate](../operations/mithrilpress-free-edge-protection.md).

`apps/mithrilpress-worker/` provides the Worker handler, D1 migration, token
generator, chat-first Studio assets, and non-production Wrangler example. It
imports sanitized private drafts, supports private noindex previews and separate
approval and publish actions, returns a read-only post/page and featured-media
REST subset, and serves minimal SSR HTML with a restrictive CSP. It stores
original and sanitized content with a 1.8 MB encoded row budget beneath D1's
documented 2 MB maximum row/string size. Owner-provided images use R2 with
random site-scoped object keys and D1 metadata. Uploads check file signatures,
declared dimensions, MIME type, and byte length. They do not fetch external
WordPress media URLs or remove image metadata.

The checked-in Wrangler example has no route and disables `workers.dev`. No
MithrilPress Pages project, custom domain, DNS record, production credential,
or public hostname has been created. Pages deployment remains separate release
work.

The pricing policy is free for site owners; the hosting operator is responsible
for provider charges. This is not a zero-cost provider commitment. Workers Free
provides a 100,000-request daily account limit; Workers Paid has no daily
request limit and may bill usage. The product never bills site owners or
automatically switches a hosting account to a paid tier. Keep public routing
disabled until the account plan and an enforceable provider cost boundary have
been verified. See
[Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/),
[D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/),
[R2 pricing](https://developers.cloudflare.com/r2/pricing/), and
[Workers AI pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/).

The Cloudflare product that offers isolated per-customer Worker runtimes is
[Workers for Platforms](https://developers.cloudflare.com/cloudflare-for-platforms/workers-for-platforms/).
Its dispatch namespace is designed for customer-authored or AI-generated code
that must execute in isolated Workers. MithrilPress renders tenant content
with one operator-owned codebase, so its first version should use one ordinary
Worker, D1, and R2. Workers for Platforms is a separate paid offering (listed
at $25/month plus usage overages when checked on 2026-10-21); it does not
provide a free-hosting hard stop. Reconsider it only if executing tenant code
becomes a reviewed requirement. See [Workers for Platforms pricing](https://developers.cloudflare.com/cloudflare-for-platforms/workers-for-platforms/reference/pricing/).

Every request that reaches the Worker is subject to application hard stops of
25,000 requests across the deployment per UTC day. A request that resolves to
an active site is also subject to that site's 5,000-request daily cap; this
includes Studio, domain, DNS, media, preview, REST, and public-page routes. The
shared counter runs before hostname lookup, so requests to missing or inactive
hosts count toward the deployment cap and otherwise return 404. The site counter
runs after active-site resolution and before route dispatch. The request that
reaches an allowance is handled; later requests receive HTTP 429 for a site
limit or HTTP 503 for the shared limit until the next UTC day. These limits are
tracked atomically in D1. The Worker invocation and shared-counter write happen
before a capped response, so rejected requests can still be provider-metered. R2
application caps allow 250 MiB per site and 8 GiB per deployment,
5,000 image reads/day per site and 50,000 across the deployment, and 10,000
upload/delete operations/day. Studio generation is capped at eight requests per
UTC day across this deployment, and stops rather than switching to paid AI use.
The Workers Free plan enforces a 100,000-request daily account limit. D1 Free
enforces daily limits of 5 million rows read and 100,000 rows written, and a
5 GB total storage allowance; daily query limits fail closed and storage
exhaustion prevents new writes. These provider limits are a second stop after
the MithrilPress application caps only if the deployment is verified as
Workers Free. If it is on Workers Paid, the same app request cap does not
prevent Worker metering or overage. Import and rendering CPU usage has not been
qualified against the Free plan's 10 ms per-request limit.

Cloudflare Free rate-limiting rules cannot match the request host; they support
path and Verified Bot fields only. A rule on the parent zone would also affect
unrelated sites with matching paths. Do not use it as a MithrilPress burst
guard. Keep public routing disabled until a host-scoped edge control or an
approved isolated hosting zone is available. The
[edge-protection gate](../operations/mithrilpress-free-edge-protection.md)
records this limitation and the checks still needed.

R2 has monthly account-wide allowances of 10 GB-month Standard storage, 1
million Class A operations, and 10 million Class B operations; usage above
those allowances is billed. The current application bounds retained media to
8 GiB per deployment, reads to 50,000/day, and uploads/deletes to 10,000/day.
Even over a 31-day month, those caps bound ordinary reads to 1.55 million and
write requests to 310,000; one cleanup delete after a failed upload can at most
double the latter to 620,000 Class A calls. These application bounds are only a
source-level estimate. R2 free allowances are shared across the account, usage
above them is billed, and R2 does not enforce a hard stop at the included
limits. Keep media writes and delivery disabled until total account usage, the
R2 plan, and the operator's cost stop are read back. Disable media if other
account workloads could consume the remaining allowance.

The product never bills site owners, but do not advertise zero provider cost.
Revalidate the provider limits and all media-operation paths before each
release. Track these release requirements in Linear MITHRIL-292. Check
[Workers limits](https://developers.cloudflare.com/workers/platform/limits/),
[D1 Free quota behavior](https://developers.cloudflare.com/d1/reference/faq/),
and [R2 pricing](https://developers.cloudflare.com/r2/pricing/) before release.

D1 triggers enforce a 16 MiB retained-import content limit per site, including
entries and imported taxonomy terms, and a 256 MiB deployment-wide limit across
immutable revisions. The Studio shows the site's estimate and daily public
request count, the shared app-level AI request count, R2 image storage, and
per-site and shared daily image operations.
The content estimate excludes
indexes, database metadata,
conversations, audit rows, and the physical D1 database size. Account-level
Worker requests outside public page/REST routes, D1 reads/writes/storage, and
Workers AI neuron use are not measured in the Studio and must be monitored in
Cloudflare. Provider limits can stop service before MithrilPress application
limits are reached. Track these release requirements in Linear MITHRIL-292.
Check [Workers limits](https://developers.cloudflare.com/workers/platform/limits/)
again before release because provider quotas can change.

### Domain and DNS management

The initial address is one owner-assigned subdomain under `sites.mithril.love`.
Support for customer-owned domains should use Cloudflare for SaaS custom
hostnames and a Worker wildcard route; Workers for Platforms would be excessive
because MithrilPress renders tenant content and does not run tenant code. The
hostname must be verified and explicitly mapped to a tenant before any content
is served. The Worker now has an owner-only, feature-gated custom-hostname flow:
it issues a TXT ownership challenge, provisions Cloudflare for SaaS only after
that challenge resolves, returns provider TLS validation records, and activates
the exact tenant mapping only after provider, certificate, and public DNS
checks pass. The customer must add a DNS-only CNAME. Customer DNS is never
written by MithrilPress. Hostnames must be subdomains with at least three
labels; apex and wildcard customer hostnames are excluded from this prototype.
An enabled Worker checks up to 30 active hostnames every five minutes and
suspends mismatches or mappings with three consecutive provider/DNS read
failures. Re-enable remains blocked until both the dedicated routing setup and
the deployed Cron Trigger have been read back successfully.

This flow is disabled until the Cloudflare for SaaS entitlement, fallback
origin, hostname route and DNS, scoped `SSL and Certificates Write` token, and
current hostname capacity have all been provisioned and read back. Use the
verified SaaS fallback zone on the existing parent-zone account; do not assume
or create a child zone for `sites.mithril.love`. Cloudflare for SaaS routing
must not intercept unrelated `mithril.love` websites. Keep
`CUSTOM_DOMAINS_MONITORING_READY=false` until the Cron Trigger's successful
deployed invocation is visible. Cloudflare for SaaS currently
includes 100 custom hostnames and charges $0.10 per additional hostname;
wildcard custom hostnames and apex proxying are unavailable on Free, and
non-enterprise enablement requires payment information. Therefore customer
domains are not part of the zero-cost promise. See [Cloudflare for SaaS plans](https://developers.cloudflare.com/cloudflare-for-platforms/cloudflare-for-saas/plans/)
and the [enablement requirements](https://developers.cloudflare.com/cloudflare-for-platforms/cloudflare-for-saas/start/enable/).
An owner-guided nameserver migration plan is implemented: it captures source and
staged destination snapshots, compares supported records, binds approval to the
exact diff, checks NS/DS propagation through two recursive resolvers, and can
verify source rollback. A Cloudflare destination can be read and staged; the
additive Cloudflare record-import path is disabled by default until isolated-zone
qualification. Registrar changes remain manual. This does not check mail or
HTTP/TLS service health or every geographic resolver. Cloudflare's
[Workers-as-fallback-origin guide](https://developers.cloudflare.com/cloudflare-for-platforms/cloudflare-for-saas/start/advanced-settings/worker-as-origin/)
describes routing custom-hostname traffic through the SaaS zone's Worker route.

The Cloudflare product the original idea may have been recalling is
**Workers for Platforms**. Its dispatch namespaces suit a service that executes
customer Workers. MithrilPress owns the renderer and does not accept tenant
code, so the current static-hosting candidate uses one Pages project and exact
custom domain per site. The Pages account limit is 100 projects; if the
product reaches its 90-site hard cap, stop onboarding and revisit a separately
funded scale design. Do not switch to Workers for Platforms automatically.
See [Workers for Platforms](https://developers.cloudflare.com/cloudflare-for-platforms/workers-for-platforms/)
and [Cloudflare hostname routing](https://developers.cloudflare.com/cloudflare-for-platforms/workers-for-platforms/configuration/hostname-routing/).

The feature gates, implemented DNS migration steps, and remaining operator
requirements are specified in [MithrilPress domain lifecycle](mithrilpress-domain-lifecycle.md).

## WordPress REST subset

`GET /wp-json/wp/v2/posts` and `/pages` expose only the currently published
revision. They support `page`, `per_page` (1–100), `slug`, and `context=view` or
`embed`, returning `X-WP-Total`, `X-WP-TotalPages`, and pagination `Link`
headers. `GET /wp-json/wp/v2/categories` and `/tags`, with optional term IDs,
expose imported terms, published-post counts, and descriptions. Categories also
expose parent IDs. These routes support bounded pagination, `slug`, `search`,
and `hide_empty`. Single-item `GET` and `HEAD` routes at
`/wp-json/wp/v2/posts/{id}` and `/wp-json/wp/v2/pages/{id}` return one published
entry by its WordPress source ID, or by the MithrilPress API ID for a
chat-authored entry. Only the active published revision is addressable; private
previews, drafts, and IDs for another post type return 404.
Public edit context is denied. `GET /wp-json/wp/v2/media/{id}` exposes metadata
only for a featured image referenced by the published revision. Term and media
write routes, media listings, users, comments, custom post types, and WordPress
authentication plugins are not available. Category and tag links render simple
published-entry archives at `/category/{slug}/` and `/tag/{slug}/`.
The HTML sanitizer preserves a narrow semantic element list, removes all
attributes except validated HTTP(S)/relative anchor links, strips comments,
drops active subtrees, and unwraps unknown formatting tags. Inline images and
attachment URLs are omitted. A `media:write` owner can upload JPEG, PNG, GIF,
or WebP files up to 8 MiB, with signature and dimension checks, to tenant-scoped
R2. The image library uses a 250 MiB per-site cap, an 8 GiB per-deployment cap,
5,000 reads/day per site, 50,000 across the deployment, and 10,000
upload/delete operations/day. A published page
serves an image only while its entry references it; private previews require a
`revision:preview` session. Uploads do not fetch WordPress URLs or strip image
metadata, so owners should remove GPS or other private metadata before upload.
This supports owner-assisted featured images, not automatic media migration.
Imported WordPress drafts, private, trashed, and future entries stay visible
only in the authenticated preview; public pages and REST results include only
entries whose source status was `publish`.

`POST /api/wordpress/import` also accepts a raw WordPress WXR 1.2 XML export
with `application/rss+xml`, `application/xml`, or `text/xml`. The importer uses
the WXR channel link to bind the source origin and retains standard category
and tag terms, category parents, and entry term IDs. REST JSON imports may
include a `taxonomy_terms` array; every referenced category/tag ID must resolve
to an imported term. Term descriptions are sanitized before storage. The API
returns omission counts for content it does not migrate. It does not fetch
attachment URLs; owners must upload image files they control and review the
private preview and omissions before publishing. This does not provide full
WordPress content parity.

## Outreach workflow

The actual `wordpress-migration-reviewer` Hermes profile is draft-only and its
gateway is stopped. It does not send, schedule, or bulk-send messages. Japan is
excluded; the target market and explicit local-language support must be chosen
before research. Public WordPress evidence or a public email address does not
establish permission to contact. Each recipient needs a sourced, dated business
fit and contact/legal basis, suppression check, approved copy, and individual
human send approval. Do not claim that MithrilPress is safer or feature-identical
until those claims are evidenced and approved.

## OSS and release gates

MithrilPress source is public in `mithril-lang/mithril` under the product name
MithrilPress and the repository's existing root license. The repository pins an
organization-owned `mithrilpress-worker` prepared profile for Worker tests,
owner-auth integration, D1 migrations, and JavaScript syntax. It has not yet
produced an exact-source signed receipt for this follow-up branch. That profile
does not replace the repository's `runtime-required` Mithril compiler/native
mission-library profile or qualify production. Production deployment also
requires a service owner, scoped Cloudflare credentials, signed artifact
evidence, rollback, and live read-back.

Linear project: [MithrilPress CMS and WordPress migration](https://linear.app/kotobalabs/project/mithrilpress-cms-and-wordpress-migration-730325bee568).
