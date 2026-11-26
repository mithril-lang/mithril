#!/usr/bin/env node
// mithril-native-esm: AOT bundle CLI. Mirrors bin/mithril-native-esm.cljk.
//   mithril-native-esm <package.mith> --target js|js-browser --output-directory <new-directory>
import fs from 'node:fs';
import path from 'node:path';
import {compileNativeEsm, esmSourceBasenames} from '../../packages/runtime/dist/compiler.mjs';
const [source, flag, target, outFlag, output, ...extra] = process.argv.slice(2);
if (!(source && flag === '--target' && target && outFlag === '--output-directory' && output && extra.length === 0)) {
  console.error('usage: mithril-native-esm <package.mith> --target js|js-browser --output-directory <new-directory>');
  process.exit(64);
}
if (!['js', 'js-browser'].includes(target)) {
  console.error('REFUSE\tnative-esm-target\tNative ESM packages require target js or js-browser');
  process.exit(65);
}
let created = false;
function readLocal(dir, name) {
  const file = path.join(dir, name);
  const stat = fs.lstatSync(file);
  if (!(stat.isFile() && !stat.isSymbolicLink() && stat.size <= 1048576)) throw Object.assign(new Error('Expected bounded regular Mithril source'), {code: 'mithril.native-esm/source'});
  return fs.readFileSync(file, 'utf8');
}
try {
  const text = fs.readFileSync(source, 'utf8');
  const names = esmSourceBasenames(text);
  const directory = path.dirname(path.resolve(source));
  const sources = Object.fromEntries(names.map(n => [n, readLocal(directory, n)]));
  const result = compileNativeEsm(text, sources);
  fs.mkdirSync(output); created = true;
  for (const [name, contents] of Object.entries(result.files)) fs.writeFileSync(path.join(output, name), contents, {flag: 'wx'});
  const {files, ...rest} = result;
  console.log(JSON.stringify({...rest, target, 'output-directory': output}));
} catch (e) {
  if (created) fs.rmSync(output, {recursive: true, force: true});
  console.error(`REFUSE\t${e.code || 'compile-error'}\t${e.message || e}`);
  process.exit(65);
}
