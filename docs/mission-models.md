# Mission model integration v1

Mithril can compile normalized architecture, scenario, order, information,
workflow, decision and form records into one validated typed model. The module
is `mithril.mission`; the standalone entry point is `bin/mithril-mission.cljk`.
The example is `examples/mission/relief.mith`, a fictional disaster relief model.

## Support boundary

This is **Mithril normalized-record support**, not conformance to a DoD, NATO,
SISO, OMG or MIP wire specification. A producer must explicitly normalize its
source data before import. `catalog` reports this distinction mechanically.
`version` is retained as producer-supplied provenance, not verified against an
official schema. No source document is fetched or executed.

| Family | Implemented | Not implemented |
| --- | --- | --- |
| DoDAF/DM2 | Organization, Resource, Activity, Capability, Rule, State, Transition, InformationFlow mappings | PES XML/XSD import or export, complete DM2 metamodel, OV view rendering |
| C-BML | Actor, Location, Goal, Order, Report, Event mappings | Native XML, full command semantics, order dispatch |
| MSDL | Unit, Equipment, Location, Environment, InitialState mappings | Native XML, terrain ingestion, simulation initialization |
| C2SIM | Entity, Task, Report, Event mappings | Complete C2SIM command semantics |
| JC3IEDM/MIM | Objects, actions, status, associations, observations; MIM capability and goal mappings | Complete metamodel, native exchanges, terminology equivalence proofs |
| BPMN/DMN/Forms | Normalized records referencing the same entities, decisions, constraints and observations | New BPMN token or DMN/FEEL engine, form rendering |
| MIL-STD-2525, Link 16, VMF, USMTF, HLA/FOM, NITF/NSIF, STANAG 4607/4609 | Capability catalog entries with `metadata-only` support | Symbol rendering, message decoding, containers, sensor streams, RTI/time synchronization |

The existing `mithril.bpmn` executor retains its own token semantics. Importing
a `bpmn` record here does not call that executor. The same distinction applies
to DMN rule evaluation and simulation time. Unsupported standard/type pairs
are rejected rather than silently interpreted as generic tasks.

