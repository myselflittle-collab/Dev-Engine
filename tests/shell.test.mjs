import test from 'node:test';
import assert from 'node:assert/strict';
import { tokenize, splitChain, createShell } from '../js/shell.js';

test('tokenize handles quotes, escapes and redirects', () => {
  assert.deepEqual(tokenize(`echo "hello world" 'a b' c\\ d > out.txt`), ['echo', 'hello world', 'a b', 'c d', '>', 'out.txt']);
  assert.deepEqual(tokenize('echo hi>>log'), ['echo', 'hi', '>>', 'log']);
  assert.deepEqual(tokenize('echo ""'), ['echo', '']);
  assert.throws(() => tokenize('echo "oops'));
  assert.deepEqual(splitChain('a && b; c || d'), [{ cmd: 'a', op: '&&' }, { cmd: 'b', op: ';' }, { cmd: 'c', op: '||' }, { cmd: 'd', op: null }]);
});

function mkShell() {
  const project = { files: { 'main.py': 'print(1)\n', 'src/app.js': 'x\ny\nz\n' }, folders: [], env: { NAME: 'Little' } };
  let out = '';
  const ctx = {
    getProject: () => project,
    setFS: ({ files, folders }) => { project.files = files; project.folders = folders; },
    write: (t) => { out += t; }, clear: () => { out = ''; }, openFile: () => {},
    run: () => 0, test: () => 0, runFile: () => 0, pip: () => 0, npm: () => 0, setEnv: (k, v) => { project.env[k] = v; },
  };
  const sh = createShell(ctx);
  return { sh, project, out: () => out.replace(/\x1b\[[0-9;]*m/g, ''), reset: () => { out = ''; } };
}

test('file commands', async () => {
  const { sh, project, out, reset } = mkShell();
  await sh.exec('mkdir lib && touch lib/a.txt');
  assert.ok('lib/a.txt' in project.files);
  await sh.exec('echo hello $NAME > greet.txt');
  assert.equal(project.files['greet.txt'], 'hello Little\n');
  await sh.exec('echo again >> greet.txt');
  assert.equal(project.files['greet.txt'], 'hello Little\nagain\n');
  await sh.exec('mv greet.txt lib');
  assert.ok('lib/greet.txt' in project.files);
  await sh.exec('cd lib'); reset();
  await sh.exec('ls');
  assert.match(out(), /a\.txt\s+greet\.txt/);
  await sh.exec('cd ..'); reset();
  await sh.exec('head -n 2 src/app.js');
  assert.equal(out().trim().split(/\r?\n/).join(','), 'x,y');
  await sh.exec('rm lib');
  assert.ok('lib/a.txt' in project.files, 'rm without -r refuses dirs');
  await sh.exec('rm -r lib');
  assert.ok(!('lib/a.txt' in project.files));
  reset();
  const code = await sh.exec('nope || echo fallback');
  assert.match(out(), /command not found/);
  assert.match(out(), /fallback/);
  assert.equal(code, 0);
  reset();
  await sh.exec('grep print');
  assert.match(out(), /main\.py:1:print\(1\)/);
  assert.deepEqual(sh.complete('ca'), ['cat']);
  assert.deepEqual(sh.complete('cat sr'), ['src/']);
});
