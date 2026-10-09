# Specification ownership, versioning and contribution policy

Mithril Dataset is maintained by the Mithril project in this public repository,
under its Apache-2.0 license. This publication creates no independent standards
body and claims no endorsement from Apache Arrow or Apache Iceberg.

## Identifiers and compatibility

- Specification publication: `0.1` draft; editorial corrections can be published
  with a recorded changelog. Historical revision is identified by Git commit.
- Storage profile: `mithril.computable-segments/reference-v1`; its semantics are
  frozen when published. Incompatible fields/meaning require a new profile ID.
- Interchange profile: `mithril.arrow-quads/reference-v1`.
- Python SDK: `0.1.0`; SDK API versions are independent from stored format IDs.

Unsupported formats/features MUST cause explicit refusal. Recompression may
change physical identity without changing tuple identity. Current stored files
remain test fixtures for subsequent libraries. Pre-1.0 SDK APIs may change;
there is no promise of a production-stable future binary ABI yet.

## Change process

1. Open a public issue describing the problem, affected profiles and user impact.
2. Submit a PR with normative text, implementation status, migration/compatibility
   analysis and new positive/negative vectors. Implementation alone is not a
   specification change; a document alone is not implemented capability.
3. Maintainers review correctness, interoperability, security/resource bounds
   and benchmark evidence. Existing valid vectors must keep working unchanged.
4. Merge after checks; update changelog and publish the immutable revision.

Use public repository issues for non-sensitive defects and RFCs. Follow the
repository security reporting policy, if present, for sensitive reports;
do not put private datasets, access credentials or personal evidence in issues.

## Stable 1.0 gates

A stable profile requires two independently implemented readers passing the same
cross-language corpus; fully specified canonical byte encoding; backwards
compatibility/migration tests; corruption and expansion-budget tests; and
representative independent workload measurements. Stable lake claims additionally
require object-storage range I/O and catalog/crash/retention conformance.

The current Python SDK wraps the Node evaluator and does **not** count as an
independent second reader. Dates or download counts do not satisfy these gates.

## Changelog

- 0.1 / 2026-10-09: draft reference storage specification; JSON Schema; vectors;
  Python SDK with Arrow and Parquet interchange; proposed lake/Iceberg contract;
  public Quickstart, announcement, status and staged roadmap.
