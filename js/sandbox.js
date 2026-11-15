// Sandbox runtime injected into the preview/run iframe.
// Every exported install* / create* function here must be SELF-CONTAINED
// (no references to module scope) because it is serialised with .toString().

/** Pretty-print any JS value like Node's util.inspect (simplified). */
export function inspect(value, depth = 0, seen = new WeakSet()) {
  const ind = (n) => '  '.repeat(n);
  const t = typeof value;
  if (value === null) return 'null';
  if (t === 'undefined') return 'undefined';
  if (t === 'string') return depth === 0 ? value : JSON.stringify(value);
  if (t === 'number' || t === 'boolean') return String(value);
  if (t === 'bigint') return value + 'n';
  if (t === 'symbol') return value.toString();
  if (t === 'function') return `[Function: ${value.name || 'anonymous'}]`;
  if (value instanceof Error) return value.stack || `${value.name}: ${value.message}`;
  if (value instanceof Date) return value.toISOString();
  if (value instanceof RegExp) return String(value);
  if (seen.has(value)) return '[Circular]';
  if (depth > 3) return Array.isArray(value) ? '[Array]' : '[Object]';
  seen.add(value);
  try {
    if (Array.isArray(value)) {
      const items = value.slice(0, 100).map((v) => inspect(v, depth + 1, seen));
      if (value.length > 100) items.push(`... ${value.length - 100} more items`);
      const one = `[ ${items.join(', ')} ]`;
      return value.length === 0 ? '[]' : one.length < 72 ? one : `[\n${items.map((s) => ind(depth + 1) + s).join(',\n')}\n${ind(depth)}]`;
    }
    if (value instanceof Map) {
      const items = [...value].map(([k, v]) => `${inspect(k, depth + 1, seen)} => ${inspect(v, depth + 1, seen)}`);
      return `Map(${value.size}) { ${items.join(', ')} }`;
    }
    if (value instanceof Set) {
      return `Set(${value.size}) { ${[...value].map((v) => inspect(v, depth + 1, seen)).join(', ')} }`;
    }
    if (typeof Element !== 'undefined' && value instanceof Element) {
      return `<${value.tagName.toLowerCase()}${value.id ? ' id="' + value.id + '"' : ''}${value.className ? ' class="' + value.className + '"' : ''}>`;
    }
    const keys = Object.keys(value);
    const ctor = value.constructor && value.constructor.name;
    const prefix = ctor && ctor !== 'Object' ? ctor + ' ' : '';
    if (keys.length === 0) return prefix + '{}';
    const items = keys.slice(0, 50).map((k) => {
      const key = /^[A-Za-z_$][\w$]*$/.test(k) ? k : JSON.stringify(k);
      return `${key}: ${inspect(value[k], depth + 1, seen)}`;
    });
    const one = `${prefix}{ ${items.join(', ')} }`;
    return one.length < 72 ? one : `${prefix}{\n${items.map((s) => ind(depth + 1) + s).join(',\n')}\n${ind(depth)}}`;
  } finally {
    seen.delete(value);
  }
}

/** Format console.log args, supporting %s %d %i %f %o %O %j. */
export function formatArgs(args, insp) {
  if (!args.length) return '';
  let first = args[0];
  let rest = args.slice(1);
  if (typeof first === 'string' && /%[sdifoOjc%]/.test(first)) {
    first = first.replace(/%([sdifoOjc%])/g, (m, f) => {
      if (f === '%') return '%';
      if (!rest.length) return m;
      const v = rest.shift();
      if (f === 's') return typeof v === 'string' ? v : insp(v, 1);
      if (f === 'd' || f === 'i') return String(f === 'i' ? parseInt(v, 10) : Number(v));
      if (f === 'f') return String(parseFloat(v));
      if (f === 'c') return '';
      return insp(v, 1);
    });
    return [first, ...rest.map((a) => insp(a, 0))].join(' ');
  }
  return args.map((a) => insp(a, 0)).join(' ');
}

/**
 * Creates a module resolver over a virtual file map.
 * resolve(from, spec) -> { path } | { bare, url } | { builtin }
 */
