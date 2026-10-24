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
  Standard WXR categories, tags, category parents, page-parent links, and term
  IDs are retained when referenced records are present. Cyclic, unresolved, or
  over-depth page hierarchies are reported for owner review; a small static SEO
  field allowlist is retained, while other custom fields and source media files
  require manual migration. Every
  import returns link, block, asset, SEO metadata, and permalink reconciliation
  counts. Safe multi-segment source URL paths are preserved for published
  routes; query-based and reserved paths fall back to a slug route and are
  marked for owner review.
- Chat-first MithrilPress Studio for creating one post or page draft, revising it
  in a conversation, opening a private preview, and separately approving and
  publishing it. Owners can also save a bounded manually written draft without
  making an AI request.
- Owner-provided JPEG, PNG, GIF, and WebP image uploads to tenant-scoped R2,
  with byte and dimension checks, per-site and deployment storage caps, daily
  per-site and shared read caps, daily upload/delete caps, and explicit
  featured-image selection. One site cannot exhaust the shared image delivery
  allowance by itself. Uploads never fetch URLs from WordPress or elsewhere.
- Short-lived, host-only browser sessions exchanged from a scoped owner token;
  conversation messages and AI drafts remain in the tenant's D1 database until
  the owner deletes the conversation.
- Authenticated, `noindex` private preview; separate revision-approval and
  publication actions with audit receipts. A `site:publish` owner can restore
  a complete previously published revision by confirming both target and
  current IDs; the old approval is rechecked and a distinct restore action is
  recorded.
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
- An optional, capped Cloudflare Pages Direct Upload adapter for approved static
  publications. It does not replace the shared Worker/D1 default host plane.
- Owner-guided DNS migration planning with TXT ownership proof, private BIND
  snapshots, exact record comparison, digest-bound cutover approval, and public
  NS/DS verification. Owners retain control of their DNS providers and
  registrar; MithrilPress does not change nameserver delegation. Zone snapshot
  fields are removed from the active D1 state after 30 days without a
  state-changing owner action; the retention window pauses while an approved
  cutover awaits delegation verification or rollback. Cloudflare D1 Time Travel
  may retain earlier production-backend states for up to 7 days on Workers Free
  or 30 days on Workers Paid, so active-state removal is not immediate
  irreversible erasure.
  Optional Cloudflare record import is disabled by default until isolated-zone
  behavior is qualified.

The checked-in Mithril native-JS modules own platform subdomain validation,
WordPress post/page record admission, individual taxonomy-term admission, the
private chat-draft proposal envelope, migration parity classification, and
revision approval/publication/restore eligibility. The Worker calls those
contracts at the hostname, import, taxonomy, AI proposal, and revision
lifecycle boundaries. It retains host
responsibility for cross-record taxonomy references and cycles, D1/R2 and AI
I/O, HTML sanitization, language-tag canonicalization, and slug collision
resolution. The `.cljk` model remains the platform-neutral reference boundary;
the `.mith` modules are the executable Worker contracts. Regenerate all
checked-in modules from the repository root or this package directory with
`npm run build:mithril` after changing their `.mith` source. The build uses the
Mithril workspace's `kbb` compiler.

To walk through a synthetic 24-page, 6-post WordPress migration entirely on the
local Worker/D1/R2 emulator, follow the [migration demo runbook](../../docs/operations/mithrilpress-migration-demo-runbook.md).
The optional migration/content-operations boundaries are in the [managed
service handoff packet](../../docs/operations/mithrilpress-managed-service-handoff.md).

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

The D1 migrations use a coordinated sequence because several feature branches
were created from older schema snapshots. See the [MithrilPress migration
order](../../docs/operations/mithrilpress-d1-migrations.md) before rebasing or
applying a migration.

The example config deliberately has no route and disables `workers.dev`. It is
not a production deployment config. The required default hosting topology is a
shared tenant-aware Worker and D1 hostname registry, with one exact Worker
Custom Domain for each registered `label.sites.mithril.love` site. This keeps
the requested public hostname pattern without a wildcard DNS record or route;
Cloudflare creates the exact DNS mapping and managed certificate. The platform
cohort stops at 90 domains. The global owner audience and the number of
simultaneously hosted preview sites are separate limits: hold additional
onboarding requests in a manual waitlist when the cohort is full. Do not ingest
source content until a slot is available and the owner authorizes the import;
never switch to paid hosting automatically. Cloudflare for SaaS lists 100 included hostnames but
charges $0.10 per additional hostname and reserves wildcard custom hostnames
for Enterprise; the `fund-mithril` quota and entitlement are not verified, so
that is not an approved scale-up path. Production attachment, certificate read-back,
operator cost controls, real D1 IDs, zone ownership, exact-source standalone
qualification, rollback, and live read-back remain release gates. The optional
Pages adapter attaches one exact hostname per selected site and remains an
independently gated publication path.

