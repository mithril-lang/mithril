#!/usr/bin/env node
// mithril-native-package: AOT bundle CLI. Mirrors bin/mithril-native-package.cljk.
import fs from 'node:fs';
import path from 'node:path';
import {compileNativePackage, packageSourceBasenames} from '../../packages/runtime/dist/compiler.mjs';
const [source, flag, target, outFlag, output, ...extra] = process.argv.slice(2);
if (!(source && flag === '--target' && target && outFlag === '--output' && output && extra.length === 0)) {
  console.error('usage: mithril-native-package <package.mith> --target js|js-browser --output <library.mjs>');
  process.exit(64);
}
if (!['js', 'js-browser'].includes(target)) {
  console.error('REFUSE\tnative-package-target\tNative packages require target js or js-browser');
  process.exit(65);
}
function readLocal(dir, name) {
  const file = path.join(dir, name);
  const stat = fs.lstatSync(file);
  if (!(stat.isFile() && !stat.isSymbolicLink() && stat.size <= 1048576)) throw Object.assign(new Error('Expected bounded regular Mithril source'), {code: 'mithril.native-package/source'});
  return fs.readFileSync(file, 'utf8');
}
try {
  const text = fs.readFileSync(source, 'utf8');
  const names = packageSourceBasenames(text);
  const directory = path.dirname(path.resolve(source));
  const sources = Object.fromEntries(names.map(n => [n, readLocal(directory, n)]));
  const result = compileNativePackage(text, sources);
  fs.writeFileSync(output, result.source);
  const {source: _s, ...rest} = result;
  console.log(JSON.stringify({...rest, target, output}));
} catch (e) {
  console.error(`REFUSE\t${e.code || 'compile-error'}\t${e.message || e}`);
  process.exit(65);
}
