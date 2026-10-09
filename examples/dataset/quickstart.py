from pathlib import Path
import mithril_dataset as m

out = Path("dataset-output")
out.mkdir(exist_ok=True)
xsd = "http://www.w3.org/2001/XMLSchema#"
data = {"quads": [], "emptyGraphs": [["I", "urn:empty"]]}
for i in range(1000):
    subject = ["I", f"urn:device:{i}"]
    data["quads"].extend([
        [subject, ["I", "urn:type"], ["I", "urn:Device"], None],
        [subject, ["I", "urn:ordinal"], ["L", str(i), xsd + "integer", ""], None]])
bundle = m.pack(data, out / "devices.mithbundle.json")
restored = m.unpack(bundle)
assert len(restored["quads"]) == 2000
assert len(m.query_subject(bundle, ["I", "urn:device:42"])["quads"]) == 2
assert m.from_arrow(m.to_arrow(restored)) == restored
m.to_parquet(restored, out / "devices.parquet")
assert m.from_parquet(out / "devices.parquet") == restored
print({"quads": len(restored["quads"]), "bundle_bytes": (out / "devices.mithbundle.json").stat().st_size,
       "parquet_bytes": (out / "devices.parquet").stat().st_size, "verified": True})
