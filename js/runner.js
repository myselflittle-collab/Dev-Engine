// Builds sandbox documents for the web / node / test runtimes and transpiles TS/JSX.
import { bootstrapScript } from './sandbox.js';
import { dirname, resolveRelative, extname } from './vfs.js';

const TS_URL = 'https://cdn.jsdelivr.net/npm/typescript@5.6.3/lib/typescript.js';
let tsPromise = null;

export function loadScript(src) {
  return new Promise((res, rej) => {
    if (document.querySelector(`script[data-src="${src}"]`)) return res();
    const s = document.createElement('script');
    s.src = src; s.dataset.src = src; s.onload = () => res(); s.onerror = () => rej(new Error('Failed to load ' + src));
    document.head.appendChild(s);
  });
}

export async function loadTypeScript() {
  if (window.ts) return window.ts;
  // Monaco's AMD loader hijacks `define`; hide it while loading the UMD TypeScript bundle.
  if (!tsPromise) {
    tsPromise = (async () => {
      const def = window.define; window.define = undefined;
      try { await loadScript(TS_URL); } finally { window.define = def; }
      return window.ts;
    })();
  }
  return tsPromise;
}

const needsTranspile = (p) => /\.(tsx?|jsx)$/.test(p);

/** Returns a copy of files with .ts/.tsx/.jsx transpiled to JS (paths unchanged). */
export async function transpileFiles(files) {
  const paths = Object.keys(files).filter(needsTranspile);
  if (!paths.length) return { files: { ...files }, diagnostics: [] };
  const ts = await loadTypeScript();
  const out = { ...files };
  const diagnostics = [];
  for (const p of paths) {
    const r = ts.transpileModule(files[p], {
      fileName: p,
      reportDiagnostics: true,
      compilerOptions: {
        module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020,
        jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true, sourceMap: false, removeComments: false,
      },
    });
    out[p] = r.outputText;
    for (const d of r.diagnostics || []) {
      const pos = d.file && d.start != null ? d.file.getLineAndCharacterOfPosition(d.start) : { line: 0, character: 0 };
      diagnostics.push({ file: p, line: pos.line + 1, col: pos.character + 1, severity: 'error', message: ts.flattenDiagnosticMessageText(d.messageText, '\n'), source: 'ts' });
    }
  }
  return { files: out, diagnostics };
}

/** Merge package.json dependencies with project-level packages. */
export function collectPackages(project) {
  const pk = { ...(project.packages || {}) };
  try {
    const pkg = JSON.parse(project.files['package.json'] || '{}');
    Object.assign(pk, pkg.dependencies || {}, pkg.devDependencies || {});
  } catch { /* invalid package.json is reported by the linter */ }
  return pk;
}

