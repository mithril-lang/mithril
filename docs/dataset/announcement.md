# Introducing Mithril Dataset specification 0.1

Mithril Dataset 0.1 is now available as a public draft specification with a
reference implementation, conformance vectors and a Python Quickstart.
It preserves RDF term spelling, named/default graphs and explicit empty-graph
metadata while allowing finite computable models plus exact exceptions.
Segment payloads use Zstd or gzip, with integrity and evaluation limits.

Engineers can install the SDK from source, try their own quad datasets and
export lossless Arrow/Parquet tables for existing analysis workflows.
No new Mithril source syntax is needed to try the JSON tuple entry point.
The specification separates format profiles, library API versions and proposed
lake capabilities so adopters can see exactly what is available.

Compression benefit depends on the workload. The earlier local experiment's
regular 300,000-quad fixture was 84.5% smaller than its best ordinary Mithril+Zstd
baseline; its CodeGraph sample was about 49% larger. The SDK currently materializes
full datasets and calls a packaged Node evaluator. S3 partial reads, a stable
binary format, an independent decoder and Iceberg catalog integration are future
work. This is an experimental project specification, not a production lake
release or an Apache standard.

Start with the [Quickstart](quickstart.md), read the
[specification](../../spec/v0.1/specification.md), and consult the
[status and roadmap](../../spec/implementation-status.md).
We welcome reproducible workload reports, compatibility reviews and independent
reader implementations through [issues](https://github.com/mithril-lang/mithril/issues)
and pull requests. Report file size including metadata, cold-open and query
latency, peak memory and reconstruction correctness; do not submit private data.
