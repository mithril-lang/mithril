# Mithril Dataset Quickstart

Publication 0.1 is an experimental reference profile. It preserves RDF term
spelling and graphs, compresses finite models with exact exceptions, and exports
ordinary Arrow/Parquet data. Node.js 24+ and Python 3.10+ are required. There is
no PyPI package release yet; install from the public repository:

```sh
git clone https://github.com/mithril-lang/mithril.git
cd mithril
python -m venv .venv-dataset
. .venv-dataset/bin/activate
python -m pip install './sdk/python[arrow]'
python examples/dataset/quickstart.py
```

The executable example writes a Zstd bundle, queries a subject, verifies a
lossless Arrow/Parquet round-trip and prints output sizes. Files are written
inside `dataset-output/` in the current directory. All API functions are available:

```python
import mithril_dataset as m
bundle = m.pack(data, 'devices.mithbundle.json')
restored = m.unpack(bundle)
selected = m.query_subject(bundle, ['I', 'urn:device:42'])
table = m.to_arrow(restored)
m.to_parquet(restored, 'devices.parquet')
assert m.from_parquet('devices.parquet') == restored
```

Here `data` is `{quads: [...], emptyGraphs: [...]}` using the specification's
JSON RDF terms. This SDK does not parse arbitrary Mithril source. `query_subject`
fully validates the bundle on each Python call; it is not a retained warm handle.

## SQL entry point

Install DuckDB separately and use the exported Parquet:

```sh
python -m pip install duckdb==1.4.1
python examples/dataset/query.py
```

Columns contain JSON term strings. A SQL result that drops metadata is a derived
view, not a lossless Mithril export. Preserve the Parquet schema metadata for
empty graphs or use explicit term-aware export.

## CLI

```sh
mithril-dataset pack input.dataset.json output.mithbundle.json
mithril-dataset unpack output.mithbundle.json restored.dataset.json
mithril-dataset subject output.mithbundle.json urn:device:42
mithril-dataset to-parquet output.mithbundle.json devices.parquet
mithril-dataset from-parquet devices.parquet restored.mithbundle.json
```

The `.mithbundle.json` suffix is a convention for the existing JSON profile,
not a stable binary `.mithpack` declaration. Use `codec='gzip'` where Node's Zstd
functions are unavailable. Keep data private and check outputs before sharing.

Read the [specification](../../spec/v0.1/specification.md),
[Arrow profile](../../spec/v0.1/arrow.md),
[implementation status](../../spec/implementation-status.md) and
[contribution policy](../../spec/governance.md).
