# Arrow and Parquet interchange profile 0.1

Status: implemented experimental profile `mithril.arrow-quads/reference-v1`.
This is a Mithril projection using Arrow types, not a registered Arrow extension
or a zero-copy reader for compressed/model-generated data.

A table MUST have exactly these columns in order: `subject`, `predicate`,
`object`, `graph`. All are Arrow UTF-8 string type. Each cell MUST be non-null
and contain a JSON term as defined by the storage specification. The default
graph is the four-character string `null`, not an Arrow null. The fixed schema
remains present for an empty table.

Schema metadata MUST contain:

- `mithril.dataset.profile`: UTF-8 `mithril.arrow-quads/reference-v1`.
- `mithril.dataset.envelope`: UTF-8 JSON object with exactly `emptyGraphs`, the
  list of graph terms. Blank-node scope is the complete table and envelope.

Readers MUST check the schema, metadata, JSON values and RDF-term positions,
then normalize tuples and empty-graph metadata. Duplicate rows are set duplicates.
SDK Parquet export uses this schema and metadata with internal Zstd level 6.
An importer MUST reject missing envelope metadata rather than infer an empty
list. SQL/DataFrame transformations may discard schema metadata or change term
strings; their output is not automatically a lossless dataset export.

This is a generic lossless quad layout. It is not a domain-specific wide table;
performance comparisons MUST name the projection. A wide business projection
MUST separately describe datatype, lexical, blank-node and graph losses.
Stored canonical RDF claims are not propagated as verified identity by this SDK;
recompute identity after transformations when required.

The first SDK materializes tuples in Python and evaluates the reference profile
through Node. Arrow IPC/C Stream, filter/projection pushdown, native zero-copy
bindings and streaming conversion are future work, not implementation claims.

See [Arrow format](https://arrow.apache.org/docs/format/Columnar.html) and
[Parquet compression](https://parquet.apache.org/docs/file-format/data-pages/compression/).
