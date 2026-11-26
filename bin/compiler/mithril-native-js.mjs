#!/usr/bin/env node
// mithril-native-js: AOT bundle CLI (Item 224 §C.2). Same contract as bin/mithril-native-js.cljk:
//   mithril-native-js <source.mith> --target js|js-browser --output <file.mjs>
// node:fs only (allowlist). Compiler is packages/runtime/dist/compiler.mjs.
import fs from 'node:fs';
import {compileNativeJs} from '../../packages/runtime/dist/compiler.mjs';
const args = process.argv.slice(2);
const [source, flag, target, outFlag, output, ...extra] = args;
if (!(source && flag === '--target' && target && outFlag === '--output' && output && extra.length === 0)) {
  console.error('usage: mithril-native-js <source.mith> --target js|js-browser --output <file.mjs>');
  process.exit(64);
}
if (!['js', 'js-browser'].includes(target)) {
  console.error('REFUSE\tnative-js-target\tNative JS host modules require target js or js-browser');
  process.exit(65);
}
try {
  const result = compileNativeJs(fs.readFileSync(source, 'utf8'));
  fs.writeFileSync(output, result.source);
  console.log(JSON.stringify({format: 'mithril.native-js/artifact-v1', target, module: result.module, 'required-imports': result['required-imports'], exports: result.exports, output}));
} catch (e) {
  console.error(`REFUSE\t${e.code || 'compile-error'}\t${e.message || e}`);
  process.exit(65);
}
