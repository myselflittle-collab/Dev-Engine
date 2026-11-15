// Persistence: projects, settings and checkpoints in localStorage.
const P = 'devengine:';
const mem = new Map();
const ls = (() => {
  try { const k = P + 'probe'; localStorage.setItem(k, '1'); localStorage.removeItem(k); return localStorage; } catch {
    return { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
  }
})();

const read = (k, d) => { try { const v = ls.getItem(P + k); return v == null ? d : JSON.parse(v); } catch { return d; } };
const write = (k, v) => {
  try { ls.setItem(P + k, JSON.stringify(v)); return true; } catch (e) {
    console.error('Storage full?', e);
    return false;
  }
};

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

export function listProjects() {
  return read('index', []).sort((a, b) => b.updatedAt - a.updatedAt);
}

export function loadProject(id) {
  return read('project:' + id, null);
}

export function saveProject(p) {
  p.updatedAt = Date.now();
  const ok = write('project:' + p.id, p);
  const idx = read('index', []).filter((x) => x.id !== p.id);
  idx.push({ id: p.id, name: p.name, template: p.template, runtime: p.runtime, updatedAt: p.updatedAt, createdAt: p.createdAt, fileCount: Object.keys(p.files).length });
  write('index', idx);
  return ok;
}

export function deleteProject(id) {
  ls.removeItem(P + 'project:' + id);
  ls.removeItem(P + 'checkpoints:' + id);
  write('index', read('index', []).filter((x) => x.id !== id));
}

export function createProject({ name, template, runtime, files, folders = [], packages = {}, env = {} }) {
  const p = {
    id: uid(), name: name || 'untitled', template, runtime,
    files: { ...files }, folders, packages, env,
    openTabs: [], activeFile: null,
    createdAt: Date.now(), updatedAt: Date.now(),
  };
  saveProject(p);
  return p;
}

// ---- checkpoints (restore points) ----
export function listCheckpoints(id) {
  return read('checkpoints:' + id, []);
}

export function addCheckpoint(p, label) {
  const list = listCheckpoints(p.id);
  const last = list[0];
  const snap = JSON.stringify({ files: p.files, folders: p.folders });
  if (last && last.snap === snap) return last; // nothing changed
  const cp = { id: uid(), label, at: Date.now(), snap, fileCount: Object.keys(p.files).length };
  list.unshift(cp);
  while (list.length > 25) list.pop();
  if (!write('checkpoints:' + p.id, list)) { list.splice(5); write('checkpoints:' + p.id, list); }
  return cp;
}

export function getCheckpoint(id, cpId) {
  const cp = listCheckpoints(id).find((c) => c.id === cpId);
  return cp ? { ...cp, data: JSON.parse(cp.snap) } : null;
}

// ---- settings ----
const DEFAULT_SETTINGS = {
  theme: 'dark', fontSize: 14, wordWrap: 'on', minimap: false, tabSize: 2, autoSave: true, formatOnSave: false,
  backendUrl: '',
  ai: { provider: 'anthropic', apiKey: '', model: 'claude-sonnet-5-5', baseUrl: 'https://api.openai.com/v1', maxFixRounds: 3 },
};

export function getSettings() {
  const s = read('settings', {});
  return { ...DEFAULT_SETTINGS, ...s, ai: { ...DEFAULT_SETTINGS.ai, ...(s.ai || {}) } };
}

export function saveSettings(s) {
  write('settings', s);
}
