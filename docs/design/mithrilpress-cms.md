# MithrilPress: WordPress-compatible migration CMS

**Status: OSS implementation prototype, published in PRs #114 and #115 on
2026-10-21.** The Mithril content ontology and pure import/chat boundaries,
Cloudflare Worker/D1 adapter, bounded WordPress import and read-only
REST-compatible subset, chat-first owner Studio, and supervised sales-process
docs are in the public repository. The exact Worker source passed its approved
standalone qualification before integration. No production Worker, D1
database, R2 bucket, wildcard DNS record, or public route has been provisioned
and read back. A follow-up branch adds source-permalink route preservation but
has not been qualified or integrated. This is not a production release or full
WordPress parity.

## Product boundary

“WordPress compatible” means importing an explicitly owner-authorized subset of
posts and pages, preserving source IDs, slugs, dates, taxonomy IDs, media
references, and safe source URL paths, and serving a documented read-only
subset of the WordPress REST API. Safe multi-segment source paths can be served
on MithrilPress and are used for canonical URLs and rewritten internal links.
Query-based, reserved, and otherwise unsupported paths fall back to a slug route
and are reported for owner review; colliding routes reject the import. This
does not include PHP, themes, plugins, shortcodes, custom post types, or
arbitrary Gutenberg rendering.

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
`apps/mithrilpress-worker/src/platform_hostname.mith`,
`apps/mithrilpress-worker/src/content_boundary.mith`, and
`apps/mithrilpress-worker/src/studio_ai_policy.mith`, compiled with Mithril's
native JavaScript emitter, and called at the hostname, WordPress record,
taxonomy-term, chat-proposal, and Workers Free AI-admission boundaries. The chat
contract returns an untrusted, blocked, private-draft envelope; the host
attaches bounded sanitized HTML before opening the rendering gate. The AI
policy contract requires explicit enablement, the `workers-free-only` mode,
operator confirmation of the Workers Free plan, and an available AI binding
before inference. The pure `.cljk` boundary remains the platform-neutral
reference model. The Worker keeps host I/O and stateful work in JavaScript,
including cross-record taxonomy integrity, D1/R2 and AI calls, HTML
sanitization, language-tag canonicalization, slug collision resolution, and
publication transactions.

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
queries, bounded chat history, HTML sanitization, and an eight-generation daily
app cap. D1 triggers cap each conversation at 40 messages, a site at 50 saved
conversations and 4 MiB of UTF-8 message text, and the deployment at 1,000
conversations and 64 MiB of message text. The Usage view reports those text
estimates, and deleting a conversation releases its message allowance. This is
not a physical D1 database-size measurement. Workers AI processes the
conversation and current draft to produce a proposal; the proposal is not
fact-checked and must not be published without owner review. The default
free-hosting path uses `@cf/meta/llama-3.3-70b-instruct-fp8-fast` directly
through the Workers AI binding, with no AI Gateway or paid fallback. The model
is listed as supporting Workers AI JSON Mode, matching Studio's JSON Schema
request. Enable it only when the target account is verified as Workers Free and set
`STUDIO_AI_FREE_PLAN_CONFIRMED=true` and `STUDIO_AI_MODE=workers-free-only`;
the confirmation is an operator-controlled deployment gate, not a runtime query
of Cloudflare's account plan. Studio caps generations at eight per UTC day,
limits the conservative prompt-input estimate to 10,000 bytes and output to 700
tokens, and atomically reserves a two-times Neuron estimate against an 8,000
Neuron application budget. Failed and ambiguous calls keep their reservations.
These estimates use published model rates and are not provider metering; recheck
pricing before release. The provider stops inference at its shared 10,000-Neuron
daily Free allocation. On Workers Paid, usage above that allocation is billable,
so this mode must not be deployed there. The example deployment keeps Studio AI
disabled and the plan confirmation false.

At the currently published rate for this model (26,668 input and 204,805
output Neurons per million tokens), the reservation formula caps one accepted
request at 821 Neurons: at most 10,000 input bytes including message/schema
overhead, at most 700 output tokens, and a two-times safety multiplier. Eight
maximum-size requests reserve at most 6,568 Neurons. This bounds only the
application's estimate, not provider usage or other account workloads. See
[Workers AI pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/)
and recheck the model rates, limits, and account plan before release.

## Cloudflare hosting

The initial runtime is a single MithrilPress Worker, D1, and R2. Production must
put these resources in a dedicated Cloudflare account on the Workers Free plan,
separate from the existing `fund-mithril` Workers Paid account and unrelated
workloads. Add `sites.mithril.love` as a child zone in that account and delegate
it from the parent `mithril.love` zone with NS records. Cloudflare supports a
subdomain zone in a different account; this isolates the Workers and R2 quota
pools from the existing account.

A proxied wildcard DNS record and wildcard Worker route in the child zone cover
`*.sites.mithril.love/*`. Keep `workers.dev` disabled and configure the route to
fail closed when the Free plan's daily Worker request limit is reached. Cloudflare
returns Error 1027 at that limit; fail-open routing bypasses the Worker. The
Worker normalizes the hostname, rejects reserved and unknown labels, then looks
up the complete hostname in D1. Host labels never grant tenant identity. Content
queries carry both site and revision IDs and use prepared statements. Owner
credentials are per-site salted SHA-256 token hashes with narrowly scoped
permissions; plaintext tokens are provisioned out of band.

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

The checked-in Wrangler example has no custom route and disables `workers.dev`.
No Cloudflare resources, wildcard DNS, credentials, or public hostnames were
created by this implementation. Production route configuration and deployment
remain separate release work.

