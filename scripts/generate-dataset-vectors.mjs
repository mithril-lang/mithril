import fs from 'node:fs';
import R from '../resources/datalake/runtime.cjs';
const dir = new URL('../spec/v0.1/vectors/', import.meta.url);
const I = s => ['I', s];
const L = s => ['L', s, R.XSD + 'string', ''];
const regular = {quads: [], emptyGraphs: [I('urn:empty')]};
for (let i = 0; i < 100; i++) {
  const s = I('urn:s:' + i);
  regular.quads.push([s, I('urn:type'), I('urn:Device'), null],
    [s, I('urn:n'), ['L', String(i), R.XSD + 'integer', ''], I('urn:g')],
    [s, I('urn:tenant'), L(i === 42 ? 'exception' : 'shared'), null]);
}
const terms = {quads: [[I('urn:s'), I('urn:p'), ['B', 'shared'], null],
  [['B', 'shared'], I('urn:p'), ['L', '01', R.XSD + 'integer', ''], I('urn:g')],
  [['B', 'shared'], I('urn:label'), ['L', '日本語', 'http://www.w3.org/1999/02/22-rdf-syntax-ns#langString', 'ja'], null]], emptyGraphs: [I('urn:empty')]};
for (const [name, data, options] of [['regular-zstd', regular, {}], ['terms-gzip', terms, {codec:'gzip'}], ['empty-zstd', {quads:[], emptyGraphs:[I('urn:empty')]}, {}]]) {
  const bundle = R.pack(data, options);
  fs.writeFileSync(new URL(name + '.bundle.json', dir), JSON.stringify(bundle) + '\n');
  fs.writeFileSync(new URL(name + '.dataset.json', dir), JSON.stringify(R.unpack(bundle)) + '\n');
}