The table describes the pure language module. Native XML, DIS Link 16 simulation
transport and real HLA RTI services are implemented separately in the sibling
[`fund.mithril.interop` repository](https://github.com/mithril-lang/fund.mithril.interop), with the
`mithril.mission-native` host adapter. Its support does not change the pure core's
`metadata-only` wire catalog entries. XML projections still pass typed model
admission. Native byte custody, pinned XSD validation and guarded edits are
available; the public C2SIM schema has acceptance/rejection tests. MSDL parsing
and projection are exercised without a full official XSD-conformance claim.
Other domain schemas require explicit, versioned bundles and mapping profiles.

Link 16 implements the SISO 2021 DIS/UDP simulation subset (TSA 0, MTI 0, opaque
75-bit words), not RF terminals or tactical J-series field semantics. HLA uses
actual OpenRTI IEEE 1516e services: two federates exchange object attributes and
timestamped interactions and receive time grants. In-process RTI is verified;
TCP RTI passed Linux CI; its handshake timed out on the local macOS host.

## Source contract

A `.mith` file uses Mithril's JSON source syntax:

```json
{
  "@type": "MissionModel",
  "@id": "urn:example:model",
  "records": [{
    "@id": "urn:example:team",
    "standard": "msdl",
    "version": "producer-profile-v1",
    "document": "urn:example:source",
    "record": "unit-1",
    "type": "Unit",
    "payload": {"name": "Relief team"},
    "refs": {}
  }]
}
```

`standard` and `type` are exact, case-sensitive names in `mission/profiles`.
These names are Mithril profile labels, not claimed XML element names. Each
record needs an absolute IRI identity, nonblank source version/document/record,
a JSON data object `payload`, and typed `refs`. An optional `label` is allowed.
Payload supports strings, integers, booleans, null, arrays and string-keyed
objects. Preserve source fractional values as strings in this v1 profile.

The eleven IR types are Entity, Relation, Capability, Goal, Task, Constraint,
Decision, State, Transition, Observation and Event. All identities are unique
within the combined model. References may point forward in the same document;
absent targets and targets with the wrong type fail admission.

| IR type | Allowed reference roles | Required roles |
| --- | --- | --- |
| Entity | initialState | none |
| Relation | subject, object | subject, object |
| Capability, Goal | entity, constraints | none |
| Task | actor, location, goal, capability, constraints, dependsOn | Order requires actor, location, goal |
| Constraint, State, Event | entity | State requires entity |
| Decision | dependsOn, constraints | none |
| Transition | entity, from, to, trigger, constraints | entity, from, to, trigger |
| Observation | entity, actor, location | none |

`constraints` and `dependsOn` are arrays of unique target IDs. Other roles are
single IDs. Entity/actor/location refer to Entity nodes, goal to Goal,
capability to Capability, trigger to Event, and from/to/initialState to State.
Constraints target Constraint; dependencies target Task, Decision or Entity.
Relations may connect any admitted node types. Initial and transition states
must belong to the referenced entity. Unknown fields and reference roles fail.

An Order's `payload` keeps what/when/why and any other source attributes intact;
v1 validates graph structure, not their command-language meaning.

## Commands and API

Using the mission SCI runner (Node and nbb 1.5.212):

```sh
node scripts/run-mission-sci.mjs bin/mithril-mission.cljk catalog
node scripts/run-mission-sci.mjs bin/mithril-mission.cljk validate examples/mission/relief.mith
node scripts/run-mission-sci.mjs bin/mithril-mission.cljk compile examples/mission/relief.mith
node scripts/run-mission-sci.mjs bin/mithril-mission.cljk rdf examples/mission/relief.mith
node scripts/run-mission-sci.mjs bin/mithril-mission.cljk export examples/mission/relief.mith
node scripts/run-mission-sci.mjs test/run_mission.cljk
```

After installing and building the sibling adapter as described in its README:

```sh
node scripts/run-mission-sci.mjs bin/mithril-interop.cljk \
  "$PWD/../mithril-interop/.venv/bin/python" ../mithril-interop \
  ../mithril-interop/examples/requests/link16-loopback.json
MITHRIL_INTEROP_PYTHON="$PWD/../mithril-interop/.venv/bin/python" \
  node scripts/run-mission-sci.mjs test/run_mission_native.cljk
```

The Python executable is absolute because the host runs in the adapter
checkout. `examples/requests/hla-exercise.json` exercises the real RTI through the
same entry point. Host requests select an explicit runtime and checkout;
network send/receive requires a caller-supplied peer allowlist.

`compile` outputs an artifact with format
`https://mithril.fund/artifact/mission-ir-v1`; every node retains its source type,
provenance, payload, references and label. All file commands accept either a
source document or a compiled artifact. `export` reconstructs the normalized
source document exactly. This does not reconstruct a native XML file.

`compile-document`, `validate`, `export-document`, `compose`, `initial-state`,
`step` and `rdf-document` are library functions. `compose` combines validated,
self-contained artifacts and refuses identity collisions. For cross-source
references, combine the input records first and call `compile-document` once.

```clojure
(let [artifact (mission/compile-document doc)
      state (mission/initial-state artifact)]
  (mission/step artifact state "urn:relief:transition" "urn:relief:event"
                {"urn:relief:consent" true}))
```

`step` implements only the explicit Mithril IR state-transition rule. It checks
the current state, event identity and exactly the required constraint results.
Every constraint result must be literal `true`; absent, extra, false or string
values fail. It returns a new state and a source-linked receipt with
`effects: false`. The caller's constraint results are assertions, not proofs of
DMN evaluation or evidence that the real-world event happened. Dependency edges
are representational and are not scheduled or checked by `step`.

`rdf-document` emits a local JSON-LD context, class IRIs and typed reference
edges for existing reasoning tools. Source, payload and the original references
remain lossless EDN text literals (`sourceEDN`, `payloadEDN`, `refsEDN`), because
the pinned JSON-LD implementation rejects `@json`. It does not load a remote context, assert native ontology
equivalence, or perform OWL/SHACL inference itself.

## Specification evidence

Reviewed on 2026-10-08:

- [DoD DM2](https://dodcio.defense.gov/Library/DoD-Architecture-Framework/dodaf20_dm2/)
  distinguishes the conceptual/logical model from the physical exchange schema.
- [DoD PES](https://dodcio.defense.gov/Library/DoD-Architecture-Framework/dodaf20_pes/)
  lists XSD downloads with CAC access requirements. No schema was imported here.
- [SISO C2SIM standard](https://cdn.ymaws.com/www.sisostandards.org/resource/resmgr/standards_products/siso-std-019-2020_c2sim.pdf)
  describes MSDL and C-BML and their consolidation in C2SIM. This implementation
  implements normalized C2SIM mappings. The separate native adapter validates
  its command fixture against a pinned public OpenC2SIM reference schema; this
  does not establish full C2SIM interoperability or command execution.
- [MIM access statement](https://www.mimworld.org/portal/projects/welcome/wiki/export.pdf)
  describes availability by request. No complete MIM model was imported here.

Native adapters require an identified schema/version, permitted access,
conformance fixtures, loss reporting and source-specific semantic validation.
They must be reported separately from this normalized integration.

Published plugins use reverse-DNS repository and plugin IDs. See the [plugin installation contract](https://github.com/mithril-lang/fund.mithril.interop/blob/main/docs/plugins.md) for independently installable XML, Link16, HLA, C2SIM and MSDL adapters. The generic and profile-specific projection operations all undergo typed admission in this bridge.
