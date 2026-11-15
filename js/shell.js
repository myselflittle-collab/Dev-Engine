// Browser shell: a small POSIX-like shell over the project's virtual file system.
import { normalize, join, dirname, basename, buildTree, findNode, allFolders, movePath, removePath, searchFiles } from './vfs.js';

/** Split a command line into tokens honouring quotes and escapes. */
export function tokenize(line) {
  const out = []; let cur = ''; let q = null; let had = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === q) q = null;
      else if (c === '\\' && q === '"' && i + 1 < line.length) cur += line[++i];
      else cur += c;
    } else if (c === '"' || c === "'") { q = c; had = true; }
    else if (c === '\\' && i + 1 < line.length) { cur += line[++i]; had = true; }
    else if (/\s/.test(c)) { if (cur || had) out.push(cur); cur = ''; had = false; }
    else if (c === '>' ) {
      if (cur || had) out.push(cur); cur = ''; had = false;
      if (line[i + 1] === '>') { out.push('>>'); i++; } else out.push('>');
    } else { cur += c; }
  }
  if (q) throw new Error('unterminated quote');
  if (cur || had) out.push(cur);
  return out;
}

/** Split on && / ; / || keeping the operator. */
export function splitChain(line) {
  const parts = []; let cur = ''; let q = null;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) { cur += c; if (c === q) q = null; continue; }
    if (c === '"' || c === "'") { q = c; cur += c; continue; }
    if (c === '&' && line[i + 1] === '&') { parts.push({ cmd: cur.trim(), op: '&&' }); cur = ''; i++; continue; }
    if (c === '|' && line[i + 1] === '|') { parts.push({ cmd: cur.trim(), op: '||' }); cur = ''; i++; continue; }
    if (c === ';') { parts.push({ cmd: cur.trim(), op: ';' }); cur = ''; continue; }
    cur += c;
  }
  parts.push({ cmd: cur.trim(), op: null });
  return parts.filter((p) => p.cmd);
}

const HELP = `Dev Engine shell — commands:
  ls [dir]            list files            tree               show file tree
  cd <dir> / pwd      change / print dir    cat <file>         print a file
  echo <text> [> f]   print / write text    touch <file>       create file
  mkdir <dir>         create folder         rm [-r] <path>     delete
  mv <a> <b>          move / rename         cp <a> <b>         copy file
  grep <text> [file]  search in files       head/tail <file>   first/last lines
  wc <file>           count lines/words     env / export K=V   environment
  run                 run the project       test               run tests
  python <file.py>    run a Python file     node <file.js>     run a JS/TS file
  pip install <pkg>   install Python pkg    npm install <pkg>  add npm package
  open <file>         open in editor        clear              clear screen
  history             command history       help               this help
Tip: connect the Dev Engine backend in Settings for a real Linux shell.`;

/**
 * ctx: {
 *   getProject(), setFS({files, folders}), write(text), clear(), openFile(path),
 *   run(), test(), runFile(path), pip(pkgs), npm(pkgs), setEnv(k,v)
 * }
 */
