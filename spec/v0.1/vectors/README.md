# Reference-v1 conformance vectors

`*.bundle.json` are frozen reader fixtures; `*.dataset.json` are normalized expected
envelopes. Compression bytes are not required to match across writer libraries.
Readers MUST reconstruct the expected envelopes and reject corrupted digests,
unknown operations/profile IDs, invalid terms, expansion budgets and poisoned
pruning metadata (negative tests in `scripts/test-datalake.mjs`).

The corpus includes empty graphs, named/default graphs, shared blank nodes,
non-ASCII literals, lexical integer `01`, regular integer models, exceptions,
both codecs and empty datasets. Run Node unit tests and Python SDK tests.
The Python SDK uses the same Node evaluator; these tests are not evidence of
independent decoder interoperability. JSON Schema validates manifests only;
semantic validation is mandatory in addition.
