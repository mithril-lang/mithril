# Data lake and Iceberg integration contract 0.1

Status: **proposed; no catalog connector is implemented in this release**.
This contract guides implementation and prevents accidental interoperability
claims. It is not an Iceberg table specification amendment.

## Existing Iceberg as authority

An integration MUST pin an exact catalog/table identity, table UUID, metadata
location and snapshot ID. It MUST record the selected schema, partition spec,
projection and model dependencies. Mutable table names or `latest` alone cannot
identify reproducible input. Expired snapshots and missing source objects MUST
produce an explicit refusal; they MUST NOT silently read a newer snapshot.
Credential values MUST NOT be embedded in the exported metadata.

The initial connector SHOULD use an existing Iceberg client and REST catalog,
read a pinned snapshot and attach Mithril ontology/constraint/model references
in a separate versioned envelope. Materialized output MUST be ordinary supported
Iceberg data files, such as Parquet. A generic Spark/Trino reader cannot evaluate
reference-v1 model segments merely because they are named in lake metadata.

## Mithril as authority (future)

A snapshot publishes an immutable dependency closure: schemas, admitted models,
inputs, parameters, exceptions, segment objects, index objects and dictionary
objects. Object byte hashes and logical identity MUST be distinct. Upload
and verify dependencies before compare-and-swap of the catalog head. An
uncommitted upload is not a visible snapshot. Readers retain a snapshot/read
lease; garbage collection MUST preserve reachable objects and active readers.

Partition evolution, delta ordering, assertion/derivation boundaries, index
false-negative prevention, compaction, crash recovery and retention require
specified behavior and executable tests before a stable lake profile release.
No binary magic bytes, external-block ABI or cross-catalog atomic transaction
is standardized by publication 0.1.

## Physical I/O acceptance gates

A production reader MUST demonstrate bounded cold-open cost, actual byte-range
reads, column/condition selection and integrity checks with object storage.
Benchmark request counts, transferred bytes, p50/p95 latency, working memory,
full scans, updates and compaction on representative workloads. Warm in-memory
segment selection is insufficient evidence for these gates.

Sources: [Iceberg table specification](https://iceberg.apache.org/spec/) and
[REST catalog specification](https://iceberg.apache.org/rest-catalog-spec/).