The R2 adapter stores objects with random site-scoped keys and keeps metadata
and ownership references in D1. The application caps storage at 250 MiB per
site and 8 GiB per deployment, image reads at 5,000 per site and 50,000 across
the deployment per UTC day, and uploads/deletes at 10,000 across the deployment
per day. Cloudflare's R2 Standard free tier currently includes
10 GB-month storage, 1 million Class A operations, and 10 million Class B
operations per month; those allowances are account-wide and shared with other
workloads. The application caps do not guarantee a zero bill when the account
has other R2 usage. No paid fallback is configured. See [R2 pricing](https://developers.cloudflare.com/r2/pricing/).

### Optional static publication artifact

This capped Pages path is an optional publication adapter, not the default
hosting plane. The shared tenant-aware Worker and D1 registry remain the
default for registered exact hostnames under `*.sites.mithril.love`; the Pages
publisher does not provision or replace those Worker Custom Domains. Pages
projects, exact custom domains, and REST Functions remain disabled until their
separate qualification and cost gates pass.

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
tenant-facing Worker. The command's JSON result includes a sorted per-file
manifest with each path, byte length, and SHA-256, plus an artifact digest bound
to the site, hostname, published revision, and source snapshot digest. Preserve
that result with the standalone publisher receipt so the upload can be tied to
the exact local bundle.

### Optional guarded Pages Direct Upload

This exact-host flow is separate from the default shared Worker Custom Domain
attachment. It is limited to the capped Pages publication path and does not
change routing for tenants that remain on the shared Worker.

`npm run publish:pages -- --confirm-publication` updates an already established
static Pages site. The first publish uses the explicit
`--confirm-publication --initialize-hostname <exact-hostname>` mode. Both modes
use the package-lock Wrangler v4 entrypoint directly; neither uses `npx` or
installs a publisher at runtime. The publisher re-exports the exact
`MITHRILPRESS_EXPECTED_REVISION`, checks every local file against the
digest-bound manifest, and confirms the account ID against the separately
pinned standalone-publisher value. The project name is derived as
`mp-<site UUID>`. The project must use the expected production branch. The
only deployed Function is the package-owned read-only WordPress REST handler;
the exporter binds its source digest and exact `/wp-json/wp/v2/*` invocation
route into the publication manifest.

Initial publication validates the exact hostname against the owner's published
snapshot and confirms the configured zone is `mithril.love` in the expected
Cloudflare account. It checks the exact hostname's DNS records before writing,
creates the static Pages project when absent, and stops before creating a new
project when the account has 90 or more Pages projects. It first uploads a
small `noindex` setup placeholder to the project's `pages.dev` host, then
attaches the exact custom hostname and creates a proxied CNAME only if the exact
hostname has no DNS records. It waits for the Pages domain, validation, and
verification states to become active and verifies the placeholder over HTTPS
before uploading owner-approved content. If a provider step fails, already
created project, deployment, domain, or DNS resources remain for a safe retry;
the script does not attempt destructive cleanup. The Pages API and DNS writes
are not one atomic operation.

Cloudflare Pages allows 100 projects per account; the publisher's 90-project
cap leaves ten slots for other account projects and operational headroom. It
does not provide an all-world scale path: onboarding stops at the cap until a
separately qualified and funded hosting architecture is available. See [Pages limits](https://developers.cloudflare.com/pages/platform/limits/).

The initial placeholder remains the rollback target until the first approved
publication passes read-back. Later updates require the current production
deployment and its previous successful publisher receipt. They first verify
the live files against that receipt, then check the revision again immediately
before Direct Upload. After upload they read back every public file over the
exact HTTPS custom hostname and compare the returned byte length and SHA-256
with the approved manifest. On a failed read-back the publisher attempts the
Pages rollback API only if the deployment it just published is still current,
then verifies the previous receipt's files again. Each Direct Upload carries a
unique deployment message bound to the site, revision, artifact digest, and
publish attempt. If a concurrent publisher changed production, rollback is
withheld.

The fixed Pages Function serves the read-only WordPress REST subset at
`/wp-json/wp/v2/*`. Its source digest is bound into the publication manifest;
the publisher verifies that only this REST route invokes Functions and reads
back posts, pages, taxonomies, and media through the live HTTPS API. The
published static data contains only the owner-approved public revision. REST
search matches published titles on this static path; the authenticated Worker
API retains its broader search behavior.

All other routes stay on Pages static assets, whose requests are free and
unlimited. Each REST Function request increments the same trigger-enforced D1
request counters as the MithrilPress Worker: 5,000 requests per site/day and
25,000 requests across the deployment/day. The publisher verifies the exact
`mithrilpress` D1 database in the pinned account and binds it as `DB` on a new
Pages project before the first deployment. It also binds the exact tenant site
ID and canonical hostname as `MITHRILPRESS_SITE_ID` and
`MITHRILPRESS_HOSTNAME`, then reads all three production bindings back before
publishing. The Function rejects missing configuration and `pages.dev` alias
requests before reading tenant assets. It checks both counters using the bound
site ID before fetching or parsing the REST catalog, then verifies that the
catalog site ID and hostname match the production bindings. Over-cap requests
do not read or parse the catalog, which can be up to 25 MiB. The Function fails
closed when D1 is unavailable or a limit is reached. The digest covers both the
Function and its shared quota helper. Site owners are never charged; Pages
Function requests are still metered to the operator, and application caps are
not a provider billing cap on a Workers Paid account. Each over-cap REST attempt
still invokes the Function and a metered D1 transaction to enforce the
application counter; the shared and site counters are charged atomically, so a
rejected site request does not consume the deployment allowance.

The publisher refuses `_worker.js`, arbitrary Functions routes, extra files,
symlinks, and bundles above the existing 5,000-file / 300 MB product caps.
The exact `_routes.json` and Pages' `_headers` configuration are included in
the manifest but are not public assets, so they are excluded from HTTPS
file-by-file read-back.

Set credentials from the approved local secret store, never on the command
line. `MITHRILPRESS_EXPECTED_CLOUDFLARE_ACCOUNT_ID` must match
`CLOUDFLARE_ACCOUNT_ID`; the standalone publisher pins both to the intended
account (the hosted MithrilPress profile must select `fund-mithril`). Initial
publication also requires `CLOUDFLARE_ZONE_ID` to match the separately pinned
`MITHRILPRESS_EXPECTED_CLOUDFLARE_ZONE_ID`. The zone must read back as
`mithril.love` and belong to that account. The token needs Pages Read and Write
and D1 Read for the account, Zone Read for the zone, and DNS Read and Write
for the zone. The deployment profile pins
`MITHRILPRESS_EXPECTED_D1_DATABASE_ID`; the command requires the matching
`MITHRILPRESS_D1_DATABASE_ID` and verifies that the database is named
`mithrilpress` in the same account before using it. The Pages production
configuration must read back the exact `DB` binding. The publisher does not
claim to configure or verify Cloudflare's separate request-limit exhaustion
behavior; the application quota stops content responses, not Worker request
metering.
The command also requires the owner token, the reviewed revision UUID, a path
to the previous successful receipt, and a new receipt path. For the initial
publish, the previous-receipt path is a new file for the verified placeholder
baseline. The receipt stores deployment IDs, the manifest, and public
read-back result; keep it with signed standalone publisher evidence. Its
self-checksum detects accidental edits but is not a digital signature, so the
standalone release authority must sign and retain it before it is treated as
release evidence. Select an existing local scratch directory according to the
operator's storage policy.

```sh
MITHRILPRESS_CONTROL_URL=https://control.mithril.love \
MITHRILPRESS_SITE_ID=00000000-0000-4000-8000-000000000000 \
MITHRILPRESS_EXPECTED_REVISION=00000000-0000-4000-8000-000000000001 \
MITHRILPRESS_EXPECTED_CLOUDFLARE_ACCOUNT_ID=<pinned-account-id> \
MITHRILPRESS_EXPECTED_CLOUDFLARE_ZONE_ID=<pinned-mithril-love-zone-id> \
MITHRILPRESS_D1_DATABASE_ID=<mithrilpress-d1-id> \
MITHRILPRESS_EXPECTED_D1_DATABASE_ID=<pinned-mithrilpress-d1-id> \
MITHRILPRESS_PREVIOUS_RECEIPT_PATH=/secure/evidence/placeholder.json \
MITHRILPRESS_PUBLISH_RECEIPT_PATH=/secure/evidence/first-publish.json \
MITHRILPRESS_SCRATCH_DIR=/path/to/existing-scratch-directory \
npm run publish:pages -- --confirm-publication \
  --initialize-hostname blue-widget.sites.mithril.love
```

An update omits `CLOUDFLARE_ZONE_ID` and uses the same receipt variables with
the previous successful publication receipt:

```sh
MITHRILPRESS_CONTROL_URL=https://control.mithril.love \
MITHRILPRESS_SITE_ID=00000000-0000-4000-8000-000000000000 \
MITHRILPRESS_EXPECTED_REVISION=00000000-0000-4000-8000-000000000002 \
MITHRILPRESS_EXPECTED_CLOUDFLARE_ACCOUNT_ID=<pinned-account-id> \
MITHRILPRESS_D1_DATABASE_ID=<mithrilpress-d1-id> \
MITHRILPRESS_EXPECTED_D1_DATABASE_ID=<pinned-mithrilpress-d1-id> \
MITHRILPRESS_SCRATCH_DIR=/path/to/existing-scratch-directory \
MITHRILPRESS_PREVIOUS_RECEIPT_PATH=/secure/evidence/previous.json \
MITHRILPRESS_PUBLISH_RECEIPT_PATH=/secure/evidence/next.json \
npm run publish:pages -- --confirm-publication
```

Before running the command, load `MITHRILPRESS_OWNER_TOKEN`,
`CLOUDFLARE_API_TOKEN`, and the account and zone ID pairs from the approved
local secret/profile configuration. The IDs are configuration values, not
credentials; the API token is secret.

This command is not a release authorization or qualification receipt. The
current repository still requires exact-source standalone qualification,
account/domain readiness, signed evidence, rollback qualification, and live
read-back before a production publication.

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

### Exact platform-host attachment

The public URL pattern is `*.sites.mithril.love`; each registered
`label.sites.mithril.love` host attaches to the shared
`mithrilpress` Worker as an exact Cloudflare Worker Custom Domain. This avoids a
wildcard DNS record and wildcard route, so unknown labels do not reach the
Worker. Cloudflare creates the exact DNS mapping and managed certificate. The
zone-wide cap is 90 Worker Domains, leaving ten slots below Cloudflare's
100-domain limit; D1 also rejects a 91st non-deleted platform site. Onboarding
stops at either cap and never upgrades the account.

Create the tenant row first with `provision:site`. The attachment command
checks that its `--database-id` matches the deployed Worker `DB` binding and
the `mithrilpress` database, then confirms that the exact hostname maps to one
active site row before planning or `--apply`. It uses a separate D1 Read token
and one parameterized `SELECT`; the token must be limited to `fund-mithril`
because Cloudflare scopes D1 Read at the account level, not per database. The
command never writes to D1. The Worker serves content only when its own exact
D1 hostname lookup resolves to an active tenant.

Use an operator credential from the approved secret store, passed through the
process environment. Cloudflare requires Editor access to the existing Worker
and `Workers Routes Write` scoped to the affected `mithril.love` zone to add a
Custom Domain. The command also needs read access to the account, zone, Worker
scripts, Worker Domains, and exact DNS records. Cloudflare currently does not
support per-Worker roles for Custom Domains. Keep provider writes disabled if
the required Editor grant cannot be isolated to `mithrilpress`; a zone-scoped
Routes permission does not make the Worker Editor grant service-specific. The
command verifies that the account reads back as `fund-mithril`, the zone as
`mithril.love`, the named Worker exists, the exact hostname is unused, and the
zone count is below 90. Cloudflare creates the exact DNS record and managed
certificate; no DNS Write permission, wildcard record, or Worker Route is used
for this attachment. `--apply` is required for the provider write; without it
the command prints a plan. After attachment it reads back the Worker Domain
and the exact proxied DNS record, requires a certificate ID, and verifies the
noindex Studio shell over HTTPS. The HTTPS request confirms the managed
certificate is serving the hostname; the Worker Domain API does not expose a
separate certificate status field. An incomplete DNS/TLS/HTTPS read-back leaves
the exact domain in place for manual reconciliation; the command never removes
provider resources automatically. Migration `0012_platform_site_capacity.sql`
caps non-deleted platform sites at 90 in D1, including concurrent tenant
inserts. See the Cloudflare [Custom Domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/)
and [Workers authorization](https://developers.cloudflare.com/workers/authorization/workers/) documentation.

```sh
export CLOUDFLARE_API_TOKEN='from the operator secret manager'
export CLOUDFLARE_D1_READ_TOKEN='separate D1 Read token for fund-mithril'
npm run attach:platform-host -- \
  --account-id <fund-mithril-account-id> \
  --zone-id <mithril-love-zone-id> \
  --database-id <mithrilpress-d1-database-uuid> \
  --hostname studio-example.sites.mithril.love \
  --confirm-hostname studio-example.sites.mithril.love
```

Review the dry-run output and repeat the same command with `--apply` only after
the D1 tenant and shared Worker are deployed and ready. This CLI does not create
or change customer-owned DNS, registrar delegation, Worker code, D1, or R2. It
does not make the bounded host cohort unlimited; the separate Cloudflare for
SaaS customer-domain workflow and Pages static-export path have their own limits
and release gates. Production attachment still requires isolated deep-host
TLS/renewal proof, an enforceable operator cost stop, rollback planning, and
exact-source/current-main standalone qualification.

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
and never accepts registrar credentials. A staging read uses zone-scoped
`Zone Read` and `DNS Read`. The separate explicit import request uses its
token for pre-write and post-write reads as well as the additive write, so it
requires zone-scoped `Zone Read`, `DNS Read`, and `DNS Write`. It contains only
source records missing from an unchanged staged zone. The Worker sends
Cloudflare batch `posts` only; it never sends
`deletes`, `patches`, or `puts`. Record types or values that cannot be
represented without changing their meaning remain on the manual import path.
The create-only converter currently supports `A`, `AAAA`, `CAA`, `CNAME`,
`MX`, `NAPTR`, `NS`, `OPENPGPKEY`, `PTR`, `SRV`, `TXT`, and `URI` records with
validated field formats and TTLs. Other record types remain available in the
reviewable BIND export but require a manual import; if a missing record cannot
be represented, the whole automatic batch is rejected before any provider
write.

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
| `POST` | `/_mithrilpress/api/revisions/{revision-id}/restore` | `site:publish` | Restore an earlier published revision only when its original approval still verifies and the request confirms both that revision and the current publication ID. |
| `GET` / `POST` / `DELETE` | `/_mithrilpress/api/studio/session` | `content:write`, `media:write`, `site:domains`, or `site:dns-migrate` | Exchange a short-lived owner token for a one-hour browser session, inspect it, or revoke it. |
| `GET` | `/_mithrilpress/studio` | public shell; noindex | Open the chat-first post/page Studio. The API requires a site-owner session. |
| `POST` | `/_mithrilpress/api/studio/chat` | `content:write` | Generate or revise one private draft; no model response is published. |
| `POST` | `/_mithrilpress/api/studio/manual-draft` | `content:write` | Save a title and up to 100,000 characters of plain text as a private draft without calling AI; uses the same sanitizer, route checks, revision approval, publication, and D1 conversation quotas. |
| `GET` | `/_mithrilpress/api/studio/conversations` and `/_mithrilpress/api/studio/conversations/{id}` | `content:write` | Read the signed-in owner's conversation history. |
| `DELETE` | `/_mithrilpress/api/studio/conversations/{id}` | `content:write` | Delete the conversation and its unpublished draft. Published revisions remain intact. |
| `GET` | `/_mithrilpress/api/studio/usage` | `content:write`, `media:write`, or `site:domains` | Show this site's retained content, public request use, R2 image storage, and daily app-level usage. |
| `GET` / `POST` | `/_mithrilpress/api/media` | `media:write` | List the tenant's image library and up to 25 pending uploads, or upload a bounded JPEG, PNG, GIF, or WebP image directly to R2. |
| `DELETE` | `/_mithrilpress/api/media/{id}` | `media:write` | Remove an unreferenced image only after its immutable upload action and R2 object metadata are verified. Deletion is rejected while an importing, private-preview, approved, or published revision references it. |
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
| `GET` / `DELETE` | `/_mithrilpress/api/dns-migrations/{id}` | `site:dns-migrate` | Read a tenant-private plan, or cancel/archive and remove its zone snapshots from active D1 state. Cloudflare may retain earlier states during its provider restore window. |
| `POST` | `/_mithrilpress/api/dns-migrations/{id}/verify-ownership` | `site:dns-migrate` | Verify the domain TXT challenge before accepting zone files. |
| `POST` | `/_mithrilpress/api/dns-migrations/{id}/source` | `site:dns-migrate` | Validate and retain the source BIND zone and generate a destination import file. |
| `POST` | `/_mithrilpress/api/dns-migrations/{id}/target` | `site:dns-migrate` | Compare a staged destination zone and its assigned nameservers against the source. |
| `POST` | `/_mithrilpress/api/dns-migrations/{id}/cloudflare-target` | `site:dns-migrate` plus a transient zone-scoped Cloudflare token | Read a full Cloudflare zone export and stage its assigned nameservers and record diff. |
| `POST` | `/_mithrilpress/api/dns-migrations/{id}/cloudflare-import` | `site:dns-migrate`, explicit confirmation, and a transient token with zone-scoped `Zone Read`, `DNS Read`, and `DNS Write` | Recheck the staged zone, create only missing source records using Cloudflare batch `posts`, then export and verify the readback. Unsupported record data remains manual. |
| `POST` | `/_mithrilpress/api/dns-migrations/{id}/approve` | `site:dns-migrate` | Approve the exact diff digest after a required owner confirmation. |
| `POST` | `/_mithrilpress/api/dns-migrations/{id}/verify-delegation` | `site:dns-migrate` | Check destination NS and absence of DS through Cloudflare and Google recursive resolvers. |
| `POST` | `/_mithrilpress/api/dns-migrations/{id}/verify-rollback` | `site:dns-migrate` | Check restored source NS and DS state through the same resolvers. |
| `GET` | `/wp-json/wp/v2/posts` | public | Read published posts with bounded search, date, order, slug, and pagination filters. |
| `GET` | `/wp-json/wp/v2/pages` | public | Read published pages with bounded search, date, order, slug, pagination, and page-parent filters. |
| `GET` / `HEAD` | `/wp-json/wp/v2/posts/{id}` or `/wp-json/wp/v2/pages/{id}` | public | Read one published post or page by its WordPress source ID or MithrilPress API ID. |
| `GET` | `/wp-json/wp/v2/media/{id}` | public | Read metadata for a currently published featured or inline image. |
| `GET` | `/{slug}/` | public | Render one published page or post. |

An R2 write that rejects or has an uncertain result keeps its private D1
reservation. A successful `R2.put` is recorded as one immutable
`media-uploaded` action before the row can become active. Studio lists pending
reservations and offers removal only when the exact action, owner token,
creation time, and upload metadata can be verified. Removal fences the row as
`deleting`, verifies the exact R2 object's metadata, confirms object absence,
then removes the D1 reservation. Unknown or mismatched outcomes remain private
and quota-counted for operator review. Follow the
[media reconciliation runbook](../../docs/operations/mithrilpress-media-reconciliation.md).

The HTML sanitizer keeps a small semantic tag allowlist in
`src/wordpress_html_policy.js`, including native `details`/`summary`
disclosures. It removes attributes except validated HTTP(S) or relative anchor
`href` values and the `open` state plus bounded, control-free `name` grouping
values on `details`. It removes comments and active content subtrees. An inline
image is retained only when its `wp-image-N` class maps to an active R2 image
uploaded by the site owner with WordPress media ID `N`. This retains disclosure
and same-name accordion behavior but omits WordPress styling, block classes,
and dimensions.
Unmapped image elements are removed and counted. Owners must transfer media
themselves; MithrilPress never fetches WordPress URLs or arbitrary source media.
Links on the admitted WordPress host are rewritten only when their
source permalink matches an imported post or page. Unmatched source-host links
remain pointed at the source and are counted for owner review; unsafe schemes
are removed and counted. The private import response and `migration-report`
endpoint classify static, layout-degraded, dynamic, and unknown Gutenberg
blocks. Core details disclosures render with native HTML semantics. The report
counts source omissions, link mappings and image mappings, and flags
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
example deployment. When enabled, the Worker calls the Workers AI binding
directly; it does not use AI Gateway or configure a paid fallback. The free-only
mode is intended for a verified Workers Free account. Its
`STUDIO_AI_FREE_PLAN_CONFIRMED` setting is an operator assertion, not a live
account-plan check. Keep AI disabled until the target account and provider
limits have been read back. Workers Paid can bill usage above its shared daily
free neuron allocation. The app-level request cap and Neuron reservation are
not an account-wide dollar hard stop, and bounded prompts do not guarantee zero
operator cost. A disabled or over-budget request returns an unavailable response
without saving or publishing a draft. See [Workers AI
pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/).

Owners may instead write a title and up to 100,000 characters directly in
Studio. The Worker escapes the text into paragraphs, applies the manual-draft
content boundary and sanitizer, and saves a private revision through the
existing conversation flow. This records `ai_used: false` and does not consume
the AI request or Neuron reservation. Database triggers still enforce the
per-conversation, per-site, and deployment-wide conversation and text limits;
an exhausted quota rejects the whole save.

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

The requested public URL pattern is `*.sites.mithril.love`. The default runtime
is one shared tenant-aware Worker and D1 registry, with one exact Worker Custom
Domain attached for each registered `label.sites.mithril.love` hostname. A
Custom Domain is an exact hostname match: Cloudflare creates its DNS record and
managed certificate, and no wildcard DNS record or Worker Route is used. This
keeps unregistered labels from reaching the Worker. Hosting is free to site
owners; the operator is responsible for provider charges. MithrilPress does not
bill owners or automatically upgrade a Cloudflare plan.

The 90-domain stop is a first-cohort limit, not completion of the worldwide
hosting objective. Cloudflare currently documents limits of 100 Worker Custom
Domains and 1,000 Worker Routes per zone. One wildcard Worker Route and one
proxied wildcard DNS record are a candidate scale path for this shared
renderer. Cloudflare's Routes guidance recommends Custom Domains when a Worker
is the application origin, so this direct-Worker-origin route is an explicit
design exception that must pass isolated-zone qualification before production.
For `*.sites.mithril.love`, it also needs a certificate for the deep hostname;
the parent zone's Universal SSL does not cover it. Advanced Certificate
Manager supports the required wildcard coverage and is a paid add-on. Keep this
path disabled until wildcard TLS, host-aware abuse controls, an enforceable
provider-cost stop, rollback, and the operator budget are qualified. Site
owners remain free; there is no automatic upgrade or owner billing. See the
[wildcard hosting rollout runbook](../../docs/operations/mithrilpress-wildcard-hosting-rollout.md),
[Worker limits](https://developers.cloudflare.com/workers/platform/limits/),
[Routes](https://developers.cloudflare.com/workers/configuration/routing/routes/),
[Universal SSL limits](https://developers.cloudflare.com/ssl/edge-certificates/universal-ssl/limitations/), and
[Advanced Certificate Manager](https://developers.cloudflare.com/ssl/edge-certificates/advanced-certificate-manager/).

MithrilPress does not use Workers for Platforms in the initial design. That
product's dispatch namespaces isolate and route customer-authored Worker code;
MithrilPress runs one reviewed renderer over tenant content and does not execute
tenant code. Workers for Platforms is a separate product with its own pricing,
so it is not required for this shared-renderer design or a provider-level hard
stop. Revisit it only if tenant-authored code becomes a product requirement.
See the [Workers for Platforms overview](https://developers.cloudflare.com/cloudflare-for-platforms/workers-for-platforms/),
[dispatch model](https://developers.cloudflare.com/cloudflare-for-platforms/workers-for-platforms/how-workers-for-platforms-works/),
and [pricing](https://developers.cloudflare.com/cloudflare-for-platforms/workers-for-platforms/reference/pricing/).

MithrilPress enforces 5,000 HTTP requests per active site per UTC day and
25,000 HTTP requests across the deployment. A read-only shared-counter check
runs before hostname resolution; when the cap is reached, the Worker returns
503 without another tenant-registry lookup. After resolution, active-site
requests increment the shared and site counters in one D1 batch. If a site cap
rejects a request, the batch rolls back and shared usage is unchanged.
Unresolved or inactive hosts and invalid control-host requests consume only the
shared counter after resolution. These counters cover public pages, WordPress
REST, Studio, previews, DNS, media, and unsupported routes. The final allowed
request is served; later requests receive 429 for a site cap or 503 for the
shared cap until 00:00 UTC.

Application counters do not stop Worker invocations at Cloudflare's billing
layer. A request at the shared cap still invokes the Worker and performs the
read-only D1 preflight; unrelated workloads in the same Cloudflare account
consume the same provider allocations. The Studio shows MithrilPress app
counters, but does not measure all account-wide Worker requests, D1
reads/writes/storage, or Workers AI neuron usage. Workers Paid has no daily
request ceiling and meters usage beyond its included allocations; budget alerts
notify but do not pause or cap usage. Workers Free has an account-wide daily
request limit and rejects requests after that limit, but this protects
MithrilPress only if the selected account is confirmed Free and shared account
usage is bounded. A strict provider-level stop is not provided by MithrilPress's
app counters. Keep public hosting disabled until the account plan, shared
usage, and enforceable cost boundary are read back. On Workers Free, D1 daily read/write exhaustion
or a D1 storage ceiling is returned as a clear 503 and requests fail closed.
Import and rendering workloads have not been qualified against the current CPU
limit. Usage monitoring and release gates are tracked in Linear MITHRIL-292 and
the tenant-counter consistency fix in MITHRIL-458.
See [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/),
[Workers limits](https://developers.cloudflare.com/workers/platform/limits/),
[D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/), and
[Cloudflare budget alerts](https://developers.cloudflare.com/billing/manage/budget-alerts/),
[Workers AI pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/)
again before each release.

Studio history has separate D1 trigger-enforced limits: 40 messages per
conversation, 50 conversations per site, 1,000 conversations across the
deployment, 4 MiB of UTF-8 message text per site, and 64 MiB across the
deployment. The Studio displays the text-byte estimate and conversation counts.
Deleting a conversation releases its message-text allowance. This is an
application estimate, not physical D1 database size; the provider's Free-plan
row and storage limits remain the final hard stop.

The default address is one exact Worker Custom Domain per registered tenant
under the requested `*.sites.mithril.love` URL pattern; the platform host is
attached one exact hostname at a time after owner and capacity checks.

Customer-owned-domain onboarding is implemented behind a separate
disabled-by-default feature gate. It asks the owner to publish a short-lived
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
for a single staging read request (`Zone Read` and `DNS Read`). The explicit
import request uses a separate token to reread the live zone before and after
the write, as well as create records missing from the unchanged staged zone;
that token therefore needs zone-scoped `Zone Read`, `DNS Read`, and `DNS Write`.
The request contains no update or delete operations and uses Cloudflare batch
`posts`. Cloudflare documents that batch writes use a
database transaction but DNS propagation is not atomic. The deployment keeps
the write endpoint disabled until its behavior is qualified against an
isolated Cloudflare zone. MithrilPress stops if the live zone changed, the
destination has extra or changed records, or the post-write readback is not an
exact match. The token is not persisted.
Automatic writes additionally require the destination zone to be `pending` and
the current public NS/DS answers from both recursive resolvers to match the
captured source state. Keep the source zone active and do not change registrar
delegation while a write is in progress. Cloudflare notes that pending zones
still answer queries sent to their assigned nameservers; they are not active
for proxy traffic. See [Cloudflare zone status](https://developers.cloudflare.com/dns/zone-setups/reference/domain-status/).
Registrar nameserver changes, DNSSEC, and service checks for web, TLS, and mail
remain manual owner operations. See [Cloudflare DNS record batch](https://developers.cloudflare.com/api/resources/dns/subresources/records/methods/batch/)
and [zone import/export](https://developers.cloudflare.com/dns/manage-dns-records/how-to/import-and-export/).
Provider writes are disabled by default with
`CLOUDFLARE_DNS_IMPORTS_ENABLED=false`; set it to `true` only after the exact
create-only batch and readback behavior is qualified against an isolated
Cloudflare zone. The Worker rejects record data that its Cloudflare API mapping
cannot preserve and directs the owner to the manual import workflow.

The parser accepts a documented BIND zone-file subset up to 256 KiB and 2,000
records. It supports `$ORIGIN`, `$TTL`, explicit or inherited owners, and
standard TTL suffixes; unsupported directives such as `$GENERATE` must be
expanded before upload. The parser does not support escaped owner-name labels
or non-IN record classes, so review and normalize exports that use them before
uploading. NAPTR records must use the six standard fields, quoted flags,
service, and regexp character strings, and a fully qualified replacement name
(or `.`); ambiguous forms are rejected before staging.
Comparison excludes provider-managed apex SOA/NS and generated DNSSEC records,
and retains Cloudflare `cf-proxied` and `cf-flatten-cname` settings where the
zone export includes them. Generated imports default A/AAAA/CNAME records to
DNS-only when the source export does not provide proxy state. Provider settings,
free-form comments, glue, mail delivery, TLS, and application health still need
separate owner review. Cloudflare's official zone-file import limit is 256 KiB.
BIND import/export remains the manual path; the automatic path uses DNS Records
batch creation. See [Cloudflare DNS record batch](https://developers.cloudflare.com/api/resources/dns/subresources/records/methods/batch/)
and [zone import/export](https://developers.cloudflare.com/dns/manage-dns-records/how-to/import-and-export/).

Zone snapshots contain DNS TXT values that may include verification or service
secrets. They remain tenant-scoped in D1 until the owner cancels the plan or
archives a verified cutover/rollback, at which point snapshot and challenge
fields are removed from active D1 state while hashes and append-only audit
receipts remain. Cloudflare may retain earlier production-backend D1 states
for up to 7 days on Workers Free or 30 days on Workers Paid, so active-state
removal is not immediate irreversible erasure. Keep the source DNS zone active
through the rollback window. After TXT ownership proof,
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

Worker-hosted public post/page list requests support `page`, `per_page` (1–100), `slug`,
`search`, `after`, `before`, `modified_after`, `modified_before`, `order`, and
`orderby` (`date`, `modified`, `id`, `title`, `slug`, or `relevance`; relevance
requires a search term), plus `context` `view`/`embed`. Page lists also support
`parent`, `parent_exclude`, and `orderby=parent`. Parent filters accept up to 80
IDs total across both filters in comma-separated, repeated, or bracket-array
query forms. Search matches the published title and sanitized content.
Relevance descending ranks exact title matches, title substrings, then
content-only matches. Dates accept ISO 8601 calendar dates or timezone-qualified
date-times; date-only `before` and `modified_before` values include the full UTC
calendar day. Results remain restricted to published entries. Parent filtering
and sorting use the public parent ID returned for each page: it is the source ID
only when that parent is also published in the active revision, and `0`
otherwise.
Single-item `GET` and `HEAD` routes accept a positive numeric ID. Imported
entries resolve by their WordPress source ID; MithrilPress-authored entries
resolve by their MithrilPress API ID. They return only an entry in the active
published revision, so drafts, private previews, superseded revisions, and IDs
of another post type return 404. Pages expose their parent source ID only when
that parent is also published in the active revision; otherwise the public
`parent` value is `0`.
Category/tag lists also support
`search` and `hide_empty`, and individual terms can be fetched by source ID.
Responses include standard `X-WP-Total`, `X-WP-TotalPages`, and pagination
`Link` headers. Category/tag archives render published-entry lists. Editing
contexts, term and media writes, media listings, users, comments, custom post
types, and WordPress authentication plugins are not implemented here.

The Pages static publication serves the same read-only post/page, category/tag,
and individual-media routes through its fixed Pages Function. Its bounded
catalog supports pagination, slug, date, modified-date, ordering, and title
search filters. Content search, write endpoints, authentication plugins, and
other WordPress REST resources remain unsupported on the static path.

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
above, the importer does not preserve custom fields, users, comments, or custom
taxonomies. Unresolved, cyclic, and over-depth page hierarchies are counted in
the migration report and require owner review.
Safe multi-segment WordPress permalink paths are used by the published site,
the read-only REST `link` field, canonical tags, and rewritten internal links.
Query-based, reserved, invalid, or unsupported source paths fall back to a
one-segment slug route and are counted in the private migration report; the
owner must review URL changes before publication. Duplicate public routes are
rejected rather than resolved arbitrarily.
Unsupported post types and password-protected posts/pages are skipped and
counted in the import report; protected content is never silently turned into
ordinary public content. Review the report and private preview before
publication.
Migration report version 2 includes record reconciliation and a Mithril-authored
`parity_status`. It reports `supported-slice-complete` only when every imported
record reconciles and the importer reports no omitted source content, degraded
or dynamic blocks, unsafe or unresolved links, missing media, metadata omission,
or route fallback. Otherwise it reports `owner-review-required`; this describes
the admitted subset and is not a claim of full WordPress parity.

Restoring a prior publication does not edit its immutable content or manufacture
a new approval. A `site:publish` owner must POST the historical revision ID and
the current publication ID to the exact restore path. The worker requires the
target to have been published before, remain complete, and retain its original
owner approval, then atomically switches the current revision and records a
distinct `restore` owner action. The publication snapshot endpoint reads back
the resulting current revision for export.
