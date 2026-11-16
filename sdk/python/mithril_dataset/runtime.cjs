'use strict';
// Reference storage evaluator. No host eval; not the native Amu ABI.
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const FORMAT = 'mithril.computable-segments/reference-v1';
const XSD = 'http://www.w3.org/2001/XMLSchema#';
const DEFAULT = {maxQuads: 2000000, maxSubjects: 500000, maxBytes: 256 * 1024 * 1024, maxWork: 8000000};
const key = x => JSON.stringify(x);
const hash = x => 'sha256:' + crypto.createHash('sha256').update(x).digest('hex');
function fail(message) { throw new Error('mithril-datalake: ' + message); }
function keys(value, expected) {
  if (!value || Array.isArray(value) || typeof value !== 'object' || key(Object.keys(value).sort()) !== key(expected.slice().sort())) fail('invalid fields');
}
function integer(n, min, max) { if (!Number.isSafeInteger(n) || n < min || n > max) fail('integer budget'); }
function limits(options = {}) {
  if (Object.keys(options).some(k => !(k in DEFAULT))) fail('unknown limit');
  const result = {...DEFAULT, ...options};
  for (const n of Object.values(result)) integer(n, 1, Number.MAX_SAFE_INTEGER);
  return result;
}
function term(t, position) {
  if (t === null && position === 3) return;
  if (!Array.isArray(t) || typeof t[1] !== 'string') fail('invalid term');
  if (t[0] === 'I' && t.length === 2 && /^[A-Za-z][A-Za-z0-9+.-]*:[^\u0000-\u0020\s<>"{}|^`\\]*$/u.test(t[1])) return;
  if (t[0] === 'B' && t.length === 2 && position !== 1 && t[1].length > 0) return;
  if (t[0] === 'L' && position === 2 && t.length === 4 && typeof t[2] === 'string' && typeof t[3] === 'string') {
    term(['I', t[2]], 1);
    if ((t[3] && (!/^[A-Za-z]+(?:-[A-Za-z0-9]+)*$/.test(t[3]) || t[2] !== 'http://www.w3.org/1999/02/22-rdf-syntax-ns#langString')) || (!t[3] && t[2] === 'http://www.w3.org/1999/02/22-rdf-syntax-ns#langString')) fail('language datatype');
    return;
  }
  fail('invalid RDF term position');
}
function quad(q) { if (!Array.isArray(q) || q.length !== 4) fail('invalid quad'); q.forEach(term); }
function normalize(quads, budget = DEFAULT) {
  if (!Array.isArray(quads) || quads.length > budget.maxQuads) fail('quad budget');
  const unique = new Map();
  let bytes = 0;
  for (const q of quads) { quad(q); const k = key(q); bytes += Buffer.byteLength(k); if (bytes > budget.maxBytes) fail('byte budget'); unique.set(k, q); }
  return [...unique.entries()].sort((a, b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0).map(e => e[1]);
}
function envelope(quads, emptyGraphs, budget) {
  const qs = normalize(quads, budget);
  if (!Array.isArray(emptyGraphs) || emptyGraphs.length > budget.maxSubjects) fail('graph budget');
  emptyGraphs.forEach(g => term(g, 3));
  const graphs = [...new Map(emptyGraphs.map(g => [key(g), g])).values()].sort((a, b) => key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0);
  return {quads: qs, emptyGraphs: graphs};
}
function dictionary(quads) {
  const terms = [...new Map(quads.flat().map(t => [key(t), t])).values()].sort((a, b) => key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0);
  const ids = new Map(terms.map((t, i) => [key(t), i]));
  return {kind: 'literal', terms, rows: quads.map(q => q.map(t => ids.get(key(t)))).sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2] || a[3] - b[3])};
}
function numericSubject(s) {
  if (s[0] !== 'I') return null;
  const m = /^(.*?)(0|[1-9][0-9]*)$/.exec(s[1]);
  return m && Number.isSafeInteger(Number(m[2])) ? {prefix: m[1], n: Number(m[2])} : null;
}
function domain(subjects) {
  const parsed = subjects.map(numericSubject);
  if (parsed.every(Boolean) && parsed.every(p => p.prefix === parsed[0].prefix)) {
    const nums = parsed.map(p => p.n).sort((a, b) => a - b);
    if (nums[nums.length - 1] - nums[0] + 1 === nums.length) return {kind: 'range', prefix: parsed[0].prefix, start: nums[0], count: nums.length};
  }
  return {kind: 'list', subjects};
}
function modelCandidate(quads, budget) {
  const subjects = [...new Map(quads.map(q => [key(q[0]), q[0]])).values()];
  const fields = new Map();
  for (const [s, p, o, g] of quads) {
    const field = key([p, g]);
    if (!fields.has(field)) fields.set(field, {p, g, constants: new Map(), ordinals: new Map()});
    const f = fields.get(field), k = key(o);
    const c = f.constants.get(k) || {o, subjects: new Set()}; c.subjects.add(key(s)); f.constants.set(k, c);
    const n = numericSubject(s);
    if (n && o[0] === 'L' && o[2] === XSD + 'integer' && !o[3] && /^(0|-?[1-9][0-9]*)$/.test(o[1]) && Number.isSafeInteger(Number(o[1]))) {
      const offset = Number(o[1]) - n.n;
      if (Number.isSafeInteger(offset)) { const set = f.ordinals.get(offset) || new Set(); set.add(key(s)); f.ordinals.set(offset, set); }
    }
  }
  const templates = [];
  for (const f of fields.values()) {
    const best = [...f.constants.values()].sort((a, b) => b.subjects.size - a.subjects.size)[0];
    const ordinal = [...f.ordinals.entries()].sort((a, b) => b[1].size - a[1].size)[0];
    if (ordinal && ordinal[1].size > best.subjects.size && ordinal[1].size >= subjects.length * .7 && subjects.every(s => numericSubject(s) && Number.isSafeInteger(numericSubject(s).n + ordinal[0]))) templates.push([f.p, ['ordinal', ordinal[0]], f.g]);
    else if (best.subjects.size >= subjects.length * .7) templates.push([f.p, ['constant', best.o], f.g]);
  }
  if (subjects.length * templates.length > budget.maxQuads || subjects.length * templates.length > budget.maxWork) return null;
  const model = {kind: 'model', domain: domain(subjects), templates, remove: [], add: []};
  const generated = new Map();
  for (const s of subjects) for (const t of templates) { const q = generate(s, t); generated.set(key(q), q); }
  const actual = new Map(quads.map(q => [key(q), q]));
  model.remove = [...generated].filter(([k]) => !actual.has(k)).map(([, q]) => q);
  model.add = [...actual].filter(([k]) => !generated.has(k)).map(([, q]) => q);
  if (generated.size + model.add.length > budget.maxQuads || generated.size + model.add.length + model.remove.length > budget.maxWork) return null;
  return model;
}
function generate(s, [p, expr, g]) {
  if (expr[0] === 'constant') return [s, p, expr[1], g];
  const n = numericSubject(s);
  if (!n || !Number.isSafeInteger(n.n + expr[1])) fail('ordinal overflow');
  return [s, p, ['L', String(n.n + expr[1]), XSD + 'integer', ''], g];
}
function decodePayload(payload, budget, subject = null) {
  let result;
  if (payload.kind === 'literal') {
    keys(payload, ['kind', 'terms', 'rows']);
    if (!Array.isArray(payload.terms) || !Array.isArray(payload.rows) || payload.rows.length > budget.maxQuads || payload.terms.length > budget.maxQuads * 4) fail('literal budget');
    let rows = payload.rows;
    if (subject) {
      // The full-validated handle has already checked the sorted dictionary/rows.
      const target = key(subject);
      let low = 0, high = payload.terms.length;
      while (low < high) { const mid = (low + high) >>> 1; if (key(payload.terms[mid]) < target) low = mid + 1; else high = mid; }
      if (low === payload.terms.length || key(payload.terms[low]) !== target) rows = [];
      else {
        const id = low; low = 0; high = rows.length;
        while (low < high) { const mid = (low + high) >>> 1; if (rows[mid][0] < id) low = mid + 1; else high = mid; }
        let end = low; while (end < rows.length && rows[end][0] === id) end++;
        rows = rows.slice(low, end);
      }
    } else {
      for (let i = 1; i < payload.terms.length; i++) if (key(payload.terms[i - 1]) >= key(payload.terms[i])) fail('dictionary order');
      for (let i = 1; i < rows.length; i++) if (rows[i - 1][0] > rows[i][0]) fail('row order');
    }
    result = rows.map(row => {
      if (!Array.isArray(row) || row.length !== 4) fail('invalid row');
      return row.map(i => { integer(i, 0, payload.terms.length - 1); return payload.terms[i]; });
    });
    result.forEach(quad);
    if (subject) result = result.filter(q => key(q[0]) === key(subject));
  } else if (payload.kind === 'model') {
    keys(payload, ['kind', 'domain', 'templates', 'remove', 'add']);
    if (!Array.isArray(payload.templates) || !Array.isArray(payload.remove) || !Array.isArray(payload.add) || payload.templates.length > budget.maxWork || payload.remove.length + payload.add.length > budget.maxQuads) fail('model budget');
    const d = payload.domain;
    let subjects;
    if (d.kind === 'range') {
      keys(d, ['kind', 'prefix', 'start', 'count']);
      if (typeof d.prefix !== 'string') fail('invalid range');
      integer(d.start, 0, Number.MAX_SAFE_INTEGER); integer(d.count, 1, budget.maxSubjects); integer(d.start + d.count - 1, 0, Number.MAX_SAFE_INTEGER);
      if (subject) {
        const n = numericSubject(subject);
        subjects = n && n.prefix === d.prefix && n.n >= d.start && n.n < d.start + d.count ? [subject] : [];
      } else subjects = Array.from({length: d.count}, (_, i) => ['I', d.prefix + (d.start + i)]);
    } else if (d.kind === 'list') {
      keys(d, ['kind', 'subjects']);
      if (!Array.isArray(d.subjects) || d.subjects.length > budget.maxSubjects) fail('subject budget');
      d.subjects.forEach(s => term(s, 0));
      if (new Set(d.subjects.map(key)).size !== d.subjects.length) fail('duplicate subject');
      subjects = subject ? d.subjects.filter(s => key(s) === key(subject)) : d.subjects;
    } else fail('unknown domain');
    if (subjects.length * payload.templates.length > budget.maxWork || subjects.length * payload.templates.length + payload.add.length > budget.maxQuads) fail('expansion budget');
    payload.templates.forEach(t => {
      if (!Array.isArray(t) || t.length !== 3 || !Array.isArray(t[1]) || t[1].length !== 2) fail('invalid template');
      term(t[0], 1); term(t[2], 3);
      if (t[1][0] === 'constant') term(t[1][1], 2);
      else if (t[1][0] === 'ordinal') integer(t[1][1], -Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER);
      else fail('unknown expression');
    });
    payload.remove.forEach(quad); payload.add.forEach(quad);
    result = subjects.flatMap(s => payload.templates.map(t => generate(s, t)));
    const generated = new Set(result.map(key));
    const removed = new Set();
    for (const q of payload.remove) {
      if (subject && key(q[0]) !== key(subject)) continue;
      const k = key(q); if (!generated.has(k) || removed.has(k)) fail('invalid retraction'); removed.add(k);
    }
    result = result.filter(q => !removed.has(key(q)));
    const retained = new Set(result.map(key));
    for (const q of payload.add) {
      if (subject && key(q[0]) !== key(subject)) continue;
      if (retained.has(key(q))) fail('duplicate addition');
      retained.add(key(q)); result.push(q);
    }
  } else fail('unknown payload');
  return normalize(result, budget);
}
function compress(bytes, codec) {
  if (codec === 'gzip') return zlib.gzipSync(bytes, {level: 9});
  if (codec === 'zstd' && zlib.zstdCompressSync) return zlib.zstdCompressSync(bytes, {params: {[zlib.constants.ZSTD_c_compressionLevel]: 6}});
  fail('unsupported codec');
}
function decompress(bytes, codec, maxBytes) {
  if (codec === 'gzip') return zlib.gunzipSync(bytes, {maxOutputLength: maxBytes});
  if (codec === 'zstd' && zlib.zstdDecompressSync) return zlib.zstdDecompressSync(bytes, {maxOutputLength: maxBytes});
  fail('unsupported codec');
}
function pack(input, options = {}) {
  const {segmentSubjects = 2048, codec = 'zstd', models = true, budget: overrides = {}} = options;
  const budget = limits(overrides); integer(segmentSubjects, 1, budget.maxSubjects);
  const data = envelope(input.quads, input.emptyGraphs || [], budget);
  const groups = new Map();
  for (const q of data.quads) { const k = key(q[0]); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(q); }
  if (groups.size > budget.maxSubjects) fail('subject budget');
  const entries = [...groups.entries()].sort((a, b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0), segments = [];
  const numbers = entries.map(e => numericSubject(e[1][0][0]));
  if (numbers.length && numbers.every(Boolean) && numbers.every(n => n.prefix === numbers[0].prefix)) entries.sort((a, b) => numericSubject(a[1][0][0]).n - numericSubject(b[1][0][0]).n);
  for (let i = 0; i < entries.length; i += segmentSubjects) {
    const batch = entries.slice(i, i + segmentSubjects), qs = batch.flatMap(e => e[1]);
    const bounds = batch.map(e => e[0]).sort(), d = domain(batch.map(e => e[1][0][0]));
    const candidates = [dictionary(qs)];
    if (models) { const candidate = modelCandidate(qs, budget); if (candidate) candidates.push(candidate); }
    const scored = candidates.map(payload => {
      const decoded = decodePayload(payload, budget);
      if (key(decoded) !== key(normalize(qs, budget))) fail('candidate equality');
      const raw = Buffer.from(key(payload)), bytes = compress(raw, codec);
      return {kind: payload.kind, codec, rawBytes: raw.length, count: decoded.length, min: bounds[0], max: bounds[bounds.length - 1], subjectRange: d.kind === 'range' ? d : null, digest: hash(bytes), bytes: bytes.toString('base64')};
    }).sort((a, b) => Buffer.byteLength(key(a)) - Buffer.byteLength(key(b)));
    segments.push(scored[0]);
  }
  const canonicalGraphDigest = input.canonicalGraphDigest || null;
  if (canonicalGraphDigest !== null && !/^sha256:[0-9a-f]{64}$/.test(canonicalGraphDigest)) fail('invalid canonical digest');
  const body = {format: FORMAT, tupleDigest: hash(key(data)), canonicalGraphDigest, emptyGraphs: data.emptyGraphs, count: data.quads.length, segments};
  return {...body, physicalDigest: hash(key(body))};
}
function inspect(bundle, budget) {
  keys(bundle, ['format', 'tupleDigest', 'canonicalGraphDigest', 'emptyGraphs', 'count', 'segments', 'physicalDigest']);
  if (bundle.format !== FORMAT) fail('unsupported format');
  if (bundle.canonicalGraphDigest !== null && !/^sha256:[0-9a-f]{64}$/.test(bundle.canonicalGraphDigest)) fail('invalid canonical digest');
  integer(bundle.count, 0, budget.maxQuads);
  if (!Array.isArray(bundle.segments) || bundle.segments.length > budget.maxSubjects || !Array.isArray(bundle.emptyGraphs)) fail('manifest budget');
  const {physicalDigest, ...body} = bundle;
  if (Buffer.byteLength(key(body)) > budget.maxBytes || physicalDigest !== hash(key(body))) fail('manifest integrity');
  let count = 0;
  for (const s of bundle.segments) {
    keys(s, ['kind', 'codec', 'rawBytes', 'count', 'min', 'max', 'subjectRange', 'digest', 'bytes']);
    integer(s.rawBytes, 1, budget.maxBytes); integer(s.count, 0, budget.maxQuads);
    if (!['literal', 'model'].includes(s.kind) || !['gzip', 'zstd'].includes(s.codec) || typeof s.bytes !== 'string' || typeof s.min !== 'string' || typeof s.max !== 'string' || s.min > s.max) fail('segment metadata');
    if (s.subjectRange) {
      keys(s.subjectRange, ['kind', 'prefix', 'start', 'count']);
      if (s.subjectRange.kind !== 'range' || typeof s.subjectRange.prefix !== 'string') fail('range metadata');
      integer(s.subjectRange.start, 0, Number.MAX_SAFE_INTEGER); integer(s.subjectRange.count, 1, budget.maxSubjects);
      integer(s.subjectRange.start + s.subjectRange.count - 1, 0, Number.MAX_SAFE_INTEGER);
    }
    count += s.count;
  }
  if (count !== bundle.count) fail('manifest count');
}
function readSegment(s, budget, subject) {
  const bytes = Buffer.from(s.bytes, 'base64');
  if (bytes.length > budget.maxBytes || bytes.toString('base64') !== s.bytes || hash(bytes) !== s.digest) fail('segment integrity');
  const raw = decompress(bytes, s.codec, budget.maxBytes);
  if (raw.length !== s.rawBytes) fail('segment size');
  const payload = JSON.parse(raw);
  if (payload.kind !== s.kind) fail('segment kind');
  const quads = decodePayload(payload, budget, subject);
  if (!subject && (quads.length !== s.count || quads.some(q => key(q[0]) < s.min || key(q[0]) > s.max))) fail('segment bounds/count');
  if (!subject && s.subjectRange && key(domain([...new Map(quads.map(q => [key(q[0]), q[0]])).values()])) !== key(s.subjectRange)) fail('subject range mismatch');
  const work = payload.kind === 'literal' ? payload.rows.length :
    (payload.domain.kind === 'range' ? payload.domain.count : payload.domain.subjects.length) * payload.templates.length + payload.remove.length + payload.add.length;
  return {quads, fetchedBytes: bytes.length, work};
}
function unpack(bundle, options = {}) {
  const budget = limits(options); inspect(bundle, budget);
  let totalRaw = 0, totalWork = 0;
  const quads = [];
  for (const s of bundle.segments) {
    totalRaw += s.rawBytes; if (totalRaw > budget.maxBytes) fail('total byte budget');
    if (totalWork >= budget.maxWork) fail('total work budget');
    const decoded = readSegment(s, {...budget, maxWork: budget.maxWork - totalWork}, null);
    totalWork += decoded.work;
    if (totalWork > budget.maxWork) fail('total work budget');
    for (const q of decoded.quads) quads.push(q);
  }
  const data = envelope(quads, bundle.emptyGraphs, budget);
  if (data.quads.length !== bundle.count || hash(key(data)) !== bundle.tupleDigest) fail('dataset integrity');
  return data;
}
function selectSubject(bundle, subject, budget) {
  term(subject, 0);
  const k = key(subject), n = numericSubject(subject);
  const segments = bundle.segments.filter(s => s.subjectRange ? n && n.prefix === s.subjectRange.prefix && n.n >= s.subjectRange.start && n.n < s.subjectRange.start + s.subjectRange.count : s.min <= k && k <= s.max);
  const rows = segments.map(s => readSegment(s, budget, subject));
  return {quads: rows.flatMap(r => r.quads), fetchedBytes: rows.reduce((n, r) => n + r.fetchedBytes, 0), segmentsRead: segments.length,
    verification: 'full-validated tuple dataset; selected segment physical digest'};
}
function open(bundle, options = {}) {
  const budget = limits(options), copy = structuredClone(bundle);
  unpack(copy, options);
  return Object.freeze({querySubject: subject => selectSubject(copy, subject, budget)});
}
function querySubject(bundle, subject, options = {}) { return open(bundle, options).querySubject(subject); }
module.exports = {FORMAT, XSD, pack, unpack, open, querySubject, normalize, dictionary, decodePayload, hash, compress, decompress};
