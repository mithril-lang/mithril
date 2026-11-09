# fund.mithril.lib.ieee.hla

Independent specification plugin for Mithril JSON RPC v1. Plugin ID `fund.mithril.lib.ieee.hla`.

Operations: hla-exercise.

Install with `python -m pip install -e .`; discovery uses the `mithril.interop.plugins` entry-point group.

Build native OpenRTI with `./scripts/build-hla.sh`. In-process IEEE 1516e has been verified; TCP timed out on macOS. No RF or RPR FOM support is claimed.

[Detailed boundaries](https://github.com/mithril-lang/fund.mithril.lib.interop/blob/main/docs/design.md)

Linux CI builds with GNU C++ and passes all four tests, including a separate TCP rtinode server: [verified v0.2.2 run](https://github.com/mithril-lang/fund.mithril.lib.ieee.hla/actions/runs/37773380233). The macOS TCP handshake remains unresolved.

## Common library ID and imports

Repository, plugin and library ID: `fund.mithril.lib.ieee.hla`. Python/Hy namespace: `fund.mithril.lib.ieee.hla`. `.cljk` and `.kotoba` facades are under the matching `src/` namespace path; the packaged `.mith` Library binds this ID to `https://mithril.fund/lib/fund.mithril.lib.ieee.hla` with its canonical graph digest.

See the [cross-language contract](https://github.com/mithril-lang/fund.mithril.lib.interop/blob/main/docs/language-adapters.md). Import resolution performs no automatic downloads or network effects.
