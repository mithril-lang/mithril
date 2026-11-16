import test from 'node:test';
import assert from 'node:assert/strict';
import R from '../resources/sd/runtime.cjs';

const expModel = {stocks:[{id:'P',initial:1}],parameters:[{id:'r',value:0.5}],rates:[{id:'growth',direction:'in',target:'P',expression:'r*P'}]};
const sampleAt = (run, t) => run.times.indexOf(t);
test('midpoint step integrates exponential growth to the analytic value', () => {
  const run = R.integrate(expModel, {dt: 0.01, horizon: 2});
  assert.equal(run.status, 'complete');
  const n = run.times.length;
  const last = run.stocks.P[n - 1];
  assert.ok(Math.abs(last - Math.E) < 5e-4, `expected e, got ${last}`);
  // dense check at the quarter points
  const q = run.times.indexOf(1);
  assert.equal(q, 100);
  assert.ok(Math.abs(run.stocks.P[q] - Math.sqrt(Math.E)) < 5e-4);
});
test('logistic growth saturates at the carrying capacity', () => {
  const model = {stocks:[{id:'P',initial:1}],parameters:[{id:'r',value:1},{id:'K',value:100}],rates:[{id:'growth',direction:'in',target:'P',expression:'r*P*(1-P/K)'}]};
  const run = R.integrate(model, {dt: 0.01, horizon: 10});
  const last = run.stocks.P[run.stocks.P.length - 1];
  assert.ok(last > 99.5 && last < 100.01, `expected ~K, got ${last}`);
  // analytic logistic at t=5: K / (1 + 99 e^-5) = 60.347...
  const mid = run.times.indexOf(5);
  assert.ok(Math.abs(run.stocks.P[mid] - 100 / (1 + 99 * Math.exp(-5))) < 0.5, `t=5: ${run.stocks.P[mid]}`);
  // monotone non-decreasing stock
  const s = run.stocks.P;
  for (let i = 1; i < s.length; i++) assert.ok(s[i] >= s[i - 1] - 1e-12);
});
test('bathtub stock with constant flows is linear and exact', () => {
  const model = {stocks:[{id:'water',initial:0}],constants:[{id:'in',value:2},{id:'out',value:1}],rates:[{id:'fill',direction:'in',target:'water',expression:'in'},{id:'drain',direction:'out',target:'water',expression:'out'}]};
  const run = R.integrate(model, {dt: 0.25, horizon: 4});
  assert.deepEqual(run.stocks.water, run.times.map(t => t));
});
test('auxiliary system solves by fixed-point iteration within budget', () => {
  const model = {stocks:[{id:'P',initial:1}],parameters:[{id:'r',value:0.5}],auxiliaries:[{id:'f',expression:'P/(P+1)'}],rates:[{id:'growth',direction:'in',target:'P',expression:'r*P*f'}]};
  const run = R.integrate(model, {dt: 0.1, horizon: 1});
  assert.equal(run.status, 'complete');
  assert.ok(run.stocks.P[run.stocks.P.length - 1] > 1);
});
test('time is admitted and rates may reference it', () => {
  const model = {stocks:[{id:'x',initial:0}],rates:[{id:'ramp',direction:'in',target:'x',expression:'time'}]};
  const run = R.integrate(model, {dt: 0.5, horizon: 2});
  // dx/dt = t, x = t^2/2, midpoint of t is exact for the quadratic
  const last = run.stocks.x[run.stocks.x.length - 1];
  assert.ok(Math.abs(last - 2) < 1e-9, `expected 2, got ${last}`);
});
test('expression grammar: precedence, power, unary minus and parens', () => {
  const model = {stocks:[{id:'x',initial:0}],rates:[{id:'f',direction:'in',target:'x',expression:'2+3*4^2-1/(2-4)'}]};
  const run = R.integrate(model, {dt: 1, horizon: 1});
  assert.equal(run.stocks.x[1], 50.5);
});
test('unknown identifiers and unparseable text fail closed', () => {
  const base = {stocks:[{id:'P',initial:1}]};
  for (const badExpr of ['r*missing', 'r**P', 'r P', '1 +', '']) assert.throws(() => R.integrate({...base, rates: [{id: 'g', direction: 'in', target: 'P', expression: badExpr}]}, {dt: 1, horizon: 1}));
  assert.throws(() => R.integrate({stocks: [{id: 'P', initial: 1}], rates: [{id: 'g', direction: 'sideways', target: 'P', expression: '1'}]}, {dt: 1, horizon: 1}));
  assert.throws(() => R.integrate({stocks: [{id: 'P', initial: 1}], rates: [{id: 'g', direction: 'in', target: 'missing', expression: '1'}]}, {dt: 1, horizon: 1}));
});
test('duplicate and unsafe identifiers refuse', () => {
  assert.throws(() => R.integrate({stocks: [{id: 'P', initial: 1}, {id: 'P', initial: 2}]}, {dt: 1, horizon: 1}));
  assert.throws(() => R.integrate({stocks: [{id: '__proto__', initial: 1}]}, {dt: 1, horizon: 1}));
  assert.throws(() => R.integrate({stocks: [{id: 'a b', initial: 1}]}, {dt: 1, horizon: 1}));
});
test('budgets: dt, horizon, steps and overflow', () => {
  assert.throws(() => R.integrate(expModel, {dt: 0, horizon: 1}), /dt/);
  assert.throws(() => R.integrate(expModel, {dt: 2, horizon: 1}), /dt/);
  assert.throws(() => R.integrate(expModel, {dt: 1, horizon: -1}), /horizon/);
  assert.throws(() => R.integrate(expModel, {dt: 0.001, horizon: 1e6}), /budget/);
  const fast = {stocks: [{id: 'P', initial: 1.7e308}], rates: [{id: 'g', direction: 'in', target: 'P', expression: 'P'}]};
  assert.throws(() => R.integrate(fast, {dt: 1, horizon: 1}), /overflow/);
});
test('auxiliary non-convergence is refused, not looped forever', () => {
  const model = {stocks: [{id: 'P', initial: 1}], auxiliaries: [{id: 'a', expression: 'a + 1'}], rates: [{id: 'g', direction: 'in', target: 'P', expression: 'a'}]};
  assert.throws(() => R.integrate(model, {dt: 1, horizon: 1}), /converge/);
});
test('inert SD program declarations roundtrip through RDF', () => {
  const node = {'@id': 'urn:sd:run', '@type': R.NS + 'Program', [R.NS + 'key']: 'growth', [R.NS + 'model']: 'sd', [R.NS + 'specification']: JSON.stringify({model: expModel, dt: 0.01, horizon: 1})};
  const ps = R.programs({'@graph': [node]});
  assert.equal(ps.length, 1);
  assert.equal(ps[0].model, 'sd');
  assert.throws(() => R.programs({'@graph': [node, node]}), /duplicate/);
  assert.throws(() => R.programs({'@graph': [{...node, [R.NS + 'model']: 'eval'}]}), /invalid SD program/);
});
test('run result is canonical JSON and sample budget is enforced', () => {
  const run = R.integrate(expModel, {dt: 0.1, horizon: 1, maxSamples: 5});
  assert.ok(run.times.length <= 6);
  assert.ok(run.times[0] === 0 && run.times[run.times.length - 1] === 1);
  const text = JSON.stringify(run);
  assert.equal(text, JSON.stringify(JSON.parse(text)));
  assert.throws(() => R.integrate(expModel, {dt: 1e-6, horizon: 10, maxSamples: 0}), /budget/);
});
// -- .mith source path (pure-JS reader + runtime; no Clojure entry) --
const mithText = (await import('node:fs')).readFileSync(new URL('../examples/sd/programs.mith', import.meta.url), 'utf8');
const {parseMith, readAll} = await import('../resources/sd/reader.mjs');
test('.mith programs.mith lowers to the same RDF as the clj form/parse oracle', () => {
  const doc = parseMith(mithText);
  assert.ok(Array.isArray(doc) && doc.length === 3);
  const g = doc.find(n => n['@id'] === 'urn:mithril:sd:growth');
  assert.deepEqual(g, {
    '@id': 'urn:mithril:sd:growth',
    'http://www.w3.org/1999/02/22-rdf-syntax-ns#type': [{'@id': 'https://mithril.fund/ns/sd/v1#Program'}],
    'https://mithril.fund/ns/sd/v1#key': [{'@value': 'growth'}],
    'https://mithril.fund/ns/sd/v1#model': [{'@value': 'sd'}],
    'https://mithril.fund/ns/sd/v1#specification': [{'@value': JSON.stringify({model: expModel, dt: 0.01, horizon: 2})}],
  });
  assert.ok(doc.find(n => n['@id'] === 'urn:mithril:sd:bathtub'));
  assert.ok(doc.find(n => n['@id'] === 'urn:mithril:sd:logistic'));
});
test('.mith reader: comments, escapes and multiple top-level forms are refused', () => {
  assert.deepEqual(readAll('(rdf/iri "a:b")\n; comment\n(rdf/iri "a:c")'), [['rdf/iri','a:b'],['rdf/iri','a:c']]);
  assert.deepEqual(readAll('"\\u0041\\t"'), ['A\t']);
  assert.throws(() => parseMith('(rdf/iri "a:b")\n(rdf/iri "a:c")'), /exactly one form/);
});
test('.mith reader: malformed RDF data fails closed', () => {
  assert.throws(() => parseMith('(rdf/dataset (rdf/graph nil (rdf/description "urn:x:1" (rdf/property "urn:p:1" (rdf/literal :key)))))'), /lexical string/);
  assert.throws(() => parseMith('(rdf/dataset (rdf/graph nil (rdf/description "urn:x:1" (rdf/property "urn:p:1" (rdf/iri "urn:a:1")) (rdf/property "urn:p:1" (rdf/iri "urn:a:2")))))'), /duplicate RDF property/);
  assert.throws(() => parseMith('(rdf/dataset (rdf/graph nil (rdf/description "urn:x 1" (rdf/property "urn:p:1" (rdf/iri "urn:a:1")))))'), /IRI/);
  assert.throws(() => parseMith('(rdf/dataset (rdf/graph nil (rdf/description "urn:x:1" (rdf/property "urn:p:1" (rdf/literal "a" :datatype "xsd:date" :language "en")))))'), /not both/);
  assert.throws(() => parseMith('(rdf/dataset (rdf/graph nil (rdf/description "urn:x:1" (rdf/property "urn:p:1" (rdf/literal "a" :bogus 1)))))'), /only :datatype/);
  assert.throws(() => parseMith('(rdf/dataset (rdf/graph nil (rdf/description "urn:x:1" (rdf/property "urn:p:1"))))'), /explicit RDF terms/);
});
test('end-to-end: .mith source runs through the pure-JS reader and runtime', async () => {
  const {run} = await import(new URL('../bin/mithril-sd.mjs', import.meta.url));
  const result = run(['run', new URL('../examples/sd/programs.mith', import.meta.url).pathname, 'growth']);
  assert.equal(result.status, 'complete');
  assert.ok(Math.abs(result.stocks.P[result.times.length - 1] - Math.E) < 5e-4);
  assert.throws(() => run(['run', new URL('../examples/sd/programs.mith', import.meta.url).pathname, 'missing']));
  const sized = run(['run', new URL('../examples/sd/programs.mith', import.meta.url).pathname, 'growth', '50']);
  assert.ok(sized.times.length <= 51);
});

test('reader rejects stray closing parentheses without hanging', () => {
  assert.throws(() => parseMith(')'), /closing parenthesis/);
  assert.throws(() => parseMith('(rdf/iri \"urn:x\"))'), /closing parenthesis/);
});
test('zero interior samples and unavailable rate identifiers fail safely', () => {
  const run = R.integrate(expModel, {dt: 0.01, horizon: 1, maxSamples: 0});
  assert.deepEqual(run.times, [0, 1]);
  assert.equal(run.stocks.P.length, 2);
  assert.throws(() => R.integrate({stocks: [{id: 'time'}]}, {dt: 1, horizon: 1}), /identifier/);
  assert.throws(() => R.integrate({stocks: [{id: 'x'}], rates: [{id: 'r', target: 'x', direction: 'in', expression: '1'}, {id: 'other', target: 'x', direction: 'in', expression: 'r'}]}, {dt: 1, horizon: 1}), /unknown identifier/);
});
