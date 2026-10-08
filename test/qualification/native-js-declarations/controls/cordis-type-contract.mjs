import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

// Baseline only: a future Mithril candidate must use its own module identity for augmentation.
assert.equal(process.argv.length, 4, 'Expected compiler and Node type roots; candidate comparison is not implemented');
const [compiler, typeRoots] = process.argv.slice(2);
const ts = (await import(pathToFileURL(resolve(compiler)).href)).default;
assert.equal(ts.version, '6.0.3');
const fixture = fileURLToPath(new URL('../../../fixtures/cordis-declarations/', import.meta.url));
const provenance = JSON.parse(readFileSync(join(fixture, 'program-provenance.json'), 'utf8'));
const sha256 = data => createHash('sha256').update(data).digest('hex');
assert.deepEqual(provenance.config_diagnostics, []);
assert.deepEqual(provenance.diagnostics, []);
assert.equal(provenance.emitSkipped, false);
assert.equal(Object.keys(provenance.outputs).length, 9);
for (const [file, sha] of Object.entries(provenance.fixture_hashes)) {
  assert.equal(sha256(readFileSync(join(fixture, file))), sha, file);
}
assert.equal(sha256(readFileSync(resolve(fixture, '../cosmokit-declarations/index.d.ts'))), provenance.external_types.cosmokit);
for (const [file, metadata] of Object.entries(provenance.outputs)) {
  const data = readFileSync(join(fixture, 'program', file));
  assert.equal(data.length, metadata.bytes, file);
  assert.equal(sha256(data), metadata.sha256, file);
}
const reference = join(fixture, 'program/index.d.ts');
const options = {
  strict: true, noEmit: true, skipLibCheck: false,
  target: ts.ScriptTarget.ES2024, module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler, allowImportingTsExtensions: true,
  types: ['node'], typeRoots: [resolve(typeRoots)],
  paths: {
    '@deepseek-ai/cosmokit': [resolve(fixture, '../cosmokit-declarations/index.d.ts')],
    '@standard-schema/spec': [join(fixture, 'standard-schema/index.d.ts')],
  },
};
// All files form one consumer program; this augmentation is visible to every case.
const augmentation = `
  declare module ${JSON.stringify(join(fixture, 'program/context.ts'))} {
    interface Context { demo: { run(): number }; }
  }
  declare module ${JSON.stringify(join(fixture, 'program/events.ts'))} {
    interface Events { 'demo/event': (value: number) => void; }
  }
`;
const positives = [
  ['class/interface/built-in augmentation', `const c=new api.Context();c.on('internal/plugin',fiber=>{const f:api.Fiber=fiber;});c.provide('api',1);c.plugin(()=>{});c.effect(()=>()=>{});c.logger('test').info('hello');c.reflect.get('api');c.registry.size;const f:api.Fiber=c.fiber;`],
  ['Context polymorphic this', 'class Child extends api.Context{extra=1;}const c=new Child();const root:Child=c.root;const child:Child=c.extend({a:1});'],
  ['unique symbols', 'declare const c:api.Context;const isolate:Record<string,symbol>=c[api.symbols.isolate];const key:typeof api.Context.effect=api.Context.effect;'],
  ['abstract generic service subclass', `class S extends api.Service<{x:number}>{constructor(c:api.Context){super(c,'api');}read(){return this.ctx.root;}merge(){return this[api.symbols.resolveConfig]({x:1},{x:2});}}`],
  ['Fiber asynchronous methods', 'declare const f:api.Fiber;const p:Promise<api.Fiber>=f.await();f.restart();f.dispose();'],
  ['plugin callback required config', 'declare const c:api.Context;const p=(c:api.Context,v:{x:number})=>{};c.plugin(p,{x:1});'],
  ['plugin callback optional config', 'declare const c:api.Context;const p=(c:api.Context,v?:{x:number})=>{};c.plugin(p);c.plugin(p,{x:1});'],
  ['plugin constructor config', 'declare const c:api.Context;class P{constructor(c:api.Context,v:{x:number}){}}c.plugin(P,{x:1});'],
  ['plugin object config', 'declare const c:api.Context;const p={apply(c:api.Context,v:{x:number}){}};c.plugin(p,{x:1});'],
  ['external Context/Events augmentation', `${augmentation}declare const c:api.Context;const n:number=c.demo.run();c.on('demo/event',v=>{const x:number=v;});c.emit('demo/event',3);`],
  ['const enum contracts', 'const a:api.FiberState=api.FiberState.ACTIVE;const b:api.LoggerLevel=api.LoggerLevel.INFO;'],
  ['volatile type-only reexports', 'type V=api.Volatile<{x:number}>;type S=api.VolatileSnapshot<{x:{y:1}}>;declare const v:V;const n:number=v.get().x;'],
  ['class/namespace merging', `const e=new api.CordisError('INACTIVE_EFFECT');type C=api.CordisError.Code;type I=api.Inject;type P=api.Plugin;`],
  ['logger class/interface merging', `declare const l:api.Logger;l.error('x');l.warn('x');l.info('x');l.debug('x');declare const c:api.Context;c.logger.info('x');`],
  ['generic DisposableList', 'const list=new api.DisposableList<object>();const x={};const cleanup:()=>boolean=list.push(x);const n:number=list.length;list.delete(x);list.clear();'],
  ['Service out covariance', 'declare const narrow:api.Service<{x:1}>;const wide:api.Service<{x:number}>=narrow;'],
];
const negatives = [
  ['abstract construction', `new api.Service(new api.Context(),'api');`, [2511]],
  ['protected access', 'declare const s:api.Service;s.ctx;', [2445]],
  ['required plugin config missing', 'new api.Context().plugin((c:api.Context,v:{x:number})=>{});', [2554]],
  ['wrong plugin config', 'new api.Context().plugin((c:api.Context,v:{x:number})=>{},{x:"wrong"});', [2322]],
  ['invalid fiber enum', 'const f:api.FiberState=1000;', [2322]],
  ['volatile immutable snapshot', 'declare const v:api.Volatile<{x:number}>;v.get().x=2;', [2540]],
  ['wrong augmented event arg', `new api.Context().emit('demo/event','wrong');`, [2769]],
  ['unknown property', 'new api.Context().missing;', [2339]],
  ['readonly static symbol', 'api.Context.effect=Symbol();', [2540]],
  ['weak list primitive', 'new api.DisposableList<number>();', [2344]],
  ['private class access', 'declare const f:api.Fiber;f._runner;', [2341]],
  ['private nominal identity', 'declare class Fake{private sn:number;private map:number;private weak:number;readonly length:number;push(value:object):()=>boolean;delete(value:object):boolean;clear():object[];[Symbol.iterator]():MapIterator<object>;}declare const fake:Fake;const list:api.DisposableList<object>=fake;', [2322]],
  ['const enum object unavailable', 'const state=api.FiberState;', [2475]],
  ['type-only export unavailable as value', 'const v=api.Volatile;', [2339]],
  ['Service covariance reverse rejected', 'declare const wide:api.Service<{x:number}>;const narrow:api.Service<{x:1}>=wide;', [2322]],
];
const dir = mkdtempSync(join(tmpdir(), 'mithril-cordis-types-'));
try {
  const groups = [];
  for (const [category, cases] of [['positive', positives], ['negative', negatives]]) {
    for (const [index, [name, body, expected]] of cases.entries()) {
      const file = join(dir, `${category}-${index}.ts`);
      writeFileSync(file, `import * as api from ${JSON.stringify(reference.replace(/\.d\.ts$/, '.js'))};\n${body}\n`);
      groups.push({ category, name, file, expected });
    }
  }
  const program = ts.createProgram(groups.map(g => g.file), options);
  const diagnostics = ts.getPreEmitDiagnostics(program);
  const negativeFiles = new Set(groups.filter(g => g.category === 'negative').map(g => g.file));
  const unexpected = diagnostics.filter(d => !d.file || !negativeFiles.has(d.file.fileName));
  assert.deepEqual(unexpected.map(d => ({ code: d.code, file: d.file?.fileName, message: ts.flattenDiagnosticMessageText(d.messageText, ' ') })), []);
  for (const group of groups.filter(g => g.category === 'negative')) {
    const codes = diagnostics.filter(d => d.file?.fileName === group.file).map(d => d.code).sort((a,b) => a-b);
    assert.deepEqual(codes, group.expected, group.name);
  }
  const checker = program.getTypeChecker();
  const symbol = checker.getSymbolAtLocation(program.getSourceFile(reference));
  const surface = checker.getExportsOfModule(symbol).map(s => {
    const target = s.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(s) : s;
    return { name: s.name, value: !!(target.flags & ts.SymbolFlags.Value), type: !!(target.flags & ts.SymbolFlags.Type), const_enum: !!(target.flags & ts.SymbolFlags.ConstEnum) };
  }).sort((a,b) => a.name.localeCompare(b.name));
  const expectedSurface = JSON.parse(readFileSync(join(fixture, 'public-surface.json'), 'utf8'));
  assert.deepEqual(surface, expectedSurface);
  assert.equal(surface.length, 50);
  assert.equal(surface.filter(s => s.value && !s.const_enum).length, 26);
  assert.deepEqual(surface.filter(s => s.const_enum).map(s => s.name), ['FiberState', 'LoggerLevel']);
  assert(surface.filter(s => ['Volatile', 'VolatileSnapshot'].includes(s.name)).every(s => s.type && !s.value));
  console.log(JSON.stringify({
    format: 'mithril.cordis-original-type-oracle/v1',
    positive_groups: positives.length, negative_groups: negatives.length,
    original_declaration_modules: Object.keys(provenance.outputs).length,
    public_names: surface.length, runtime_values: 26,
    const_enums: ['FiberState', 'LoggerLevel'],
    candidate_compared: false,
    scope: 'Pinned original declarations with strict library checks and finite consumer cases; no Mithril public type implementation or whole repository build claim',
  }, null, 2));
} finally {
  rmSync(dir, { recursive: true, force: true });
}
