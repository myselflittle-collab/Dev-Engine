#!/usr/bin/env node
// Dev Engine backend: real Linux shell + run any language (C, C++, Java, Go, Rust, Bash, Node, Python…).
// Also serves the Dev Engine front-end, so one URL gives you the whole IDE.
//
//   PORT=3001 DEVENGINE_TOKEN=secret node server.js
//
// SECURITY: this executes arbitrary code sent by the browser. Run it on your own machine,
// inside Docker, or behind authentication (set DEVENGINE_TOKEN). Never expose it publicly without a token.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3001);
const TOKEN = process.env.DEVENGINE_TOKEN || '';
const ROOT = path.resolve(process.env.DEVENGINE_WORKDIR || path.join(os.tmpdir(), 'devengine-workspaces'));
const STATIC = path.resolve(process.env.DEVENGINE_STATIC || path.join(__dirname, '..'));
const MAX_FILE = 2 * 1024 * 1024;
const SKIP_DIRS = new Set(['node_modules', '.git', '__pycache__', '.venv', 'venv', 'target', '.pytest_cache', '.cache', '.npm']);

fs.mkdirSync(ROOT, { recursive: true });

let pty = null;
try { pty = (await import('node-pty')).default; } catch { /* optional */ }

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png' };

// ---------- static front-end + health ----------
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/health') {
    res.writeHead(200, { 'content-type': 'application/json', 'access-control-allow-origin': '*' });
    res.end(JSON.stringify({ ok: true, name: 'dev-engine-server', pty: !!pty, languages: detectLanguages() }));
    return;
  }
  let p = decodeURIComponent(url.pathname);
  if (p.endsWith('/')) p += 'index.html';
  const file = path.join(STATIC, p);
  if (!file.startsWith(STATIC) || file.includes(`${path.sep}server${path.sep}`) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    res.writeHead(404); res.end('Not found'); return;
  }
  res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

let langCache = null;
function detectLanguages() {
  if (langCache) return langCache;
  const which = (cmd) => { try { return spawnSyncOk(cmd); } catch { return false; } };
  langCache = Object.fromEntries(['node', 'python3', 'gcc', 'g++', 'javac', 'go', 'rustc', 'ruby', 'php', 'bash'].map((c) => [c, which(c)]));
  return langCache;
}
function spawnSyncOk(cmd) {
  const paths = (process.env.PATH || '').split(path.delimiter);
  return paths.some((d) => { try { fs.accessSync(path.join(d, cmd), fs.constants.X_OK); return true; } catch { return false; } });
}

// ---------- workspace helpers ----------
const safeId = (s) => String(s || 'default').replace(/[^\w-]/g, '').slice(0, 64) || 'default';

function safePath(dir, rel) {
  const full = path.resolve(dir, rel);
  if (!full.startsWith(dir + path.sep)) throw new Error('path escapes workspace: ' + rel);
  return full;
}

function syncFiles(dir, files, known) {
  for (const old of known) {
    if (!(old in files)) { try { fs.rmSync(safePath(dir, old), { force: true }); } catch { /* */ } }
  }
  known.clear();
  for (const [rel, content] of Object.entries(files || {})) {
    if (typeof content !== 'string' || content.length > MAX_FILE) continue;
    const full = safePath(dir, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    let cur = null;
    try { cur = fs.readFileSync(full, 'utf8'); } catch { /* new */ }
    if (cur !== content) fs.writeFileSync(full, content, { mode: rel.endsWith('.sh') ? 0o755 : 0o644 });
    known.add(rel);
  }
}

function readFiles(dir) {
  const out = {};
  let count = 0;
  const walk = (d, rel) => {
    for (const ent of fs.readdirSync(d, { withFileTypes: true })) {
      if (count > 500) return;
      if (ent.isDirectory()) { if (!SKIP_DIRS.has(ent.name)) walk(path.join(d, ent.name), rel ? `${rel}/${ent.name}` : ent.name); continue; }
      if (!ent.isFile()) continue;
      const full = path.join(d, ent.name);
      const st = fs.statSync(full);
      if (st.size > 512 * 1024) continue;
      const buf = fs.readFileSync(full);
      if (buf.includes(0)) continue; // binary
      out[rel ? `${rel}/${ent.name}` : ent.name] = buf.toString('utf8');
      count++;
    }
  };
  walk(dir, '');
  return out;
}

// ---------- websocket protocol ----------
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 50 * 1024 * 1024 });

