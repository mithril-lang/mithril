# vendor/ — pinned snapshots (no kotoba-lang dependency)

This directory is a **pinned source snapshot** of code that was previously resolved at build
time from `https://github.com/kotoba-lang/<repo>.git`. Those repositories no longer exist:
kotoba-lang consolidated everything into the `kotoba-lang/kotoba-lang` monorepo, so every
`io.github.kotoba-lang/*` git dependency in `deps.edn` and `nbb.edn` failed to resolve
(`Error building classpath. Unable to clone .../io-ipld.git: could not read Username`).

mithril does not depend on kotoba-lang. The code below is owned by this repository and is
committed here; nothing in the build clones, fetches, or calls a kotoba-lang repository,
package registry, or service. Each file records its source repository, source revision, source
path, and SHA-256 in [`PROVENANCE.json`](PROVENANCE.json).

## Layout

- `vendor/src/` — one classpath root holding the merged namespaces. Namespaces are unchanged,
  so `:require` forms in mithril source are untouched.
- `vendor/resources/` — the non-source resources those libraries shipped (`:paths ["src" "resources"]`).
- `PROVENANCE.json` — machine-readable per-file provenance and content hashes.

## Snapshot contents

| source repository | revision | files | bytes |
|---|---|---:|---:|
| `github.com/kotoba-lang/coll` | `f74e248f0a07` | 2 | 26,617 |
| `github.com/kotoba-lang/coll-assoc-some` | `4720f160dc3d` | 1 | 593 |
| `github.com/kotoba-lang/coll-bounded-postwalk` | `355b43684576` | 1 | 1,056 |
| `github.com/kotoba-lang/coll-bounded-prewalk` | `033c28f8a262` | 1 | 1,035 |
| `github.com/kotoba-lang/coll-deep-merge` | `7b54f365cbbf` | 1 | 693 |
| `github.com/kotoba-lang/coll-default-max-walk-depth` | `8e96e182de6e` | 1 | 423 |
| `github.com/kotoba-lang/coll-filter-keys` | `2940d9f7c63b` | 1 | 466 |
| `github.com/kotoba-lang/coll-filter-vals` | `e989e67c9e80` | 1 | 470 |
| `github.com/kotoba-lang/coll-index` | `31081ae35e47` | 1 | 566 |
| `github.com/kotoba-lang/coll-index-by` | `88b9a862f8f9` | 1 | 585 |
| `github.com/kotoba-lang/coll-invert-map` | `32a649ab8eae` | 1 | 637 |
| `github.com/kotoba-lang/coll-join` | `2f5c5b15a6cb` | 1 | 2,089 |
| `github.com/kotoba-lang/coll-keywordize-keys` | `65049a83c4b3` | 1 | 723 |
| `github.com/kotoba-lang/coll-map-keys` | `aad2eda342bb` | 1 | 452 |
| `github.com/kotoba-lang/coll-map-vals` | `8fadb3a3a414` | 1 | 465 |
| `github.com/kotoba-lang/coll-postwalk` | `891379081438` | 1 | 572 |
| `github.com/kotoba-lang/coll-postwalk-replace` | `58b3e7a14345` | 1 | 616 |
| `github.com/kotoba-lang/coll-prewalk` | `086c412e1b02` | 1 | 562 |
| `github.com/kotoba-lang/coll-prewalk-replace` | `77730a1b195e` | 1 | 608 |
| `github.com/kotoba-lang/coll-project` | `147e51228b1e` | 1 | 601 |
| `github.com/kotoba-lang/coll-rename` | `a7edfbc42719` | 1 | 519 |
| `github.com/kotoba-lang/coll-rename-keys` | `00b5fcc2d80f` | 1 | 697 |
| `github.com/kotoba-lang/coll-select` | `e85f4354634f` | 1 | 610 |
| `github.com/kotoba-lang/coll-set-difference` | `8bb8d7dcbc3b` | 1 | 522 |
| `github.com/kotoba-lang/coll-set-intersection` | `79e394967874` | 1 | 513 |
| `github.com/kotoba-lang/coll-set-union` | `73cd6c4947ad` | 1 | 505 |
| `github.com/kotoba-lang/coll-stringify-keys` | `92411506b539` | 1 | 895 |
| `github.com/kotoba-lang/coll-subset` | `e32b36cb8f78` | 1 | 512 |
| `github.com/kotoba-lang/coll-superset` | `9066e2665823` | 1 | 450 |
| `github.com/kotoba-lang/coll-walk` | `24f897ff47e5` | 1 | 982 |
| `github.com/kotoba-lang/coll-walk-children` | `30596d88373c` | 1 | 564 |
| `github.com/kotoba-lang/coll-walk-depth-exceeded` | `cc97ca28d148` | 1 | 453 |
| `github.com/kotoba-lang/datalog` | `9c86cc8d1009` | 8 | 287,910 |
| `github.com/kotoba-lang/datom-source` | `1c3875df01e8` | 5 | 29,843 |
| `github.com/kotoba-lang/dev-protobuf` | `cfd0b29997ab` | 1 | 12,899 |
| `github.com/kotoba-lang/dsl-core` | `ac8554fe4c29` | 1 | 1,339 |
| `github.com/kotoba-lang/io-ipld` | `48ba40490cf0` | 14 | 201,116 |
| `github.com/kotoba-lang/io-ipld-car` | `6a67a81f2c47` | 5 | 38,709 |
| `github.com/kotoba-lang/io-multiformats` | (see PROVENANCE.json) | 3 | 43,951 |
| `github.com/kotoba-lang/json` | `9c11ad189e64` | 8 | 46,426 |
| `github.com/kotoba-lang/json-char-code` | `19b53ff487a3` | 1 | 316 |
| `github.com/kotoba-lang/json-codepoint` | `90c4ee3f7da9` | 1 | 392 |
| `github.com/kotoba-lang/json-decode` | `f7b03f38002e` | 1 | 578 |
| `github.com/kotoba-lang/json-emit` | `08fdd27939f3` | 1 | 1,863 |
| `github.com/kotoba-lang/json-encode` | `96accd53e7da` | 1 | 394 |
| `github.com/kotoba-lang/json-esc` | `ec8e16d14d4d` | 1 | 1,160 |
| `github.com/kotoba-lang/json-hex-digits` | `0ea6076bac8b` | 1 | 287 |
| `github.com/kotoba-lang/json-hex-val` | `565ca0105b5b` | 1 | 934 |
| `github.com/kotoba-lang/json-hex4` | `886d31fdb02e` | 1 | 547 |
| `github.com/kotoba-lang/json-json` | `aecd6042a8e3` | 1 | 406 |
| `github.com/kotoba-lang/json-kstr` | `58cb0e1c93a7` | 1 | 290 |
| `github.com/kotoba-lang/json-number-re` | `8497a9159e61` | 1 | 315 |
| `github.com/kotoba-lang/json-numstr` | `3dc866fabbb2` | 1 | 484 |
| `github.com/kotoba-lang/json-read-number` | `f09a7054aae1` | 1 | 1,638 |
| `github.com/kotoba-lang/json-read-string-star` | `5b2232f57b7d` | 1 | 1,276 |
| `github.com/kotoba-lang/json-read-value` | `ca862d5b6c50` | 1 | 2,796 |
| `github.com/kotoba-lang/json-skip-ws` | `1e4553644285` | 1 | 421 |
| `github.com/kotoba-lang/json-starts` | `21a89c59be86` | 1 | 322 |
| `github.com/kotoba-lang/json-ws` | `b0529f86db7d` | 1 | 299 |
| `github.com/kotoba-lang/kotobase` | `bbf57df9dde5` | 5 | 41,024 |
| `github.com/kotoba-lang/kotobase-client` | `8d88d43d6294` | 10 | 125,283 |
| `github.com/kotoba-lang/kotobase-protocol-core` | `ca3874d2daba` | 7 | 23,913 |
| `github.com/kotoba-lang/kotobase-protocol-ipq` | `6ad3df76db64` | 4 | 85,378 |
| `github.com/kotoba-lang/oak` | `4474497d7a84` | 1 | 10,374 |
| `github.com/kotoba-lang/org-ietf-cbor` | (see PROVENANCE.json) | 1 | 14,658 |
| `github.com/kotoba-lang/org-nist-sha2` | `e7c1b250adf3` | 2 | 18,797 |
| `github.com/kotoba-lang/org-omg-bpmn` | `f64eb5cb510b` | 6 | 27,053 |
| `github.com/kotoba-lang/org-w3-json-ld-api` | `ef6a81a3bb2b` | 2 | 54,276 |
| `github.com/kotoba-lang/org-w3-nquads` | `794846ca2e71` | 1 | 14,291 |
| `github.com/kotoba-lang/org-w3-owl2` | `93214e916157` | 6 | 111,001 |
| `github.com/kotoba-lang/org-w3-rdf-canon` | `e3e9223a48f1` | 1 | 21,339 |
| `github.com/kotoba-lang/set` | `a9ec506af07b` | 1 | 1,566 |
| `github.com/kotoba-lang/set-difference` | `8d0dd29f9f9d` | 1 | 501 |
| `github.com/kotoba-lang/set-index` | `a8a1d2c01967` | 1 | 565 |
| `github.com/kotoba-lang/set-intersection` | `dc3a39d774f2` | 1 | 492 |
| `github.com/kotoba-lang/set-join` | `6575f8c72341` | 1 | 2,072 |
| `github.com/kotoba-lang/set-map-invert` | `af3a69b630fd` | 1 | 636 |
| `github.com/kotoba-lang/set-project` | `48ede30a95f9` | 1 | 600 |
| `github.com/kotoba-lang/set-rename` | `ba131bd18b09` | 1 | 517 |
| `github.com/kotoba-lang/set-rename-keys` | `4ef29bc8dc5b` | 1 | 696 |
| `github.com/kotoba-lang/set-select` | `54114d4f4762` | 1 | 609 |
| `github.com/kotoba-lang/set-subset` | `90b9d54d2f71` | 1 | 511 |
| `github.com/kotoba-lang/set-superset` | `2d1d3d7a3bac` | 1 | 449 |
| `github.com/kotoba-lang/set-union` | `0e14c5f953cd` | 1 | 484 |
| `github.com/kotoba-lang/sparql` | `8809be30fa48` | 1 | 9,909 |
| `github.com/kotoba-lang/spec` | `7af79b6a9f5a` | 1 | 4,541 |
| `github.com/kotoba-lang/test` | `2ab4885f99fd` | 2 | 30,216 |
| `github.com/kotoba-lang/test--starcontexts-star` | `40f14d4edb32` | 1 | 538 |
| `github.com/kotoba-lang/test--starreport-star` | `8fd13c7d0493` | 1 | 646 |
| `github.com/kotoba-lang/test-alphabet` | `5d3c660b779d` | 1 | 449 |
| `github.com/kotoba-lang/test-are-eq` | `07ca283d3d25` | 1 | 443 |
| `github.com/kotoba-lang/test-context-str` | `f192336610c4` | 1 | 553 |
| `github.com/kotoba-lang/test-for-all` | `15cf6ef5ba78` | 1 | 874 |
| `github.com/kotoba-lang/test-gen-bool` | `25443136f3bf` | 1 | 524 |
| `github.com/kotoba-lang/test-gen-element` | `cdcc44951626` | 1 | 616 |
| `github.com/kotoba-lang/test-gen-from-spec` | `d14cb971b54b` | 1 | 1,275 |
| `github.com/kotoba-lang/test-gen-int` | `2c6efe1ef62d` | 1 | 707 |
| `github.com/kotoba-lang/test-gen-string` | `f1e21906e40c` | 1 | 963 |
| `github.com/kotoba-lang/test-generator` | `4c675b201837` | 1 | 483 |
| `github.com/kotoba-lang/test-make-rng` | `0ec1e42613da` | 1 | 673 |
| `github.com/kotoba-lang/test-next-int` | `6330f0467a31` | 1 | 677 |
| `github.com/kotoba-lang/test-next-long` | `8217b89afeed` | 1 | 654 |
| `github.com/kotoba-lang/test-next-state` | `d16ec6bbcebc` | 1 | 469 |
| `github.com/kotoba-lang/test-print-detail` | `f96e074b4d44` | 1 | 1,384 |
| `github.com/kotoba-lang/test-quickcheck` | `06662b2a9d79` | 1 | 1,328 |
| `github.com/kotoba-lang/test-record-error` | `17591680374a` | 1 | 1,319 |
| `github.com/kotoba-lang/test-record-fail` | `0cf9c223c9ef` | 1 | 1,208 |
| `github.com/kotoba-lang/test-record-pass` | `1ec9bc7fba13` | 1 | 689 |
| `github.com/kotoba-lang/test-rng` | `7cb862bdcd93` | 1 | 407 |
| `github.com/kotoba-lang/test-run-one` | `ebcbb5079200` | 1 | 1,047 |
| `github.com/kotoba-lang/test-shrink-int` | `7737b28c48c5` | 1 | 802 |
| `github.com/kotoba-lang/test-test-registry` | `528d0640652c` | 1 | 437 |
| `github.com/kotoba-lang/test-throws` | `5b248afca648` | 1 | 676 |
| `github.com/kotoba-lang/test-try-shrink` | `926b3ac48346` | 1 | 823 |
| `github.com/kotoba-lang/text` | (see PROVENANCE.json) | 3 | 42,216 |
| `github.com/kotoba-lang/walk` | `39a6909219db` | 1 | 1,657 |
| `github.com/kotoba-lang/walk-bounded-postwalk` | `320f28e9dde3` | 1 | 1,056 |
| `github.com/kotoba-lang/walk-bounded-prewalk` | `bb04ab2cb1a6` | 1 | 1,035 |
| `github.com/kotoba-lang/walk-default-max-walk-depth` | `e7771cc4e291` | 1 | 423 |
| `github.com/kotoba-lang/walk-keywordize-keys` | `c6409b529322` | 1 | 723 |
| `github.com/kotoba-lang/walk-postwalk` | `9c2234b1351d` | 1 | 572 |
| `github.com/kotoba-lang/walk-postwalk-replace` | `c131fd94b155` | 1 | 616 |
| `github.com/kotoba-lang/walk-prewalk` | `7c990ae43897` | 1 | 562 |
| `github.com/kotoba-lang/walk-prewalk-replace` | `dc5615ee7ee4` | 1 | 608 |
| `github.com/kotoba-lang/walk-stringify-keys` | `03db538c363e` | 1 | 895 |
| `github.com/kotoba-lang/walk-walk` | `9a00daed8a94` | 1 | 982 |
| `github.com/kotoba-lang/walk-walk-children` | `5325af0f5ef3` | 1 | 564 |
| `github.com/kotoba-lang/walk-walk-depth-exceeded` | `f76e98cf1920` | 1 | 497 |
| **total** | | **203** | **1,398,783** |

## Resolution of overlapping classpath paths

One classpath path, `kotobase/datom_plan.cljk`, shipped in two of the pinned repositories.
The copy kept here is the one that won on the resolved classpath before this change
(`clojure -Spath` put `datom-source` ahead of `kotobase-client`), so behaviour is unchanged.
The displaced copy is listed under `shadowed` in `PROVENANCE.json`.

## Re-verification

The snapshot is self-contained: with an empty `~/.gitlibs` and no network, `clojure -Spath`
resolves and `node scripts/run-sci.mjs test/run_codegraph.cljk` passes. No file here is fetched
at build time.