export function createResolver(files, packages = {}, cdn = 'https://esm.sh') {
  const BUILTINS = ['fs', 'path', 'events', 'util', 'readline', 'os', 'assert', 'process'];
  const EXTS = ['', '.js', '.mjs', '.jsx', '.ts', '.tsx', '.cjs', '.json', '/index.js', '/index.ts', '/index.jsx', '/index.tsx'];
  function norm(p) {
    const out = [];
    for (const s of p.split('/')) { if (!s || s === '.') continue; if (s === '..') out.pop(); else out.push(s); }
    return out.join('/');
  }
  function dirname(p) { const i = p.lastIndexOf('/'); return i === -1 ? '' : p.slice(0, i); }
  function pkgName(spec) {
    const parts = spec.split('/');
    return spec.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
  }
  function bareUrl(spec) {
    if (/^https?:\/\//.test(spec)) return spec;
    const name = pkgName(spec);
    const sub = spec.slice(name.length);
    const ver = packages[name];
    const deps = Object.entries(packages).filter(([n]) => n !== name).map(([n, v]) => `${n}@${v}`).join(',');
    return `${cdn}/${name}${ver ? '@' + String(ver).replace(/^[\^~]/, '') : ''}${sub}${deps ? '?deps=' + deps : ''}`;
  }
  function resolve(from, spec) {
    const clean = spec.replace(/^node:/, '');
    if (BUILTINS.includes(clean)) return { builtin: clean };
    if (spec.startsWith('.') || spec.startsWith('/')) {
      const base = spec.startsWith('/') ? spec : dirname(from) + '/' + spec;
      const target = norm(base);
      for (const e of EXTS) if (Object.prototype.hasOwnProperty.call(files, target + e)) return { path: target + e };
      throw new Error(`Cannot find module '${spec}' imported from '${from}'`);
    }
    return { bare: spec, url: bareUrl(spec) };
  }
  return { resolve, bareUrl, norm, dirname };
}

/** Rewrite every static/dynamic import specifier in `code` using fn(spec) -> newSpec. */
export function rewriteImports(code, fn) {
  return code.replace(
    /(\bimport\s*\(\s*|\bimport\s+(?:[\w$*{}\s,]+\s+from\s*)?|\bexport\s+(?:\*(?:\s+as\s+[\w$]+)?|\{[^}]*\})\s*from\s*)(['"])([^'"\n]+)\2/g,
    (m, pre, q, spec) => pre + q + fn(spec) + q,
  );
}

export function isESM(code) {
  return /(^|[\n;])\s*(import\s*[\w${*'"]|import\s*\(|export\s+(default|const|let|var|function|class|async|\{|\*))/.test(code)
    && !/^\s*(\/\/.*\n|\s)*['"]use strict['"];?\s*\n?\s*(const|var|let)\s+\w+\s*=\s*require\(/.test(code);
}

/** Minimal Jest-compatible test framework. Returns { run } and installs globals. */
export function installJestLite(g) {
  const root = { name: '', tests: [], suites: [], before: [], after: [], beforeAll: [], afterAll: [], parent: null };
  let cur = root;
  const deepEqual = (a, b) => {
    if (Object.is(a, b)) return true;
    if (typeof a !== 'object' || typeof b !== 'object' || !a || !b) return false;
    if (Array.isArray(a) !== Array.isArray(b)) return false;
    if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
    if (a instanceof Map && b instanceof Map) return a.size === b.size && [...a].every(([k, v]) => b.has(k) && deepEqual(v, b.get(k)));
    if (a instanceof Set && b instanceof Set) return a.size === b.size && [...a].every((v) => b.has(v));
    const ka = Object.keys(a).filter((k) => a[k] !== undefined);
    const kb = Object.keys(b).filter((k) => b[k] !== undefined);
    return ka.length === kb.length && ka.every((k) => deepEqual(a[k], b[k]));
  };
  const show = (v) => { try { return typeof v === 'string' ? JSON.stringify(v) : (g.__de_inspect ? g.__de_inspect(v, 1) : JSON.stringify(v)); } catch { return String(v); } };
  function expect(actual) {
    const make = (neg) => {
      const check = (pass, msg) => { if (neg ? pass : !pass) throw new Error((neg ? 'Expected NOT: ' : '') + msg); };
      const m = {
        toBe: (e) => check(Object.is(actual, e), `expected ${show(actual)} to be ${show(e)}`),
        toEqual: (e) => check(deepEqual(actual, e), `expected ${show(actual)} to equal ${show(e)}`),
        toStrictEqual: (e) => check(deepEqual(actual, e), `expected ${show(actual)} to strictly equal ${show(e)}`),
        toBeTruthy: () => check(!!actual, `expected ${show(actual)} to be truthy`),
        toBeFalsy: () => check(!actual, `expected ${show(actual)} to be falsy`),
        toBeNull: () => check(actual === null, `expected ${show(actual)} to be null`),
        toBeUndefined: () => check(actual === undefined, `expected ${show(actual)} to be undefined`),
        toBeDefined: () => check(actual !== undefined, `expected value to be defined`),
        toBeNaN: () => check(Number.isNaN(actual), `expected ${show(actual)} to be NaN`),
        toBeGreaterThan: (e) => check(actual > e, `expected ${show(actual)} > ${show(e)}`),
        toBeGreaterThanOrEqual: (e) => check(actual >= e, `expected ${show(actual)} >= ${show(e)}`),
        toBeLessThan: (e) => check(actual < e, `expected ${show(actual)} < ${show(e)}`),
        toBeLessThanOrEqual: (e) => check(actual <= e, `expected ${show(actual)} <= ${show(e)}`),
        toBeCloseTo: (e, d = 2) => check(Math.abs(actual - e) < Math.pow(10, -d) / 2, `expected ${show(actual)} to be close to ${show(e)}`),
        toBeInstanceOf: (C) => check(actual instanceof C, `expected value to be instance of ${C && C.name}`),
        toContain: (e) => check(actual != null && actual.includes(e), `expected ${show(actual)} to contain ${show(e)}`),
        toContainEqual: (e) => check(Array.isArray(actual) && actual.some((x) => deepEqual(x, e)), `expected ${show(actual)} to contain equal ${show(e)}`),
        toHaveLength: (n) => check(actual != null && actual.length === n, `expected length ${actual && actual.length} to be ${n}`),
        toHaveProperty: (k, v) => {
          const val = String(k).split('.').reduce((o, p) => (o == null ? undefined : o[p]), actual);
          check(val !== undefined && (v === undefined || deepEqual(val, v)), `expected object to have property ${k}`);
        },
        toMatch: (r) => check(typeof r === 'string' ? String(actual).includes(r) : r.test(actual), `expected ${show(actual)} to match ${r}`),
        toMatchObject: (o) => check(Object.keys(o).every((k) => deepEqual(actual[k], o[k])), `expected ${show(actual)} to match object ${show(o)}`),
        toThrow: (e) => {
          let threw = false; let err;
          try { actual(); } catch (x) { threw = true; err = x; }
          let ok = threw;
          if (threw && e !== undefined) {
            const msg = err && err.message !== undefined ? err.message : String(err);
            ok = typeof e === 'string' ? msg.includes(e) : e instanceof RegExp ? e.test(msg) : typeof e === 'function' ? err instanceof e : true;
          }
          check(ok, threw ? `function threw ${show(err && err.message)} which did not match ${show(e)}` : 'expected function to throw');
        },
        toHaveBeenCalled: () => check(actual.mock && actual.mock.calls.length > 0, 'expected mock to have been called'),
        toHaveBeenCalledTimes: (n) => check(actual.mock && actual.mock.calls.length === n, `expected mock to be called ${n} times, got ${actual.mock && actual.mock.calls.length}`),
        toHaveBeenCalledWith: (...a) => check(actual.mock && actual.mock.calls.some((c) => deepEqual(c, a)), `expected mock to have been called with ${show(a)}`),
      };
      return m;
    };
    const api = make(false);
    api.not = make(true);
    api.resolves = new Proxy({}, { get: (_, k) => async (...a) => expect(await actual)[k](...a) });
    api.rejects = new Proxy({}, { get: (_, k) => async (...a) => { let e; try { await actual; } catch (x) { e = x; } if (!e) throw new Error('expected promise to reject'); return expect(() => { throw e; })[k](...a); } });
    return api;
  }
  const describe = (name, fn) => {
    const s = { name, tests: [], suites: [], before: [], after: [], beforeAll: [], afterAll: [], parent: cur };
    cur.suites.push(s);
    const prev = cur; cur = s;
    try { fn(); } finally { cur = prev; }
  };
  describe.skip = (name) => cur.suites.push({ name, tests: [], suites: [], before: [], after: [], beforeAll: [], afterAll: [], parent: cur, skip: true });
  const test = (name, fn) => cur.tests.push({ name, fn });
  test.skip = (name) => cur.tests.push({ name, skip: true });
  test.todo = (name) => cur.tests.push({ name, skip: true });
  const fnMock = (impl) => {
    const f = function (...args) { f.mock.calls.push(args); const r = f._impl ? f._impl.apply(this, args) : undefined; f.mock.results.push(r); return r; };
    f.mock = { calls: [], results: [] };
    f._impl = impl;
    f.mockReturnValue = (v) => { f._impl = () => v; return f; };
    f.mockImplementation = (i) => { f._impl = i; return f; };
    f.mockClear = () => { f.mock.calls = []; f.mock.results = []; return f; };
    return f;
  };
  Object.assign(g, {
    describe, test, it: test, expect,
    beforeEach: (f) => cur.before.push(f), afterEach: (f) => cur.after.push(f),
    beforeAll: (f) => cur.beforeAll.push(f), afterAll: (f) => cur.afterAll.push(f),
    jest: { fn: fnMock }, vi: { fn: fnMock },
  });
  async function run(onResult) {
    const results = [];
    const chain = (s, key) => { const out = []; for (let x = s; x; x = x.parent) out.unshift(...x[key]); return out; };
    const chainAfter = (s) => { const out = []; for (let x = s; x; x = x.parent) out.push(...x.after); return out; };
    async function runSuite(s, path, skipped) {
      const skip = skipped || s.skip;
      if (!skip) for (const h of s.beforeAll) await h();
      for (const t of s.tests) {
        const name = [...path, t.name].filter(Boolean).join(' › ');
        if (skip || t.skip) { const r = { name, status: 'skipped', duration: 0 }; results.push(r); onResult && onResult(r); continue; }
        const start = Date.now();
        let r;
        try {
          for (const h of chain(s, 'before')) await h();
          await Promise.race([
            Promise.resolve().then(() => t.fn()),
            new Promise((_, rej) => setTimeout(() => rej(new Error('Test timed out after 5000 ms')), 5000)),
          ]);
          for (const h of chainAfter(s)) await h();
          r = { name, status: 'passed', duration: Date.now() - start };
        } catch (e) {
          r = { name, status: 'failed', duration: Date.now() - start, error: (e && (e.stack || e.message)) || String(e), message: (e && e.message) || String(e) };
        }
        results.push(r);
        onResult && onResult(r);
      }
      for (const c of s.suites) await runSuite(c, [...path, c.name], skip);
      if (!skip) for (const h of s.afterAll) await h();
    }
    await runSuite(root, [], false);
    return results;
  }
  return { run, root };
}

/**
 * Main runtime installed into the sandbox iframe.
 * cfg: { mode:'web'|'node'|'test', files, entry, packages, env, testFiles, page }
 */
export function installRuntime(g, cfg) {
  const post = (msg) => { try { g.parent.postMessage(Object.assign({ __devengine: true, runId: cfg.runId }, msg), '*'); } catch (e) { /* ignore */ } };
  const insp = g.__de_inspect;
  const urlToPath = {};
  const mapStack = (s) => {
    s = String(s || '');
    for (const u in urlToPath) s = s.split(u).join(urlToPath[u]);
    return s.replace(/about:srcdoc/g, cfg.page || 'index.html');
  };
  g.__de_mapStack = mapStack;

  // ---- console bridge ----
  const counts = {}; const timers = {};
  const send = (level, args) => post({ kind: 'console', level, text: mapStack(g.__de_formatArgs(args, insp)) });
  const con = g.console;
  ['log', 'info', 'warn', 'error', 'debug'].forEach((lvl) => {
    const orig = con[lvl] && con[lvl].bind(con);
    con[lvl] = (...a) => { send(lvl, a); orig && orig(...a); };
  });
  con.trace = (...a) => send('log', [...a, '\n' + mapStack(new Error().stack)]);
  con.table = (d) => {
    try {
      const rows = Array.isArray(d) ? d : Object.values(d);
      const keys = Array.isArray(d) ? Object.keys(d) : Object.keys(d);
      const cols = [...new Set(rows.flatMap((r) => (r && typeof r === 'object' ? Object.keys(r) : ['Values'])))];
      const lines = [['(index)', ...cols].join('\t')];
      rows.forEach((r, i) => lines.push([keys[i], ...cols.map((c) => (r && typeof r === 'object' ? insp(r[c], 1) : c === 'Values' ? insp(r, 1) : ''))].join('\t')));
      post({ kind: 'console', level: 'log', text: lines.join('\n') });
    } catch (e) { send('log', [d]); }
  };
  con.clear = () => post({ kind: 'clear' });
  con.count = (l = 'default') => { counts[l] = (counts[l] || 0) + 1; send('log', [`${l}: ${counts[l]}`]); };
  con.time = (l = 'default') => { timers[l] = performance.now(); };
  con.timeEnd = (l = 'default') => { if (timers[l] != null) send('log', [`${l}: ${(performance.now() - timers[l]).toFixed(3)}ms`]); delete timers[l]; };
  con.assert = (c, ...a) => { if (!c) send('error', ['Assertion failed:', ...a]); };
  con.group = (...a) => a.length && send('log', a); con.groupEnd = () => {};

  const reportError = (err, file, line, col) => {
    const stack = mapStack((err && err.stack) || '');
    const message = (err && err.message) || String(err);
    let loc = { file: file ? mapStack(file) : null, line, col };
    const m = stack.match(/(?:at .*?\(|at |@)([^\s()]+?):(\d+):(\d+)/);
    if (m && (!loc.file || /blob:|srcdoc/.test(loc.file) || !line)) loc = { file: m[1], line: +m[2], col: +m[3] };
    post({ kind: 'error', message: `${(err && err.name) || 'Error'}: ${message}`, stack, file: loc.file, line: loc.line, col: loc.col });
  };
  g.__de_reportError = reportError;

  // Console eval from the IDE
  g.addEventListener('message', (e) => {
    const d = e.data;
    if (!d || !d.__de_eval) return;
    try {
      const r = (0, eval)(d.code);
      Promise.resolve(r).then((v) => post({ kind: 'evalResult', text: insp(v, 1) }), (err) => post({ kind: 'evalResult', error: true, text: String(err) }));
    } catch (err) { post({ kind: 'evalResult', error: true, text: String(err) }); }
  });

  // Sandboxed (opaque-origin) frames can't use Web Storage — provide in-memory shims.
  const memStorage = () => {
    const m = new Map();
    return {
      getItem: (k) => (m.has(String(k)) ? m.get(String(k)) : null), setItem: (k, v) => m.set(String(k), String(v)),
      removeItem: (k) => m.delete(String(k)), clear: () => m.clear(), key: (i) => [...m.keys()][i] ?? null, get length() { return m.size; },
    };
  };
  ['localStorage', 'sessionStorage'].forEach((name) => {
    let ok = false;
    try { ok = !!g[name]; } catch (e) { ok = false; }
    if (!ok) { try { Object.defineProperty(g, name, { value: memStorage(), configurable: true }); } catch (e) { /* ignore */ } }
  });
  g.addEventListener('error', (e) => { if (e.error && e.error.__deExit) { e.preventDefault(); return; } reportError(e.error || { message: e.message }, e.filename, e.lineno, e.colno); });
  g.addEventListener('unhandledrejection', (e) => { if (e.reason && e.reason.__deExit) return; reportError(e.reason, null); });

  // ---- Node-ish builtins ----
  const files = cfg.files;
  const { resolve, dirname } = g.__de_createResolver(files, cfg.packages || {});
  const nodePath = {
    sep: '/', delimiter: ':',
    join: (...p) => p.join('/').replace(/\/+/g, '/').split('/').reduce((a, s) => (s === '..' ? a.slice(0, -1) : s === '.' ? a : [...a, s]), []).join('/') || '.',
    dirname: (p) => dirname(p) || '.', basename: (p, ext) => { const b = p.split('/').pop(); return ext && b.endsWith(ext) ? b.slice(0, -ext.length) : b; },
    extname: (p) => { const b = p.split('/').pop(); const i = b.lastIndexOf('.'); return i > 0 ? b.slice(i) : ''; },
    resolve: (...p) => '/' + nodePath.join(...p).replace(/^\/+/, ''), normalize: (p) => nodePath.join(p), isAbsolute: (p) => p.startsWith('/'),
  };
  const fsPath = (p) => String(p).replace(/^\.?\//, '').replace(/^\/?(home\/runner\/)?/, '');
  const fsErr = (p) => Object.assign(new Error(`ENOENT: no such file or directory, open '${p}'`), { code: 'ENOENT' });
  const nodeFs = {
    readFileSync: (p, enc) => { const k = fsPath(p); if (!(k in files)) throw fsErr(p); return files[k]; },
    writeFileSync: (p, data) => { files[fsPath(p)] = String(data); post({ kind: 'fswrite', path: fsPath(p), content: String(data) }); },
    appendFileSync: (p, data) => nodeFs.writeFileSync(p, (files[fsPath(p)] || '') + data),
    existsSync: (p) => { const k = fsPath(p); return k in files || Object.keys(files).some((f) => f.startsWith(k + '/')); },
    readdirSync: (p) => { const k = fsPath(p); const pre = k && k !== '.' ? k + '/' : ''; return [...new Set(Object.keys(files).filter((f) => f.startsWith(pre)).map((f) => f.slice(pre.length).split('/')[0]))]; },
    unlinkSync: (p) => { delete files[fsPath(p)]; post({ kind: 'fsdelete', path: fsPath(p) }); },
    mkdirSync: () => {},
  };
  nodeFs.promises = Object.fromEntries(Object.entries(nodeFs).filter(([, v]) => typeof v === 'function').map(([k, v]) => [k.replace(/Sync$/, ''), async (...a) => v(...a)]));
  nodeFs.readFile = (p, enc, cb) => { cb = typeof enc === 'function' ? enc : cb; try { cb(null, nodeFs.readFileSync(p)); } catch (e) { cb(e); } };
  nodeFs.writeFile = (p, d, enc, cb) => { cb = typeof enc === 'function' ? enc : cb; try { nodeFs.writeFileSync(p, d); cb && cb(null); } catch (e) { cb && cb(e); } };
  class EventEmitter {
    constructor() { this._ev = {}; }
    on(e, f) { (this._ev[e] = this._ev[e] || []).push(f); return this; }
    addListener(e, f) { return this.on(e, f); }
    once(e, f) { const w = (...a) => { this.off(e, w); f(...a); }; return this.on(e, w); }
    off(e, f) { this._ev[e] = (this._ev[e] || []).filter((x) => x !== f); return this; }
    removeListener(e, f) { return this.off(e, f); }
    emit(e, ...a) { (this._ev[e] || []).slice().forEach((f) => f(...a)); return !!(this._ev[e] || []).length; }
  }
  const util = { format: (...a) => g.__de_formatArgs(a, insp), inspect: (v) => insp(v, 1), promisify: (f) => (...a) => new Promise((res, rej) => f(...a, (e, v) => (e ? rej(e) : res(v)))), isDeepStrictEqual: (a, b) => JSON.stringify(a) === JSON.stringify(b) };
  const readline = {
    createInterface: () => {
      const rl = new EventEmitter();
      rl.question = (q, cb) => { const ans = g.prompt(q); send('log', [q + (ans ?? '')]); setTimeout(() => cb(ans ?? ''), 0); };
      rl.close = () => rl.emit('close');
      rl[Symbol.asyncIterator] = async function* () { while (true) { const l = g.prompt('stdin'); if (l === null) return; yield l; } };
      return rl;
    },
  };
  readline.promises = { createInterface: () => { const rl = readline.createInterface(); return { question: (q) => new Promise((r) => rl.question(q, r)), close: rl.close }; } };
  const assert = (c, m) => { if (!c) throw new Error(m || 'Assertion failed'); };
  assert.ok = assert; assert.equal = (a, b, m) => assert(a == b, m || `${insp(a, 1)} == ${insp(b, 1)}`);
  assert.strictEqual = (a, b, m) => assert(Object.is(a, b), m || `Expected ${insp(a, 1)} to strictly equal ${insp(b, 1)}`);
  assert.deepStrictEqual = assert.deepEqual = (a, b, m) => assert(JSON.stringify(a) === JSON.stringify(b), m || `Expected ${insp(a, 1)} to deep equal ${insp(b, 1)}`);
  assert.throws = (f, m) => { let t = false; try { f(); } catch { t = true; } assert(t, typeof m === 'string' ? m : 'Expected function to throw'); };
  const ExitSignal = (code) => Object.assign(new Error('process.exit(' + code + ')'), { __deExit: true, code });
  let stdoutBuf = '';
  const process = {
    env: Object.assign({ NODE_ENV: 'development', HOME: '/home/runner', USER: 'runner' }, cfg.env || {}),
    argv: ['node', '/home/runner/' + (cfg.entry || 'index.js')], platform: 'linux', version: 'v20.0.0-devengine', versions: { node: '20.0.0' },
    cwd: () => '/home/runner', exit: (c = 0) => { post({ kind: 'exit', code: c }); throw ExitSignal(c); },
    nextTick: (f, ...a) => queueMicrotask(() => f(...a)), hrtime: Object.assign(() => [0, 0], { bigint: () => BigInt(Math.round(performance.now() * 1e6)) }),
    memoryUsage: () => ({ heapUsed: 0, rss: 0 }), uptime: () => performance.now() / 1000, on: () => process, exitCode: 0,
    stdout: { write: (s) => { stdoutBuf += s; const i = stdoutBuf.lastIndexOf('\n'); if (i >= 0) { post({ kind: 'console', level: 'log', text: stdoutBuf.slice(0, i) }); stdoutBuf = stdoutBuf.slice(i + 1); } return true; } },
    stderr: { write: (s) => { post({ kind: 'console', level: 'error', text: String(s).replace(/\n$/, '') }); return true; } },
    stdin: { on: () => {}, setEncoding: () => {} },
  };
  const flushStdout = () => { if (stdoutBuf) { post({ kind: 'console', level: 'log', text: stdoutBuf }); stdoutBuf = ''; } };
  const os = { platform: () => 'linux', EOL: '\n', cpus: () => [{}], homedir: () => '/home/runner', hostname: () => 'devengine', type: () => 'Linux', arch: () => 'wasm', totalmem: () => 4e9, freemem: () => 2e9 };
  const builtins = { fs: nodeFs, path: nodePath, events: Object.assign(EventEmitter, { EventEmitter }), util, readline, os, assert, process };
  g.__de_builtins = builtins;
  if (cfg.mode !== 'web') { g.process = process; g.global = g; } else { g.process = g.process || { env: process.env }; }

  // ---- module loader (ESM via blob URLs + CommonJS) ----
  const blobs = {};
  const building = new Set();
  const cjsCache = {};
  const mk = (code, name) => { const u = URL.createObjectURL(new Blob([code], { type: 'text/javascript' })); urlToPath[u] = name; return u; };
  function builtinUrl(name) {
    const key = 'node:' + name;
    if (blobs[key]) return blobs[key];
    const m = builtins[name];
    const names = Object.keys(m).filter((k) => /^[A-Za-z_$][\w$]*$/.test(k) && k !== 'default');
    blobs[key] = mk(`const m = globalThis.__de_builtins[${JSON.stringify(name)}];\nexport default m;\n${names.length ? `export const { ${names.join(', ')} } = m;` : ''}`, key);
    return blobs[key];
  }
  function esmUrl(path) {
    if (blobs[path]) return blobs[path];
    if (building.has(path)) throw new Error(`Circular import detected involving '${path}' (not supported in the browser runtime)`);
    building.add(path);
    let code = files[path];
    if (path.endsWith('.json')) code = 'export default ' + code + ';';
    else if (/\.(css|scss)$/.test(path)) code = `const s=document.createElement('style');s.textContent=${JSON.stringify(code)};document.head.appendChild(s);export default {};`;
    else if (!g.__de_isESM(code)) code = `const m = globalThis.__de_require(${JSON.stringify(path)});\nexport default m;`;
    else {
      code = g.__de_rewriteImports(code, (spec) => {
        const r = resolve(path, spec);
        if (r.builtin) return builtinUrl(r.builtin);
        if (r.bare) return r.url;
        return esmUrl(r.path);
      });
    }
    building.delete(path);
    blobs[path] = mk(code, path);
    return blobs[path];
  }
  g.__de_require = function req(path) {
    if (cjsCache[path]) return cjsCache[path].exports;
    const module = { exports: {} };
    cjsCache[path] = module;
    const code = files[path];
    if (path.endsWith('.json')) { module.exports = JSON.parse(code); return module.exports; }
    const localRequire = (spec) => {
      const r = resolve(path, spec);
      if (r.builtin) return builtins[r.builtin];
      if (r.bare) throw new Error(`require('${spec}'): npm packages must be loaded with ESM "import" in the browser runtime (or use the Dev Engine backend)`);
      if (g.__de_isESM(files[r.path])) throw new Error(`require('${spec}'): '${r.path}' is an ES module — use import instead`);
      return req(r.path);
    };
    // eslint-disable-next-line no-new-func
    const fn = new Function('require', 'module', 'exports', '__filename', '__dirname', 'process', code + `\n//# sourceURL=${path}`);
    fn(localRequire, module, module.exports, '/home/runner/' + path, '/home/runner/' + dirname(path), process);
    return module.exports;
  };
  g.__de_import = (path) => import(esmUrl(path));
  // Classic <script src> in web mode: inject a blob script synchronously during parsing.
  const afterParse = (f) => (g.document.readyState === 'loading' ? g.document.addEventListener('DOMContentLoaded', f) : f());
  g.__de_classic = (path, deferred) => {
    if (!(path in files)) { reportError(new Error(`Failed to load script '${path}' (file not found)`), cfg.page, 0, 0); return; }
    const u = mk(files[path], path);
    if (deferred || g.document.readyState !== 'loading') {
      afterParse(() => { const s = g.document.createElement('script'); s.async = false; s.src = u; g.document.body.appendChild(s); });
    } else {
      g.document.write('<script src="' + u + '"><\/script>');
    }
  };
  g.__de_module = (path) => afterParse(() => g.__de_import(path).catch((e) => reportError(e)));

  // ---- navigation between local pages in the webview ----
  if (cfg.mode === 'web') {
    g.document.addEventListener('click', (e) => {
      const a = e.target.closest && e.target.closest('a[href]');
      if (!a) return;
      const href = a.getAttribute('href');
      if (!href || /^(https?:|mailto:|tel:|#|javascript:)/.test(href)) { if (/^https?:/.test(href)) { e.preventDefault(); post({ kind: 'open', url: href }); } return; }
      const target = g.__de_createResolver(files).norm(dirname(cfg.page || 'index.html') + '/' + href.split('#')[0].split('?')[0]);
      const page = target in files ? target : (target + '/index.html') in files ? target + '/index.html' : null;
      if (page) { e.preventDefault(); post({ kind: 'navigate', path: page }); }
    }, true);
  }

  // ---- entry points ----
  async function runNode() {
    const t0 = performance.now();
    try {
      const entry = cfg.entry;
      if (!(entry in files)) throw new Error(`Entry file '${entry}' not found`);
      if (g.__de_isESM(files[entry])) await g.__de_import(entry);
      else g.__de_require(entry);
      // allow pending timers/promises a moment to settle before reporting completion
      await new Promise((r) => setTimeout(r, 30));
      flushStdout();
      post({ kind: 'done', code: 0, ms: performance.now() - t0 });
    } catch (e) {
      flushStdout();
      if (e && e.__deExit) { post({ kind: 'done', code: e.code, ms: performance.now() - t0 }); return; }
      reportError(e);
      post({ kind: 'done', code: 1, ms: performance.now() - t0 });
    }
  }
  async function runTests() {
    const jl = g.__de_jest;
    const fileResults = [];
    for (const tf of cfg.testFiles) {
      const jlFile = g.__de_installJestLite(g);
      try {
        if (g.__de_isESM(files[tf])) await g.__de_import(tf);
        else g.__de_require(tf);
        const res = await jlFile.run((r) => post({ kind: 'test', file: tf, result: r }));
        fileResults.push({ file: tf, results: res });
      } catch (e) {
        const r = { name: '(load) ' + tf, status: 'failed', error: mapStack(e && (e.stack || e.message)), message: String(e && e.message) };
        post({ kind: 'test', file: tf, result: r });
        fileResults.push({ file: tf, results: [r] });
      }
    }
    void jl;
    flushStdout();
    post({ kind: 'testsDone', files: fileResults });
  }
  g.__de_start = () => {
    if (cfg.mode === 'node') runNode();
    else if (cfg.mode === 'test') runTests();
  };
}

/** Build the bootstrap <script> string to inject into the sandbox document. */
export function bootstrapScript(cfg) {
  const json = JSON.stringify(cfg).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  return `<script>
window.__de_inspect = ${inspect.toString()};
window.__de_formatArgs = ${formatArgs.toString()};
window.__de_createResolver = ${createResolver.toString()};
window.__de_rewriteImports = ${rewriteImports.toString()};
window.__de_isESM = ${isESM.toString()};
window.__de_installJestLite = ${installJestLite.toString()};
(${installRuntime.toString()})(window, ${json});
<\/script>`;
}