wss.on('connection', (ws, req) => {
  const url = new URL(req.url, 'http://x');
  if (TOKEN && url.searchParams.get('token') !== TOKEN) { ws.close(4401, 'unauthorized'); return; }
  const dir = path.join(ROOT, safeId(url.searchParams.get('project')));
  fs.mkdirSync(dir, { recursive: true });
  const known = new Set(Object.keys(readFiles(dir)));
  let proc = null;
  let shell = null;
  const send = (m) => { if (ws.readyState === 1) ws.send(JSON.stringify(m)); };
  const env = { ...process.env, TERM: 'xterm-256color', REPL_HOME: dir, FORCE_COLOR: '1', PYTHONUNBUFFERED: '1' };

  send({ t: 'hello', version: 1, pty: !!pty, languages: detectLanguages(), cwd: dir });

  const killProc = () => { if (proc) { try { process.kill(-proc.pid, 'SIGKILL'); } catch { try { proc.kill('SIGKILL'); } catch { /* */ } } proc = null; } };

  const startShell = () => {
    if (shell) return;
    if (pty) {
      shell = pty.spawn(process.env.SHELL || 'bash', ['-i'], { name: 'xterm-256color', cols: 100, rows: 30, cwd: dir, env });
      shell.onData((d) => send({ t: 'shell-out', data: d }));
      shell.onExit(() => { shell = null; send({ t: 'shell-out', data: '\r\n[shell exited — press Enter to restart]\r\n' }); });
    } else {
      // `script` allocates a pseudo-terminal without native modules
      const p = spawn('script', ['-qfc', 'bash -i', '/dev/null'], { cwd: dir, env });
      p.stdout.on('data', (d) => send({ t: 'shell-out', data: d.toString() }));
      p.stderr.on('data', (d) => send({ t: 'shell-out', data: d.toString() }));
      p.on('exit', () => { shell = null; send({ t: 'shell-out', data: '\r\n[shell exited — press Enter to restart]\r\n' }); });
      shell = { write: (d) => p.stdin.write(d), resize: () => {}, kill: () => p.kill('SIGKILL') };
    }
  };

  ws.on('message', (raw) => {
    let m;
    try { m = JSON.parse(raw.toString()); } catch { return; }
    try {
      switch (m.t) {
        case 'sync': syncFiles(dir, m.files, known); break;
        case 'run': {
          killProc();
          proc = spawn('bash', ['-lc', String(m.cmd || '')], { cwd: dir, env, detached: true });
          const p = proc;
          p.stdout.on('data', (d) => send({ t: 'out', data: d.toString(), stream: 'stdout' }));
          p.stderr.on('data', (d) => send({ t: 'out', data: d.toString(), stream: 'stderr' }));
          p.on('error', (e) => send({ t: 'out', data: String(e.message) + '\n', stream: 'stderr' }));
          p.on('close', (code, signal) => { if (proc === p) proc = null; send({ t: 'exit', code: code ?? (signal ? 137 : 0) }); });
          break;
        }
        case 'stdin': if (proc) proc.stdin.write(String(m.data)); break;
        case 'kill': killProc(); break;
        case 'shell': startShell(); if (m.data) shell.write(String(m.data)); break;
        case 'shell-resize': if (shell && shell.resize) shell.resize(Math.max(20, m.cols | 0), Math.max(5, m.rows | 0)); break;
        case 'pull': send({ t: 'files', files: readFiles(dir) }); break;
        default: break;
      }
    } catch (e) {
      send({ t: 'out', data: `[server] ${e.message}\n`, stream: 'stderr' });
    }
  });

  ws.on('close', () => { killProc(); if (shell) { try { shell.kill(); } catch { /* */ } shell = null; } });
});

server.listen(PORT, () => {
  console.log(`\n  Dev Engine server running`);
  console.log(`  ➜ IDE:        http://localhost:${PORT}/`);
  console.log(`  ➜ Backend URL: http://localhost:${PORT}${TOKEN ? '?token=' + TOKEN : ''}  (paste into ⚙ Settings → Backend)`);
  console.log(`  ➜ Workspaces: ${ROOT}`);
  console.log(`  ➜ Terminal:   ${pty ? 'node-pty' : 'script(1) fallback'}${TOKEN ? '' : '\n  ⚠ No DEVENGINE_TOKEN set — only run this on a trusted machine/network.'}\n`);
});
