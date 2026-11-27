# Language site source

This directory is the static document root intended for `lang.mithril.fund`.
It has no build-time JavaScript, remote assets, or runtime dependencies.

`index.html` is the public reference page. `grammar.ebnf` is the downloadable
reader-shape grammar. Keep both aligned with `docs/language/README.md` and the
implementation in `src/mithril/form.cljk` and `src/mithril/compiler.cljk`.

`CNAME` binds the custom hostname. It is copied to the Pages publishing branch
only by the gated cutover step in `.github/workflows/dataset.yml`
(`publish_language_site=true`), and the host is enabled through the Pages API.
Nothing here is live until `docs/operations/lang-mithril-fund-cutover.md` is
executed and its read-back checks pass.
