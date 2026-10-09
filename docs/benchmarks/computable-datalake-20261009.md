> Historical local experiment, 2026-10-09. The local source-parser bridge and
> benchmark harness described here are not part of the published Python SDK.
> Reproduction of that original experiment requires those experimental sources;
> published SDK conformance/Quickstart checks are independently runnable.

# Computable Mithril storage measurements (2026-10-09)

Local reference implementation. Measured at 2026-10-09T06:31:32.650Z; v26.7.0, Apple M4, darwin/arm64; PyArrow 25.0.1.

## Capacity

All capacities are KiB (1,024 bytes). Zstd level 6. The Mithril baseline uses the smaller compressed result of the source serializer and existing native RDF Form writer. Selected segments include the JSON manifest, integrity hashes and base64 payload overhead. Parquet is a lossless **RDF string-term quad table**, including an empty-graph sidecar, not a domain-specific wide table. Positive reduction means smaller than whole-source Mithril+Zstd; negative means larger.

| Dataset | Quads | Mithril+Zstd KiB | Parquet KiB | Selected segments KiB | Reduction vs Mithril+Zstd | Model/literal segments |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| regular-20000 | 60,000 | 37.47 | 131.78 | 6.17 | 83.5% | 10/0 |
| regular-100000 | 300,000 | 188.45 | 657.42 | 29.16 | 84.5% | 49/0 |
| exceptions-20000 | 60,000 | 55.78 | 133.37 | 9.91 | 82.2% | 10/0 |
| observations-20000 | 80,000 | 878.06 | 904.24 | 1022.27 | -16.4% | 10/0 |
| mithril-datalake-codegraph | 12,000 | 94.57 | 113.93 | 140.85 | -48.9% | 0/1 |
| mithril-datalake-ontology | 139 | 0.80 | 2.84 | 1.80 | -124.5% | 0/1 |

Regular fixtures have three quads per entity. Exceptions alter the tenant of every 53rd entity. Observations add one explicitly stored 256-bit value per entity. The CodeGraph fixture takes the first 12,000 parsed quads from a local asserted RDF snapshot containing 149385 quads; it is a sample, not a whole-repository storage result. The ontology fixture is the actual codegraph-v1 ontology.

## Time

Milliseconds. Encode/decode/open are single measurements. Subject lookup uses a validated, warm in-memory handle; p50/p95 use 25 samples after one warmup. Full scan is a warm scan of already decoded tuples. No network IO was measured. CPU contention and JS allocation/GC affect these numbers; do not treat them as service latency guarantees.

| Dataset | Encode candidates | Full decode+verify | Initial validated open | Warm subject p50 / p95 | Warm full-scan p50 |
| --- | ---: | ---: | ---: | ---: | ---: |
| regular-20000 | 2300.963 | 510.146 | 456.309 | 0.083 / 0.237 | 30.188 |
| regular-100000 | 11257.476 | 9881.362 | 8361.626 | 0.082 / 0.165 | 248.500 |
| exceptions-20000 | 3038.264 | 1111.506 | 888.470 | 0.393 / 2.660 | 51.966 |
| observations-20000 | 13375.083 | 1562.858 | 1997.732 | 4.195 / 8.496 | 56.104 |
| mithril-datalake-codegraph | 529.848 | 102.179 | 102.119 | 4.068 / 7.373 | 8.892 |
| mithril-datalake-ontology | 6.552 | 0.667 | 2.091 | 0.074 / 0.127 | 0.038 |

The complete bundle is loaded and verified before the handle opens. Subject pruning then decompresses only selected segment payloads, but the present JSON bundle is already in memory. Payload-byte counters indicate a possible external-block access pattern, not actual disk/network bytes saved. The Node benchmark process cumulative peak RSS was 1317.3 MiB; Python and RDF canonicalization memory are excluded.

## Verification and conclusion

All 6 datasets passed exact tuple reconstruction and canonical RDF hash equality through the existing Mithril source reader and writer. The stored canonical receipt preserves the graph identity; the JS tuple digest is a separate, label-sensitive check. Parquet round trips preserve all four encoded term columns and the empty-graph sidecar.

Finite model compression substantially reduces regular generated data. Irregular observation values remain literal payloads. The actual CodeGraph sample selects literal dictionary segments and is larger than whole-source Zstd; the small ontology also pays disproportionate manifest overhead. The current selector chooses between model and literal segments only. Whole-file Zstd or Parquet fallback remains a future dataset-level policy.

This experiment supports model compression as an optional codec. It does not establish a production data lake, arbitrary Jsonnet evaluation, native Amu execution, cross-host publication, full SPARQL indexing, or an Iceberg commit.

Raw measurements, implementation hashes, canonical receipts and additional baselines: [computable-datalake-20261009.json](computable-datalake-20261009.json). Reproduction commands and implementation limitations: [reference implementation](../../spec/implementation-status.md).
