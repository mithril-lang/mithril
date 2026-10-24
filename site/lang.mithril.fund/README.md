# Language site source

This directory is the static document root intended for `lang.mithril.fund`.
It has no build-time JavaScript, remote assets, or runtime dependencies.

`index.html` is the public reference page. `grammar.ebnf` is the downloadable
reader-shape grammar. Keep both aligned with `docs/language/README.md` and the
implementation in `src/mithril/form.cljk` and `src/mithril/compiler.cljk`.

The custom hostname is not configured by this directory. Use the repository's
approved standalone publication owner and verify the domain read-back before
calling the site live.
