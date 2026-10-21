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
3. Apply `migrations/0001_sites.sql` locally.
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
`content:import`, `content:write`, `revision:preview`, `revision:approve`, and
`site:publish`. The Studio owner token needs `content:write` to create drafts,
`revision:preview` to open previews, `revision:approve` to approve a revision,
and `site:publish` to publish it. Keep import-only automation on a separate
`content:import` token. Revoke early by setting `revoked_at`.

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
| `GET` | `/_mithrilpress/preview/{revision-id}/{slug}` | `revision:preview` | View sanitized revision HTML with `noindex` headers. |
| `POST` | `/_mithrilpress/api/revisions/{revision-id}/approve` | `revision:approve` | Record owner approval for a complete sanitized revision. |
| `POST` | `/_mithrilpress/api/revisions/{revision-id}/publish` | `site:publish` | Make the approved revision the public site revision. |
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

## Hosting and custom domains

The intended free-plan starting point is one Worker, D1, and a proxied wildcard
route for `*.sites.mithril.love`. Cloudflare's free Workers plan currently has a
100,000-request daily limit and 10 ms CPU per request. D1 Free currently
includes 5 million rows read per day, 100,000 rows written per day, and 5 GB
total storage; Workers AI includes 10,000 neurons per day. The prototype does
not use a paid fallback. Aggregate Worker and D1 quota monitoring is not yet
implemented; provider failures outside AI generation can currently surface as
generic errors. The import and rendering workloads have not been qualified
against the 10 ms CPU budget. Usage monitoring and free-tier guardrails are
tracked in Linear MITHRIL-292. See [Workers limits](https://developers.cloudflare.com/workers/platform/limits/),
[D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/), and
[Workers AI pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/)
for the current provider limits before each release.

The wildcard `sites.mithril.love` domain is the default hosting address. A
customer domain can be connected without transferring its nameservers: the
owner verifies control, adds the requested CNAME/TXT records, and traffic is
attached through Cloudflare for SaaS. On non-enterprise Cloudflare plans,
enabling Cloudflare for SaaS requires payment information. Its free allowance
currently includes 100 hostnames, then charges $0.10 per additional hostname;
customer wildcard hostnames require Enterprise. See [Cloudflare for SaaS plans](https://developers.cloudflare.com/cloudflare-for-platforms/cloudflare-for-saas/plans/)
and the [enablement requirements](https://developers.cloudflare.com/cloudflare-for-platforms/cloudflare-for-saas/start/enable/).
Therefore custom domains are not part of the zero-cost promise. A full nameserver move or registrar transfer
is optional and may incur at-cost renewal charges. Before any nameserver
cutover, a future domain manager must import and compare all DNS records,
including mail, verification, CAA, SRV, and DNSSEC settings, then provide a
rollback path. The domain manager and DNS API integration are not implemented
in this slice.

Cloudflare's [Workers-as-fallback-origin guide](https://developers.cloudflare.com/cloudflare-for-platforms/cloudflare-for-saas/start/advanced-settings/worker-as-origin/)
documents routing customer hostnames through a wildcard Worker route.

## WordPress REST subset

Public list requests support `page`, `per_page` (1–100), `slug`, and `context`
`view`/`embed`. Responses include standard `X-WP-Total`, `X-WP-TotalPages`, and
pagination `Link` headers. Only posts/pages are implemented. Editing contexts,
media, terms, users, comments, custom post types, search, writes, WXR/XML, and
WordPress authentication plugins are not implemented here.
