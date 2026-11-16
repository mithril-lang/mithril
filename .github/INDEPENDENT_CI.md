# Independent CI adoption

This repository is registered with Mithril's organization-owned CI controller.
The immutable controller revision, verification scope, runtime readiness and
publication gates are recorded in [independent-actions.json](independent-actions.json).

Use the [organization adoption guide](https://github.com/mithril-lang/.github/blob/0c227a7a7b3ce4431904c32270d755302a8aae93/INDEPENDENT_ACTIONS.md).
Check out `mithril-lang/.github` at the exact `controller.revision` in
`independent-actions.json` in a separate trusted checkout, then run:

```sh
node /path/to/org-policy/tools/independent-actions/cli.mjs plan --checkout /path/to/this-repo
node /path/to/org-policy/tools/independent-actions/cli.mjs check-adapter --checkout /path/to/this-repo
```

The adapter cannot provide executable shell commands. Review the shared policy
before upgrading its pin. The `mithrilpress-worker` prepared profile covers
Worker tests, owner-auth integration, D1 migrations, and JavaScript syntax. It
does not replace compiler/native conformance or qualify a production release.
Runtime-required profiles fail closed until their listed dependencies and
native environments have been qualified. Fund delegates to its existing
signed scheduler and dedicated publishers.

This initial registration does not retire existing workflows or qualify a
production release. Repository-specific signing, native validation, owner,
credentials, rollback and live/installed-client verification remain required.
Adapter validation is not full application CI.
