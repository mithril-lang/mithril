import test from 'node:test';
import assert from 'node:assert/strict';
import R from '../resources/datalake/runtime.cjs';
const I = value => ['I', value], B = value => ['B', value], L = (value, datatype = R.XSD + 'string', language = '') => ['L', value, datatype, language];
const P = I('urn:p'), G = I('urn:g');
function devices(n, irregular = false) {
  const quads = [];
  for (let i = 0; i < n; i++) {
    const s = I('urn:device:' + i);
    quads.push([s, I('urn:type'), I('urn:Device'), G], [s, I('urn:tenant'), L(irregular && i % 53 === 0 ? 'different' : 'example'), G], [s, I('urn:ordinal'), L(String(i), R.XSD + 'integer'), null]);
  }
  return {quads, emptyGraphs: [I('urn:empty')]};
}
test('finite range + constants + ordinal compress and exactly reconstruct', () => {
  const data = devices(1000), bundle = R.pack(data, {segmentSubjects: 100});
  assert.ok(bundle.segments.every(s => s.kind === 'model'));
  assert.deepEqual(R.unpack(bundle), {...data, quads: R.normalize(data.quads)});
  const opened = R.open(bundle);
  for (const i of [0, 9, 10, 99, 100, 999, 1000]) {
    const result = opened.querySubject(I('urn:device:' + i));
    assert.deepEqual(result.quads, R.normalize(data.quads.filter(q => q[0][1] === 'urn:device:' + i)));
    assert.ok(result.segmentsRead <= 1);
  }
});
test('exact exceptions and dictionary fallback preserve RDF terms', () => {
  const data = devices(500, true);
  data.quads.push([B('shared'), P, L('01', R.XSD + 'integer'), G], [B('shared'), P, L('日本語', 'http://www.w3.org/1999/02/22-rdf-syntax-ns#langString', 'ja'), null], [I('urn:other'), P, B('shared'), G]);
  data.quads.push(data.quads[0]);
  const bundle = R.pack(data, {segmentSubjects: 100});
  assert.deepEqual(R.unpack(bundle).quads, R.normalize(data.quads));
  assert.deepEqual(R.open(bundle).querySubject(B('shared')).quads, R.normalize(data.quads.filter(q => q[0][0] === 'B')));
});
test('physical identity changes with codec, tuple identity does not', () => {
  const a = R.pack(devices(100), {codec: 'gzip'}), b = R.pack(devices(100), {codec: 'zstd'});
  assert.equal(a.tupleDigest, b.tupleDigest); assert.notEqual(a.physicalDigest, b.physicalDigest);
  assert.deepEqual(R.unpack(a), R.unpack(b));
});
test('refuses executable expressions, illegal terms, invalid removals and budget expansion', () => {
  const model = {kind: 'model', domain: {kind: 'range', prefix: 'urn:s:', start: 0, count: 100}, templates: [[P, ['constant', L('v')], null]], remove: [], add: []};
  const budget = {maxQuads: 1000, maxSubjects: 1000, maxBytes: 1000000, maxWork: 1000};
  assert.equal(R.decodePayload(model, budget).length, 100);
  assert.throws(() => R.decodePayload({...model, templates: [[P, ['eval', 'process.exit()'], null]]}, budget), /unknown expression/);
  assert.throws(() => R.decodePayload({...model, remove: [[I('urn:not-generated'), P, L('v'), null]]}, budget), /retraction/);
  assert.throws(() => R.decodePayload(model, {...budget, maxQuads: 10}), /expansion budget/);
  assert.throws(() => R.pack({quads: [[L('subject'), P, I('urn:o'), null]]}), /position/);
  assert.throws(() => R.pack({quads: [[I('urn:s'), B('predicate'), I('urn:o'), null]]}), /position/);
  assert.throws(() => R.pack({quads: [[I('relative'), P, L('v'), null]]}), /position/);
  assert.throws(() => R.pack({quads: [[I('urn:bad\u0000'), P, L('v'), null]]}), /position/);
  assert.throws(() => R.pack({quads: [[I('urn:s'), P, L('v', 'http://www.w3.org/1999/02/22-rdf-syntax-ns#langString'), null]]}), /language/);
});
test('integrity, decompression limits and poisoned pruning metadata are checked', () => {
  const bundle = R.pack(devices(100));
  const corrupt = structuredClone(bundle); corrupt.segments[0].bytes = 'AAAA';
  assert.throws(() => R.unpack(corrupt), /integrity/);
  assert.throws(() => R.unpack(bundle, {maxBytes: 100}), /budget|integrity/);
  const poisoned = structuredClone(bundle); poisoned.segments[0].subjectRange.start = 1000;
  const {physicalDigest, ...body} = poisoned; poisoned.physicalDigest = R.hash(JSON.stringify(body));
  assert.throws(() => R.open(poisoned), /range mismatch/);
  const opened = R.open(bundle); bundle.segments[0].bytes = 'broken';
  assert.equal(opened.querySubject(I('urn:device:0')).quads.length, 3);
});
test('empty dataset and empty named graph are retained', () => {
  const data = {quads: [], emptyGraphs: [I('urn:empty')]};
  assert.deepEqual(R.unpack(R.pack(data)), data);
  assert.equal(R.open(R.pack(data)).querySubject(I('urn:none')).quads.length, 0);
});
test('a model exceeding the expansion budget falls back to a valid literal encoding', () => {
  const quads = [];
  for (let p = 0; p < 10; p++) for (let i = 0; i < 10; i++) if ((i + p) % 10 < 7) quads.push([I('urn:s:' + i), I('urn:p:' + p), L('same'), null]);
  const bundle = R.pack({quads}, {budget: {maxQuads: 70}});
  assert.equal(bundle.segments[0].kind, 'literal');
  assert.deepEqual(R.unpack(bundle, {maxQuads: 70}).quads, R.normalize(quads));
});
test('deterministic irregular datasets agree with full scans for every subject', () => {
  const quads = [];
  for (let i = 0; i < 250; i++) for (let p = 0; p < 1 + i % 7; p++) quads.push([I('urn:mixed:' + i), I('urn:p:' + p), L(String((i * 7919 + p * 31) % 104729)), i % 2 ? G : null]);
  const opened = R.open(R.pack({quads}, {segmentSubjects: 17}));
  for (let i = 0; i < 250; i++) assert.deepEqual(opened.querySubject(I('urn:mixed:' + i)).quads, R.normalize(quads.filter(q => q[0][1] === 'urn:mixed:' + i)));
});
export {devices};
