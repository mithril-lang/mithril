# MithrilPress exact-host attachment and cost gate

**Status: exact Worker Custom Domains are the required default host method, but
none is provisioned.** The public URL pattern remains
`label.sites.mithril.love` under `*.sites.mithril.love`. The shared Worker
accepts only individually attached, registered tenant hostnames. It creates no
wildcard DNS record or wildcard Worker Route; unknown labels have no public
MithrilPress attachment. The optional capped Pages path is separate and can
replace an exact hostname only through an owner-approved cutover; see
`docs/design/mithrilpress-static-publication.md`.

## Exact-host controls

1. Read back the selected `fund-mithril` account, active `mithril.love` zone,
   shared `mithrilpress` Worker, exact hostname, and D1 tenant mapping before
   attaching a domain.
2. Require an explicit hostname confirmation and a scoped operator credential
   for Worker Custom Domains. The CLI defaults to read-only dry run and requires
   `--apply` for the provider write.
3. Keep a hard cap of 90 non-deleted sites and 90 Worker Domains, leaving ten
   slots below Cloudflare's 100 Custom Domains per-zone limit. Stop at the cap;
   do not auto-upgrade or reuse a domain that still exists in the provider.
4. Read back the exact Worker Domain, DNS record, managed certificate status,
   and HTTPS response before marking a site attached. Test deletion and
   rollback in an isolated zone; reconcile partial API writes manually.
5. Keep all content queries bound to the exact D1 tenant and current revision.
   Unknown, detached, or unregistered hosts return no content.

## Cost boundary

The application stops serving content at its per-site and deployment caps, but
each request still invokes the Worker before it can return a capped response.
The app counters therefore do not cap provider-billed invocations. Workers Free
has an account-wide daily request limit; Workers Paid has no daily request
limit. The `fund-mithril` account contains other Workers and its subscription
read requires Billing Read, so the account plan and enforceable cost boundary
must be verified before enabling public host attachments. D1 and R2 limits are
also account-wide; confirm their provider behavior and shared workloads.

No exact host, DNS record, certificate, or Worker Domain may be created until
scoped Worker Custom Domains access, exact-source standalone qualification,
current-main qualification, cost limits, rollback, and provider read-back are
ready. See [Workers limits](https://developers.cloudflare.com/workers/platform/limits/),
[Worker Custom Domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/),
[D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/), and
[R2 pricing](https://developers.cloudflare.com/r2/pricing/).
