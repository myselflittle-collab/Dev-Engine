import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { WebSocket } from 'ws';
import os from 'node:os';
import path from 'node:path';

const PORT = 39000 + Math.floor(Math.random() * 500);
const work = path.join(os.tmpdir(), 'de-test-' + PORT);
let srv;

test.before(async () => {
  srv = spawn(process.execPath, ['server.js'], { env: { ...process.env, PORT: String(PORT), DEVENGINE_TOKEN: 'tok', DEVENGINE_WORKDIR: work }, stdio: 'pipe' });
  await new Promise((r) => srv.stdout.on('data', (d) => /running/.test(d) && r()));
});
test.after(() => srv.kill());

function connect(token = 'tok') {
  const ws = new WebSocket(`ws://localhost:${PORT}/ws?project=p1&token=${token}`);
  const msgs = [];
  const waiters = [];
  ws.on('message', (d) => { const m = JSON.parse(d); msgs.push(m); waiters.forEach((w) => w()); });
  const until = (pred, ms = 15000) => new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error('timeout; got ' + JSON.stringify(msgs).slice(0, 500))), ms);
    const check = () => { const m = msgs.find(pred); if (m) { clearTimeout(t); res(m); } };
    waiters.push(check); check();
  });
  return { ws, msgs, until, send: (m) => ws.send(JSON.stringify(m)) };
}

test('rejects bad token', async () => {
  const ws = new WebSocket(`ws://localhost:${PORT}/ws?project=x&token=bad`);
  const code = await new Promise((r) => ws.on('close', (c) => r(c)));
  assert.equal(code, 4401);
});

test('sync + run bash, stdin, exit code and pull', async () => {
  const c = connect();
  await c.until((m) => m.t === 'hello');
  c.send({ t: 'sync', files: { 'main.sh': 'read name\necho "hi $name"\necho made > out.txt\nexit 3\n', 'sub/a.txt': 'A' } });
  c.send({ t: 'run', cmd: 'bash main.sh' });
  c.send({ t: 'stdin', data: 'Little\n' });
  await c.until((m) => m.t === 'out' && /hi Little/.test(m.data));
  const ex = await c.until((m) => m.t === 'exit');
  assert.equal(ex.code, 3);
  c.send({ t: 'pull' });
  const f = await c.until((m) => m.t === 'files');
  assert.equal(f.files['out.txt'], 'made\n');
  assert.equal(f.files['sub/a.txt'], 'A');
  c.ws.close();
});

test('path traversal is blocked', async () => {
  const c = connect();
  await c.until((m) => m.t === 'hello');
  c.send({ t: 'sync', files: { '../../evil.txt': 'x' } });
  const m = await c.until((x) => x.t === 'out' && /escapes workspace/.test(x.data));
  assert.ok(m);
  c.ws.close();
});

test('compiles and runs C when gcc exists', async (t) => {
  const c = connect();
  const hello = await c.until((m) => m.t === 'hello');
  if (!hello.languages.gcc) return t.skip('gcc not installed');
  c.send({ t: 'sync', files: { 'main.c': '#include <stdio.h>\nint main(){printf("C works %d\\n", 6*7);return 0;}\n' } });
  c.send({ t: 'run', cmd: 'gcc main.c -o main && ./main' });
  await c.until((m) => m.t === 'out' && /C works 42/.test(m.data));
  assert.equal((await c.until((m) => m.t === 'exit')).code, 0);
  c.ws.close();
});

test('interactive shell', async () => {
  const c = connect();
  await c.until((m) => m.t === 'hello');
  c.send({ t: 'shell', data: 'echo $((40+2))\n' });
  await c.until((m) => m.t === 'shell-out' && /42/.test(m.data));
  c.ws.close();
});

test('serves the front-end and health', async () => {
  const html = await (await fetch(`http://localhost:${PORT}/`)).text();
  assert.match(html, /Dev Engine/);
  const h = await (await fetch(`http://localhost:${PORT}/health`)).json();
  assert.equal(h.ok, true);
  assert.equal((await fetch(`http://localhost:${PORT}/server/server.js`)).status, 404);
});
