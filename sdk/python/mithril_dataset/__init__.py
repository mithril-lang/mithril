"""Mithril Dataset reference-v1. Fully materialized; requires Node.js."""
import argparse
import json
import os
from pathlib import Path
import subprocess
import tempfile

__version__ = "0.1.0"
FORMAT = "mithril.computable-segments/reference-v1"
MAX_FILE_BYTES = 256 * 1024 * 1024
META = b"mithril.dataset.envelope"
PROFILE = b"mithril.dataset.profile"


def _call(op, data, **kwargs):
    request = json.dumps({"op": op, "data": data, **kwargs}, ensure_ascii=False, separators=(",", ":"))
    if len(request.encode("utf-8")) > MAX_FILE_BYTES:
        raise ValueError("request exceeds SDK byte limit")
    try:
        result = subprocess.run(
            [os.environ.get("MITHRIL_DATASET_NODE", "node"), str(Path(__file__).with_name("bridge.cjs"))],
            input=request, text=True, encoding="utf-8", capture_output=True, timeout=120, check=False)
    except FileNotFoundError as error:
        raise RuntimeError("Node.js 24+ is required; set MITHRIL_DATASET_NODE") from error
    if result.returncode:
        raise ValueError(result.stderr.strip() or "reference evaluator failed")
    return json.loads(result.stdout)


def _read_json(path):
    path = Path(path)
    if path.stat().st_size > MAX_FILE_BYTES:
        raise ValueError("file exceeds SDK byte limit")
    return json.loads(path.read_text(encoding="utf-8"))


def _write_json(path, data):
    path = Path(path)
    fd, temp = tempfile.mkstemp(prefix=".mithril-", dir=path.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as stream:
            json.dump(data, stream, ensure_ascii=False, separators=(",", ":"))
        os.replace(temp, path)
    finally:
        if os.path.exists(temp):
            os.unlink(temp)


def pack(data, path=None, *, codec="zstd", models=True, segment_subjects=2048):
    bundle = _call("pack", data, options={"codec": codec, "models": models, "segmentSubjects": segment_subjects})
    if path is not None:
        _write_json(path, bundle)
    return bundle


def unpack(bundle):
    if isinstance(bundle, (str, Path)):
        bundle = _read_json(bundle)
    return _call("unpack", bundle)


def query_subject(bundle, subject):
    if isinstance(bundle, (str, Path)):
        bundle = _read_json(bundle)
    return _call("subject", bundle, subject=subject)


def to_arrow(data):
    """Lossless quad term strings; envelope metadata carries empty graphs."""
    import pyarrow as pa
    data = unpack(pack(data, codec="gzip", models=False))
    rows = [{name: json.dumps(term, ensure_ascii=False, separators=(",", ":"))
             for name, term in zip(("subject", "predicate", "object", "graph"), quad)}
            for quad in data["quads"]]
    schema = pa.schema([(name, pa.string()) for name in ("subject", "predicate", "object", "graph")], metadata={
        PROFILE: b"mithril.arrow-quads/reference-v1",
        META: json.dumps({"emptyGraphs": data["emptyGraphs"]}, ensure_ascii=False, separators=(",", ":")).encode("utf-8")})
    return pa.Table.from_pylist(rows, schema=schema)


def from_arrow(table):
    import pyarrow as pa
    names = ["subject", "predicate", "object", "graph"]
    if table.column_names != names or any(field.type != pa.string() for field in table.schema):
        raise ValueError("expected four non-null UTF-8 JSON-term columns in profile order")
    metadata = table.schema.metadata or {}
    if metadata.get(PROFILE) != b"mithril.arrow-quads/reference-v1" or META not in metadata:
        raise ValueError("missing Mithril Arrow profile/envelope metadata")
    envelope = json.loads(metadata[META])
    if set(envelope) != {"emptyGraphs"}:
        raise ValueError("invalid envelope metadata")
    quads = []
    for row in table.to_pylist():
        if any(row[name] is None for name in names):
            raise ValueError("null Arrow cell; default graph must be JSON null string")
        quads.append([json.loads(row[name]) for name in names])
    return unpack(pack({"quads": quads, "emptyGraphs": envelope["emptyGraphs"]}, codec="gzip", models=False))


def to_parquet(data, path):
    import pyarrow.parquet as pq
    pq.write_table(to_arrow(data), path, compression="zstd", compression_level=6)


def from_parquet(path):
    import pyarrow.parquet as pq
    return from_arrow(pq.read_table(path))


def main():
    parser = argparse.ArgumentParser(description="Experimental Mithril Dataset reference profile")
    parser.add_argument("operation", choices=["pack", "unpack", "subject", "to-parquet", "from-parquet"])
    parser.add_argument("input")
    parser.add_argument("output", help="output path, or subject IRI for subject operation")
    args = parser.parse_args()
    if args.operation == "pack":
        pack(_read_json(args.input), args.output)
    elif args.operation == "unpack":
        _write_json(args.output, unpack(args.input))
    elif args.operation == "subject":
        print(json.dumps(query_subject(args.input, ["I", args.output]), ensure_ascii=False))
    elif args.operation == "to-parquet":
        to_parquet(unpack(args.input), args.output)
    else:
        pack(from_parquet(args.input), args.output)
