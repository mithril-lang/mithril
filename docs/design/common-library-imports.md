# Canonical library imports

The repository name, shared library ID and source namespace use
`fund.mithril.lib.*`. The native plugins provide Python/Hy namespaces, portable
cljk transport facades, typed Kotoba modules, and Mithril Library graphs.
See the [published adapter contract](https://github.com/mithril-lang/fund.mithril.lib.interop/blob/v0.4.0/docs/language-adapters.md).

The Mithril host accepts a reviewed Python executable and adapter root explicitly:

```sh
export MITHRIL_INTEROP_PYTHON=/reviewed/venv/bin/python
export MITHRIL_INTEROP_ROOT=/reviewed/interop
node scripts/run-mission-sci.mjs bin/mithril-library.cljk resolve fund.mithril.lib.xml
node scripts/run-mission-sci.mjs bin/mithril-library.cljk invoke fund.mithril.lib.siso.link16 link16-loopback arguments.json
node scripts/run-mission-sci.mjs bin/mithril-library.cljk compile application.mith registry.json
```

`arguments.json` is the operation's JSON argument object, for example `{}` for
`link16-loopback`. The compile registry is explicitly provided; each entry has
`descriptor` and `source` values from `resolve`. Wrap a resolve result under its
common ID to create the registry:

```json
{"fund.mithril.lib.xml":{"descriptor":{"libraryId":"fund.mithril.lib.xml","...":"full resolved descriptor"},"source":{"...":"full resolved Library document"}}}
```

The abbreviated JSON above is explanatory, not a complete binding. A real
application's imports use the common ID and the graph digest reported by resolve.
The adapter recompiles every binding, checks operation ownership and identity,
checks the import's digest, then resolves the ID to its canonical IRI before
standard WebApplication compilation. It performs no implicit provider installation.

cljk imports require the package source roots on the classpath. Native effects
remain capabilities of the explicitly supplied transport. Kotoba imports use
Amu source resolution with a CID module lock; the typed module produces requests
for an explicit host dispatcher. A compiled handler declaration alone does not
execute a native operation. Mission projections from a library call still pass
through the existing mission compiler admission.

CI covers actual Hy imports, cljk ownership refusal, Mithril digest refusal,
CID-locked Kotoba native guest output and real UDP read-back. Amu is pinned at
`bbbdaa9cb5ee0ad4ff29e024e4a70c9db4f8c02b`; its JVM-free bootstrap compiler is
used without claiming selfhost evidence.
