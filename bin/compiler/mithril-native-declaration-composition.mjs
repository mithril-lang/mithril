#!/usr/bin/env node
// mithril-native-declaration-composition: AOT bundle CLI. Mirrors bin/mithril-native-declaration-composition.cljk.
import fs from 'node:fs';
import path from 'node:path';
import {compileDeclarationComposition, readCompositionPlan, readCompositionSourcePlan, readDeclarationPlan} from '../../packages/runtime/dist/compiler.mjs';
const [source, flag, target, outFlag, output, ...extra] = process.argv.slice(2);
if (!(source && flag === '--target' && target && outFlag === '--output-directory' && output && extra.length === 0)) {
  console.error('usage: mithril-native-declaration-composition <composition.mith> --target js|js-browser --output-directory <new-directory>');
  process.exit(64);
}
if (!['js', 'js-browser'].includes(target)) {
  console.error('REFUSE\tnative-declarations-target\tNative declarations require target js or js-browser');
  process.exit(65);
}
let created = false;
function readFile(file) {
  const stat = fs.lstatSync(file);
  if (!(stat.isFile() && !stat.isSymbolicLink() && stat.size <= 1048576)) throw Object.assign(new Error('Expected bounded regular composition Mithril source'), {code: 'mithril.native-declarations/source'});
  return fs.readFileSync(file, 'utf8');
}
try {
  const text = readFile(source);
  const {['program-sources']: programSources} = readCompositionPlan(text);
  const directory = path.dirname(path.resolve(source));
  const programs = Object.fromEntries(programSources.map(n => [n, readFile(path.join(directory, n))]));
  const plans = programSources.map(n => readDeclarationPlan(programs[n]));
  const manifests = Object.fromEntries(plans.map(p => [p['runtime-source'], readFile(path.join(directory, p['runtime-source']))]));
  const readPlan = readCompositionSourcePlan(text, programs, manifests);
  const known = {...programs, ...manifests};
  const sources = Object.fromEntries(readPlan.sources.map(n => [n, known[n] ?? readFile(path.join(directory, n))]));
  const artifact = compileDeclarationComposition(text, sources);
  fs.mkdirSync(output); created = true;
  for (const [file, contents] of Object.entries(artifact.files)) {
    fs.mkdirSync(path.dirname(path.join(output, file)), {recursive: true});
    fs.writeFileSync(path.join(output, file), contents, {flag: 'wx'});
  }
  const {files, ...rest} = artifact;
  console.log(JSON.stringify({...rest, target, 'output-directory': output}));
} catch (e) {
  if (created) fs.rmSync(output, {recursive: true, force: true});
  console.error(`REFUSE\t${e.code || 'compile-error'}\t${e.message || e}`);
  process.exit(65);
}
