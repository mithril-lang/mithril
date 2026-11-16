from pathlib import Path
import json
import jsonschema
root = Path(__file__).resolve().parents[1]
schema = json.loads((root / 'spec/v0.1/bundle.schema.json').read_text())
jsonschema.Draft202012Validator.check_schema(schema)
for path in (root / 'spec/v0.1/vectors').glob('*.bundle.json'):
    jsonschema.validate(json.loads(path.read_text()), schema)
print('Published manifests pass JSON Schema; semantic tests are separate.')
