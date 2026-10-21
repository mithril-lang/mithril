# MithrilPress Worker

This package is the first host adapter for the MithrilPress content
model in `src/mithril/sites_cms.cljk` and `ontology/sites-cms-v1.mith`. It uses
Cloudflare D1 and serves only an explicitly published tenant revision.

## Supported in this slice

- Exact one-label `*.sites.mithril.love` host validation followed by an exact
  D1 hostname lookup. A hostname label never grants tenant identity.
- Owner-scoped WordPress REST record import for posts and pages. Imports are
  bounded, sanitized, immutable revisions that remain private.
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
3. Apply `migrations/0001_sites.sql` locally.
4. Provision a site and owner tokens using the SQL shapes below. Keep token
   plaintext in a secret manager and pass it only in an HTTPS Authorization
   header; the Worker stores only a salted SHA-256 digest.
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
`content:import`, `revision:preview`, `revision:approve`, and `site:publish`.
Use distinct scoped tokens where operationally possible and revoke early by
setting `revoked_at`.

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
| `GET` | `/__preview/{revision-id}/{slug}` | `revision:preview` | View sanitized revision HTML with `noindex` headers. |
| `POST` | `/api/revisions/{revision-id}/approve` | `revision:approve` | Record owner approval for a complete sanitized revision. |
| `POST` | `/api/revisions/{revision-id}/publish` | `site:publish` | Make the approved revision the public site revision. |
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

## WordPress REST subset

Public list requests support `page`, `per_page` (1–100), `slug`, and `context`
`view`/`embed`. Responses include standard `X-WP-Total`, `X-WP-TotalPages`, and
pagination `Link` headers. Only posts/pages are implemented. Editing contexts,
media, terms, users, comments, custom post types, search, writes, WXR/XML, and
WordPress authentication plugins are not implemented here.