The pricing policy is free for site owners; the hosting operator is responsible
for provider charges. This is not a zero-cost provider commitment. Do not run
the MithrilPress runtime in the existing Workers Paid account: its requests are
unlimited and do not provide a hard daily request stop. The product never bills
site owners or automatically switches a hosting account to a paid tier. See
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

Requests that resolve to an active site are subject to application hard stops
of 5,000 requests per site and 25,000 across the deployment per UTC day; this
includes Studio, domain, DNS, media, preview, REST, and public-page routes.
Requests for missing or inactive hosts return 404 without consuming either
counter. Each accepted tenant request updates the per-site and deployment rows
in one atomic D1 batch; if either limit is reached, neither counter advances.
The request that reaches an allowance is handled; later requests receive HTTP
429 for a site limit or HTTP 503 for the shared limit until the next UTC day.
This is an application quota, not an edge rate limit: Worker invocation and
hostname lookup happen before rejection, and a burst distributed across valid
tenant hostnames can still exhaust the shared allowance. Verify an independent
Cloudflare edge rate limit before configuring a public production route. R2
application caps allow 250 MiB per site and 8 GiB per deployment,
5,000 image reads/day per site and 50,000 across the deployment, and 10,000
upload/delete operations/day. Studio generation is capped at eight requests per
UTC day across this deployment, and stops rather than switching to paid AI use.
The Workers Free plan enforces a 100,000-request daily account limit. D1 Free
enforces daily limits of 5 million rows read and 100,000 rows written, and a
5 GB total storage allowance; daily query limits fail closed and storage
exhaustion prevents new writes. These provider limits are a second stop after
the MithrilPress application caps, provided the deployment read-back confirms
that it remains on Workers Free. If it is on Workers Paid, the same request cap
does not prevent provider metering or overage. Import and rendering CPU usage
has not been qualified against the Free plan's 10 ms per-request limit.

Before public routing, provision the one-rule Free WAF burst guard on the
delegated `sites.mithril.love` child zone and verify that blocked requests do
not invoke the Worker. Its IP counters are local to each Cloudflare data center
and do not provide a global request budget. See the [Free edge-protection
runbook](../operations/mithrilpress-free-edge-protection.md) for the current
rule shape, scoped token, rollout checks, and limitations.

R2 has monthly account-wide allowances of 10 GB-month Standard storage, 1
million Class A operations, and 10 million Class B operations; usage above
those allowances is billed. The current application bounds retained media to
8 GiB per deployment, reads to 50,000/day, and uploads/deletes to 10,000/day.
Even over a 31-day month, those caps bound ordinary reads to 1.55 million and
write requests to 310,000; one cleanup delete after a failed upload can at most
double the latter to 620,000 Class A calls. This stays below the listed R2 Free
allowances only while the dedicated account and bucket have no other R2 usage,
the Worker remains the only media access path, and the documented provider
limits remain current. R2 itself does not reject billable overage. Keep public
onboarding disabled unless the account separation, plan, and route fail mode
are read back. Disable media writes and delivery if the usage bounds or provider
allowances cannot be maintained.

No usage in the separate account can protect against an operator changing its
plan, an external R2 client, a provider limit change, or a new unbounded code
path. The product never bills site owners, but do not advertise zero provider
cost. Revalidate the provider limits and all media-operation paths before each
release. Track these release requirements in Linear MITHRIL-292. Check
[Workers limits](https://developers.cloudflare.com/workers/platform/limits/),
[D1 Free quota behavior](https://developers.cloudflare.com/d1/reference/faq/),
and [R2 pricing](https://developers.cloudflare.com/r2/pricing/) before release.

D1 triggers enforce a 16 MiB retained-import content limit per site, including
entries and imported taxonomy terms, and a 256 MiB deployment-wide limit across
immutable revisions. The Studio shows the site's estimate and daily public
request count, the shared app-level AI request count and conservative Neuron
reservation, R2 image storage, and per-site and shared daily image operations.
The retained-content estimate excludes indexes, database metadata, chat-history
rows (which have separate application quotas), DNS snapshots, audit rows, and
the physical D1 database size. Account-level
Worker requests outside public page/REST routes and D1
reads/writes/storage are not measured in the Studio and must be monitored in
Cloudflare. Workers AI neurons are also not tenant-metered, but the dedicated
Workers Free account enforces its 10,000-Neuron daily provider stop. Other
account workloads can exhaust that shared allowance sooner, causing Studio
drafting to fail closed. Provider limits can stop service before MithrilPress
application limits are reached. Track these release requirements in
Linear MITHRIL-292.
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

This flow is disabled until a dedicated `sites.mithril.love` SaaS zone,
fallback origin, wildcard Worker route, wildcard DNS, safe subzone delegation,
scoped `SSL and Certificates Write` token, and current hostname capacity have
all been provisioned and read back. Cloudflare for SaaS's catch-all route must
not intercept unrelated `mithril.love` websites. Keep
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
code, so one ordinary Worker with a wildcard route and D1 is the suitable first
version. Revisit Workers for Platforms only if customer-authored code becomes a
reviewed product requirement. See [Workers for Platforms](https://developers.cloudflare.com/cloudflare-for-platforms/workers-for-platforms/)
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
private preview and omissions before publishing. Safe source permalink paths,
including nested paths, are retained for public rendering, API links, canonical
URLs, and imported internal-link rewriting. Sources that use query URLs or
paths reserved by MithrilPress use a slug fallback and are explicitly marked
for owner review. This does not provide full WordPress content parity.

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
