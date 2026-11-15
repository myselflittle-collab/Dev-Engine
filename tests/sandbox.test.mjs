import test from 'node:test';
import assert from 'node:assert/strict';
import { inspect, formatArgs, createResolver, rewriteImports, isESM, installJestLite, bootstrapScript } from '../js/sandbox.js';

test('inspect formats values like node', () => {
  assert.equal(inspect('hi'), 'hi');
  assert.equal(inspect([1, 'a', { b: 2 }]), "[ 1, \"a\", { b: 2 } ]");
  const o = { a: 1 }; o.self = o;
  assert.match(inspect(o), /\[Circular\]/);
  assert.equal(inspect(new Map([[1, 2]])), 'Map(1) { 1 => 2 }');
  assert.equal(inspect(null), 'null');
  assert.equal(formatArgs(['%s is %d', 'x', 42], inspect), 'x is 42');
});

test('resolver resolves relative, extensionless, builtins and bare imports', () => {
  const files = { 'src/a.js': '', 'src/util/index.ts': '', 'data.json': '{}' };
  const r = createResolver(files, { react: '^18.3.1', 'react-dom': '18.3.1' });
  assert.deepEqual(r.resolve('src/main.js', './a'), { path: 'src/a.js' });
  assert.deepEqual(r.resolve('src/main.js', './util'), { path: 'src/util/index.ts' });
  assert.deepEqual(r.resolve('src/main.js', '../data.json'), { path: 'data.json' });
  assert.deepEqual(r.resolve('x.js', 'node:fs'), { builtin: 'fs' });
  assert.equal(r.resolve('x.js', 'react').url, 'https://esm.sh/react@18.3.1?deps=react-dom@18.3.1');
  assert.equal(r.resolve('x.js', 'react-dom/client').url, 'https://esm.sh/react-dom@18.3.1/client?deps=react@^18.3.1');
  assert.throws(() => r.resolve('x.js', './missing'), /Cannot find module/);
});

test('rewriteImports handles all import forms', () => {
  const code = `import a from './a.js';\nimport { b, c } from "./b";\nimport * as d from './d';\nimport './side.css';\nexport { e } from './e';\nexport * from './f';\nconst g = await import('./g.js');\nconst s = "import x from 'not-real'";`;
  const seen = [];
  rewriteImports(code, (s) => { seen.push(s); return s; });
  assert.deepEqual(seen.slice(0, 7), ['./a.js', './b', './d', './side.css', './e', './f', './g.js']);
});

test('isESM detection', () => {
  assert.equal(isESM("import x from 'y'"), true);
  assert.equal(isESM('export default 1'), true);
  assert.equal(isESM("const x = require('y');\nmodule.exports = x"), false);
  assert.equal(isESM('console.log(1)'), false);
});

test('jest-lite runs suites, hooks, async, matchers and reports failures', async () => {
  const g = {};
  const jl = installJestLite(g);
  const order = [];
  g.describe('math', () => {
    g.beforeEach(() => order.push('before'));
    g.test('adds', () => g.expect(1 + 1).toBe(2));
    g.it('deep equal', () => g.expect({ a: [1, 2] }).toEqual({ a: [1, 2] }));
    g.test('async', async () => { await new Promise((r) => setTimeout(r, 5)); g.expect(await Promise.resolve(3)).toBeGreaterThan(2); });
    g.test('throws', () => g.expect(() => { throw new Error('boom'); }).toThrow('boom'));
    g.test('not', () => g.expect([1, 2]).not.toContain(3));
    g.test('mock', () => { const f = g.jest.fn((x) => x * 2); f(2); g.expect(f).toHaveBeenCalledWith(2); g.expect(f).toHaveBeenCalledTimes(1); });
    g.test('fails', () => g.expect('a').toBe('b'));
    g.test.skip('skipped', () => {});
  });
  const res = await jl.run();
  const by = Object.fromEntries(res.map((r) => [r.name, r.status]));
  assert.equal(by['math › adds'], 'passed');
  assert.equal(by['math › async'], 'passed');
  assert.equal(by['math › mock'], 'passed');
  assert.equal(by['math › fails'], 'failed');
  assert.equal(by['math › skipped'], 'skipped');
  assert.equal(order.length, 7);
  assert.match(res.find((r) => r.status === 'failed').message, /expected "a" to be "b"/);
});

test('bootstrap script is safe to inline in HTML', () => {
  const s = bootstrapScript({ files: { 'a.html': '</script><script>alert(1)</script>' } });
  assert.equal((s.match(/<\/script>/g) || []).length, 1, 'only the closing tag of the bootstrap itself');
});
