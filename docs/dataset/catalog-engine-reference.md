# Data lake formats, catalogs and engines: an engineering comparison

Scope: Mithril Dataset publication 0.1, source-checked on 2026-10-11.
This is an advisory guide, not a conformance specification or a performance
ranking. External `latest`/`current` documentation links may change; pin exact
versions and enabled features before validating a deployment. No catalog or
distributed-engine integration was executed for this comparison.

Read [the introductory article](comparison.md) for the architecture and
[implementation status](../../spec/implementation-status.md) for release boundaries.

## Representations and table formats

| Technology | Main responsibility | Relevant behavior | Relationship to Mithril |
| --- | --- | --- | --- |
| [Parquet](https://parquet.apache.org/docs/overview/) | Columnar data files | Column-oriented storage and encodings; no table commit service by itself | Implemented materialized export/import using the Mithril quad profile |
| [Arrow](https://arrow.apache.org/docs/format/Columnar.html) | Columnar memory and interchange | Typed arrays and serialization/transport contracts | Implemented UTF-8 quad table; no compressed-model zero-copy reader |
| [Iceberg](https://iceberg.apache.org/spec/) | Versioned analytic tables | Snapshots, manifests, schema and partition evolution over data files | Proposed pinned-snapshot sidecar and materialized output; no connector |
| [Delta Lake](https://github.com/delta-io/delta/blob/master/PROTOCOL.md) | Transactional table protocol | Versioned transaction log, snapshots and feature-dependent reader/writer requirements | No Delta adapter; a Parquet export alone is not a Delta table |
| [Hudi](https://hudi.apache.org/docs/overview/) | Mutable lake tables and ingestion | Updates and incremental processing; [Copy-on-Write/Merge-on-Read](https://hudi.apache.org/docs/table_types/) tradeoffs | No Hudi adapter; a Parquet export alone is not a Hudi table |
| [Mithril Dataset](../../spec/v0.1/specification.md) | Finite RDF-term storage representation | Model/literal segments, exact exceptions, Zstd/gzip and checked digests | Experimental reference SDK; transaction/catalog/remote-reader features proposed |

Use Parquet for a file requirement and a table format for a committed table
requirement. Evaluate table formats using your update pattern, retention policy
and verified engine support. Mithril's current comparison axis is representation
and semantic preservation, not production transactional parity.

### Compression and indexes

| Mechanism | Mithril 0.1 | Operational implication |
| --- | --- | --- |
| Structural compression | Finite model operations and exact exceptions | Benefit depends on regularity; irregular data can be larger |
| Byte compression | Independent Zstd or gzip stream per inline segment | Count base64, manifests and hashes in stored bytes |
| Term dictionary | Implemented per literal segment | Distinct from a trained codec dictionary |
| Subject pruning | Verified Node handle selects segments; Python revalidates per call | Warm selection is not a cold remote query |
| Remote or general query index | S3 range reads and condition/column pushdown proposed | No demonstrated network-byte reduction or general SPARQL index |
| Automatic whole-dataset fallback | Proposed | Current segment selection can still lose to whole-source Zstd |

Parquet encodings and internal codecs are separate choices from table metadata
and engine query planning. Do not wrap a whole Parquet file in external Zstd
and assume ordinary Parquet readers retain their seek behavior. The SDK uses
Parquet's internal Zstd level 6.
[Codec documentation](https://parquet.apache.org/docs/file-format/data-pages/compression/).

## Catalogs: identify the authority you need

“Catalog” can mean a table lookup/commit API, a governed asset service, a discovery
index, or an engine's named connector configuration. These roles can coexist.
The entries below compare responsibilities, not equivalent feature packages.

| System | Role and documented focus | Integration consideration | Mithril support |
| --- | --- | --- | --- |
| [Iceberg REST Catalog API](https://iceberg.apache.org/rest-catalog-spec/) | Protocol for table metadata and catalog operations | Select an implementation, authentication and supported API features | Proposed integration target; no client |
| [Apache Polaris](https://polaris.apache.org/) | Open Iceberg catalog implementing the REST API | Candidate when a shared Iceberg catalog is required; validate engine and access configuration | No tested connector |
| [Project Nessie](https://projectnessie.org/) | Transactional catalog with branches, tags and commits | Pin catalog reference/hash as well as table snapshot; distinguish catalog versions from table versions | No tested connector |
| [AWS Glue Data Catalog](https://docs.aws.amazon.com/glue/latest/dg/catalog-and-crawler.html) | Managed metadata catalog integrated with AWS analytics and Lake Formation | Evaluate AWS identity, storage permissions and the exact table/client integration | No tested connector |
| [Databricks Unity Catalog](https://docs.databricks.com/aws/en/data-governance/unity-catalog) | Governed data and AI assets, access control, lineage and auditing | This row describes Databricks; the open-source implementation has a separate capability boundary | No tested connector |
| [Hive metastore through an Iceberg connector](https://trino.io/docs/current/object-storage/metastores.html) | Table/metastore integration option | Confirm the table format and client commit protocol, rather than relying on a table name alone | No tested connector |
| [DataHub OSS](https://github.com/datahub-project/datahub) | Discovery, metadata graph, lineage and governance context | For this design, ingest descriptive metadata while the table system retains commit authority | No metadata ingestion connector |
| Mithril lake authority | Proposed immutable dependency closure and catalog-head compare-and-swap | Needs concurrency, leases, garbage collection and recovery tests | Not implemented |

Nessie catalog branching should not be conflated with branching one Iceberg
table. A discovery graph should not be assumed to perform that table's commits.
Trino's `catalog` configuration identifies a connector; the connector can then
use an external metastore/catalog. These distinctions determine which service
must enforce a proposed Mithril integration's consistency rules.
[Trino Iceberg connector](https://trino.io/docs/current/connector/iceberg.html).

## Engines: query the representation they actually understand

| Engine | Documented execution focus | Path from Mithril today | Unimplemented boundary |
| --- | --- | --- | --- |
| [DuckDB](https://duckdb.org/docs/current/data/parquet/overview) | SQL over Parquet with projection/filter pushdown | SDK export followed by local Parquet query; repository example available | No native model-segment SQL scan; exported pushdown does not imply bundle pushdown |
| [Spark](https://spark.apache.org/docs/latest/streaming/index.html) | Distributed processing with Structured Streaming over Spark SQL | Materialize ordinary data, then use a configured standard ingestion path | No Mithril DataSource or distributed model evaluator |
| [Trino](https://trino.io/docs/current/connector/iceberg.html) | SQL through an Iceberg connector, supported files and catalogs | Commit materialized data using an existing lake writer, then query the table | No Mithril connector; no direct bundle reader |
| [Flink](https://nightlies.apache.org/flink/flink-docs-stable/docs/concepts/overview/) | Stateful stream/batch processing, Table API and SQL | A separately implemented pipeline could supply ordinary records | No Mithril source/sink, streaming decoder or tested checkpoint integration |
| Mithril reference runtime | Profile validation, reconstruction and subject selection | Node evaluator; Python SDK delegates to Node | No distributed SQL optimizer or general SPARQL endpoint in this SDK |

The existing DuckDB demo uses version 1.4.1. Other rows describe architectural
paths, not verified adapters. Engine support for a table format varies with the
connector version and table features; check reads and writes separately. No
relative throughput or latency claim is made here.

## Integration recipes and maturity

### 1. Local RDF-to-Parquet pilot: available now

Install the source SDK and follow [Quickstart](quickstart.md). Use `pack`/`unpack`
to check the bundle, `to_parquet`/`from_parquet` to check the term-preserving
projection, then run `examples/dataset/query.py` for SQL. Node.js 24+ is required;
Python delegates to its evaluator. This is not an independent Python decoder.

The four string columns are `subject`, `predicate`, `object`, `graph`. The default
graph cell is the JSON string `null`, not SQL NULL. Preserve schema metadata
`mithril.dataset.profile` and `mithril.dataset.envelope` for lossless import.
Generic SQL output may discard it. See the
[Arrow/Parquet contract](../../spec/v0.1/arrow.md).

### 2. Existing Iceberg with a semantic sidecar: proposed

Keep the existing catalog and Iceberg client authoritative. Pin catalog/table
identity, table UUID, metadata location, snapshot ID, schema, partition spec,
projection and model dependencies. For a versioned catalog, pin its reference
and commit too. Define row-to-RDF mapping and preserve source identifiers.

Store a versioned sidecar separately; its shape is not standardized by the
published SDK. Materialize output to supported files and commit with an existing
Iceberg writer. Missing or expired inputs must fail rather than silently read
`latest`. Treat output commits as separate transactions; the proposed contract
does not provide atomicity across tables, sidecars or catalogs.
[Lake contract](../../spec/v0.1/lake.md).

### 3. Mithril-owned lake snapshots: future design

Upload and verify immutable dependencies before publishing a head through
compare-and-swap. Define reader leases, garbage collection, compaction, update
ordering and corruption behavior before deployment. A digest detects changed
bytes; it is not authentication, authorization or a verified RDF canonicalization
receipt. None of these future operations is an SDK catalog service today.

## Evaluation worksheet

Record the workload and acceptance thresholds before running a pilot. Use the
same input snapshot and distinguish a lossless quad projection from a typed
business projection. The existing
[benchmark report](../benchmarks/computable-datalake-20261009.md) is historical
evidence, not a catalog/engine benchmark suite shipped with this guide.

| Dimension | Record or exercise | Acceptance evidence |
| --- | --- | --- |
| Environment | Hardware, runtime/SDK/engine versions, codec levels, concurrency, dataset digest and projection | Reproducible run manifest |
| Correctness | Lexical literals, languages, blank-node scope, named/default graphs, empty-graph metadata, duplicate normalization | Exact normalized envelope round-trip; separately pinned canonicalization if required |
| Capacity | Source + Zstd; models on/off; quad Parquet + Zstd; typed projection separately | Total bytes including manifests, dictionaries, indexes, sidecars and retained dependencies |
| Read cost | Cold open, warm subject lookup, filters, full scans, conversion | Repeated p50/p95, CPU and per-process memory; state cache/warmup conditions |
| Object storage | Request counts, transferred bytes, corrupted/truncated objects, stale indexes | Actual remote reader evidence; mark Mithril 0.1 unsupported |
| Transactions | Conflicting writers, retries, partial upload, expiration, reader retention, compaction | Exact-version integration tests; mark Mithril catalog unsupported |
| Security | Catalog denial, storage denial, credential handling, untrusted payload budgets | Existing platform policies plus bounded decode; no credentials in sidecars |
| Economics | Storage, retained history, egress, compute, maintenance | Measured workload cost; no generic winner |

Choose Mithril for a bounded experiment when exact RDF-term reconstruction or
regular model structure matters. Choose an established lake stack for current
production transaction and distributed execution requirements. Proceed to a
Mithril lake connector pilot only after its missing acceptance gates are met.
