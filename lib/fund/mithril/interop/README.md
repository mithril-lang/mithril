# fund.mithril.lib.interop

Common Mithril native plugin host (JSON RPC v1), compatibility facade and discovery.
Implementation modules live in specification repositories; no adapter is built into this host.
Install only trusted plugins: entry points execute installed Python code. No runtime download or automatic installation occurs.

```sh
python -m mithril_interop.cli rpc < examples/requests/plugins.json
```

See [plugin contract](docs/plugins.md) and [implementation boundaries](docs/design.md).
Native RF terminals and full tactical semantics are not implemented. TCP OpenRTI is unverified on macOS.

See the [repository map and installation contract](docs/plugins.md).

## Common library IDs

The repository name and canonical library ID are identical. Python/Hy, cljk,
Mithril source imports and typed Kotoba modules use `fund.mithril.lib.*`.
See [language adapters](docs/language-adapters.md) for explicit transport,
locked resolution, graph digest checks and native execution examples.
