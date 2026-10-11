# Where Mithril Dataset fits in a modern data lake

An engineering introduction, checked on 2026-10-11 against Mithril Dataset
publication 0.1 and the primary sources linked below. This article is explanatory;
the [versioned specification](../../spec/v0.1/specification.md) is authoritative.

Mithril Dataset offers an experimental way to preserve RDF terms and store
repeated, finite structure as models plus exact exceptions. Engineers can use
its reference SDK to reconstruct a dataset and export Arrow or Parquet. The
practical adoption path is to evaluate that representation alongside an existing
lake, while keeping established catalogs and engines responsible for production
transactions and queries.

## Start by separating the layers

“Data lake format” can describe several different responsibilities. Comparing
products across these boundaries creates misleading feature checklists.

| Layer | Question it answers | Examples | Mithril Dataset 0.1 |
| --- | --- | --- | --- |
| Logical meaning | What do these entities, terms and graphs mean? | RDF vocabulary, application ontology | Preserves admitted RDF terms and explicit graph metadata |
| Stored representation | How are values encoded? | Parquet; Mithril model/literal segments | JSON bundle with compressed inline segment payloads |
| In-memory interchange | How do libraries exchange columns? | Arrow | Materialized four-column Arrow projection |
| Table state | Which files belong to a committed table version? | Iceberg, Delta Lake, Hudi | Proposed lake contract; no released transaction layer |
| Catalog and governance | Where is a table, and who can use it? | Polaris, Nessie, Glue, Unity Catalog | No implemented catalog connector or permission service |
| Execution | Who plans and runs the query? | Spark, Trino, Flink, DuckDB | Reference evaluator and subject selection; SQL uses exported data |
| Discovery | How do people find assets and their context? | DataHub | Possible future metadata mapping; no connector |

