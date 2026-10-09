import json
from pathlib import Path
import tempfile
import unittest
import pyarrow as pa
import mithril_dataset as m

X = "http://www.w3.org/2001/XMLSchema#"
DATA = {"quads": [
    [["I", "urn:s:1"], ["I", "urn:p"], ["L", "01", X + "integer", ""], None],
    [["B", "shared"], ["I", "urn:p"], ["L", "日本語", "http://www.w3.org/1999/02/22-rdf-syntax-ns#langString", "ja"], ["I", "urn:g"]],
    [["I", "urn:s:1"], ["I", "urn:p"], ["B", "shared"], ["I", "urn:g"]]], "emptyGraphs": [["I", "urn:empty"]]}

class DatasetTest(unittest.TestCase):
    def test_arrow_and_parquet_roundtrip(self):
        expected = m.unpack(m.pack(DATA))
        self.assertEqual(m.from_arrow(m.to_arrow(DATA)), expected)
        with tempfile.TemporaryDirectory() as temp:
            p = Path(temp) / "data.parquet"
            m.to_parquet(DATA, p)
            self.assertEqual(m.from_parquet(p), expected)
            m.pack(expected, Path(temp) / "data.json")
            self.assertEqual(m.unpack(Path(temp) / "data.json"), expected)
        self.assertEqual(len(m.query_subject(m.pack(DATA), ["I", "urn:s:1"])["quads"]), 2)

    def test_missing_metadata_and_null_cells_rejected(self):
        table = m.to_arrow(DATA)
        with self.assertRaisesRegex(ValueError, "metadata"):
            m.from_arrow(table.replace_schema_metadata(None))
        rows = table.to_pylist(); rows[0]["graph"] = None
        with self.assertRaisesRegex(ValueError, "null"):
            m.from_arrow(pa.Table.from_pylist(rows, schema=table.schema))

    def test_empty_graph_only(self):
        data = {"quads": [], "emptyGraphs": [["I", "urn:empty"]]}
        self.assertEqual(m.from_arrow(m.to_arrow(data)), data)

    def test_unknown_format_and_corruption_rejected(self):
        bundle = m.pack(DATA); bundle["format"] = "unknown"
        with self.assertRaisesRegex(ValueError, "unsupported format"):
            m.unpack(bundle)
        bundle = m.pack(DATA); bundle["segments"][0]["bytes"] = "AAAA"
        with self.assertRaisesRegex(ValueError, "integrity"):
            m.unpack(bundle)

    def test_published_vectors(self):
        root = Path(__file__).resolve().parents[3]
        for path in (root / "spec/v0.1/vectors").glob("*.bundle.json"):
            expected = json.loads(path.with_name(path.name.replace(".bundle.json", ".dataset.json")).read_text())
            self.assertEqual(m.unpack(path), expected)

if __name__ == "__main__": unittest.main()
