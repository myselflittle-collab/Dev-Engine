// Python runtime powered by Pyodide (CPython compiled to WebAssembly).
import { loadScript } from './runner.js';

const PYODIDE = 'https://cdn.jsdelivr.net/pyodide/v0.26.4/full/';
const ROOT = '/home/pyodide/project';
let pyPromise = null;
let installed = new Set();

export function pythonLoaded() { return !!window.__de_py; }

export function loadPython(onStatus = () => {}) {
  if (!pyPromise) {
    pyPromise = (async () => {
      onStatus('Downloading Python runtime (first run only, ~10 MB)…');
      const def = window.define; window.define = undefined; // hide Monaco AMD loader
      try { await loadScript(PYODIDE + 'pyodide.js'); } finally { window.define = def; }
      const py = await window.loadPyodide({ indexURL: PYODIDE });
      window.__de_py = py;
      onStatus('Python ready');
      return py;
    })().catch((e) => { pyPromise = null; throw e; });
  }
  return pyPromise;
}

function rmrf(FS, path) {
  let st;
  try { st = FS.stat(path); } catch { return; }
  if (FS.isDir(st.mode)) {
    for (const n of FS.readdir(path)) if (n !== '.' && n !== '..') rmrf(FS, path + '/' + n);
    FS.rmdir(path);
  } else FS.unlink(path);
}

function mkdirp(FS, path) {
  let cur = '';
  for (const seg of path.split('/').filter(Boolean)) {
    cur += '/' + seg;
    try { FS.mkdir(cur); } catch { /* exists */ }
  }
}

function writeProject(py, files) {
  const FS = py.FS;
  try { FS.chdir('/'); } catch { /* ignore */ } // can't remove the current working directory
  rmrf(FS, ROOT);
  mkdirp(FS, ROOT);
  for (const [p, c] of Object.entries(files)) {
    const full = ROOT + '/' + p;
    mkdirp(FS, full.slice(0, full.lastIndexOf('/')));
    FS.writeFile(full, c);
  }
}

