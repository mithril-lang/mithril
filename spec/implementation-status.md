# Implementation status and adoption roadmap

| Capability | Publication 0.1 |
| --- | --- |
| Exact tuple/empty-graph round-trip | Implemented |
| Finite list/range, constants, integer ordinal, exceptions | Implemented |
| Segment term dictionary, Zstd/gzip, SHA-256, work budgets | Implemented |
| Fully verified handle, warm subject selection | Implemented in Node |
| Python source install, CLI and packaged evaluator | Implemented; requires Node |
| Arrow/Parquet lossless quad interchange | Implemented; materialized |
| Independently verified canonical RDF identity | Not provided by published SDK |
| Whole-dataset automatic `.mith+Zstd`/Parquet fallback | Proposed |
| Stable binary container, external blocks, trained Zstd dictionaries | Proposed |
| S3 range I/O, column/condition pushdown, streaming reader | Proposed |
| Iceberg pinned-snapshot connector, catalog CAS, deltas, leases, GC | Proposed |
| Independent Python/Rust/JVM decoder, Spark/Trino integration | Proposed |
| PyPI distribution and production readiness | Not released |

## Next acceptance gates

1. Validate the Quickstart and packaged wheel outside the source directory;
   invite engineers to run their own datasets and report complete costs.
2. Implement external segments and a bounded object-storage reader; measure
   actual cold-open/network performance, corruption and poisoned indexes.
3. Implement a pinned-snapshot Iceberg connector using an existing client;
   test snapshot expiration and Parquet materialization without implicit upgrades.
4. Build an independent decoder and compatibility corpus before a stable profile.
5. Work with initial users on ingestion, updates, export and recovery. Measure
   repeat use and workload benefit, not merely installs or synthetic compression.

## Measured scope

The earlier local experiment reconstructed 512,139 quads across six datasets
and verified canonical RDF round-trips through the existing local Mithril bridge.
Its regular 300,000-quad fixture used 29,859 bytes versus 192,975 bytes for the
best ordinary Mithril+Zstd baseline (84.5% smaller). The 12,000-quad CodeGraph
sample was about 49% larger. These are exploratory workload-specific results,
not a general Parquet advantage, a published SDK throughput guarantee or proof
of production lake I/O. Full bundle load/validation preceded warm queries.
See the published [measurement report](../docs/benchmarks/computable-datalake-20261009.md).
