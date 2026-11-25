#!/usr/bin/env node
// mithril-native-declarations: AOT bundle CLI. Mirrors bin/mithril-native-declarations.cljk.
import fs from 'node:fs';
import path from 'node:path';
import {compileNativeDeclarations, declarationsRuntimeBasename, parseForm, checkNativePackage, checkNativeEsm, packageSourceBasenames, esmSourceBasenames} from '../../packages/runtime/dist/compiler.mjs';
const [source, flag, target, outFlag, output, ...extra] = process.argv.slice(2);
if (!(source && flag === '--target' && target && outFlag === '--output' && output && extra.length === 0)) {
  console.error('usage: mithril-native-declarations <declarations.mith> --target js|js-browser --output <library.d.mts>');
  process.exit(64);
}
if (!['js', 'js-browser'].includes(target)) {
  console.error('REFUSE\tnative-declarations-target\tNative declarations require target js or js-browser');
  process.exit(65);
}
function readLocal(dir, name) {
  const file = path.join(dir, name);
  const stat = fs.lstatSync(file);
  if (!(stat.isFile() && !stat.isSymbolicLink() && stat.size <= 1048576)) throw Object.assign(new Error('Expected bounded regular Mithril source'), {code: 'mithril.native-declarations/source'});
  return fs.readFileSync(file, 'utf8');
}
try {
  const text = fs.readFileSync(source, 'utf8');
  const name = declarationsRuntimeBasename(text);
  const directory = path.dirname(path.resolve(source));
  const runtimeText = readLocal(directory, name);
  const runtimeKind = parseForm(runtimeText)['@type'];
  let names, checkedRuntime;
  if (runtimeKind === 'NativeJsPackage') {
    names = packageSourceBasenames(runtimeText);
    checkedRuntime = checkNativePackage(runtimeText, Object.fromEntries(names.map(n => [n, readLocal(directory, n)])));
  } else if (runtimeKind === 'NativeJsEsmPackage' || runtimeKind === 'NativeJsEsmEntryPackage') {
    names = esmSourceBasenames(runtimeText);
    checkedRuntime = checkNativeEsm(runtimeText, Object.fromEntries(names.map(n => [n, readLocal(directory, n)])));
  } else {
    throw Object.assign(new Error('Expected checked native package runtime'), {code: 'mithril.native-declarations/runtime'});
  }
  const result = compileNativeDeclarations(text, checkedRuntime);
  fs.writeFileSync(output, result.source);
  const {source: _s, ...rest} = result;
  console.log(JSON.stringify({...rest, target, output}));
} catch (e) {
  console.error(`REFUSE\t${e.code || 'compile-error'}\t${e.message || e}`);
  process.exit(65);
}