export function createShell(ctx) {
  let cwd = '';
  const history = [];
  const out = (t = '') => ctx.write(String(t).replace(/\n/g, '\r\n') + '\r\n');
  const abs = (p) => normalize(p.startsWith('/') ? p.replace(/^\/(home\/runner\/?)?/, '') : join(cwd, p));
  const fs = () => { const p = ctx.getProject(); return { files: p.files, folders: p.folders || [] }; };
  const exists = (p) => { const { files, folders } = fs(); return p in files || p === '' || allFolders(files, folders).includes(p); };
  const isDir = (p) => { const { files, folders } = fs(); return p === '' || allFolders(files, folders).includes(p); };

  const commands = {
    help: () => out(HELP),
    pwd: () => out('/home/runner' + (cwd ? '/' + cwd : '')),
    cd: ([d = '']) => {
      const t = d === '' || d === '~' ? '' : abs(d);
      if (!isDir(t)) return out(`cd: ${d}: No such directory`), 1;
      cwd = t;
    },
    ls: (args) => {
      const all = args.includes('-a') || args.includes('-la');
      const long = args.some((a) => /^-\w*l/.test(a));
      const target = abs(args.find((a) => !a.startsWith('-')) || '.');
      const { files, folders } = fs();
      if (target in files) return out(basename(target));
      const node = findNode(buildTree(files, folders), target);
      if (!node) return out(`ls: cannot access '${target}': No such file or directory`), 2;
      const items = node.children.filter((c) => all || !c.name.startsWith('.'));
      if (long) items.forEach((c) => out(`${c.type === 'dir' ? 'd' : '-'}rw-r--r--  ${String(c.type === 'dir' ? 4096 : (files[c.path] || '').length).padStart(7)}  ${c.type === 'dir' ? '\x1b[1;34m' + c.name + '\x1b[0m/' : c.name}`));
      else out(items.map((c) => (c.type === 'dir' ? '\x1b[1;34m' + c.name + '\x1b[0m/' : c.name)).join('  '));
    },
    tree: () => {
      const { files, folders } = fs();
      const lines = ['.'];
      const walk = (n, pre) => n.children.forEach((c, i) => {
        const last = i === n.children.length - 1;
        lines.push(pre + (last ? '└── ' : '├── ') + (c.type === 'dir' ? '\x1b[1;34m' + c.name + '\x1b[0m' : c.name));
        if (c.type === 'dir') walk(c, pre + (last ? '    ' : '│   '));
      });
      walk(buildTree(files, folders), '');
      out(lines.join('\n'));
    },
    cat: (args) => {
      if (!args.length) return out('cat: missing file operand'), 1;
      for (const a of args) {
        const p = abs(a); const { files } = fs();
        if (!(p in files)) { out(`cat: ${a}: No such file or directory`); return 1; }
        out(files[p].replace(/\n$/, ''));
      }
    },
    head: (args) => lines(args, (l, n) => l.slice(0, n)),
    tail: (args) => lines(args, (l, n) => l.slice(-n)),
    wc: ([a]) => {
      const p = abs(a || ''); const { files } = fs();
      if (!(p in files)) return out(`wc: ${a}: No such file`), 1;
      const c = files[p];
      out(`${c.split('\n').length - (c.endsWith('\n') ? 1 : 0)} ${c.split(/\s+/).filter(Boolean).length} ${c.length} ${a}`);
    },
    echo: (args) => out(args.join(' ').replace(/\$(\w+)/g, (m, k) => ctx.getProject().env?.[k] ?? '')),
    touch: (args) => {
      const { files, folders } = fs();
      for (const a of args) { const p = abs(a); if (!(p in files)) files[p] = ''; }
      ctx.setFS({ files, folders });
    },
    mkdir: (args) => {
      const { files, folders } = fs();
      args.filter((a) => !a.startsWith('-')).forEach((a) => folders.push(abs(a)));
      ctx.setFS({ files, folders: [...new Set(folders)] });
    },
    rm: (args) => {
      const rec = args.some((a) => /^-\w*r/.test(a));
      let { files, folders } = fs();
      for (const a of args.filter((x) => !x.startsWith('-'))) {
        const p = abs(a);
        if (!exists(p) || p === '') { out(`rm: cannot remove '${a}': No such file or directory`); return 1; }
        if (isDir(p) && !rec) { out(`rm: cannot remove '${a}': Is a directory (use -r)`); return 1; }
        ({ files, folders } = removePath(files, folders, p));
      }
      ctx.setFS({ files, folders });
    },
    mv: ([a, b]) => {
      if (!a || !b) return out('mv: missing operand'), 1;
      const from = abs(a); let to = abs(b);
      if (!exists(from)) return out(`mv: cannot stat '${a}': No such file or directory`), 1;
      if (isDir(to)) to = join(to, basename(from));
      const { files, folders } = fs();
      ctx.setFS(movePath(files, folders, from, to));
    },
    cp: ([a, b]) => {
      const from = abs(a || ''); let to = abs(b || '');
      const { files, folders } = fs();
      if (!(from in files)) return out(`cp: cannot stat '${a}'`), 1;
      if (isDir(to)) to = join(to, basename(from));
      files[to] = files[from];
      ctx.setFS({ files, folders });
    },
    grep: (args) => {
      const flags = args.filter((a) => a.startsWith('-'));
      const [pat, file] = args.filter((a) => !a.startsWith('-'));
      if (!pat) return out('usage: grep <pattern> [file]'), 2;
      const { files } = fs();
      const scope = file ? { [abs(file)]: files[abs(file)] ?? '' } : files;
      const res = searchFiles(scope, pat, { regex: true, caseSensitive: !flags.includes('-i') });
      res.forEach((r) => out(`\x1b[35m${r.path}\x1b[0m:\x1b[32m${r.line}\x1b[0m:${r.text}`));
      return res.length ? 0 : 1;
    },
    env: () => { const e = ctx.getProject().env || {}; Object.entries(e).forEach(([k, v]) => out(`${k}=${v}`)); if (!Object.keys(e).length) out('(no secrets / env vars set)'); },
    export: (args) => { for (const a of args) { const i = a.indexOf('='); if (i > 0) ctx.setEnv(a.slice(0, i), a.slice(i + 1)); } },
    clear: () => ctx.clear(),
    history: () => history.forEach((h, i) => out(`${String(i + 1).padStart(4)}  ${h}`)),
    whoami: () => out('runner'),
    date: () => out(new Date().toString()),
    open: ([a]) => { const p = abs(a || ''); if (!(p in fs().files)) return out(`open: ${a}: not found`), 1; ctx.openFile(p); },
    code: (a) => commands.open(a),
    run: () => ctx.run(),
    test: () => ctx.test(),
    python: async ([a, ...rest]) => {
      if (!a) return out('Python REPL is not available — run a file: python main.py'), 1;
      if (a === '-m' && rest[0] === 'pytest') return ctx.test();
      if (a === '-m' && rest[0] === 'pip') return commands.pip(rest.slice(1));
      const p = abs(a); if (!(p in fs().files)) return out(`python: can't open file '${a}': No such file`), 2;
      return ctx.runFile(p, 'python');
    },
    python3: (a) => commands.python(a),
    node: async ([a]) => {
      if (!a) return out('usage: node <file.js>'), 1;
      const p = abs(a); if (!(p in fs().files)) return out(`node: cannot find module '${a}'`), 1;
      return ctx.runFile(p, 'node');
    },
    tsx: (a) => commands.node(a), 'ts-node': (a) => commands.node(a),
    pip: async ([sub, ...pk]) => {
      if (sub === 'list') return out([...(ctx.getProject().files['requirements.txt'] || '').split('\n')].filter((l) => l && !l.startsWith('#')).join('\n'));
      if (sub !== 'install' || !pk.length) return out('usage: pip install <package>'), 1;
      return ctx.pip(pk.filter((p) => !p.startsWith('-')));
    },
    pip3: (a) => commands.pip(a),
    npm: async ([sub, ...pk]) => {
      if (['install', 'i', 'add'].includes(sub)) { if (!pk.length) return out('All packages are loaded on demand from esm.sh — nothing to install.'); return ctx.npm(pk.filter((p) => !p.startsWith('-'))); }
      if (sub === 'test' || sub === 't') return ctx.test();
      if (sub === 'start' || (sub === 'run' && pk[0] === 'start') || (sub === 'run' && pk[0] === 'dev')) return ctx.run();
      if (sub === 'run' && pk[0] === 'test') return ctx.test();
      return out('npm: supported: install <pkg>, test, start, run dev'), 1;
    },
    yarn: ([sub, ...pk]) => commands.npm([sub === 'add' ? 'install' : sub, ...pk]),
    pnpm: (a) => commands.npm(a),
    git: () => out('Use the 🕘 Checkpoints panel for history, or ⋯ → "Push to GitHub" to commit.'),
    exit: () => out('logout'),
  };
  const lines = (args, fn) => {
    let n = 10; const rest = [];
    for (let i = 0; i < args.length; i++) { if (args[i] === '-n') n = +args[++i]; else if (/^-\d+$/.test(args[i])) n = +args[i].slice(1); else rest.push(args[i]); }
    const p = abs(rest[0] || ''); const { files } = fs();
    if (!(p in files)) return out(`${rest[0]}: No such file`), 1;
    out(fn(files[p].replace(/\n$/, '').split('\n'), n).join('\n'));
  };

  async function execOne(line) {
    let tokens;
    try { tokens = tokenize(line); } catch (e) { out('sh: ' + e.message); return 2; }
    if (!tokens.length) return 0;
    // redirection (echo/cat/ls/etc.)
    const ri = tokens.findIndex((t) => t === '>' || t === '>>');
    let redirect = null;
    if (ri !== -1) { redirect = { mode: tokens[ri], file: abs(tokens[ri + 1] || '') }; tokens = tokens.slice(0, ri); }
    const [cmd, ...args] = tokens;
    const f = commands[cmd];
    if (!f) { out(`sh: ${cmd}: command not found (type 'help')`); return 127; }
    if (redirect) {
      let buf = '';
      const origWrite = ctx.write;
      ctx.write = (t) => { buf += t; };
      let code;
      try { code = await f(args); } finally { ctx.write = origWrite; }
      const text = buf.replace(/\r\n/g, '\n').replace(/\x1b\[[0-9;]*m/g, '');
      const { files, folders } = fs();
      files[redirect.file] = redirect.mode === '>>' ? (files[redirect.file] || '') + text : text;
      ctx.setFS({ files, folders });
      return code || 0;
    }
    return (await f(args)) || 0;
  }

  async function exec(line) {
    line = line.trim();
    if (!line) return 0;
    history.push(line);
    let last = 0;
    let skip = false;
    for (const { cmd, op } of splitChain(line)) {
      if (!skip) last = await execOne(cmd);
      skip = (op === '&&' && last !== 0) || (op === '||' && last === 0);
    }
    return last;
  }

  return {
    exec,
    history,
    get cwd() { return cwd; },
    prompt: () => `\x1b[1;32mrunner\x1b[0m@\x1b[1;33mdev-engine\x1b[0m:\x1b[1;34m~${cwd ? '/' + cwd : ''}\x1b[0m$ `,
    complete(partial) {
      const words = partial.split(/\s+/);
      const last = words[words.length - 1];
      if (words.length === 1) return Object.keys(commands).filter((c) => c.startsWith(last));
      const dir = last.includes('/') ? last.slice(0, last.lastIndexOf('/') + 1) : '';
      const base = abs(dir || '.');
      const { files, folders } = fs();
      const node = findNode(buildTree(files, folders), base);
      if (!node || node.type !== 'dir') return [];
      return node.children.filter((c) => c.name.startsWith(last.slice(dir.length))).map((c) => dir + c.name + (c.type === 'dir' ? '/' : ''));
    },
    dirname,
  };
}
