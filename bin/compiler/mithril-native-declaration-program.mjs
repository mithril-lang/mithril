#!/usr/bin/env node
// mithril-native-declaration-program: AOT bundle CLI. Mirrors bin/mithril-native-declaration-program.cljk.
import fs from 'node:fs';
import path from 'node:path';
import {compileDeclarationProgram, readDeclarationPlan, checkNativeEsm, esmSourceBasenames} from '../../packages/runtime/dist/compiler.mjs';
const [source, flag, target, outFlag, output, ...extra] = process.argv.slice(2);
if (!(source && flag === '--target' && target && outFlag === '--output-directory' && output && extra.length === 0)) {
  console.error('usage: mithril-native-declaration-program <program.mith> --target js|js-browser --output-directory <new-directory>');
  process.exit(64);
}
if (!['js', 'js-browser'].includes(target)) {
  console.error('REFUSE\tnative-declarations-target\tNative declarations require target js or js-browser');
  process.exit(65);
}
let created = false;
function readFile(file) {
  const stat = fs.lstatSync(file);
  if (!(stat.isFile() && !stat.isSymbolicLink() && stat.size <= 1048576)) throw Object.assign(new Error('Expected bounded regular Mithril source'), {code: 'mithril.native-declarations/source'});
  return fs.readFileSync(file, 'utf8');
}
try {
  const text = readFile(source);
  const plan = readDeclarationPlan(text);
  const directory = path.dirname(path.resolve(source));
  const runtimeText = readFile(path.join(directory, plan['runtime-source']));
  const runtimeSources = Object.fromEntries(esmSourceBasenames(runtimeText).map(n => [n, readFile(path.join(directory, n))]));
  const runtime = checkNativeEsm(runtimeText, runtimeSources);
  const sources = Object.fromEntries(plan.sources.map(n => [n, readFile(path.join(directory, n))]));
  const artifact = compileDeclarationProgram(text, sources, runtime);
  fs.mkdirSync(output); created = true;
  for (const [name, contents] of Object.entries(artifact.files)) fs.writeFileSync(path.join(output, name), contents, {flag: 'wx'});
  const {files, ...rest} = artifact;
  console.log(JSON.stringify({...rest, target, 'output-directory': output}));
} catch (e) {
  if (created) fs.rmSync(output, {recursive: true, force: true});
  console.error(`REFUSE\t${e.code || 'compile-error'}\t${e.message || e}`);
  process.exit(65);
}
