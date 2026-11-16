# Common library IDs and language adapters (v0.4)

The public repository name, library ID and language namespace are identical:

| ID | Operations |
| --- | --- |
| fund.mithril.lib.interop | plugins, resolve-library |
| fund.mithril.lib.xml | XML custody, validation and explicit projection |
| fund.mithril.lib.siso.link16 | DIS/UDP simulation envelopes |
| fund.mithril.lib.ieee.hla | OpenRTI federate execution |
| fund.mithril.lib.siso.c2sim | C2SIM native XML and projection |
| fund.mithril.lib.siso.msdl | MSDL native XML and projection |

Install only reviewed providers into the explicitly selected Python environment.
Resolution never downloads or installs code. Legacy `mithril_*` Python modules
remain available. Importing a facade does not grant network or process authority.

## Python and Hy

```python
import fund.mithril.lib.xml as xml
binding = xml.resolve()
assert binding['libraryId'] == xml.LIBRARY_ID
receipt = xml.invoke('xml-import', {'bytesBase64': 'PGRlZmluaXRpb25zIHhtbG5zPSJodHRwOi8vd3d3Lm9tZy5vcmcvc3BlYy9CUE1OLzIwMTAwNTI0L01PREVMIi8+',
                                    'standard': 'bpmn', 'version': '2.0.2'})
```

```hy
(import fund.mithril.lib.xml :as xml)
(print (get (xml.resolve) "libraryId"))
```

`invoke(operation, arguments)` dispatches only an operation owned by this
installed provider. The provider's existing input validation and effects remain.

## cljk

Add the installed libraries' `src` directories (or extracted package namespaces)
to the source classpath. `interop.cljk` is the common portable protocol facade.
The caller supplies a transport capability; the Mithril Node host can supply it:

```clojure
(ns example (:require [fund.mithril.lib.xml :as xml]
                      [mithril.library-adapter :as library]))
(def transport (library/transport {:python "/reviewed/venv/bin/python"
                                   :adapter-root "/reviewed/interop"}))
(xml/resolve transport)
(xml/invoke! transport "xml-import" {"bytesBase64" "PGRlZmluaXRpb25zIHhtbG5zPSJodHRwOi8vd3d3Lm9tZy5vcmcvc3BlYy9CUE1OLzIwMTAwNTI0L01PREVMIi8+"
                                     "standard" "bpmn" "version" "2.0.2"})
```

The facade itself has no Node/JVM dependency. Transport implementations on other
hosts must enforce this protocol and own the host effects explicitly.

## mith

The source import uses the common ID and a required canonical graph digest:

```json
{"library":"fund.mithril.lib.xml","digest":"sha256:a7b9771fc49491488cbff76527483eab3cd46398852ba06f8ddea70c2e751a6a"}
```

`mithril.library-adapter/resolve!` retrieves the installed Library document.
`binding` compiles its graph and checks ID, repository, IRI and exports.
`compile-web-text` accepts an explicit registry of these bindings, verifies each
common-ID import's digest, and resolves it to
`https://mithril.fund/lib/fund.mithril.lib.xml` before standard compilation.
Existing IRI imports retain their normal compiler behavior. This is source
resolution; a handler declaration alone does not execute a host operation.
The CLI `bin/mithril-library.cljk` exposes resolve, compile and explicit invoke.

## Kotoba

Add the package source root to Amu's module resolver, then pin it with a module
lock. Each typed `.kotoba` module exports `library-id`, `library-iri`, `accepts`
and `request`:

```clojure
(ns example (:require [fund.mithril.lib.xml :as xml]) (:export [main]))
(defn main [] :string (xml/request "xml-import" "{}"))
```

`request` produces a JSON envelope; it performs no host I/O. Its JSON argument
must be an object. Pass the envelope to the explicit native host RPC dispatcher,
which rejects duplicate JSON keys, routing overrides and foreign operations.
Unknown members produce an invalid-operation envelope that the host refuses.

`python scripts/test-kotoba-library.py --amu-root AMU --source-root LINK16/src
--library-id fund.mithril.lib.siso.link16 --member link16-loopback --invoke`
checks CID-locked module resolution, native guest output, and explicit real UDP
host read-back. The compiler uses the pinned JVM-free bootstrap; this test is
not evidence of a selfhost compiler. These string primitives are verified on
native targets; no JavaScript-backend execution is claimed.

## Host contract

- Resolve: `{"operation":"resolve-library","libraryId":"fund.mithril.lib.xml"}`.
- Call: `{"operation":"library-call","libraryId":"fund.mithril.lib.xml","member":"xml-import","arguments":{"bytesBase64":"PGRlZmluaXRpb25zIHhtbG5zPSJodHRwOi8vd3d3Lm9tZy5vcmcvc3BlYy9CUE1OLzIwMTAwNTI0L01PREVMIi8+","standard":"bpmn","version":"2.0.2"}}`.
- Resolution reports repository, ID, IRI, RPC version, operation ownership,
  effect metadata and packaged source. Installed providers are trusted code.
- Calls use exactly these four routing fields. Arguments cannot contain
  `operation`, `libraryId`, `member` or `arguments`; values must be finite JSON.
- Source projection still undergoes Mithril mission admission on the Mithril
  host. Common naming does not add RF/tactical-terminal functionality or broaden
  supported protocol profiles.