Parquet defines columnar files, while Arrow defines columnar memory and transport
representations. Neither specification alone supplies a lake transaction service.
Iceberg adds table metadata and snapshots around data files. Its REST catalog
API is a protocol for catalog operations, rather than a query engine.
Sources: [Parquet overview](https://parquet.apache.org/docs/overview/),
[Arrow format](https://arrow.apache.org/docs/format/Columnar.html),
[Iceberg table spec](https://iceberg.apache.org/spec/) and
[REST catalog spec](https://iceberg.apache.org/rest-catalog-spec/).

The [engineering reference](catalog-engine-reference.md) compares individual
formats, catalogs and engines and provides a workload evaluation plan.

## What model compression contributes

Suppose a dataset contains many numbered devices, the same type assertion for
each device, and a predictable ordinal value. A finite range and a value rule
can represent that repeated structure. Explicit exceptions retain the records
that differ. The decoder reconstructs the exact admitted tuples instead of
approximating their values.

The published profile admits finite lists/ranges, constants, integer ordinals,
term dictionaries and exceptions. It is a bounded storage model, not arbitrary
Jsonnet execution. Packing does not run arbitrary Mithril application source,
access remote services or infer new RDF facts. Ontology reasoning and source
parsing belong to separate Mithril components. See the
[storage profile](../../spec/v0.1/specification.md).

Zstd then compresses each model or literal payload. Structure reduction and byte
compression serve different purposes: the model avoids spelling every repeated
tuple; Zstd compresses the remaining bytes. Parquet also supports internal Zstd
compression. Compare `Mithril model + Zstd` with a clearly specified
`Parquet layout + Zstd`, including metadata, rather than comparing a compressed
artifact with an uncompressed export.
[Parquet compression reference](https://parquet.apache.org/docs/file-format/data-pages/compression/).

Mithril term dictionaries are not trained Zstd dictionaries. External trained
Zstd dictionaries and a stable binary Mithril container remain proposed.
The current `.mithbundle.json` profile includes base64 and manifest overhead.

## What the existing measurements show

The [2026-10-09 local experiment](../benchmarks/computable-datalake-20261009.md)
demonstrated workload dependence:

| Workload | Quads | Whole-source Mithril + Zstd | Selected segments | Observation |
| --- | ---: | ---: | ---: | --- |
| Regular generated entities | 300,000 | 188.45 KiB | 29.16 KiB | 84.5% smaller |
| Irregular observations | 80,000 | 878.06 KiB | 1,022.27 KiB | 16.4% larger |
| CodeGraph sample | 12,000 | 94.57 KiB | 140.85 KiB | 48.9% larger |

These are historical measurements of the experimental harness, not new results
from the published SDK. The report also contains Parquet baselines using a
lossless RDF string-term quad layout. Those numbers do not predict the size or
query speed of a typed, wide business table.

For the regular 300,000-quad fixture, initial validated open took about 8.36
seconds; subsequent warm subject lookup had a 0.082 ms median. The complete JSON
bundle had already been loaded and validated. No network I/O was measured.
Python `query_subject` starts validation on each call and does not retain that
warm Node handle. These results establish neither remote partial-read latency
nor superiority over Spark, Trino or another lake engine.

## The first integration is materialization

Today an engineer can run the
[Quickstart](quickstart.md), pack a dataset with Zstd, reconstruct it, export
Parquet and query that file with DuckDB. The exported columns contain JSON RDF
term strings. The Arrow/Parquet profile carries envelope metadata for empty
graphs, which a generic SQL transformation may discard.

This gives two deliberately different outputs: a term-preserving interchange
artifact and an application-specific analytical view. A business view can decode
values into typed columns for convenient SQL, but must document its treatment of
literal spelling, blank nodes, graph identity and empty graphs. Such a view is
not automatically a lossless round-trip artifact. See the
[interchange contract](../../spec/v0.1/arrow.md).

For an existing lake, the next proposed path is:

```text
Existing catalog -> pinned Iceberg snapshot -> existing Iceberg client
                                               |
                                    Mithril semantic/model sidecar
                                               |
                                     materialized Parquet output
                                               |
                              existing writer -> Iceberg -> SQL engines
```

This is a design, not an available connector. Iceberg stays responsible for table
commits. A separate versioned sidecar would record ontology/model dependencies,
the exact source snapshot and projection. Exported data would be committed by
an ordinary Iceberg writer; placing Parquet files in a bucket alone does not
create an Iceberg table. Generic readers cannot execute Mithril model segments
because a catalog names them. The
[proposed lake contract](../../spec/v0.1/lake.md) defines this boundary.

## Ontology complements catalog context

A governed catalog can already contain schema, ownership, lineage and business
definitions. Databricks Unity Catalog provides governance of data and AI assets;
DataHub provides metadata discovery and context. Mithril should not claim that
these systems lack semantics.
Sources: [Unity Catalog](https://docs.databricks.com/aws/en/data-governance/unity-catalog)
and [DataHub](https://github.com/datahub-project/datahub).

Mithril's narrower contribution is an explicit term-preserving dataset and a
finite, reconstructible storage representation. A future mapping could connect
catalog assets to vocabulary IRIs and versioned model dependencies. That mapping
would still need identity rules, synchronization and authorization tests.
An ontology assertion in a bundle does not grant permission to read its source
objects or prove that a constraint has been enforced.

## Choose a bounded pilot

Choose representative RDF data where lexical identity or graph boundaries matter
and where repeated structure might repay model evaluation. Keep the existing
lake as the source of truth, retain a conventional compressed baseline and
measure total storage, conversion time, cold-open cost and memory.

For an immediate production requirement involving concurrent lake writers,
streaming ingestion, native distributed SQL or remote range reads, use a tested
table format/catalog/engine combination. Mithril 0.1 is an experimental adjunct
for evaluating semantic preservation and storage models. Its next adoption
gates are bounded object-storage reads, a pinned-snapshot connector and an
independent decoder, as listed in the
[implementation roadmap](../../spec/implementation-status.md).
