"""Build the static specification site; only repository documentation is rendered."""
from pathlib import Path
import argparse
import html
import re
import shutil
import json
import subprocess
import markdown

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument("output", type=Path)
args = parser.parse_args()
OUT = args.output.resolve()
if OUT == ROOT or ROOT in OUT.parents and OUT.name != "dataset-site":
    raise SystemExit("use a separate output directory or dataset-site")
OUT.mkdir(parents=True, exist_ok=True)
files = list((ROOT / "spec").rglob("*")) + list((ROOT / "docs/dataset").rglob("*.md")) + list((ROOT / "docs/benchmarks").glob("computable-datalake-20261009.*"))
for path in files:
    if not path.is_file(): continue
    relative = path.relative_to(ROOT)
    dest = OUT / relative
    dest.parent.mkdir(parents=True, exist_ok=True)
    if path.suffix != ".md":
        shutil.copyfile(path, dest); continue
    rendered = markdown.markdown(path.read_text(), extensions=["tables", "fenced_code"])
    rendered = re.sub(r'href="([^"#?]+)\.md([#?][^"]*)?"', lambda m: 'href="' + m[1] + '.html' + (m[2] or '') + '"', rendered)
    # Source directory links point to their rendered README.
    rendered = rendered.replace('href="v0.1/vectors/"', 'href="v0.1/vectors/README.html"')
    dest = dest.with_suffix(".html")
    home = '../' * len(relative.parent.parts) + 'index.html'
    title = path.read_text().splitlines()[0].lstrip('# ')
    dest.write_text('<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + html.escape(title) + '</title><style>body{font:17px/1.6 system-ui;max-width:1000px;margin:40px auto;padding:0 24px;color:#182230}a{color:#155ac2}pre{overflow:auto;background:#f2f4f7;padding:18px}code{font-size:.9em}table{border-collapse:collapse}td,th{border:1px solid #ccd3dd;padding:8px;text-align:left}blockquote{border-left:4px solid #ccd3dd;margin-left:0;padding-left:18px}</style><nav><a href="' + home + '">Mithril Dataset</a> · <a href="https://github.com/mithril-lang/mithril/tree/main/spec">Source and revisions</a></nav><main>' + rendered + '</main></html>')
revision = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip()
(OUT / 'publication.json').write_text(json.dumps({'specification': '0.1', 'profile': 'mithril.computable-segments/reference-v1', 'sourceCommit': revision}) + '\n')
index = OUT / 'index.html'
index.write_text((OUT / 'spec/README.html').read_text().replace('href="v0.1/', 'href="spec/v0.1/').replace('href="governance.html"','href="spec/governance.html"').replace('href="implementation-status.html"','href="spec/implementation-status.html"').replace('href="../docs/', 'href="docs/').replace('href="../index.html"','href="index.html"'))
# Fail on broken relative links (anchors are only presentation navigation).
for path in OUT.rglob('*.html'):
    for link in re.findall(r'href="([^"]+)"', path.read_text()):
        if re.match(r'^[a-zA-Z][a-zA-Z0-9+.-]*:', link) or link.startswith('#'): continue
        target = (path.parent / link.split('#')[0].split('?')[0]).resolve()
        if not target.exists(): raise SystemExit(f'broken link in {path.relative_to(OUT)}: {link}')
print(f'Built specification site: {len(list(OUT.rglob("*.html")))} pages')
