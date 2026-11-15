// Client for the optional Dev Engine backend (server/): real Linux shell + any language.
export class Backend {
  constructor() {
    this.ws = null; this.url = ''; this.connected = false; this.info = null;
    this.handlers = { out: [], exit: [], shell: [], status: [], files: [] };
  }
  on(ev, fn) { this.handlers[ev].push(fn); }
  emit(ev, ...a) { this.handlers[ev].forEach((f) => f(...a)); }

  connect(url, projectId) {
    this.disconnect();
    if (!url) return Promise.resolve(false);
    this.url = url;
    let wsUrl;
    try {
      const u = new URL(url);
      const token = u.searchParams.get('token');
      u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:';
      u.pathname = u.pathname.replace(/\/$/, '') + '/ws';
      u.search = '';
      u.searchParams.set('project', projectId);
      if (token) u.searchParams.set('token', token);
      wsUrl = u.toString();
    } catch { return Promise.resolve(false); }
    return new Promise((resolve) => {
      let settled = false;
      try { this.ws = new WebSocket(wsUrl); } catch { resolve(false); return; }
      const timer = setTimeout(() => { if (!settled) { settled = true; resolve(false); try { this.ws.close(); } catch { /* */ } } }, 5000);
      this.ws.onmessage = (e) => {
        let m; try { m = JSON.parse(e.data); } catch { return; }
        if (m.t === 'hello') { this.connected = true; this.info = m; this.emit('status', true, m); if (!settled) { settled = true; clearTimeout(timer); resolve(true); } }
        else if (m.t === 'out') this.emit('out', m.data, m.stream);
        else if (m.t === 'exit') this.emit('exit', m.code);
        else if (m.t === 'shell-out') this.emit('shell', m.data);
        else if (m.t === 'files') this.emit('files', m.files);
      };
      this.ws.onclose = () => { const was = this.connected; this.connected = false; if (was) this.emit('status', false); if (!settled) { settled = true; clearTimeout(timer); resolve(false); } };
      this.ws.onerror = () => {};
    });
  }
  disconnect() { if (this.ws) { try { this.ws.close(); } catch { /* */ } } this.ws = null; this.connected = false; }
  send(m) { if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(m)); }
  sync(files) { this.send({ t: 'sync', files }); }
  run(cmd, files) { this.sync(files); this.send({ t: 'run', cmd }); }
  stdin(data) { this.send({ t: 'stdin', data }); }
  kill() { this.send({ t: 'kill' }); }
  shell(data) { this.send({ t: 'shell', data }); }
  resize(cols, rows) { this.send({ t: 'shell-resize', cols, rows }); }
  pull() { this.send({ t: 'pull' }); }
}

/** Default run command per language when no `.devengine` run= is given. */
export function defaultServerCommand(files, entry) {
  const has = (e) => Object.keys(files).find((f) => f.endsWith(e));
  const main = entry || has('.py') || has('.js') || has('.c') || has('.cpp') || has('.java') || has('.go') || has('.rs') || has('.sh') || has('.rb') || has('.php');
  if (!main) return 'ls -la';
  if (main.endsWith('.py')) return `python3 ${main}`;
  if (/\.(m?js|cjs)$/.test(main)) return files['package.json'] && /"start"/.test(files['package.json']) ? 'npm install --silent && npm start' : `node ${main}`;
  if (main.endsWith('.ts')) return `npx -y tsx ${main}`;
  if (main.endsWith('.c')) return `gcc ${main} -o main -lm && ./main`;
  if (main.endsWith('.cpp')) return `g++ -std=c++17 ${main} -o main && ./main`;
  if (main.endsWith('.java')) { const cls = main.split('/').pop().replace('.java', ''); return `javac ${main} && java -cp ${main.includes('/') ? main.slice(0, main.lastIndexOf('/')) : '.'} ${cls}`; }
  if (main.endsWith('.go')) return `go run ${main}`;
  if (main.endsWith('.rs')) return `rustc ${main} -o main && ./main`;
  if (main.endsWith('.sh')) return `bash ${main}`;
  if (main.endsWith('.rb')) return `ruby ${main}`;
  if (main.endsWith('.php')) return `php ${main}`;
  return `cat ${main}`;
}
