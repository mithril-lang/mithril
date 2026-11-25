# AGENTS.md — mithril-lang/mithril

- Purpose: The Mithril language and reasoner.
- Owner: Platform Engineering (Jun Kawasaki, @com-junkawasaki).
- Visibility: public. Do not change it without Jun's GO.
- Separate-repository reason: Public distribution with its own release cycle and GitHub Pages (policy section 4, reasons 1 and 3).
- Verification: The commands in `.github/workflows/` (for example `node --test scripts/test-datalake.mjs scripts/test-dataset-spec.mjs` and `python -m unittest discover -s sdk/python/tests`).
- Release path: GitHub Pages from `main`. mithril-fund pins this repository by commit in `services/system-one/runtime/pins.json`.

Rules: merge with a merge commit (no squash or rebase). Never commit secrets,
customer data or real target details. Run `gitleaks git --redact` before
pushing when it is installed.

Repository rules and classification: [mithril-fund repository policy](https://github.com/mithril-lang/mithril-fund/blob/main/docs/operations/repository-policy.md)
(`docs/operations/repository-policy.md` in mithril-fund).
