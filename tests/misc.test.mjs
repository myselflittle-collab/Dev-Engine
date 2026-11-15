import test from 'node:test';
import assert from 'node:assert/strict';
import { parseEdits, stripEdits, diffStats, renderMarkdown, projectContext } from '../js/ai.js';
import { parseRepoRef } from '../js/github.js';
import { buildWebDoc, staticChecks, isJsTestFile, isPyTestFile } from '../js/runner.js';
import { parseTraceback } from '../js/python.js';
import { defaultServerCommand } from '../js/backend.js';
import { TEMPLATES, defaultEntry, detectRuntime } from '../js/templates.js';

test('parseEdits extracts files and deletions', () => {
  const text = `Fixed the bug.\n\n<<<FILE src/a.js\nexport const a = 1;\n>>>\n<<<FILE ./doc.py\n>>> 1 + 1\n2\n>>>\n<<<DELETE old.txt>>>`;
  const e = parseEdits(text);
  assert.equal(e.length, 3);
  assert.deepEqual(e[0], { type: 'write', path: 'src/a.js', content: 'export const a = 1;\n' });
  assert.equal(e[1].path, 'doc.py');
  assert.equal(e[1].content, '>>> 1 + 1\n2\n');
  assert.deepEqual(e[2], { type: 'delete', path: 'old.txt' });
  assert.equal(stripEdits(text), 'Fixed the bug.');
  const fenced = parseEdits('<<<FILE x.js\n```js\nlet a;\n```\n>>>');
  assert.equal(fenced[0].content, 'let a;\n');
});

test('diffStats & markdown', () => {
  assert.deepEqual(diffStats('a\nb\nc', 'a\nB\nc\nd'), { add: 2, del: 1 });
  const html = renderMarkdown('**bold** <script>\n```\n<b>x</b>\n```');
  assert.match(html, /<b>bold<\/b> &lt;script&gt;/);
  assert.match(html, /<pre><code>&lt;b&gt;x&lt;\/b&gt;/);
  const ctx = projectContext({ name: 'p', runtime: 'node', files: { 'a.js': 'x' } }, { problems: [{ severity: 'error', file: 'a.js', line: 1, message: 'boom' }] });
  assert.match(ctx, /--- a\.js ---\nx/);
  assert.match(ctx, /a\.js:1 boom/);
});

test('parseRepoRef', () => {
  assert.deepEqual(parseRepoRef('octo/hello'), { owner: 'octo', repo: 'hello', branch: null, dir: '' });
  assert.deepEqual(parseRepoRef('https://github.com/octo/hello.git'), { owner: 'octo', repo: 'hello', branch: null, dir: '' });
  assert.deepEqual(parseRepoRef('https://github.com/octo/hello/tree/dev/src/app'), { owner: 'octo', repo: 'hello', branch: 'dev', dir: 'src/app' });
  assert.equal(parseRepoRef('not a repo'), null);
});

test('buildWebDoc rewrites local assets and keeps CDN ones', () => {
  const files = {
    'index.html': '<html><head><link rel="stylesheet" href="style.css"><link rel="stylesheet" href="https://cdn/x.css"></head><body><img src="logo.svg"><script src="app.js"></script><script src="https://cdn/lib.js"></script><script type="module">import "./m.js"</script><script type="module" src="./m.js"></script></body></html>',
    'style.css': 'body{color:red}', 'app.js': 'console.log(1)', 'm.js': 'export {}', 'logo.svg': '<svg></svg>',
  };
  const doc = buildWebDoc({ files, page: 'index.html', packages: {}, env: {}, runId: 1 });
  assert.match(doc, /^<!DOCTYPE html>/);
  assert.match(doc, /<style data-src="style.css">\nbody\{color:red\}/);
  assert.match(doc, /href="https:\/\/cdn\/x.css"/);
  assert.match(doc, /__de_classic\("app.js", false\)/);
  assert.match(doc, /src="https:\/\/cdn\/lib.js"/);
  assert.match(doc, /__de_module\("__inline_0.mjs"\)/);
  assert.match(doc, /__de_module\("m.js"\)/);
  assert.match(doc, /data:image\/svg\+xml/);
  assert.ok(doc.indexOf('__de_installJestLite') < doc.indexOf('<style'), 'bootstrap injected in head before user content');
  assert.match(buildWebDoc({ files, page: 'nope.html' }), /404/);
});

test('staticChecks finds invalid JSON and missing references', () => {
  const p = staticChecks({ 'package.json': '{ "a": 1, }', 'index.html': '<div><script src="missing.js"></script>' });
  assert.ok(p.some((x) => x.file === 'package.json' && x.severity === 'error'));
  assert.ok(p.some((x) => /missing\.js/.test(x.message)));
  assert.ok(p.some((x) => /Unbalanced/.test(x.message)));
});

test('test file detection', () => {
  assert.ok(isJsTestFile('utils.test.js') && isJsTestFile('src/__tests__/a.ts') && isJsTestFile('a.spec.tsx'));
  assert.ok(!isJsTestFile('test.js'));
  assert.ok(isPyTestFile('test_calc.py') && isPyTestFile('pkg/calc_test.py'));
  assert.ok(!isPyTestFile('main.py'));
});

test('parseTraceback finds the deepest project frame', () => {
  const tb = `Traceback (most recent call last):\n  File "/lib/python3.12/runpy.py", line 1, in run\n  File "main.py", line 5, in <module>\n    main()\n  File "calc.py", line 9, in average\n    return sum(v)/len(v)\nZeroDivisionError: division by zero`;
  assert.deepEqual(parseTraceback(tb), { file: 'calc.py', line: 9, message: 'ZeroDivisionError: division by zero' });
});

test('templates and defaults', () => {
  for (const t of TEMPLATES) assert.ok(Object.keys(t.files).length, t.id);
  assert.equal(defaultEntry('node', { 'package.json': '{"main":"src/x.js"}', 'src/x.js': '' }), 'src/x.js');
  assert.equal(defaultEntry('python', { 'test_a.py': '', 'app.py': '' }), 'app.py');
  assert.equal(detectRuntime({ 'a.py': '' }), 'python');
  assert.equal(defaultServerCommand({ 'main.c': '' }), 'gcc main.c -o main -lm && ./main');
  assert.equal(defaultServerCommand({ 'src/Main.java': '' }), 'javac src/Main.java && java -cp src Main');
});
