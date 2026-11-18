Live `/api/compile` responses from app.mithril.fund on 2026-11-18, captured by
the Fund app-host migration (the Worker then ran mithril 439a202 under shadow-cljs).
`starter.mith` and `jsonld.mith` are the published starters. The 422 body is
the response to the text `(not a mithril app`.

`system-one/` holds outputs recorded by Fund system-one's former nbb glue:
`dynamic-*.json` are full receipts from
`services/system-one/bench/results/mithril-dynamic-20261007/` (mithril 439a202,
pins included), with the batch inputs rebuilt from system-one's own task
definitions. `native-receipts.json` comes from
`services/system-one/examples/source-conversion/*.receipt.json` (mithril f78ce57).
