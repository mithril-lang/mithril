# Mithril Dataset specifications

Mithril Dataset is a project-owned, open specification for preserving RDF terms,
finite computable storage models and dataset envelope metadata. It complements
Parquet data files and Iceberg tables through explicit interchange contracts.

**Current publication: 0.1 draft, reference profile.** This is not an Apache
standard or an Arrow/Iceberg endorsement. A stable binary format and a production
lake catalog have not been released.

- [Specification 0.1](v0.1/specification.md): implemented storage profile.
- [Arrow interchange](v0.1/arrow.md): implemented lossless quad projection.
- [Lake and Iceberg contract](v0.1/lake.md): proposed, not implemented.
- [Versioning and contributions](governance.md).
- [Implementation status](implementation-status.md).
- [Quickstart](../docs/dataset/quickstart.md).
- [Release announcement](../docs/dataset/announcement.md).
- [JSON Schema](v0.1/bundle.schema.json) and [test vectors](v0.1/vectors/README.md).

Source of truth is the versioned text in this repository's default branch.
The generated website is a presentation of that source. Format version, storage
profile identifier, and SDK version are separate identifiers. Design discussion
is welcome through [GitHub issues](https://github.com/mithril-lang/mithril/issues).
