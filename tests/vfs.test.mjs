import test from 'node:test';
import assert from 'node:assert/strict';
import { normalize, join, dirname, basename, extname, resolveRelative, buildTree, movePath, removePath, parseConfig, searchFiles, languageForPath, allFolders } from '../js/vfs.js';

test('path helpers', () => {
  assert.equal(normalize('./a//b/../c/'), 'a/c');
  assert.equal(join('src', '../lib', 'x.js'), 'lib/x.js');
  assert.equal(dirname('a/b/c.js'), 'a/b');
  assert.equal(dirname('c.js'), '');
  assert.equal(basename('a/b/c.js'), 'c.js');
  assert.equal(extname('a/b/C.JS'), '.js');
  assert.equal(extname('.gitignore'), '');
  assert.equal(resolveRelative('src/app.js', './util.js'), 'src/util.js');
  assert.equal(resolveRelative('src/app.js', '../index.html'), 'index.html');
  assert.equal(languageForPath('x.py'), 'python');
  assert.equal(languageForPath('.devengine'), 'ini');
});

test('buildTree sorts dirs first and includes empty folders', () => {
  const t = buildTree({ 'b.js': '', 'src/a.js': '', 'a.txt': '' }, ['empty']);
  assert.deepEqual(t.children.map((c) => c.name), ['empty', 'src', 'a.txt', 'b.js']);
  assert.equal(t.children[1].children[0].path, 'src/a.js');
  assert.deepEqual(allFolders({ 'a/b/c.js': '' }), ['a', 'a/b']);
});

test('move and remove paths', () => {
  const files = { 'src/a.js': '1', 'src/b/c.js': '2', 'x.js': '3' };
  const m = movePath(files, ['src/b'], 'src', 'lib');
  assert.deepEqual(Object.keys(m.files).sort(), ['lib/a.js', 'lib/b/c.js', 'x.js']);
  assert.deepEqual(m.folders, ['lib/b']);
  const r = removePath(files, [], 'src');
  assert.deepEqual(Object.keys(r.files), ['x.js']);
});

test('parseConfig', () => {
  const c = parseConfig('run = "gcc main.c && ./main"\nentry = main.c\n# comment\nport = 3000\nlive = true');
  assert.equal(c.run, 'gcc main.c && ./main');
  assert.equal(c.entry, 'main.c');
  assert.equal(c.port, 3000);
  assert.equal(c.live, true);
});

test('searchFiles', () => {
  const r = searchFiles({ 'a.js': 'const x = 1;\nlet Y = 2;', 'b.py': 'x = 3' }, 'x');
  assert.equal(r.length, 2);
  assert.equal(searchFiles({ 'a': 'Foo' }, 'foo', { caseSensitive: true }).length, 0);
  assert.equal(searchFiles({ 'a': 'abc123' }, '\\d+', { regex: true })[0].col, 4);
  assert.deepEqual(searchFiles({ a: 'x' }, '(', { regex: true }), []);
});
