// Virtual file system helpers (pure, no DOM) — usable in browser and Node tests.

export function normalize(p) {
  const parts = [];
  for (const seg of String(p || '').replace(/\\/g, '/').split('/')) {
    if (!seg || seg === '.') continue;
    if (seg === '..') parts.pop();
    else parts.push(seg);
  }
  return parts.join('/');
}

export function join(...ps) {
  return normalize(ps.filter(Boolean).join('/'));
}

export function dirname(p) {
  const n = normalize(p);
  const i = n.lastIndexOf('/');
  return i === -1 ? '' : n.slice(0, i);
}

export function basename(p) {
  const n = normalize(p);
  return n.slice(n.lastIndexOf('/') + 1);
}

export function extname(p) {
  const b = basename(p);
  const i = b.lastIndexOf('.');
  return i <= 0 ? '' : b.slice(i).toLowerCase();
}

/** Resolve `rel` relative to the directory of file `from`. */
export function resolveRelative(from, rel) {
  if (rel.startsWith('/')) return normalize(rel);
  return join(dirname(from), rel);
}

const LANG_BY_EXT = {
  '.js': 'javascript', '.mjs': 'javascript', '.cjs': 'javascript', '.jsx': 'javascript',
  '.ts': 'typescript', '.tsx': 'typescript',
  '.py': 'python', '.html': 'html', '.htm': 'html', '.css': 'css', '.scss': 'scss',
  '.json': 'json', '.md': 'markdown', '.txt': 'plaintext', '.c': 'c', '.h': 'c',
  '.cpp': 'cpp', '.cc': 'cpp', '.hpp': 'cpp', '.java': 'java', '.go': 'go', '.rs': 'rust',
  '.sh': 'shell', '.rb': 'ruby', '.php': 'php', '.sql': 'sql', '.xml': 'xml', '.svg': 'xml',
  '.yml': 'yaml', '.yaml': 'yaml', '.toml': 'ini', '.ini': 'ini', '.cs': 'csharp', '.kt': 'kotlin',
};

export function languageForPath(p) {
  const b = basename(p);
  if (b === '.devengine' || b === '.replit') return 'ini';
  if (b === 'Dockerfile') return 'dockerfile';
  return LANG_BY_EXT[extname(p)] || 'plaintext';
}

export function fileIcon(p) {
  const e = extname(p);
  const map = {
    '.js': '🟨', '.mjs': '🟨', '.cjs': '🟨', '.jsx': '⚛️', '.tsx': '⚛️', '.ts': '🟦', '.py': '🐍',
    '.html': '🌐', '.css': '🎨', '.json': '🧾', '.md': '📝', '.c': '©️', '.cpp': '➕', '.java': '☕',
    '.go': '🐹', '.rs': '🦀', '.sh': '💲', '.txt': '📄', '.svg': '🖼️',
  };
  return map[e] || '📄';
}

/** All folder paths implied by files plus explicit (possibly empty) folders. */
export function allFolders(files, folders = []) {
  const set = new Set();
  const add = (d) => { while (d) { set.add(d); d = dirname(d); } };
  Object.keys(files).forEach((f) => add(dirname(f)));
  folders.forEach((f) => add(normalize(f)));
  return [...set].sort();
}

/** Nested tree: { name, path, type:'dir'|'file', children } */
export function buildTree(files, folders = []) {
  const root = { name: '', path: '', type: 'dir', children: [] };
  const dirs = new Map([['', root]]);
  for (const d of allFolders(files, folders)) {
    const node = { name: basename(d), path: d, type: 'dir', children: [] };
    dirs.set(d, node);
  }
  for (const [d, node] of dirs) if (d) dirs.get(dirname(d)).children.push(node);
  for (const f of Object.keys(files)) dirs.get(dirname(f)).children.push({ name: basename(f), path: f, type: 'file' });
  const sort = (n) => {
    n.children.sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'dir' ? -1 : 1));
    n.children.forEach((c) => c.type === 'dir' && sort(c));
  };
  sort(root);
  return root;
}

export function listDir(files, folders, dir) {
  dir = normalize(dir);
  const node = findNode(buildTree(files, folders), dir);
  return node && node.type === 'dir' ? node.children : null;
}

export function findNode(tree, path) {
  path = normalize(path);
  if (!path) return tree;
  let cur = tree;
  for (const seg of path.split('/')) {
    cur = cur.children && cur.children.find((c) => c.name === seg);
    if (!cur) return null;
  }
  return cur;
}

export function isDir(files, folders, p) {
  p = normalize(p);
  return p === '' || allFolders(files, folders).includes(p);
}

/** Rename/move a file or folder; returns new {files, folders}. */
export function movePath(files, folders, from, to) {
  from = normalize(from); to = normalize(to);
  const nf = {};
  for (const [k, v] of Object.entries(files)) {
    if (k === from) nf[to] = v;
    else if (k.startsWith(from + '/')) nf[to + k.slice(from.length)] = v;
    else nf[k] = v;
  }
  const nd = folders.map((d) => (d === from ? to : d.startsWith(from + '/') ? to + d.slice(from.length) : d));
  return { files: nf, folders: nd };
}

export function removePath(files, folders, p) {
  p = normalize(p);
  const nf = {};
  for (const [k, v] of Object.entries(files)) if (k !== p && !k.startsWith(p + '/')) nf[k] = v;
  const nd = folders.filter((d) => d !== p && !d.startsWith(p + '/'));
  return { files: nf, folders: nd };
}

/** Parse a simple `.devengine` / `.replit` config: key = "value" lines. */
export function parseConfig(text) {
  const cfg = {};
  for (const line of String(text || '').split('\n')) {
    const m = line.match(/^\s*([A-Za-z_][\w.-]*)\s*=\s*(.+?)\s*$/);
    if (!m) continue;
    let v = m[2];
    if (/^".*"$/.test(v) || /^'.*'$/.test(v)) v = v.slice(1, -1);
    else if (v === 'true' || v === 'false') v = v === 'true';
    else if (/^-?\d+(\.\d+)?$/.test(v)) v = Number(v);
    cfg[m[1]] = v;
  }
  return cfg;
}

/** Search all files for a string/regex; returns [{path,line,col,text}] */
export function searchFiles(files, query, { regex = false, caseSensitive = false } = {}) {
  if (!query) return [];
  let re;
  try {
    re = new RegExp(regex ? query : query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), caseSensitive ? 'g' : 'gi');
  } catch { return []; }
  const out = [];
  for (const [path, content] of Object.entries(files)) {
    String(content).split('\n').forEach((text, i) => {
      re.lastIndex = 0;
      const m = re.exec(text);
      if (m) out.push({ path, line: i + 1, col: m.index + 1, text });
    });
  }
  return out;
}
