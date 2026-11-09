# Adapter design and evidence boundaries

The language core owns model types, reference integrity, source provenance and
pure transition admission. The specification plugin repos own native parsers/serializers and host
effects; this common repo owns discovery and the RPC contract. The shared boundary is JSON, binary data uses base64/hex, and large
75-bit words stay hex strings when crossing JavaScript.

```text
native XML -- pinned XSD --> archived original bytes
                      \--> explicit versioned XPath profile --> MissionModel
                                                           --> Mithril IR admission
opaque J words <--> SISO 2021 / DIS 7 codecs <--> allowlisted UDP peer
Mithril state/event bytes <--> IEEE 1516e native host <--> actual OpenRTI
```

## XML

Native roots are namespace-qualified; MSDL, C2SIM, BPMN, DMN and HLA FOM have
explicit recognized roots. DM2, C-BML, JC3IEDM and MIM require a schema manifest
to supply an exact root, avoiding fabricated global namespace/version guesses.

```json
{
  "version": "selected-source-version",
  "entry": "domain.xsd",
  "root": "{urn:exact-source-namespace}Root",
  "files": {"domain.xsd": "64-hex-SHA256", "foundation.xsd": "64-hex-SHA256"}
}
```

The file closure is hashed, DTD-free, bounded, copied into an immutable local
temporary bundle and compiled with XSD 1.1. Schema imports must stay in that
closure. Remote XML contexts and schemaLocation hints are never fetched during
admission. A schema manifest is caller-supplied; its hash pins content and does
not authenticate the publisher. Source version must equal manifest version.

Unmodified native XML is re-exported byte-for-byte, including namespace prefixes,
unknown extensions, comments and original encoding. Edits require XPath,
namespace map, attribute name (or null for text), expected previous value and
replacement text. Exactly one element must match. Edited XML is serialized as
UTF-8 and receives a new hash; pass the manifest again to revalidate. The API
does not represent an edited document as still conforming to an earlier schema.

Projection profiles contain `standard`, `version`, `namespaces` and `rules`.
Each rule declares an element `select`, XPath-string `id`, normalized target
`type`, optional `targetStandard` and optional `refs` mapping role to XPath.
String XPath references become a single ID; node/string lists become ID arrays.
All targets must resolve to mapped identities. IDs are scoped to the original
document's hash. XML leaf paths outside mapped subtrees appear in `unmappedPaths`;
`strict` refuses them. Mapped subtrees are retained as native XML in payload,
not interpreted field-by-field. Attributes inside mapped subtrees are retained
too. This is structural projection, not a proof of semantic equivalence.

`xml-import`, `xml-export`, `xml-patch`, `xml-project` are RPC operations. RPC
requests contain data, not executable code. XPath extension functions are not
registered. Source and RPC limits are 4 MiB and 8 MiB respectively.

## Link 16 simulation

The implemented subset is DIS 7, radio protocol family, SISO 2021 bitstream,
TSA level 0, no variable transmitter records or antenna pattern, fixed-format
message type 0. Transmitter metadata carries the selected network ID. Signal
packets retain the big-endian network header, LSB-first JTIDS header and opaque
75-bit words with padding. The parser checks sizes, enums, word counts, bit
length and padding, and refuses legacy byte-swapped packets or higher-fidelity
timing. Parity is retained, not generated or validated by a tactical decoder.

The codec is separate from a terminal/network simulation: decoded NPG/net and
network ID values are provided to the caller; terminal membership, filtering,
heartbeat expiry, bandwidth metering and TDMA behavior are not claimed here.
Transport explicitly allowlists numeric IPv4 peers, has bounded receive timeout,
and performs no discovery/broadcast. `send` confirms only kernel submission;
`loopback` additionally confirms a receiver got matching bytes.

RPC operations are `link16-encode`, `link16-decode`, `link16-send`,
`link16-receive` and `link16-loopback`. Send/receive requests require
`allowedPeers`; the normal workflow cannot silently select an external endpoint.
RF/JREAP/SIMPLE and authorized terminal drivers can be additional backends for
the opaque payload interface. They need actual interface documentation and an
available peer before any corresponding delivery claim can be made.

## HLA

The C++ host calls the standard IEEE 1516e API; it contains no mock RTI. OpenRTI
is pinned by commit in the build script. Upstream source is verified clean,
built into `.cache`, and dynamically linked. The shipped host supports up to 32
local sessions and bounds request/response size. Names and paths in its command
protocol are printable ASCII tokens without whitespace; native callback names
remain UTF-8. The Python driver serializes requests and enforces response timeout.

Service commands: connect, create, join, publish-interaction,
subscribe-interaction, send, publish-object, subscribe-object, reserve,
register, update, regulate, constrain, advance, evoke, resign, destroy,
disconnect. `send` and `update` carry one explicitly encoded value per service
call. Received callbacks expose class/object identity, handles, raw value bytes
and logical time. Receive order and timestamp order are separate service forms.

`advance` records a pending request; only `timeAdvanceGrant` updates the driver's
time. Missing callbacks fail by timeout. Default endpoint is `thread://`; TCP
endpoints must be selected explicitly. RTI errors are refusals, not successful
execution receipts. EOF cleanup resigns local members before destroying only
federations created by this host. A forced process kill cannot promise remote
cleanup; callers must handle expired federates according to their RTI policy.

The native host supports caller FOMs through standard handles and raw encodings.
The example FOM defines a MithrilEntity State attribute and MithrilEvent Payload
parameter using HLAopaqueData. RPR/Link 16 FOM translation, DDM, save/restore,
ownership transfer, retraction handling, multi-parameter atomic updates and
high-fidelity synchronization are future extensions, not tested capabilities.

## Verification and primary sources

Tests cover native byte custody, wrong roots/DTD/digest rejection, schema closure,
XSD 1.1 assertions, public C2SIM acceptance/rejection, loss reporting and guarded
edits; SISO layout vectors, padding/count mutations, independent OpenDIS parsing,
real UDP read-back; actual HLA object/event callbacks and time grants with
in-process OpenRTI. A TCP-server test is included and required on Linux CI; its
TCP test passed on Linux CI ([run](https://github.com/mithril-lang/fund.mithril.lib.ieee.hla/actions/runs/37773380233)); the handshake still timed out on the macOS host.

- [SISO-STD-002-2021](https://cdn.ymaws.com/www.sisostandards.org/resource/resmgr/standards_products/siso-std-002-2021_link_16.pdf):
  implementation reference, section 4.2 and tables 5, 7-9, 17. No RF specification was imported.
- [OpenRTI](https://github.com/onox/OpenRTI/tree/814a210978b7faafd65affbe70a2e25679921b23):
  pinned native API/runtime source. Preserve upstream license notices; source is not vendored into this repo.
- [OpenC2SIM schema](https://github.com/OpenC2SIM/OpenC2SIM.github.io/blob/ca1efa3cb23d35eef80f31d87ca189de44eb99fd/C2SIM_SMX_LOX_V1.0.1.xsd):
  public reference schema, fetched by exact commit and digest into ignored cache.
- [MSDL library](https://github.com/orbat-mapper/msdllib/tree/e9e7e7f8d483bc88798847eded086aaa8f60a857):
  native namespace and structural examples. Our relief fixture is independently written.
- [xmlschema resource controls](https://xmlschema.readthedocs.io/en/latest/features.html):
  offline resource access and XSD 1.1 validation.

No official DM2/C-BML/MIM schema bundle, external military terminal or operational
federation has been exercised. CI, local protocol read-back and external-system
acceptance remain separate evidence gates.
