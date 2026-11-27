# Language site cutover to lang.mithril.fund

Status: **prepared, not executed.** This document is the executable checklist.
It is written for a maintainer with repository admin, GitHub Pages management
and Cloudflare DNS access. Nothing here has run against production.

Related: [repository policy](https://github.com/mithril-lang/mithril-fund/blob/main/docs/operations/repository-policy.md)
(public visibility, merge commits, no secrets).

## Recorded baseline (2026-11-27)

| Fact | Command | Observed |
| --- | --- | --- |
| Pages build type | `gh api repos/mithril-lang/mithril/pages` | `build_type=legacy`, source `gh-pages-todo:/`, `cname=null`, `https_enforced=true` |
| Pages URL | same | `https://mithril-lang.github.io/mithril/` |
| Dataset URL | `curl -sS -o /dev/null -w '%{http_code} %{redirect_url}\n' https://mithril-lang.github.io/mithril/dataset/` | `200` (no redirect) |
| New host DNS | `dig +short lang.mithril.fund CNAME` and `A` | empty; `curl https://lang.mithril.fund/` fails with `Could not resolve host` |
| CNAME on branch | `gh api "repos/mithril-lang/mithril/contents/CNAME?ref=gh-pages-todo"` | `404` |
| Branch root | `git ls-tree -r --name-only origin/gh-pages-todo` | TodoMVC demo at `/` (`index.html`, `app.js`, `core.js`, `demo.mp4`, …); Dataset spec under `dataset/` |
| Old URL references in this repo | `grep -rn 'mithril-lang.github.io/mithril' .` | `README.md` and `spec/v0.1/bundle.schema.json` only (both changed by this PR) |

## How the Pages site is produced

Pages serves branch `gh-pages-todo`, path `/`, with the legacy builder. The
branch is generated, not hand-maintained as a whole:

- `dataset/` — built by `scripts/build-dataset-site.py` from `spec/**`,
  `docs/dataset/**` and `docs/benchmarks/computable-datalake-20261009.*`, then
  rsynced with `--delete` by the `publish` job in
  `.github/workflows/dataset.yml`. The job pushes to `gh-pages-todo` and calls
  `POST /repos/{owner}/{repo}/pages/builds`. It runs on every push to `main`
  that touches the `paths` filter.
- `/` — before this change, a manually committed TodoMVC comparison demo
  (`index.html`, `app.js`, `core.js`, `demo.mp4`, …). No generator for it exists
  in this repository; it is not rebuilt by CI.
- `site/lang.mithril.fund/` — the language reference source. CircleCI job
  `language-site-verify` checks its files and records hashes, but nothing
  published it.

After this change the `publish` job keeps publishing `dataset/` unconditionally,
and writes the language site (`index.html`, `styles.css`, `grammar.ebnf`) plus
`CNAME` to the branch root **only** when dispatched with
`publish_language_site=true`. The retired TodoMVC files are removed in the same
commit. Branch history keeps the old tree for rollback.

## Files changed by this PR

| File | Change |
| --- | --- |
| `README.md` | Dataset site link → `https://lang.mithril.fund/dataset/` |
| `spec/v0.1/bundle.schema.json` | `$id` → `https://lang.mithril.fund/dataset/spec/v0.1/bundle.schema.json`, with `$comment` recording the old URI |
| `spec/governance.md` | Schema-`$id` relocation rule and changelog entry |
| `site/lang.mithril.fund/CNAME` | `lang.mithril.fund` (published only by the gated cutover run) |
| `site/lang.mithril.fund/README.md` | Documents who writes `CNAME` |
| `docs/language/README.md` | Points at this runbook; host is not live until it runs |
| `.circleci/config.yml` | Verifies `CNAME` and the canonical link; accepts the pre- and post-rename repository names |
| `.github/workflows/dataset.yml` | Gated language-site root publication + `CNAME` |
| `docs/operations/lang-mithril-fund-cutover.md` | This runbook |

### `$id` decision

Applied rule from `spec/governance.md`: the schema `$id` is the canonical URI of
the published document, and a host relocation is **editorial**, not a semantic
change. The publication (`0.1`) and storage profile
(`mithril.computable-segments/reference-v1`) do not move. The old URI is
recorded in `$comment` and must keep resolving; step 6 records whether it
redirects or returns `404`. The
schema has no `$ref`, so the `$id` change cannot break reference resolution;
`scripts/check-dataset-schema.py` and the vectors are unaffected.

Do not merge this PR outside the cutover window: `README.md` and the schema
`$id` point at `lang.mithril.fund`, which does not resolve until step 1 runs.

## Cutover checklist

Run top to bottom in one window. Each step ends with a read-back; do not continue
if a read-back does not match.

Prerequisites:

- Repository admin or "manage GitHub Pages settings" on `mithril-lang/mithril`.
- Cloudflare access to the `mithril.fund` zone.
- `gh` authenticated (`gh auth status`) with `repo` and `workflow` scopes.
- This PR merged, and its merge commit SHA recorded (`MERGE_SHA`).

### 0. Record the starting point

```sh
gh api repos/mithril-lang/mithril/pages \
  --jq '{status,cname,https_enforced,html_url,build_type,source}'
gh api repos/mithril-lang/mithril/pages/builds --jq '.[0] | {status,created_at,commit}'
```

Expected: `cname` is `null`, `https_enforced` is `true`, source is
`gh-pages-todo:/`.

### 1. DNS: CNAME `lang` → `mithril-lang.github.io`, proxy off

Cloudflare dashboard: **DNS → Records → Add record**

| Field | Value |
| --- | --- |
| Type | `CNAME` |
| Name | `lang` |
| Target | `mithril-lang.github.io` |
| Proxy status | **DNS only** (grey cloud, `proxied=false`) |
| TTL | `Auto` (`1`) |

Equivalent API call (`CF_ZONE_ID` and `CF_API_TOKEN` must be set):

```sh
curl -sS -X POST "https://api.cloudflare.com/client/v4/zones/$CF_ZONE_ID/dns_records" \
  -H "Authorization: Bearer $CF_API_TOKEN" \
  -H "Content-Type: application/json" \
  --data '{"type":"CNAME","name":"lang","content":"mithril-lang.github.io","proxied":false,"ttl":1}' \
  | jq '{success, errors, result: (.result | {name,type,content,proxied})}'
```

Verify:

```sh
dig +short CNAME lang.mithril.fund
dig +short A lang.mithril.fund
```

Expected: the first prints `mithril-lang.github.io.`; the second prints the four
GitHub Pages addresses (`185.199.108.153`, `185.199.109.153`,
`185.199.110.153`, `185.199.111.153`). An empty `CNAME` with no `A` means the
record is wrong or still proxied.

Do not continue until `dig` resolves. GitHub cannot issue a certificate for an
unresolvable host.

### 2. Publish the language site and `CNAME` to the Pages branch

```sh
gh workflow run dataset.yml --repo mithril-lang/mithril --ref main \
  -f publish_language_site=true
RUN_ID=""
for _ in 1 2 3 4 5 6; do
  RUN_ID=$(gh run list --repo mithril-lang/mithril --workflow dataset.yml \
    --event workflow_dispatch --branch main --limit 1 \
    --json databaseId --jq '.[0].databaseId')
  [ -n "$RUN_ID" ] && break
  sleep 5
done
test -n "$RUN_ID" || { echo "no dispatched run found" >&2; exit 1; }
gh run watch --repo mithril-lang/mithril "$RUN_ID" --exit-status
```

Read back the branch (raw content, no base64 decoding):

```sh
gh api "repos/mithril-lang/mithril/contents/CNAME?ref=gh-pages-todo" \
  -H 'Accept: application/vnd.github.raw'
gh api "repos/mithril-lang/mithril/contents/index.html?ref=gh-pages-todo" \
  -H 'Accept: application/vnd.github.raw' | grep -m1 'rel="canonical"'
gh api "repos/mithril-lang/mithril/contents/dataset/index.html?ref=gh-pages-todo" \
  -H 'Accept: application/vnd.github.raw' | grep -m1 '<title>'
```

Expected: `lang.mithril.fund`; the canonical link
`https://lang.mithril.fund/`; a Dataset title. If the workflow did not run,
check that the merge touched the workflow `paths` filter and dispatch it
manually — `workflow_dispatch` is in the trigger list.

### 3. Enable the Pages custom domain and HTTPS enforcement

Committing `CNAME` normally binds the domain, but set it explicitly and confirm
the certificate state:

```sh
gh api --method PUT repos/mithril-lang/mithril/pages \
  -f cname=lang.mithril.fund \
  -F https_enforced=true
gh api repos/mithril-lang/mithril/pages \
  --jq '{status,cname,https_enforced,html_url,build_type,source,cert:.https_certificate.state}'
```

Expected: `cname` is `lang.mithril.fund`, `https_enforced` is `true`,
`html_url` is `https://lang.mithril.fund/`, and `cert` moves through
`authorization_pending` → `issued`/`approved` (usually minutes, up to an hour).

Re-run the read-back until the certificate is `issued` or `approved`:

```sh
gh api repos/mithril-lang/mithril/pages --jq '.https_certificate.state'
```

If it stays `errored` or `bad_authz`, fix DNS first (step 1) and then toggle the
domain off and on:

```sh
gh api --method PUT repos/mithril-lang/mithril/pages --input - <<'JSON'
{"cname": null}
JSON
gh api --method PUT repos/mithril-lang/mithril/pages \
  -f cname=lang.mithril.fund -F https_enforced=true
```

### 4. Verify the new host before renaming

```sh
for path in / /grammar.ebnf /dataset/ /dataset/spec/v0.1/specification.html \
            /dataset/spec/v0.1/bundle.schema.json /dataset/v0.1/vectors/README.html; do
  curl -sS -o /dev/null -w "%{http_code} %{url_effective}\n" "https://lang.mithril.fund$path"
done
curl -sS https://lang.mithril.fund/dataset/spec/v0.1/bundle.schema.json | jq -r '."$id"'
```

Expected: `200` for every path; the last command prints
`https://lang.mithril.fund/dataset/spec/v0.1/bundle.schema.json`.

Record the pre-rename redirect behavior of the old Pages URL:

```sh
curl -sSI https://mithril-lang.github.io/mithril/dataset/ | sed -n '1p;/^[Ll]ocation:/p'
curl -sSI https://mithril-lang.github.io/mithril/ | sed -n '1p;/^[Ll]ocation:/p'
```

Write the observed status and `Location` into the table in "Post-cutover
record"; do not assume a redirect. If the old URLs return `404`, the custom
domain is bound but the `github.io` alias is not redirecting — keep the old
Pages URL in external docs until step 6 records the post-rename result.

Stop here if any of steps 1–4 failed. The repository rename is not reversible
without another public change.

### 5. Rename the repository to `mithril-lang/mithril-lang`

```sh
gh repo rename mithril-lang --repo mithril-lang/mithril
gh api repos/mithril-lang/mithril-lang --jq .full_name
gh api repos/mithril-lang/mithril-lang/pages \
  --jq '{status,cname,https_enforced,html_url,build_type,source,cert:.https_certificate.state}'
```

Expected: `mithril-lang/mithril-lang`; Pages keeps
`cname=lang.mithril.fund`, `https_enforced=true`, source `gh-pages-todo:/`.
GitHub redirects the old repository API path and old clone URLs, so existing
remotes keep working; update them when convenient:

```sh
git remote set-url origin https://github.com/mithril-lang/mithril-lang.git
```

Do not run this step before step 4. The rename changes every Pages API path in
this document from `repos/mithril-lang/mithril/...` to
`repos/mithril-lang/mithril-lang/...`.

### 6. Post-rename verification

```sh
for path in / /grammar.ebnf /dataset/ /dataset/spec/v0.1/specification.html \
            /dataset/spec/v0.1/bundle.schema.json /dataset/v0.1/vectors/README.html; do
  curl -sS -o /dev/null -w "%{http_code} %{url_effective}\n" "https://lang.mithril.fund$path"
done
curl -sS https://lang.mithril.fund/dataset/spec/v0.1/bundle.schema.json | jq -r '."$id"'
curl -sS https://lang.mithril.fund/ | grep -m1 'rel="canonical"'
```

Expected: `200` for every path; the schema `$id` is
`https://lang.mithril.fund/dataset/spec/v0.1/bundle.schema.json`; the canonical
link is `https://lang.mithril.fund/`.

Record whether the old Pages URLs redirect (fill this table with the observed
output; do not assume):

```sh
curl -sSI https://mithril-lang.github.io/mithril/dataset/ | sed -n '1p;/^[Ll]ocation:/p'
curl -sSI https://mithril-lang.github.io/mithril/ | sed -n '1p;/^[Ll]ocation:/p'
curl -sSI https://mithril-lang.github.io/mithril-lang/dataset/ | sed -n '1p;/^[Ll]ocation:/p'
```

| Check | URL | Status | `Location` | Verdict |
| --- | --- | --- | --- | --- |
| Language root | `https://lang.mithril.fund/` |  |  |  |
| Dataset root | `https://lang.mithril.fund/dataset/` |  |  |  |
| Dataset spec | `https://lang.mithril.fund/dataset/spec/v0.1/specification.html` |  |  |  |
| Schema | `https://lang.mithril.fund/dataset/spec/v0.1/bundle.schema.json` |  |  |  |
| Old repo Pages, dataset (pre-rename URL) | `https://mithril-lang.github.io/mithril/dataset/` |  |  |  |
| Old repo Pages, root (pre-rename URL) | `https://mithril-lang.github.io/mithril/` |  |  |  |
| Renamed repo Pages, dataset | `https://mithril-lang.github.io/mithril-lang/dataset/` |  |  |  |

A `301`/`302` to `https://lang.mithril.fund/...` is the expected outcome for the
old Pages URLs. If they return `404`, leave the old URLs in external docs and
open a follow-up; the custom domain itself is still correct.

### 7. External references (report, do not edit from this repository)

Known references to the old Pages URL, verified 2026-11-27:

- `mithril-twin` README.
- `mithril-fund` QA archives.
- `mithril-fund/services/system-one/runtime/pins.json` pins this repository by
  commit; a repository-URL change there is a separate PR.

Find the current set:

```sh
gh search code 'mithril-lang.github.io/mithril' --owner mithril-lang
gh search code 'github.com/mithril-lang/mithril' --owner mithril-fund
```

GitHub redirects renamed repository URLs, so these are not broken by the
rename, but they should be updated in their own repositories under their own
review.

## Rollback

Run only if the cutover must be undone. Order is the reverse of the cutover:
domain, branch, DNS, name.

1. Remove the Pages custom domain (this also clears the certificate binding):

```sh
gh api --method PUT repos/mithril-lang/mithril-lang/pages --input - <<'JSON'
{"cname": null}
JSON
gh api repos/mithril-lang/mithril-lang/pages --jq '{cname,https_enforced,html_url}'
```

Use `repos/mithril-lang/mithril/pages` instead if the repository has not been
renamed yet.

2. Revert the cutover commit on the Pages branch. This restores the previous
   root tree and removes `CNAME`:

```sh
git fetch origin gh-pages-todo
git worktree add /tmp/mithril-pages-rollback origin/gh-pages-todo
cd /tmp/mithril-pages-rollback
git log --oneline -5
git revert --no-edit "$CUTOVER_COMMIT"
git push origin HEAD:gh-pages-todo
```

3. Delete the DNS record:

```sh
CF_RECORD_ID=$(curl -sS "https://api.cloudflare.com/client/v4/zones/$CF_ZONE_ID/dns_records?name=lang.mithril.fund" \
  -H "Authorization: Bearer $CF_API_TOKEN" | jq -r '.result[0].id')
curl -sS -X DELETE "https://api.cloudflare.com/client/v4/zones/$CF_ZONE_ID/dns_records/$CF_RECORD_ID" \
  -H "Authorization: Bearer $CF_API_TOKEN" | jq '{success, errors}'
dig +short lang.mithril.fund
```

4. Rename the repository back:

```sh
gh repo rename mithril --repo mithril-lang/mithril-lang
gh api repos/mithril-lang/mithril --jq .full_name
```

5. If the preparation PR must also be reverted, revert its merge commit on
   `main` and re-run the normal checks:

```sh
git revert --no-edit -m 1 "$MERGE_SHA"
```

Verify the rollback:

```sh
curl -sS -o /dev/null -w '%{http_code} %{redirect_url}\n' https://mithril-lang.github.io/mithril/dataset/
gh api repos/mithril-lang/mithril/pages --jq '{cname,https_enforced,html_url,source}'
```

Expected: `200` for the old dataset URL, `cname=null`, source
`gh-pages-todo:/`.

## Notes and limits

- The branch name `gh-pages-todo` is a misnomer after cutover. Renaming it
  requires updating the Pages source (`source.branch`) in the same window and is
  deliberately out of scope.
- Subsequent Dataset-only publishes do not remove `CNAME` or the root language
  files: the rsync only targets `dataset/`, and the gated block is the only
  writer of the root.
- Re-running the gated publish is idempotent (`git rm --ignore-unmatch`, and the
  commit is skipped when nothing changed).
- HTTPS enforcement is already `true` today; the checklist keeps it `true` and
  does not rely on a manual toggle.
- Nothing in this repository changes DNS, Pages settings, the repository name or
  branch content at merge time. Only the dispatch in step 2 and the API call in
  step 3 do.
