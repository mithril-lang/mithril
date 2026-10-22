# MithrilPress static publication plane

**Status: design candidate; not implemented or deployed.** This document records
the candidate public-delivery path for MithrilPress. The current dynamic Worker
remains the prototype. This design does not create a Pages project, DNS record,
custom domain, Worker route, or paid subscription, and does not enable R2.

## Why split public delivery from the editor

The current Worker resolves a tenant and reads its active revision for every
public HTML or WordPress REST request. Cloudflare Pages can serve approved
static files without invoking a Function; those requests are free and
unlimited. A separate Pages project per tenant gives each site's files a
separate root, so visitor routing does not depend on a shared hostname-to-path
rewrite. Chat, import, preview, approval, and publication stay on the
authenticated control plane. Only a specifically supported dynamic WordPress
REST route would need a Pages Function, which is a metered Worker request.

References:
[Pages pricing](https://developers.cloudflare.com/pages/functions/pricing/),
[Pages limits](https://developers.cloudflare.com/pages/platform/limits/),
[Pages Direct Upload](https://developers.cloudflare.com/pages/get-started/direct-upload/),
[Pages custom domains](https://developers.cloudflare.com/pages/configuration/custom-domains/),
[Pages Functions routing](https://developers.cloudflare.com/pages/functions/routing/),
and [R2 pricing](https://developers.cloudflare.com/r2/pricing/).

## Candidate topology

```text
Owner chat and WordPress import
        |
        v
Dynamic MithrilPress control Worker ---- D1 / bounded media storage
  draft -> private preview -> approve -> publish
        |
        v
Signed standalone publisher reads the approved immutable revision and media
        |
        v
One Pages Direct Upload project per tenant
        |
        v
Exact Pages custom domain: <site>.sites.mithril.love
static files bypass Functions; optional REST paths invoke a bounded Function
```

The editor Worker continues to enforce site-scoped sessions and capabilities.
Chat proposals and imports remain private until a distinct owner approval and
publish action. Only the exact active published revision may enter a Pages
deployment. The publisher should run outside the tenant-facing Worker under
the existing standalone release authority; no Pages or DNS credential belongs
in a tenant request handler.

The publisher would build one complete, immutable asset set from the published
snapshot. The Pages project's root would contain that site's sanitized HTML,
styles, owner-uploaded media, sitemap, feed, and static WordPress-compatible
JSON files explicitly included in the parity contract. It must never include
another site's files, drafts, chat history, owner sessions, or private
previews. Unsupported dynamic WordPress queries would be called out in the
owner's migration report.

## Host isolation and routing

Create one Pages Direct Upload project per site and attach exactly one
canonical custom subdomain, such as `blue-widget.sites.mithril.love`, through
the Pages custom-domain workflow. Pages does not accept wildcard custom
domains. Do not create a wildcard DNS record, wildcard Worker Route, or URL
Rewrite Rule for this candidate. A Pages project's asset root is dedicated to
that site, which removes the shared-bundle path-prefix boundary and prevents a
normal static lookup from falling into another tenant's files.

The parent `mithril.love` zone is already active in `fund-mithril`. Cloudflare's
Pages docs say that a subdomain uses a CNAME to the project's `pages.dev`
hostname and that Cloudflare adds the record automatically after the custom
domain is confirmed when the zone is managed in Cloudflare DNS. Pages also
validates an SSL certificate for the hostname. The active Universal SSL
certificate for the parent zone does not cover a deep name such as
`blue-widget.sites.mithril.love`; treat Pages' exact-host certificate as a
separate provider resource and read back its `active` state before mapping the
site. Prove the deep-host activation and renewal path on an isolated zone
before touching the production parent zone. The validation path
`/.well-known/acme-challenge/*` must remain reachable while the certificate is
being issued.

Only the Pages API's exact project domain is eligible for provisioning. The
operator CLI must validate that the requested host is a normalized,
reserved-name-safe label below `sites.mithril.love`, belongs to the authenticated
site, and has no conflicting Pages project or DNS record. It must read back the
project, domain, CNAME, certificate, and public DNS answer before marking the
host active. Detach must stop serving the old project before the DNS record or
custom-domain association is removed.

Pages also publishes a project-specific `*.pages.dev` address. Treat it as a
public alias: do not put private previews or unapproved content in a Pages
deployment. If the product later requires that the canonical MithrilPress host
be the only public hostname, qualify a separate host-gating design; Pages
static routes alone cannot make an unapproved deployment private.

### Hostname and certificate gate

The live `fund-mithril` read-back on 2026-10-22 found one active Universal SSL
certificate covering `mithril.love` and `*.mithril.love`. It does not cover
`*.sites.mithril.love`, and the zone's custom-certificate quota is zero. On a
full-setup Free Website zone, Universal SSL does not cover deeper subdomains.
Pages accepts exact custom subdomains, but not wildcard domains. A Pages
custom-domain association is the candidate for getting an exact CNAME and
managed certificate without using the parent's Universal SSL wildcard. Its
deep-host certificate issuance and renewal must pass an isolated-zone test.

References: [Universal SSL hostname limitations](https://developers.cloudflare.com/ssl/edge-certificates/universal-ssl/limitations/),
[Pages custom domains](https://developers.cloudflare.com/pages/configuration/custom-domains/),
[Pages known issues](https://developers.cloudflare.com/pages/platform/known-issues/),
and [Pages limits](https://developers.cloudflare.com/pages/platform/limits/).

Before production, prove all of the following:

* Two Pages projects cannot read one another's root, page, media, feed,
  sitemap, preview, or REST artifact.
* Encoded separators, dot segments, malformed paths, and normalization cannot
  escape the current project's root or turn a missing asset into a served
  tenant file.
* A pending, reserved, suspended, or detached hostname serves no tenant
  content. Only the exact active Pages custom-domain mapping is public.
* Studio, import, private preview, and owner API routes remain on the
  authenticated control Worker and do not become public through Pages.
* The exact deep custom-domain CNAME, certificate, HTTPS response, and removal
  behavior are verified on an isolated zone. The production parent zone has no
  MithrilPress Pages projects or host records as of the latest read.
* If Pages Functions are used for WordPress REST routes, a `_routes.json`
  fixture proves that only the intended REST paths invoke Functions and all
  public document, media, feed, and asset paths remain static.

## Chat publish lifecycle

The owner-facing publish action should remain one explicit control-plane
operation after preview and approval. A successful publish should create a
durable publication request bound to the site, revision ID, and content digest.
The standalone publisher should then:

1. Re-read the site's active published revision and verify that it matches the
  requested site, revision, approval, and digest.
2. Render a complete site-root asset tree from that immutable snapshot.
   Include referenced owner-uploaded media only; never fetch arbitrary source
   URLs or execute imported HTML, themes, plugins, or scripts.
3. Enforce per-site file-count, byte, media, and publication-frequency limits
   before upload. Pages Free currently allows 20,000 files per site and 25 MiB
   per file; the publisher must impose smaller product limits and reject an
   oversized publication before any provider write.
4. Use Pages Direct Upload to create one immutable deployment, then read back
   its deployment ID, status, canonical custom domain, and artifact digest
   before marking the publication request complete.
5. Preserve the last known-good Pages deployment for rollback. If upload or read-back is
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
read-only REST subset. A static JSON file cannot reproduce query-string-
dependent responses. Preserve the current REST subset with a Pages Function
only on the explicitly supported `/wp-json/wp/v2/*` routes and use
`_routes.json` to keep every other request static. Function calls count against
the account's Workers usage; do not enable them until their exact billing and
stop-at-cap behavior is qualified. The migration report must identify each REST
route as static, Function-backed, or unsupported before publication.

The public page renderer should preserve imported canonical paths and current
redirect behavior. Asset paths must be stable or versioned; old cache entries
must not display a different tenant's content after republishing or rollback.

## Free hosting and current release boundary

Cloudflare Pages static asset requests are free and unlimited when they do not
invoke a Function. The Free plan allows 20,000 files per project and 25 MiB per
file, and the account limit is 100 Pages projects. On 2026-10-22, the
`fund-mithril` account had zero Pages projects. Reserve ten projects for other
account services and set the MithrilPress hard stop to 90 sites; also re-read
the account total before every create because other teams share this account.
Never create project 91 for MithrilPress, upgrade the Pages plan, or switch to
Workers for Platforms automatically. Stop onboarding and keep existing sites
serving when either cap is reached.

Use Direct Upload rather than Pages Git builds so publishing is tied to the
approved snapshot, not a branch head. Pages Free Direct Upload allows 20,000
files at 25 MiB each. Pages Functions are metered as Workers requests; static
paths must not invoke them. This can make the public document and media hosting
free to site owners while preserving an explicit upper bound on projects and
per-site bundle size. It does not make chat, D1, AI, or R2 free to the operator.

Use `_routes.json` with only an explicit include for the approved REST paths;
Cloudflare otherwise invokes Pages Functions for all requests when Functions
are present. Confirm that the final generated file keeps every static page,
media object, feed, and sitemap outside Function routes.

The account-level Workers subscription is a separate boundary for the control
Worker and any REST Function. Workers Free has a 100,000-request daily account
limit; a Workers Standard/Paid account can bill overages and does not supply
this daily hard stop. The current Cloudflare connection lacks Billing Read, so
the subscription is unverified. Leave REST Functions and paid control-plane
use disabled until the account billing state and an enforceable operator
budget are read back. Keep site-owner plans free; at every product cap, stop
new writes, uploads, AI requests, and onboarding without switching tiers or
billing the owner.

R2's included Standard allowance is account-wide: 10 GB-month of storage, 1
million Class A operations, and 10 million Class B operations per month.
Usage above those allowances is billed, and R2 does not provide a hard stop at
the included limits. A MithrilPress per-site cap cannot guarantee zero
provider overage when unrelated workloads share the account. Keep R2-backed
uploads and delivery disabled until aggregate usage and a provider-enforced
cost boundary are verified; use a separately bounded storage plane if that
boundary is unavailable.

On 2026-10-22, read-only inventory in `fund-mithril` found the `mithril.love`
parent zone on the Free Website plan, zero Pages projects, no MithrilPress
Worker route or DNS record, and an active Universal SSL certificate that
covers only `mithril.love` and `*.mithril.love`. Billing Read is unavailable
through the current Cloudflare connection, so the account-level Workers
subscription is unverified. Do not infer the Workers plan, change an account
plan, or enable a paid product as part of this design.

The design requires an isolated-zone proof, exact-source standalone
qualification, 90-site capacity enforcement, a signed Pages artifact, rollback
evidence, and live DNS/TLS/HTTP read-back before the first project is
provisioned. Track this work in Linear MITHRIL-362 and keep MITHRIL-275 and
MITHRIL-292 in progress.
