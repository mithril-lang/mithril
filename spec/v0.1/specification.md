# Mithril Dataset specification 0.1

Status: **draft**. Profile: `mithril.computable-segments/reference-v1`.
Publication date: 2026-10-09. License: Apache-2.0 (repository LICENSE).

The key words MUST, MUST NOT, SHOULD and MAY describe requirements of this
profile. They do not turn proposed lake capabilities into implemented features.
The schema checks structure; successful evaluation and digest verification are
also required for conformance.

## 1. Scope

This profile stores a finite RDF-term tuple set with optional empty-graph metadata.
It uses UTF-8 JSON, inline base64 compressed segment payloads, exact exceptions
and SHA-256. It is an experimental portable reference profile, not the proposed
future binary container. Readers MUST reject unknown profile identifiers,
payload kinds, operations and codecs rather than silently reinterpret them.

The profile accepts an explicitly defined RDF-term subset. It does not claim
complete admission of every RDF serialization or canonical RDF validation.
Mithril source parsing and application reasoning are separate operations.

## 2. Terms and dataset envelope

A quad is `[subject,predicate,object,graph]`. Terms are:

| Value | Meaning |
| --- | --- |
| `["I",iri]` | IRI string with absolute scheme |
| `["B",label]` | Nonempty dataset-scoped blank-node label |
| `["L",lexical,datatype,language]` | Literal preserving exact lexical spelling |
| `null` | Default graph, only in graph position |

Subject is IRI or blank; predicate is IRI; object is IRI, blank or literal;
graph is IRI, blank or null. IRI admission uses an ASCII scheme followed by `:`,
then characters excluding whitespace, U+0000–U+0020 and `< > " { } | ^ ` and
backslash. Blank labels are opaque nonempty strings, not N-Quads tokens.
A language literal MUST use RDF `langString` and a nonempty language matching
ASCII letters followed by zero or more hyphen-separated alphanumeric components.
Other literals MUST have an empty language string and an absolute datatype IRI.
Language spelling and literal `01` versus `1` MUST be retained; no value coercion
is permitted. All comparisons here are lexical and label-sensitive.

The logical envelope is `{quads,emptyGraphs}`. Duplicate quads and duplicate
empty-graph terms are removed. Quads sort by compact JSON string representation,
using ECMAScript UTF-16 code-unit order. Empty-graph terms sort the same way.
`emptyGraphs` is explicit envelope metadata, including null if an empty default
graph is being retained. The reference profile retains this list without
inferring or enforcing graph emptiness. Quadless named graphs otherwise disappear.
Blank labels have dataset scope across all segments and named graphs.

## 3. Serialization and identities

Compact JSON means ECMAScript `JSON.stringify`: no whitespace, preserved object
property insertion order, array order unchanged, safe-integer numbers, and its
string escaping rules. This is not JCS or RDF canonicalization. Implementations
in other languages MUST reproduce these bytes for hash verification; fixtures
include non-ASCII strings. JSON numeric fields MUST be safe integers in the
inclusive range -9007199254740991 to 9007199254740991, with additional field bounds.

SHA-256 digests have lowercase `sha256:` followed by 64 lowercase hexadecimal digits.

- `tupleDigest` hashes the UTF-8 compact normalized `{quads,emptyGraphs}` envelope,
  in exactly that property order. It is blank-label-sensitive and covers the
  explicit empty-graph list.
- Segment `digest` hashes compressed payload bytes, before base64 encoding.
- `physicalDigest` hashes the compact manifest after removing that property,
  retaining all remaining property order as read. Writers SHOULD use the field
  order below. Reordering manifest fields can change physical identity.
- `canonicalGraphDigest` is null or a supplied SHA-256 RDF canonicalization claim.
  The Node runtime and Python SDK do not independently certify that claim.
  A caller requiring canonical identity MUST recompute it with an explicitly
  pinned RDF canonicalization algorithm and preserve the empty-graph envelope
  separately. It MUST NOT treat tupleDigest as that identity.

A digest detects inconsistency with expected bytes; it is not a signature,
authenticity proof or assurance that untrusted metadata describes trusted data.

## 4. Manifest and segments

The manifest has exactly these fields (writer order shown):
`format`, `tupleDigest`, `canonicalGraphDigest`, `emptyGraphs`, `count`, `segments`,
`physicalDigest`. `count` is the number of unique normalized quads.
Each segment has exactly `kind`, `codec`, `rawBytes`, `count`, `min`, `max`,
`subjectRange`, `digest`, `bytes`. Extra fields are rejected in reference-v1.

