# MithrilPress D1 retention and erasure contract

**Status: proposed operator and product contract; not evidence of a deployed
MithrilPress database.** As of 2026-10-24, the selected `fund-mithril` account
has no MithrilPress D1 database. Verify the actual database, storage version,
and Workers plan again before enabling customer DNS migration.

## Meaning of “erase”

MithrilPress snapshot erasure means removing the snapshot fields from the
active D1 database state and retaining only the explicitly documented audit
receipt and non-content hashes. It does not promise immediate, irreversible
deletion from Cloudflare-managed database history.

Cloudflare D1 Time Travel is always enabled for production-backend databases.
It can restore prior database states, including states before a `DELETE` or
`UPDATE`. The documented restore window is up to 7 days on Workers Free and 30
days on Workers Paid. A previously stored snapshot may therefore remain
recoverable by an authorized database operator until its historical state falls
outside the applicable rolling window. Restoring rewrites the database state;
it is an operator recovery action, not a customer-facing undelete feature.
Cloudflare states that database history and restore incur no additional cost.
See [D1 Time Travel and backups](https://developers.cloudflare.com/d1/reference/time-travel/).

The application’s 30-day inactivity cleanup controls how long snapshot data
remains in the active MithrilPress state. It neither shortens nor overrides the
provider’s Time Travel window. Immediate erasure from all provider-managed
history is not currently supported or claimed.

## Product copy requirements

Until a separately reviewed provider-level erasure design exists:

* Say “removed from the active MithrilPress database” when an owner or cleanup
  job removes snapshot fields from the live D1 state.
* Explain that a prior database state may remain recoverable to an authorized
  operator during Cloudflare’s applicable restore window.
* Do not say “permanently erased,” “irreversible,” or “cannot be undone” for D1
  snapshot data while provider history can restore it.
* Keep the append-only audit receipt and non-content hashes distinct from the
  removed snapshot content; do not imply that the receipt contains the original
  zone file or TXT values.

The 30-day application retention deadline and the provider restore window are
separate clocks. The user interface must communicate both without suggesting
that opening a plan extends application retention or that application erasure
purges provider history.

## Release gate

Before enabling customer DNS migration, an operator must read back and record
the selected Cloudflare account, D1 database ID and name, D1 storage version,
Workers plan, and applied migration list. Do not infer the Workers billing plan
from the `mithril.love` website-zone plan. If billing details are unavailable,
keep customer DNS migration disabled and do not claim a provider-level
hard-stop or an exact provider history window for the deployment.

If the product or a customer agreement requires deletion sooner than the
provider history window, DNS migration must remain disabled until a storage and
key-management design that meets that requirement is implemented and reviewed.
Encryption-at-rest or deletion of active rows alone does not establish
irrecoverable deletion from a provider-managed historical database state.

Track the deployment-specific verification and any stronger erasure design in
[MITHRIL-1481](https://linear.app/kotobalabs/issue/MITHRIL-1481/clarify-dns-snapshot-erasure-semantics-for-d1-time-travel).
