# Mithril Todo Pages demo

A static browser To-do app. Jev assembles completion-toggle and unfinished-count functions from a typed, stage-aware Mithril block program. The browser executes the exact chosen nodes through a bounded primitive evaluator. The exported AST is checked against retained CLJK source and 511 completion-state vectors. To-do change classification uses the canonical Kotoba/Wasm artifact.

The UI, local browser storage and recording were implemented by Codex. `metrics.json` separates current demo preparation/implementation/local-verification time from Jev's runner interval, input/output tokens and API cost. It does not claim full-app Jev generation or measured Codex billing. Prior harness development and deployment wait are excluded from the demo interval.

No remote model calls occur when using the published app. Tasks are stored only in this browser. `demo.mp4` records real browser interactions. Site paths are relative for GitHub Pages project hosting.

`build.hy` exports the already compiled policy and measured Jev receipt; it needs the local source paths recorded there. `logic.json` and the CLJK sources are exported by replaying the measured decisions through the same typed assembler. UI adapters implement only the published primitive subset; this is not full Mithril language/runtime or full upstream UI qualification.

App sources follow the repository's Apache-2.0 license. The reused policy artifact is accompanied by `LICENSE.mithril-policy` from its MIT-licensed source repository.