`bytes` is canonical padded base64 of a compressed UTF-8 JSON payload.
`rawBytes` is its decompressed byte count. `min` and `max` bound compact subject
term strings inclusively. `subjectRange` is null or a range domain describing
exactly the distinct subjects represented by the segment. Segment count is the
number of decoded unique quads. Summed segment counts MUST equal manifest count;
full-envelope deduplication MUST still yield that same count.

`codec` is `zstd` or `gzip`, one independently decodable stream per payload.
Writers in the reference implementation use Zstd level 6 or gzip level 9.
Levels do not affect logical identity. External Zstd dictionaries and `none`
compression are not reference-v1 capabilities. Term dictionaries below are
unrelated to Zstd trained dictionaries.

## 5. Literal payload

A literal payload has exactly `{kind:"literal",terms,rows}`. `terms` is a unique
dictionary of term values, strictly increasing by compact term string order.
Each row is four zero-based safe-integer dictionary indexes in quad position
order. Rows are sorted by subject index, then predicate, object and graph index.
Readers MUST check indexes, term positions and nondecreasing subject index before
using binary search. Full reconstruction is normalized as a tuple set.

## 6. Finite model payload

A model payload has exactly `{kind:"model",domain,templates,remove,add}`.
A domain is either `{kind:"list",subjects}` with unique admitted subject terms,
or `{kind:"range",prefix,start,count}`. Range start is a nonnegative safe integer,
count is positive, and its last value MUST be safe. Range subjects are IRIs
formed by concatenating prefix with the base-10 integer without leading zeros.

Each template is `[predicate,expression,graph]`. Expressions are:

- `["constant",objectTerm]`: use the exact object term.
- `["ordinal",offset]`: the subject MUST be an IRI ending in a nonnegative decimal
  safe integer without leading zeros, recognized by `^(.*?)(0|[1-9][0-9]*)$`.
  Add the safe-integer offset; the result MUST remain safe. Emit its base-10
  spelling as an XSD integer literal with empty language.

Generate one quad for each subject/template pair. `remove` contains distinct
quads that were actually generated. Subtract them, then union `add`; additions
MUST NOT duplicate retained quads or another addition. Normalize the result.
No host eval, recursion, imports, network, clocks or random values are supported.

Automatic model discovery is a writer policy, not a decoding requirement.
The reference writer compares complete serialized segment costs for literal
and model encodings. Whole-dataset fallback to ordinary Mithril+Zstd or Parquet
is not automatic in this release.

## 7. Validation, budgets and queries

A conforming reader MUST check the profile, fields, counts, safe integers,
compressed bytes/digests, decompressed sizes, operations, exact generated
exceptions, decoded subject bounds/ranges and full envelope tupleDigest.
It MUST enforce finite limits on input bytes, decompressed bytes, subjects,
quads and model work before using derived data for queries. Resource-limit
refusal is allowed and MUST be distinguishable from successful empty results.

Reference defaults: 2,000,000 quads; 500,000 subjects; 256 MiB bytes;
8,000,000 work units. Work is literal rows or generated subject/template pairs
plus removals and additions. Total decompressed bytes and work across segments
are bounded. Process memory and JSON parsing overhead can exceed those limits;
they are not an OS memory sandbox. SDK subprocess timeout is 120 seconds.

`open` fully decodes and validates a private bundle copy before admitting subject
pruning. Subsequent subject queries decompress selected segments and check their
physical hashes. These are warm, in-process selection operations; `fetchedBytes`
is compressed selected payload size, not measured disk/network transfer.
The Python SDK starts a subprocess per operation and does not retain warm handles.
Unsigned bounds alone MUST NOT justify skipping validation. Untrusted partial
reads require a future authenticated/verified-manifest protocol.

## 8. Conformance and evolution

Run published vectors, malformed-input tests and exact round-trip tests.
A library MUST declare supported profile identifiers and optional codecs.
The format, library and specification publication versions are independent.
Changes to the meaning or field set of reference-v1 require a new profile ID.
See the versioning policy and implementation status for stable-format gates.

## References

- [Arrow format versioning](https://arrow.apache.org/docs/format/Versioning.html)
- [Iceberg table specification](https://iceberg.apache.org/spec/)
- [Zstd format RFC 8878](https://www.rfc-editor.org/rfc/rfc8878)
