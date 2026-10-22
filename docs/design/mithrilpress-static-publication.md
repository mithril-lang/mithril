# MithrilPress static publication plane

**Status: design candidate; not implemented or deployed.** This document records
an alternative public-delivery path for MithrilPress. The existing dynamic
Worker remains the current prototype. This design does not open
`*.sites.mithril.love`, create a DNS or Transform Rule, change an account plan,
or enable R2.

## Why split public delivery from the editor

The current Worker resolves a tenant and reads its active revision for every
public HTML or WordPress REST request. Cloudflare Workers Static Assets can
serve a matching asset without invoking Worker code; the Static Assets pricing
documentation says static requests are free and unlimited on Workers Free and
Paid. A purely static Worker deployment also does not require a Worker script.
This could keep normal visitor traffic out of the metered CMS runtime while
leaving chat, import, preview, approval, and publishing on the authenticated
control plane.

References:
[Static Assets](https://developers.cloudflare.com/workers/static-assets/),
[Static Assets billing and limits](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/),
[Workers best practices](https://developers.cloudflare.com/workers/best-practices/workers-best-practices/),
[Workers limits](https://developers.cloudflare.com/workers/platform/limits/),
[Workers route fail-open API field](https://developers.cloudflare.com/changelog/post/2025-04-15-workers-api-fixes/),
and [R2 pricing](https://developers.cloudflare.com/r2/pricing/).

## Candidate topology

```text
Owner chat and WordPress import
        |
        v
Dynamic MithrilPress control Worker ---- D1
  draft -> private preview -> approve -> publish
        |
        v
Signed standalone publisher reads the approved immutable revision
        |
        v
Tenant-prefixed static asset bundle
        |
        v
Cloudflare Static Assets on *.sites.mithril.love
```

The editor Worker continues to enforce site-scoped sessions and capabilities.
Chat proposals and imports remain private until a distinct owner approval and
publish action. Only the exact active published revision may enter the public
asset bundle. The publisher should run outside the tenant-facing Worker under
the existing standalone release authority; no broad Cloudflare script-write
token belongs in a tenant request handler.

The publisher would build one complete, immutable asset set from the published
snapshot. Site output would be keyed by the canonical host, for example
`/sites/blue-widget.sites.mithril.love/index.html`. It may contain sanitized
HTML, styles, referenced media, sitemap and feed files, and any static
WordPress-compatible JSON endpoints explicitly included in the parity
contract. Unsupported dynamic WordPress queries would remain on the API
Worker and be documented as such.

## Host isolation and routing hypothesis

Workers Static Assets match by URL pathname, not by hostname. Cloudflare
Transform Rules are available on all zone plans, with up to ten active rules
on Free; URL Rewrite Rules can use dynamic request-property expressions and
run before later request-processing features. A candidate rule would rewrite a
public request path using both the incoming host and path, so each site maps to
its own asset prefix. This is a hypothesis until verified on an isolated
Cloudflare zone.

References: [Transform Rules availability and execution order](https://developers.cloudflare.com/rules/transform/),
[URL Rewrite Rules](https://developers.cloudflare.com/rules/transform/url-rewrite/),
and [Workers Routes](https://developers.cloudflare.com/workers/configuration/routing/routes/).

Before production, prove all of the following:

* A two-tenant fixture cannot read the other tenant's root, page, media, feed,
  sitemap, or REST artifact.
* Encoded separators, dot segments, mixed-case hosts, explicit ports, unusual
  Unicode, malformed paths, and path normalization cannot escape a tenant's
  asset prefix. A negative asset lookup must never fall through to another
  tenant's asset.
* Unknown, reserved, suspended, and inactive hostnames return a static 404
  without running CMS Worker code or querying D1.
* Studio, private preview, migration, and owner API routes are excluded from
  public rewriting and continue to reach the dynamic Worker with their current
  authentication, noindex, same-origin, audit, and tenant-boundary checks.
* Wildcard route matching and precedence between static and dynamic routes are
  read back on an isolated zone. The current parent zone has no Transform
  Rules entrypoint or Worker route.

Do not rely on path-prefix isolation until the traversal and normalization
cases above have been demonstrated. URL rewriting changes only the path; it
does not establish tenant identity or authorization.

## Chat publish lifecycle

The owner-facing publish action should remain one explicit control-plane
operation after preview and approval. A successful publish should create a
durable publication request bound to the site, revision ID, and content digest.
The standalone publisher should then:

1. Re-read the site's active published revision and verify that it matches the
  requested site, revision, approval, and digest.
2. Render a complete tenant-prefixed asset tree from that immutable snapshot.
   Include referenced owner-uploaded media only; never fetch arbitrary source
   URLs or execute imported HTML, themes, plugins, or scripts.
3. Enforce per-site and deployment-wide asset-count and byte limits before
   upload. Workers Static Assets documents per-version file-count and
   per-file-size limits; the current zone/account plan and total deployment
   limits must be read back before choosing product caps.
4. Publish the complete asset set as one new version, then read back the
   deployed version and artifact digest before marking the publication request
   complete.
5. Preserve the prior version for rollback. If upload or read-back is
   incomplete, leave the prior publication active and keep the request in a
   recoverable state.

The D1 revision remains the editor's source of truth. Static publication is a
derived artifact and must be reproducible from the same approved revision.
Drafts, chat history, owner sessions, access tokens, migration reports, and
private preview files must not enter the public asset bundle.

## WordPress compatibility boundary

The static plane must preserve the documented supported subset rather than
claiming full WordPress parity. Current support includes owner-authorized
posts/pages, source IDs, permalinks, taxonomy references, sanitized HTML, and a
read-only REST subset. Search, query filters, pagination, and other API behavior
must either be generated with correct WordPress response headers and semantics
or continue through the dynamic REST Worker. The migration report should make
every omitted or dynamically served feature visible before publication.

The public page renderer should preserve imported canonical paths and current
redirect behavior. Asset paths must be stable or versioned; old cache entries
must not display a different tenant's content after republishing or rollback.

## Free hosting and current release boundary

Static asset delivery may reduce or remove Worker invocation cost for matching
public files. It does not make the editor, dynamic REST endpoints, D1, AI, or
R2 free or unlimited. It does not replace the user-facing app caps, provider
plan read-back, backup, rollback, or standalone qualification.

Cloudflare documents static asset requests as free and unlimited, but bundle
size remains bounded: Workers Free allows 20,000 files per Worker version and
25 MiB per file; Paid allows more files, while the per-file limit remains
25 MiB. Set publisher caps below the plan limit read back for the target
account. Static assets packaged in a Worker version do not consume the
MithrilPress R2 media allowance; any upload or media path backed by R2 still
does.

The dynamic Worker has a separate account-wide daily request limit on Workers
Free (100,000 requests); at the limit Cloudflare can fail a route open or
closed. Every security-sensitive route must be created with
`request_limit_fail_open: false` and that setting must be read back before
enablement. Do not rely on the application request cap as a provider cost stop:
it runs only after the Worker starts, and Workers Paid has no daily request
limit.

R2's included Standard allowance is account-wide: 10 GB-month of storage, 1
million Class A operations, and 10 million Class B operations per month.
Usage above those allowances is billed, and R2 does not provide a hard stop at
the included limits. A MithrilPress per-site cap cannot guarantee zero
provider overage when unrelated workloads share the account. Keep R2-backed
uploads and delivery disabled until aggregate usage and a provider-enforced
cost boundary are verified; use a separately bounded storage plane if that
boundary is unavailable.

On 2026-10-22, a read-only inventory found the proposed `mithril.love` parent
zone on the Free Website plan, with no MithrilPress route, DNS record,
Transform Rules entrypoint, or rate-limit ruleset. Billing Read is not
available through the current Cloudflare connection, so the account-level
Workers subscription is unverified. Do not infer the Workers plan, change an
account plan, or enable a paid product as part of this design.

The design requires an isolated-zone proof, exact-source standalone
qualification, capacity limits, a signed artifact, rollback evidence, and live
read-back before any production route or rewrite rule is enabled. Track this
work in Linear MITHRIL-362 and keep MITHRIL-275 and MITHRIL-292 in progress.
