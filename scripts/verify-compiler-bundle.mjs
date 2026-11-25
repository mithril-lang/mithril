#!/usr/bin/env node
// Verify the shadow-cljs AOT compiler bundle against the legacy nbb pipeline.
// Usage: node scripts/verify-compiler-bundle.mjs --nbb <nbb-cli.js>
// Exits non-zero on any byte difference or REFUSE mismatch.
import {spawnSync} from 'node:child_process';
import {mkdtempSync, writeFileSync, existsSync, mkdirSync, rmSync, readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve, join, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const nbbIdx = args.indexOf('--nbb');
if (nbbIdx < 0) throw Error('usage: verify-compiler-bundle.mjs --nbb <nbb cli.js>');
const nbb = resolve(args[nbbIdx + 1]);
if (!existsSync(nbb)) throw Error('nbb engine does not exist');
const dir = mkdtempSync(join(tmpdir(), 'compiler-verify-'));
const bundleCLI = join(repo, 'bin/compiler/mithril-native-js.mjs');
const bundleOut = join(dir, 'bundle.mjs');
const nbbOut = join(dir, 'nbb.mjs');
const config = join(dir, 'offline.edn');
let failures = 0;
function check(name, rel) {
  const src = join(repo, rel);
  const bundle = spawnSync(process.execPath, [bundleCLI, src, '--target', 'js', '--output', bundleOut], {encoding: 'utf8'});
  writeFileSync(config, `{:paths [${JSON.stringify(join(repo, 'src'))}]}`);
  const legacy = spawnSync(process.execPath, [nbb, '--config', config, join(repo, 'bin/mithril-native-js.cljk'), src, '--target', 'js', '--output', nbbOut], {encoding: 'utf8'});
  if (bundle.status !== legacy.status) { console.log(`FAIL ${name}: exit ${bundle.status} vs ${legacy.status}`); failures++; return; }
  if (bundle.status !== 0) { console.log(`ok ${name}: both REFUSE (${bundle.stderr.trim().split('\t')[1]})`); return; }
  const a = readFileSync(bundleOut);
  const b = readFileSync(nbbOut);
  if (a.equals(b)) console.log(`ok ${name}: byte-identical (${a.length}B)`);
  else { console.log(`FAIL ${name}: bundle ${a.length}B vs nbb ${b.length}B — diff follows`); failures++; }
}
for (const [name, rel] of [['cosmokit-leaf', 'examples/native-js-array.mith'], ['yaml-str', 'examples/native-js-yaml-str.mith']]) {
  try { check(name, rel); } catch (e) { console.log(`FAIL ${name}: ${e.message}`); failures++; }
}
rmSync(dir, {recursive: true, force: true});
if (failures) { console.log(`${failures} FAILURE(S)`); process.exit(1); }
console.log('All bundle smoke checks passed.');
