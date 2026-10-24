# MithrilPress D1 migration order

**Status: source coordination only. No migration in this proposed sequence has
been applied to a production database.** Current `main` includes migrations
through `0021_media_reference_guards.sql` (`0019_revision_restore_actions.sql`
from PR #143, `0020_manual_draft_audit_action.sql` from PR #140, and
`0021_media_reference_guards.sql` from PR #141). Versions 0017 and 0018 remain
unused; MITHRIL-1479 proposes `0022_dns_migration_snapshot_retention.sql` in
this PR. New pending feature migrations are numbered after the merged
migrations and must be applied only through the database owner's approved
release procedure.

Use this sequence for the currently tracked MithrilPress feature stack so each
pending migration has one stable version number and its prerequisites are
available first:

| Version | Migration | Tracked change |
| --- | --- | --- |
| 0012 | `platform_site_capacity` | Merged in PR #138 |
| 0013 | `studio_ai_neuron_reservations` | Merged in PR #126 |
| 0014 | `wordpress_permalink_routes` | Merged in PR #127 |
| 0015 | `wordpress_page_hierarchy` | Merged in PR #127 |
| 0016 | `studio_conversation_quotas` | PR #129, merged |
| 0019 | `revision_restore_actions` | PR #143, merged; keep filename and contents immutable |
| 0020 | `manual_draft_audit_action` | PR #140, merged; also raises the transcript limit for manual drafts to 100,000 characters and preserves the `restore` action |
| 0021 | `media_reference_guards` | PR #141, merged |
| 0022 | `dns_migration_snapshot_retention` | MITHRIL-1479, proposed |

Before qualifying or merging a branch, rebase it onto the current main and
assign pending migrations a version after every migration already merged there.
Do not change the name or contents of an already-applied migration. Review the
complete SQL sequence again after rebasing; this list does not replace
exact-source qualification or an integrated-main qualification.

Before any remote application, read back the selected Cloudflare account,
database ID, database name, and applied migration list. Confirm the remaining
files are pending and apply only after the migration owner approves the exact
plan. A clean local migration check is not evidence that the remote database
was changed or that the intended schema is live. Track this gate in
Linear MITHRIL-285.
