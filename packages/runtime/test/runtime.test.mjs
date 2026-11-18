import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { compileApp, appAgentLibrary, version, sourceSha } from '../dist/runtime.mjs';

const fixture = (name) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');
// The app Worker answered with JSON.stringify(clj->js body, null, 2).
const admitted = (text) => JSON.stringify({ status: 'admitted', ...compileApp(text) }, null, 2);

// The one intended difference from live. Live runs mithril 439a202. Since then,
// 2282792 (#161, bounded report rows) added the optional `report-rows` property
// to the app SHACL shape, so the validate receipt's input digest (which hashes
// {:shape :node}) changes. Its output, the report, is unchanged. Everything
// else must stay byte-for-byte equal to live.
const LIVE_VALIDATE_INPUT = 'sha256:32ffde5592797bad2d726010bc1dd429a1548723cf789c81a379f53a66c51bad';
const SHAPE_WITH_REPORT_ROWS = 'sha256:c45550701fd3fbdc97f049482801d1634e4558ea9a288dedeb981c5caf6b172c';
const asLive = (body) => {
  assert.equal(body.split(SHAPE_WITH_REPORT_ROWS).length - 1, 2, 'validate input digest appears once in semanticRun and once in trace');
  return body.replaceAll(SHAPE_WITH_REPORT_ROWS, LIVE_VALIDATE_INPUT);
};

test('admits the published Form starter byte-for-byte as live /api/compile did, except the #161 shape digest', () => {
  assert.equal(asLive(admitted(fixture('starter.mith'))), fixture('admitted-form.json'));
});

test('admits the published JSON-LD starter byte-for-byte as live /api/compile did, except the #161 shape digest', () => {
  assert.equal(asLive(admitted(fixture('jsonld.mith'))), fixture('admitted-jsonld.json'));
});

test('refuses malformed source with the live code and detail', () => {
  let refused;
  try { compileApp('(not a mithril app'); } catch (error) { refused = error; }
  assert.ok(refused instanceof Error);
  assert.equal(JSON.stringify({ status: 'refused', code: refused.code, detail: refused.detail }, null, 2), fixture('refused-422.json'));
});

test('compiles the published agent-loop-v1 library to its pinned identity', () => {
  const lib = appAgentLibrary();
  assert.equal(lib['graph-digest'], 'sha256:b7d1290a2fe8d8f6f0a17c49d2774b9396e9389fb5d070e98335d8d5517266ce');
  assert.equal(lib.library.id, 'https://mithril.fund/lib/app/agent-loop-v1');
});

test('identifies itself and matches its manifest', () => {
  const manifest = JSON.parse(readFileSync(new URL('../dist/manifest.json', import.meta.url), 'utf8'));
  assert.equal(version, manifest.version);
  assert.equal(sourceSha, manifest.sourceSha);
  assert.match(sourceSha, /^[0-9a-f]{40}$/);
  const bytes = readFileSync(new URL('../dist/runtime.mjs', import.meta.url));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), manifest.sha256);
});