const isLocal = (u) => u && !/^(https?:|\/\/|data:|blob:|#|mailto:)/i.test(u);

/** Transform an HTML page so that local CSS/JS/modules are served from the virtual FS. */
export function buildWebDoc({ files, page, packages, env, runId }) {
  if (!(page in files)) {
    return `<!DOCTYPE html><html><body style="font-family:sans-serif;padding:20px"><h2>404 — ${page} not found</h2><p>Create an <code>index.html</code> file to see your website.</p></body></html>`;
  }
  const extra = {};
  let html = files[page];
  let inline = 0;
  const pdir = dirname(page);
  const r = (u) => resolveRelative(page, u.split('?')[0].split('#')[0]);

  // stylesheets
  html = html.replace(/<link\b([^>]*?)\bhref=["']([^"']+)["']([^>]*)>/gi, (m, a, href, b) => {
    if (!/rel=["']?stylesheet/i.test(a + b) || !isLocal(href)) return m;
    const p = r(href);
    if (!(p in files)) return `<!-- missing stylesheet ${href} -->`;
    return `<style data-src="${p}">\n${files[p].replace(/<\/style/gi, '<\\/style')}\n</style>`;
  });
  // scripts
  html = html.replace(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi, (m, attrs, body) => {
    const srcM = attrs.match(/\bsrc=["']([^"']+)["']/i);
    const isModule = /type=["']?module/i.test(attrs);
    const deferred = /\bdefer\b/i.test(attrs);
    if (/type=["']?(text\/babel|application\/json|importmap|text\/template)/i.test(attrs)) return m;
    if (srcM) {
      if (!isLocal(srcM[1])) return m;
      const p = r(srcM[1]);
      return isModule ? `<script>__de_module(${JSON.stringify(p)})</script>` : `<script>__de_classic(${JSON.stringify(p)}, ${deferred})</script>`;
    }
    if (isModule) {
      const vp = (pdir ? pdir + '/' : '') + `__inline_${inline++}.mjs`;
      extra[vp] = body;
      return `<script>__de_module(${JSON.stringify(vp)})</script>`;
    }
    return m;
  });
  // inline local SVG images
  html = html.replace(/(<img\b[^>]*\bsrc=)["']([^"']+\.svg)["']/gi, (m, pre, src) => {
    if (!isLocal(src)) return m;
    const p = r(src);
    return p in files ? `${pre}"data:image/svg+xml;charset=utf-8,${encodeURIComponent(files[p])}"` : m;
  });

  const boot = bootstrapScript({ mode: 'web', files: { ...files, ...extra }, entry: page, page, packages, env, runId });
  if (/<head[^>]*>/i.test(html)) html = html.replace(/<head[^>]*>/i, (h) => h + boot);
  else if (/<html[^>]*>/i.test(html)) html = html.replace(/<html[^>]*>/i, (h) => h + '<head>' + boot + '</head>');
  else html = boot + html;
  if (!/^\s*<!doctype/i.test(html)) html = '<!DOCTYPE html>' + html;
  return html;
}

export function buildNodeDoc({ files, entry, packages, env, runId, mode = 'node', testFiles = [] }) {
  const boot = bootstrapScript({ mode, files, entry, packages, env, runId, testFiles });
  return `<!DOCTYPE html><html><head><meta charset="utf-8">${boot}</head><body><script>__de_start()</script></body></html>`;
}

export function isJsTestFile(p) {
  return /(\.|_)(test|spec)\.(m?[jt]sx?)$/.test(p) || /(^|\/)__tests__\/.+\.(m?[jt]sx?)$/.test(p);
}

export function isPyTestFile(p) {
  return /(^|\/)(test_[^/]*|[^/]*_test)\.py$/.test(p);
}

/** Static checks that need no runtime: JSON validity, HTML references, etc. */
export function staticChecks(files) {
  const out = [];
  for (const [p, c] of Object.entries(files)) {
    const ext = extname(p);
    if (ext === '.json') {
      try { JSON.parse(c); } catch (e) {
        const m = String(e.message).match(/position (\d+)/);
        let line = 1, col = 1;
        if (m) { const pre = c.slice(0, +m[1]); line = pre.split('\n').length; col = pre.length - pre.lastIndexOf('\n'); }
        out.push({ file: p, line, col, severity: 'error', message: 'Invalid JSON: ' + e.message, source: 'json' });
      }
    }
    if (ext === '.html' || ext === '.htm') {
      const lines = c.split('\n');
      lines.forEach((l, i) => {
        for (const m of l.matchAll(/\b(?:src|href)=["']([^"'#?]+)["']/gi)) {
          const u = m[1];
          if (!isLocal(u) || /^(\/$|\.\/?$)/.test(u)) continue;
          if (/\.(png|jpe?g|gif|webp|ico|mp4|mp3|woff2?|ttf)$/i.test(u)) continue;
          const t = resolveRelative(p, u);
          if (!(t in files) && !((t + '/index.html') in files)) out.push({ file: p, line: i + 1, col: m.index + 1, severity: 'warning', message: `Referenced file "${u}" does not exist`, source: 'html' });
        }
      });
      const opens = (c.match(/<(div|section|main|ul|ol|table|form|header|footer|nav)\b/gi) || []).length;
      const closes = (c.match(/<\/(div|section|main|ul|ol|table|form|header|footer|nav)>/gi) || []).length;
      if (opens !== closes) out.push({ file: p, line: 1, col: 1, severity: 'warning', message: `Unbalanced block tags: ${opens} opening vs ${closes} closing`, source: 'html' });
    }
  }
  return out;
}
