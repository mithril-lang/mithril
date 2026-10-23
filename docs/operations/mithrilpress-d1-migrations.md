# MithrilPress D1 migration order

**Status: source coordination only. No migration in this proposed sequence has
been applied to a production database.** The latest integrated main migration
is `0012_platform_site_capacity.sql`.

Use this sequence for the currently tracked MithrilPress feature stack so each
pending migration has one stable version number and its prerequisites are
available first:

| Version | Migration | Tracked change |
| --- | --- | --- |
| 0012 | `platform_site_capacity` | Merged in PR #138 |
| 0013 | `studio_ai_neuron_reservations` | PR #126 |
| 0014 | `wordpress_permalink_routes` | PR #127 |
| 0015 | `wordpress_page_hierarchy` | PR #127 |
| 0016 | `studio_conversation_quotas` | PR #129 |
| 0017 | `manual_draft_audit_action` | PR #140 |
| 0018 | `media_reference_guards` | PR #141 |

Before qualifying or merging a branch, rebase it onto the current main and
rename only migrations that have not been applied. Do not change the name or
contents of an already-applied migration. Review the complete SQL sequence
again after rebasing; this list does not replace exact-source qualification or
an integrated-main qualification.

Before any remote application, read back the selected Cloudflare account,
database ID, database name, and applied migration list. Confirm the remaining
files are pending and apply only after the migration owner approves the exact
plan. A clean local migration check is not evidence that the remote database
was changed or that the intended schema is live. Track this gate in
Linear MITHRIL-285.
