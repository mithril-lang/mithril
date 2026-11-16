# fund.mithril.lib.siso.c2sim

Versioned C2SIM native XML profile plugin: `OpenC2SIM-SMX-LOX-1.0.1`.
Operations: c2sim-import, c2sim-project. Bundled explicit XPath mapping; native source bytes remain preserved.

`python -m pip install -e .` installs the pinned XML/host dependencies and registers the plugin.

Fetch the pinned public schema with `python scripts/fetch-c2sim-schema.py`; pass its manifest to import for XSD1.1 validation.

Projection does not execute military commands or initialize a simulator.

## Common library ID and imports

Repository, plugin and library ID: `fund.mithril.lib.siso.c2sim`. Python/Hy namespace: `fund.mithril.lib.siso.c2sim`. `.cljk` and `.kotoba` facades are under the matching `src/` namespace path; the packaged `.mith` Library binds this ID to `https://mithril.fund/lib/fund.mithril.lib.siso.c2sim` with its canonical graph digest.

See the [cross-language contract](https://github.com/mithril-lang/fund.mithril.lib.interop/blob/main/docs/language-adapters.md). Import resolution performs no automatic downloads or network effects.