/** Read text files back from the FS (to sync files the program created/changed). */
function readProject(py) {
  const FS = py.FS; const out = {};
  const walk = (dir, rel) => {
    for (const n of FS.readdir(dir)) {
      if (n === '.' || n === '..' || n === '__pycache__' || n === '.pytest_cache') continue;
      const full = dir + '/' + n; const r = rel ? rel + '/' + n : n;
      const st = FS.stat(full);
      if (FS.isDir(st.mode)) walk(full, r);
      else if (st.size < 512 * 1024) {
        const bytes = FS.readFile(full);
        try { out[r] = new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { /* binary: skip */ }
      }
    }
  };
  walk(ROOT, '');
  return out;
}

async function installRequirements(py, files, log) {
  const reqs = (files['requirements.txt'] || '').split('\n').map((l) => l.replace(/#.*/, '').trim()).filter(Boolean);
  // Pyodide auto-loads packages it ships (numpy, pandas…) based on imports
  const code = Object.entries(files).filter(([p]) => p.endsWith('.py')).map(([, c]) => c).join('\n');
  try { await py.loadPackagesFromImports(code, { messageCallback: (m) => log(m + '\n'), errorCallback: () => {} }); } catch { /* ignore */ }
  const todo = reqs.filter((r) => !installed.has(r));
  if (!todo.length) return;
  await py.loadPackage('micropip');
  const micropip = py.pyimport('micropip');
  for (const r of todo) {
    log(`📦 pip install ${r}\n`);
    try { await micropip.install(r); installed.add(r); } catch (e) { log(`⚠ Could not install ${r}: ${String(e.message || e).split('\n').slice(-2).join(' ')}\n`); }
  }
}

export async function pipInstall(pkgs, log) {
  const py = await loadPython((m) => log(m + '\n'));
  await py.loadPackage('micropip');
  const micropip = py.pyimport('micropip');
  for (const p of pkgs) {
    log(`Collecting ${p}…\n`);
    try { await micropip.install(p); installed.add(p); log(`Successfully installed ${p}\n`); } catch (e) { log(`ERROR: ${String(e.message || e).split('\n').slice(-2).join(' ')}\n`); return false; }
  }
  return true;
}

/** Parse a Python traceback into {file,line,message}. */
export function parseTraceback(text) {
  const lines = String(text).split('\n');
  let loc = null;
  for (const l of lines) {
    const m = l.match(/File "(?:\/home\/pyodide\/project\/)?([^"]+)", line (\d+)/);
    if (m && !m[1].startsWith('/') && !m[1].startsWith('<')) loc = { file: m[1], line: +m[2] };
  }
  const msg = lines.map((l) => l.trim()).filter(Boolean).pop() || 'Error';
  return { file: loc && loc.file, line: loc && loc.line, message: msg };
}

const PREP = (entry, env) => `
import os, sys
os.chdir(${JSON.stringify(ROOT)})
if ${JSON.stringify(ROOT)} not in sys.path: sys.path.insert(0, ${JSON.stringify(ROOT)})
for _n, _m in list(sys.modules.items()):
    _f = getattr(_m, '__file__', None) or ''
    if _f.startswith(${JSON.stringify(ROOT)}): del sys.modules[_n]
os.environ.update(${JSON.stringify(env || {})})
sys.argv = [${JSON.stringify(entry)}]
`;

const clean = (s) => String(s).split(ROOT + '/').join('');

/**
 * Run a Python project. io = { out(text), err(text), status(text) }
 * Returns { code, files (changed project files), error }
 */
export async function runPython({ files, entry, env, io }) {
  const py = await loadPython(io.status);
  writeProject(py, files);
  await installRequirements(py, files, io.out);
  let lastLine = '';
  const dec = new TextDecoder();
  py.setStdout({ write: (b) => { const s = dec.decode(b); lastLine = (lastLine + s).split('\n').pop(); io.out(s); return b.length; } });
  py.setStderr({ write: (b) => { io.err(dec.decode(b)); return b.length; } });
  py.setStdin({ stdin: () => { const v = window.prompt(lastLine || 'Input:'); if (v === null) return null; io.input(v); lastLine = ''; return v + '\n'; } });
  if (!(entry in files)) throw new Error(`Entry file '${entry}' not found`);
  let code = 0; let error = null;
  try {
    await py.runPythonAsync(PREP(entry, env) + `
import runpy
try:
    runpy.run_path(${JSON.stringify(entry)}, run_name='__main__')
except SystemExit as _e:
    if _e.code not in (None, 0):
        raise
`);
  } catch (e) {
    code = 1;
    const tb = clean(e.message || e);
    error = { ...parseTraceback(tb), stack: tb };
  }
  try { py.runPython('import sys; sys.stdout.flush(); sys.stderr.flush()'); } catch { /* ignore */ }
  return { code, files: readProject(py), error };
}

/** Run pytest (falls back to unittest). Returns { results:[{name,status,message}], output } */
export async function testPython({ files, env, io }) {
  const py = await loadPython(io.status);
  writeProject(py, files);
  await installRequirements(py, files, io.out);
  let output = '';
  const dec = new TextDecoder();
  py.setStdout({ write: (b) => { output += dec.decode(b); return b.length; } });
  py.setStderr({ write: (b) => { output += dec.decode(b); return b.length; } });
  let hasPytest = installed.has('pytest');
  if (!hasPytest) {
    io.status('Installing pytest…');
    try { await py.loadPackage('micropip'); await py.pyimport('micropip').install('pytest'); installed.add('pytest'); hasPytest = true; } catch { hasPytest = false; }
  }
  try {
    if (hasPytest) {
      await py.runPythonAsync(PREP('pytest', env) + `
import pytest
pytest.main(['-v', '--color=no', '-p', 'no:cacheprovider', '--tb=short', '-o', 'console_output_style=classic'])
`);
    } else {
      await py.runPythonAsync(PREP('unittest', env) + `
import unittest
_s = unittest.defaultTestLoader.discover('.', pattern='test*.py')
unittest.TextTestRunner(stream=sys.stdout, verbosity=2).run(_s)
`);
    }
  } catch (e) {
    output += '\n' + (e.message || e);
  }
  output = clean(output);
  const results = [];
  const fails = {};
  // capture failure sections from pytest --tb=short
  const secRe = /_{3,} (\S+?) _{3,}\n([\s\S]*?)(?=\n_{3,} |\n={3,})/g;
  let sm;
  while ((sm = secRe.exec(output))) fails[sm[1]] = sm[2].trim();
  for (const line of output.split('\n')) {
    let m = line.match(/^(\S+::\S+)\s+(PASSED|FAILED|ERROR|SKIPPED|XFAIL|XPASS)/);
    if (m) {
      const short = m[1].split('::').slice(1).join('::');
      const st = m[2] === 'PASSED' || m[2] === 'XFAIL' || m[2] === 'XPASS' ? 'passed' : m[2] === 'SKIPPED' ? 'skipped' : 'failed';
      results.push({ name: m[1], status: st, error: st === 'failed' ? fails[short] || fails[m[1]] || '' : undefined });
      continue;
    }
    m = line.match(/^(\w+) \(([\w.]+)\)\s*\.\.\.\s*(ok|FAIL|ERROR|skipped)/);
    if (m) results.push({ name: `${m[2]}.${m[1]}`, status: m[3] === 'ok' ? 'passed' : m[3] === 'skipped' ? 'skipped' : 'failed' });
  }
  if (!results.length && /ERROR collecting|errors? during collection|SyntaxError|ImportError/.test(output)) {
    results.push({ name: 'collection', status: 'failed', error: output.slice(-2000) });
  }
  return { results, output };
}

/** Syntax-check every .py file with compile(). */
export async function lintPython(files) {
  const py = window.__de_py;
  if (!py) return null; // only when the runtime has been loaded
  const out = [];
  const check = py.runPython(`
def _de_check(src, name):
    try:
        compile(src, name, 'exec')
        return None
    except SyntaxError as e:
        return [e.lineno or 1, e.offset or 1, e.__class__.__name__ + ': ' + str(e.msg)]
_de_check`);
  for (const [p, c] of Object.entries(files)) {
    if (!p.endsWith('.py')) continue;
    const r = check(c, p);
    if (r) { const [line, col, msg] = r.toJs(); out.push({ file: p, line, col, severity: 'error', message: msg, source: 'python' }); r.destroy && r.destroy(); }
  }
  return out;
}
