# MithrilPress: WordPress-compatible migration CMS

**Status: OSS implementation prototype.** This branch contains the Mithril
content ontology and pure boundary, a Cloudflare Worker/D1 host adapter, a
bounded WordPress import and read-only REST-compatible subset, owner-scoped
private preview/approval/publication flow, and supervised sales-process docs.
It is not yet qualified, merged, or deployed. This is a documented compatibility
subset, not full WordPress parity.

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
   revisions remain stored for rollback.
5. Compare the migrated site with the owner-provided source and report omitted
   assets, unsupported blocks, and URL changes before the owner publishes.

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

The Worker adapter currently duplicates record validation because this
repository does not package the checked Mithril/ClojureScript runtime for the
Workers JavaScript runtime. Replacing the duplicate with generated checked
Mithril code is follow-up work. The adapter does not fetch WordPress itself:
owners provide the content through a scoped token. WXR/XML import, authenticated
editing UI, media upload/delivery, themes, taxonomy/media REST routes, and broad
Gutenberg support are not in this slice.

## Cloudflare hosting

The initial runtime is a single MithrilPress Worker plus D1. A proxied wildcard
DNS record and wildcard Worker route cover `*.sites.mithril.love/*`. The Worker
normalizes the hostname, rejects reserved and unknown labels, then looks up the
complete hostname in D1. Host labels never grant tenant identity. Content
queries carry both site and revision IDs and use prepared statements. Owner
credentials are per-site salted SHA-256 token hashes with narrowly scoped
permissions; plaintext tokens are provisioned out of band.

`apps/mithrilpress-worker/` provides the Worker handler, D1 migration, token
generator, and non-production Wrangler example. The handler imports sanitized
private drafts, supports private noindex previews and separate approval and
publish actions, returns a read-only post/page REST subset, and serves minimal
SSR HTML with a restrictive CSP. It stores original and sanitized content with
a 1.8 MB encoded row budget beneath D1's documented 2 MB maximum row/string
size. It preserves media IDs but does not yet transfer assets or use R2.

The checked-in Wrangler example has no custom route and disables `workers.dev`.
No Cloudflare resources, wildcard DNS, credentials, or public hostnames were
created by this implementation. Production route configuration and deployment
remain separate release work.

The Cloudflare product the original idea may have been recalling is
**Workers for Platforms**. Its dispatch namespaces suit a service that executes
customer Workers. MithrilPress owns the renderer and does not accept tenant
code, so one ordinary Worker with a wildcard route and D1 is the suitable first
version. Revisit Workers for Platforms only if customer-authored code becomes a
reviewed product requirement. See [Workers for Platforms](https://developers.cloudflare.com/cloudflare-for-platforms/workers-for-platforms/)
and [Cloudflare hostname routing](https://developers.cloudflare.com/cloudflare-for-platforms/workers-for-platforms/configuration/hostname-routing/).

## WordPress REST subset

`GET /wp-json/wp/v2/posts` and `/pages` expose only the currently published
revision. They support `page`, `per_page` (1–100), `slug`, and `context=view` or
`embed`, returning `X-WP-Total`, `X-WP-TotalPages`, and pagination `Link`
headers. Public edit context is denied. The API does not expose media, terms,
users, comments, custom post types, writes, or WordPress authentication plugins.
The HTML sanitizer preserves a narrow semantic element list, removes all
attributes except validated HTTP(S)/relative anchor links, strips comments,
drops active subtrees, and unwraps unknown formatting tags. Images are omitted.
Imported WordPress drafts, private, trashed, and future entries stay visible
only in the authenticated preview; public pages and REST results include only
entries whose source status was `publish`.

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

The intended OSS home is the existing public `mithril-lang/mithril` repository,
under the product name MithrilPress and the repository's existing root license.
The current repository standalone profile is `runtime-required` and covers the
Mithril compiler/native mission-library conformance, not this Worker. The app
must not be merged as a qualified release until a reviewed, MithrilPress-specific
standalone qualification scope is available and succeeds. Production deployment
also requires a service owner, scoped Cloudflare credentials, signed artifact
evidence, rollback, and live read-back.

Linear project: [MithrilPress CMS and WordPress migration](https://linear.app/kotobalabs/project/mithrilpress-cms-and-wordpress-migration-730325bee568).
