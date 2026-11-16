# Mithril plugin contract v1

Repository and plugin IDs use reverse DNS rooted at `mithril.fund`: `fund.mithril.*`.
Names describe ownership and specification, not endorsement by SISO or IEEE.

| Repository | Responsibility |
| --- | --- |
| [fund.mithril.lib.interop](https://github.com/mithril-lang/fund.mithril.lib.interop) | Host, discovery, common refusal type and backward-compatible Mithril facade |
| [fund.mithril.lib.xml](https://github.com/mithril-lang/fund.mithril.lib.xml) | Offline pinned XSD 1.1, native XML custody and explicit XPath projection |
| [fund.mithril.lib.siso.link16](https://github.com/mithril-lang/fund.mithril.lib.siso.link16) | SISO 2021 DIS7 TSA0/MTI0 codecs and UDP simulation |
| [fund.mithril.lib.ieee.hla](https://github.com/mithril-lang/fund.mithril.lib.ieee.hla) | IEEE1516e host and pinned OpenRTI build |
| [fund.mithril.lib.siso.c2sim](https://github.com/mithril-lang/fund.mithril.lib.siso.c2sim) | OpenC2SIM-SMX-LOX-1.0.1 XML profile and pinned schema fetcher |
| [fund.mithril.lib.siso.msdl](https://github.com/mithril-lang/fund.mithril.lib.siso.msdl) | SISO-STD-007-2008 structural XML profile |

Every package registers one `mithril.interop.plugins` Python entry point, named
exactly its reverse-DNS ID, loading a class with `id`, `rpc_version = 1`,
`operations` and static `call(request)`. The host rejects identity/version mismatch,
ambiguous operations, unknown operations and non-object requests. Installing a
plugin authorizes its Python code to execute locally; manifests are discovery
metadata, not a sandbox. Only install trusted revisions. No automatic downloads
occur during discovery or RPC execution.

Each plugin packages `plugin.json` with schema `fund.mithril.lib.interop.plugin.v1`,
ID, version, RPC version, entry point, operations, specification and effect flags.
Callers pass data as one UTF-8 JSON request to `python -m mithril_interop.cli rpc`.
Success is a JSON receipt on stdout; refusal is nonzero exit plus JSON stderr.
The host bounds requests to 8MiB; binary payloads use base64 or hex. UDP endpoints
must be explicitly allowlisted. HLA logical time advances only on real RTI grants.
`{"operation":"plugins"}` lists the installed adapters and operations.

The native XML plugins preserve unmapped data; version/profile mismatch fails.
Mithril's `mission-native/invoke!` validates all `*-project` model outputs via
`mission/compile-document`. XML/XSD receipts do not authorize command execution.

## Install from GitHub

Packages are published as source repositories, not on PyPI. Plugin pyproject
files pin common host/XML dependency commits using VCS URLs. For example:

```sh
python3 -m venv .venv
.venv/bin/python -m pip install 'git+https://github.com/mithril-lang/fund.mithril.lib.siso.link16.git@v0.3.0'
printf '%s' '{"operation":"link16-loopback"}' | .venv/bin/python -m mithril_interop.cli rpc
printf '%s' '{"operation":"plugins"}' | .venv/bin/python -m mithril_interop.cli rpc
```

XML/profile and Link16 plugins can be used from installed wheels. HLA additionally
needs a native build. Clone its repo, run `./scripts/build-hla.sh`, install it
editable into the selected venv, then invoke `hla-exercise`. With a non-editable
HLA install, pass the absolute native `executable` path in the RPC request.
The FOM is packaged with the plugin. TCP RTI is verified on Linux CI; the macOS TCP handshake remains unresolved. External terminal acceptance is a separate verification gate.

The existing local `mithril-interop` checkout remains the common host so existing
Mithril configuration paths still work. Native runtime projects and schemas are
no longer bundled in it. The language checkout adapter accepts `plugins` and
all profile operations as well as the existing generic operations.
