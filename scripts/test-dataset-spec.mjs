import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import R from '../resources/datalake/runtime.cjs';
const dir = new URL('../spec/v0.1/vectors/', import.meta.url);
for (const file of fs.readdirSync(dir).filter(f => f.endsWith('.bundle.json'))) {
  test('published vector: ' + file, () => {
    const bundle = JSON.parse(fs.readFileSync(new URL(file, dir)));
    const expected = JSON.parse(fs.readFileSync(new URL(file.replace('.bundle.json', '.dataset.json'), dir)));
    assert.deepEqual(R.unpack(bundle), expected);
    for (const codec of ['zstd', 'gzip']) assert.deepEqual(R.unpack(R.pack(expected, {codec})), expected);
  });
}
