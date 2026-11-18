import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { runBatch, runSecurityBatch, compileNative } from '../dist/runtime.mjs';

const fixture = (name) => readFileSync(new URL(`./fixtures/system-one/${name}`, import.meta.url), 'utf8');
const json = (name) => JSON.parse(fixture(name));
const sha256 = (text) => createHash('sha256').update(text).digest('hex');
const dynamicTasks = ['dynamic-refactor', 'dynamic-repair-inheritance', 'dynamic-repair-validation'];

// Each fixture is a full receipt the former nbb glue (mithril-batch.cljk on mithril
// 439a202) recorded in Fund system-one: both batches, all 11 snapshot cases.
for (const id of dynamicTasks) {
  test(`runBatch reproduces the recorded nbb receipt for ${id}`, () => {
    const { input, results } = json(`${id}.json`);
    assert.deepEqual(runBatch(input, {}).results, results);
  });
}

test('quad reuse and timing change only the timings, never the results', () => {
  const { input, results } = json('dynamic-refactor.json');
  const timed = runBatch(input, { timing: true, reuseOntologyQuads: true });
  assert.deepEqual(timed.results, results);
  assert.deepEqual(Object.keys(timed.timings).sort(), ['compile_calls', 'compile_seconds', 'data_parse_seconds',
    'entail_calls', 'entail_seconds', 'ontology_decode_hits', 'ontology_decode_misses', 'ontology_decode_seconds',
    'ontology_prepare_calls', 'ontology_prepare_seconds', 'reason_calls', 'reason_engine_seconds', 'reason_seconds',
    'schema_seconds', 'shacl_seconds']);
  assert.equal(timed.timings.compile_calls, 2);
  assert.equal(timed.timings.reason_calls, 22);
  assert.ok(timed.timings.ontology_decode_hits > 0, 'reuse serves repeated decodes from the batch cache');
  assert.ok(Object.values(timed.timings).every((x) => Number.isFinite(x) && x >= 0));
  assert.equal(runBatch(input).timings, undefined);
});

test('runSecurityBatch returns the recorded cases with per-batch compile and case timings', () => {
  const { input, results } = json('dynamic-repair-validation.json');
  const out = runSecurityBatch(input);
  assert.equal(out.length, 2);
  out.forEach((batch, i) => {
    assert.equal(batch['graph-digest'], results[i]['graph-digest']);
    assert.deepEqual(batch.cases, results[i].cases);
    assert.ok(batch['compile-ms'] >= 0);
    assert.equal(batch['case-ms'].length, batch.cases.length);
  });
});

test('compileNative reproduces the recorded source-conversion artifacts', () => {
  const recorded = json('native-receipts.json');
  for (const name of ['todo', 'refactored']) {
    const source = fixture(`${name}.mith`);
    assert.equal(sha256(source), recorded[name].mithril_sha256);
    const artifact = compileNative(source);
    assert.equal(artifact.format, 'mithril.native-js/artifact-v1');
    assert.equal(artifact.runtime, 'native-js');
    assert.deepEqual(artifact['required-imports'], []);
    assert.equal(sha256(artifact.source), recorded[name].artifact_sha256, `${name} artifact bytes`);
  }
});
