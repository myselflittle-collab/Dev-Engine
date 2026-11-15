// Dev Engine — main application.
import { $, $$, el, esc, toast, debounce, timeAgo, modal, promptModal, confirmModal, menu, download, compress, decompress } from './ui.js';
import * as store from './store.js';
import { TEMPLATES, getTemplate, defaultEntry, detectRuntime } from './templates.js';
import { normalize, join, dirname, basename, languageForPath, fileIcon, buildTree, movePath, removePath, parseConfig, searchFiles, allFolders } from './vfs.js';
import { transpileFiles, collectPackages, buildWebDoc, buildNodeDoc, isJsTestFile, isPyTestFile, staticChecks } from './runner.js';
import { runPython, testPython, lintPython, pipInstall, loadPython } from './python.js';
import { createShell } from './shell.js';
import { chat, parseEdits, stripEdits, diffStats, projectContext, renderMarkdown } from './ai.js';
import { Backend, defaultServerCommand } from './backend.js';
import { importRepo, pushRepo } from './github.js';
import { openBuilder, closeBuilder } from './builder.js';
import { classify, loadApp, APPS } from './appgen.js';
import { generateSite, KINDS } from './sitegen.js';
import { AI_PROVIDERS, aiReady as aiReadyFor } from './ai.js';

const MONACO_BASE = 'https://cdn.jsdelivr.net/npm/monaco-editor@0.52.2/min/';
const SANDBOX = 'allow-scripts allow-modals allow-forms allow-popups allow-pointer-lock allow-downloads';
const RUNTIME_LABEL = { web: 'Webview', node: 'Node.js', python: 'Python', server: 'Backend' };

const S = {
  settings: store.getSettings(),
  project: null,
  dirty: new Set(),
  expanded: new Set(['']),
  panel: 'files',
  out: 'console',
  running: false,
  runId: 0,
  runFrame: null,
  waiters: {},
  problems: { lint: [], static: [], runtime: [], tests: [], py: [] },
  tests: null,
  testOutput: '',
  consoleText: '',
  openLine: null,
  agentBusy: false,
  abort: null,
  page: 'index.html',
  lastRuntime: null,
  selectedTemplate: 'html',
  viewStates: new Map(),
  suppress: false,
  mobileMode: 'editor',
  lint: { py: [] },
};
let monaco = null;
let ed = null; // monaco editor or textarea
const backend = new Backend();

// =====================================================================
// Boot & routing
// =====================================================================

async function route() {
  const h = location.hash;
  let m = h.match(/^#\/site\/([\w]+)/);
  if (m) {
    const p = store.loadProject(m[1]);
    if (p && p.site) { if (S.project) closeWorkspace(true); return openBuilder(p, builderDeps); }
    toast('Website not found', 'err'); location.hash = ''; return;
  }
  m = h.match(/^#\/repl\/([\w]+)/);
  if (m) {
    $('#builder').hidden = true;
    const p = store.loadProject(m[1]);
    if (p) return openWorkspace(p);
    toast('Project not found', 'err');
    location.hash = '';
    return;
  }
  m = h.match(/^#\/share\/(.+)$/);
  if (m) {
    try {
      const data = JSON.parse(await decompress(m[1]));
      const ok = await modal({ title: '🍴 Fork shared project', body: el('p', {}, `Someone shared "${data.name}" (${Object.keys(data.files).length} files). Fork it into your account?`), buttons: [{ label: 'Cancel', value: false }, { label: 'Fork', class: 'primary', value: true }] });
      if (ok) {
        const p = store.createProject({ name: data.name, template: data.template, runtime: data.runtime, files: data.files, folders: data.folders || [], packages: data.packages || {} });
        location.hash = '#/repl/' + p.id;
        return;
      }
    } catch (e) { toast('Invalid share link', 'err'); }
    location.hash = '';
    return;
  }
  closeWorkspace();
}

// =====================================================================
// Home / dashboard
// =====================================================================
function renderHome() {
  const grid = $('#templates');
  grid.innerHTML = '';
  for (const t of TEMPLATES) {
    grid.append(el('button', {
      class: 'tpl' + (t.id === S.selectedTemplate ? ' selected' : ''), 'data-id': t.id,
      onclick: () => { S.selectedTemplate = t.id; $$('.tpl').forEach((x) => x.classList.toggle('selected', x.dataset.id === t.id)); $('#new-name').focus(); },
      ondblclick: () => createFromTemplate(t.id),
    }, el('span', { class: 'ico', style: { background: t.color + '33' } }, t.icon), el('span', {}, el('b', {}, t.name), el('small', {}, t.desc))));
  }
  renderReplList();
  $('#btn-create').onclick = () => createFromTemplate(S.selectedTemplate);
  $('#new-name').onkeydown = (e) => { if (e.key === 'Enter') createFromTemplate(S.selectedTemplate); };
  $('#home-search').oninput = renderReplList;
  $('#btn-import-zip').onclick = () => $('#zip-input').click();
  $('#zip-input').onchange = (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) importZip(f); };
  $('#btn-import-gh').onclick = importGitHubDialog;
  $('#btn-home-settings').onclick = () => settingsModal();
  $('#btn-connect-ai').onclick = () => connectAIModal();
  $('#ask-form').onsubmit = (e) => { e.preventDefault(); const t = $('#ask-text').value.trim(); if (t) handleRequest(t); };
  $('#ask-text').onkeydown = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('#ask-form').requestSubmit(); } };
  $$('#ask-chips .chip').forEach((c) => { c.onclick = () => { $('#ask-text').value = c.textContent; handleRequest(c.textContent); }; });
  updateAIButton();
}

function updateAIButton() {
  const p = AI_PROVIDERS[S.settings.ai.provider];
  $('#btn-connect-ai').textContent = aiReady() ? `🟢 ${p ? p.label : 'AI'} connected` : '🔌 Connect AI';
}
function aiReady() { return aiReadyFor(S.settings); }

/** Route a natural-language request: website → visual builder, app → generated project, code → template / Agent. */
async function handleRequest(text, { fromAgent } = {}) {
  const c = classify(text);
  if (c.type === 'website') {
    const site = generateSite(text, c.kind);
    const p = store.createProject({ name: site.name.replace(/[^\w.-]+/g, '-'), template: 'site', runtime: 'site', files: {} });
    p.site = site; p.prompt = text; store.saveProject(p);
    if (fromAgent) agentBubble('ai', renderMarkdown(`🎨 Opening the visual builder for **${esc(site.name)}**…`));
    location.hash = '#/site/' + p.id;
    return true;
  }
  if (c.type === 'app' && c.recipe) {
    try {
      const files = await loadApp(c.recipe, c.name);
      const p = store.createProject({ name: (c.name || c.recipe).replace(/[^\w.-]+/g, '-'), template: 'html', runtime: 'web', files });
      p.prompt = text; store.saveProject(p);
      S.autoRun = true;
      location.hash = '#/repl/' + p.id;
      if (aiReady()) toast('Tip: ask the ✨ Agent to customise it — e.g. “add categories and a dark/light toggle”.');
    } catch (e) { toast('Could not create app: ' + e.message, 'err'); }
    return true;
  }
  if ((c.type === 'app' || c.type === 'code') && aiReady()) {
    const tpl = c.type === 'code' ? ({ python: 'python', node: 'node', typescript: 'typescript', cpp: 'cpp', c: 'c', java: 'java', go: 'go', rust: 'rust', bash: 'bash' }[c.lang] || 'node') : 'html';
    const t = getTemplate(tpl);
    const p = store.createProject({ name: (c.name || 'my-app').replace(/[^\w.-]+/g, '-'), template: t.id, runtime: t.runtime, files: t.files });
    S.pendingAgent = `Build this from scratch, replacing the starter files: ${text}\n\nCreate all the files needed (HTML/CSS/JS for apps unless another language was asked for), make it look polished and modern with smooth animations, add unit tests for the core logic, and make sure it runs without errors.`;
    location.hash = '#/repl/' + p.id;
    return true;
  }
  if (c.type === 'code') {
    const t = getTemplate({ python: 'python', node: 'node', typescript: 'typescript', cpp: 'cpp', c: 'c', java: 'java', go: 'go', rust: 'rust', bash: 'bash' }[c.lang] || 'node');
    const p = store.createProject({ name: (c.name || t.id + '-project').replace(/[^\w.-]+/g, '-'), template: t.id, runtime: t.runtime, files: t.files });
    toast(`Created a ${t.name} project. Connect an AI to have the Agent write the code for you.`);
    location.hash = '#/repl/' + p.id;
    return true;
  }
  if (c.type === 'app') { appPickerModal(text); return true; }
  if (!fromAgent) toast('Tell me what to build — e.g. “make a website for my gym” or “build a todo app”.');
  return false;
}

function appPickerModal(text) {
  let close;
  const grid = el('div', { class: 'template-grid', style: { marginBottom: 0 } }, APPS.map((a) => el('button', { class: 'tpl', onclick: async () => { close(); const files = await loadApp(a.id, a.name); const p = store.createProject({ name: a.name.replace(/[^\w.-]+/g, '-'), template: 'html', runtime: 'web', files }); S.autoRun = true; location.hash = '#/repl/' + p.id; } }, el('span', { class: 'ico', style: { background: '#ffffff11' } }, a.icon), el('span', {}, el('b', {}, a.name)))));
  const pr = modal({
    title: '🛠 Build an app', wide: true,
    body: el('div', { style: { display: 'flex', flexDirection: 'column', gap: '12px' } },
      el('p', { style: { margin: 0 } }, `I don't have a ready-made template for “${text}”. To build any custom software from a description, connect an AI (some have free keys). Or start from one of these working apps:`),
      el('button', { class: 'btn primary', onclick: () => { close(); connectAIModal(); } }, '🔌 Connect AI (Claude, ChatGPT, Gemini, Groq…)'),
      grid),
    buttons: [{ label: 'Close', value: null }],
  });
  close = () => { const r = $('#modal-root').lastChild; if (r) r.remove(); };
  return pr;
}

/** Pick an AI provider, paste a key, test it. */
function connectAIModal() {
  const ai = { ...S.settings.ai };
  const status = el('div', { class: 'small muted' });
  const key = el('input', { type: 'password', value: ai.apiKey || '', placeholder: 'Paste your API key' });
  const model = el('input', { value: ai.model || '' });
  const base = el('input', { value: ai.baseUrl || '' });
  const baseRow = el('label', {}, 'API base URL', base);
  const keyLink = el('a', { target: '_blank', rel: 'noopener', class: 'small' });
  const grid = el('div', { class: 'ai-presets' });
  const pickP = (id) => {
    const p = AI_PROVIDERS[id];
    ai.provider = id;
    if (p.baseUrl !== undefined) base.value = p.baseUrl;
    if (!model.value || !Object.values(AI_PROVIDERS).every((x) => x.id === id || x.model !== model.value) || S.settings.ai.provider !== id) model.value = p.model;
    baseRow.hidden = id !== 'custom' && id !== 'ollama';
    keyLink.textContent = p.keyUrl ? `Get a ${p.label} API key ↗` : '';
    keyLink.href = p.keyUrl || '#';
    key.placeholder = id === 'ollama' ? 'Not needed for local Ollama' : 'Paste your API key';
    status.innerHTML = esc(p.note || '');
    $$('.ai-preset', grid).forEach((b) => b.classList.toggle('on', b.dataset.id === id));
  };
  for (const [id, p] of Object.entries(AI_PROVIDERS)) grid.append(el('button', { class: 'ai-preset', 'data-id': id, onclick: () => pickP(id) }, el('b', {}, p.icon + ' ' + p.label, p.free ? el('span', { class: 'free-tag' }, 'FREE TIER') : null), el('small', {}, p.desc)));
  const test = el('button', { class: 'btn', onclick: async () => {
    const s2 = { ...S.settings, ai: { ...S.settings.ai, provider: ai.provider, apiKey: key.value.trim(), model: model.value.trim(), baseUrl: base.value.trim() } };
    status.innerHTML = '<span class="spinner"></span> Testing…';
    try { const r = await chat(s2, [{ role: 'user', content: 'Reply with exactly: OK' }], { system: 'You are a connection test.' }); status.textContent = '✅ Connected! Reply: ' + r.slice(0, 60); } catch (e) { status.textContent = '❌ ' + e.message.slice(0, 300); }
  } }, '🔎 Test connection');
  const pr = modal({
    title: '🔌 Connect an AI', wide: true,
    body: el('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px' } },
      el('div', { class: 'small muted' }, 'Dev Engine works without AI (website builder, assistant commands, app templates, tests). Connect an AI to build ANY website or software from a description and to auto-fix bugs. Your key is stored only in this browser and sent only to the provider you choose.'),
      grid, el('label', {}, 'API key', key), keyLink, el('label', {}, 'Model', model), baseRow, test, status),
    buttons: [{ label: 'Disconnect', value: 'off' }, { label: 'Cancel', value: null }, { label: 'Save', class: 'primary', value: 'save' }],
  });
  pickP(AI_PROVIDERS[ai.provider] ? ai.provider : 'anthropic');
  if (ai.model) model.value = ai.model;
  pr.then((v) => {
    if (v === 'save') { Object.assign(S.settings.ai, { provider: ai.provider, apiKey: key.value.trim(), model: model.value.trim(), baseUrl: base.value.trim() }); store.saveSettings(S.settings); toast(aiReady() ? 'AI connected ✓' : 'Saved', 'ok'); }
    if (v === 'off') { S.settings.ai.apiKey = ''; if (S.settings.ai.provider === 'ollama') S.settings.ai.provider = 'anthropic'; store.saveSettings(S.settings); toast('AI disconnected'); }
    updateAIButton();
    if (S.panel === 'settings' && S.project) renderSide();
  });
  return pr;
}

const builderDeps = {
  saveProject: (p) => store.saveProject(p),
  aiReady: () => aiReady(),
  chat: (messages, opts) => chat(S.settings, messages, opts),
  connectAI: () => connectAIModal(),
  openAsCode: (name, files) => {
    const p = store.createProject({ name: (name + '-code').replace(/[^\w.-]+/g, '-'), template: 'html', runtime: 'web', files });
    S.autoRun = true;
    toast('Opened as code — edits here do not change the visual design.');
    location.hash = '#/repl/' + p.id;
  },
  publishGitHub: async (name, filesPromise) => githubModal(true, await filesPromise, name.toLowerCase().replace(/[^\w]+/g, '-')),
};

function renderReplList() {
  const q = ($('#home-search').value || '').toLowerCase();
  const list = store.listProjects().filter((p) => p.name.toLowerCase().includes(q));
  const box = $('#repl-list');
  box.innerHTML = '';
  $('#repl-count').textContent = list.length ? `${list.length} project${list.length > 1 ? 's' : ''}` : '';
  if (!list.length) { box.append(el('div', { class: 'empty' }, q ? 'No projects match your search.' : 'No projects yet — describe what to build above, or pick a template.')); return; }
  for (const p of list) {
    const isSite = p.runtime === 'site';
    const t = isSite ? { icon: '🎨', name: 'Visual website' } : getTemplate(p.template);
    box.append(el('div', { class: 'repl-card', onclick: () => { location.hash = (isSite ? '#/site/' : '#/repl/') + p.id; } },
      el('h3', {}, el('span', {}, t.icon), p.name),
      el('div', { class: 'meta' }, `${t.name}${isSite ? '' : ` · ${p.fileCount || 0} files`} · edited ${timeAgo(p.updatedAt)}`),
      el('button', { class: 'btn icon sm card-menu', title: 'Options', onclick: (e) => { e.stopPropagation(); replCardMenu(e, p); } }, '⋯')));
  }
}

function replCardMenu(e, meta) {
  menu(e.clientX, e.clientY, [
    { label: '📂 Open', action: () => { location.hash = (meta.runtime === 'site' ? '#/site/' : '#/repl/') + meta.id; } },
    { label: '✏️ Rename', action: async () => { const n = await promptModal('Rename Repl', 'Name', meta.name); if (n) { const p = store.loadProject(meta.id); p.name = n; store.saveProject(p); renderReplList(); } } },
    { label: '🍴 Fork / Duplicate', action: () => { const p = store.loadProject(meta.id); store.createProject({ ...p, name: p.name + '-copy' }); renderReplList(); toast('Duplicated', 'ok'); } },
    ...(meta.runtime === 'site' ? [] : [{ label: '⤓ Download .zip', action: () => exportZip(store.loadProject(meta.id)) }]),
    '-',
    { label: '🗑 Delete', action: async () => { if (await confirmModal('Delete Repl', `Delete "${meta.name}" permanently? This cannot be undone.`)) { store.deleteProject(meta.id); renderReplList(); } } },
  ]);
}

function createFromTemplate(id) {
  const t = getTemplate(id);
  let name = ($('#new-name').value || '').trim().replace(/[^\w.-]+/g, '-');
  if (!name) name = t.id + '-' + Math.random().toString(36).slice(2, 6);
  const pkg = (() => { try { return JSON.parse(t.files['package.json'] || '{}').dependencies || {}; } catch { return {}; } })();
  const p = store.createProject({ name, template: t.id, runtime: t.runtime, files: t.files, packages: pkg });
  $('#new-name').value = '';
  location.hash = '#/repl/' + p.id;
}

async function importZip(file) {
  try {
    const zip = await window.JSZip.loadAsync(file);
    const files = {};
    const entries = Object.values(zip.files).filter((f) => !f.dir && !/(^|\/)(node_modules|\.git|__pycache__|__MACOSX)\//.test(f.name));
    for (const f of entries) {
      const data = await f.async('uint8array');
      if (data.length > 600000) continue;
      try { files[f.name] = new TextDecoder('utf-8', { fatal: true }).decode(data); } catch { /* skip binary */ }
    }
    const names = Object.keys(files);
    const root = names.length && names.every((n) => n.split('/')[0] === names[0].split('/')[0] && n.includes('/')) ? names[0].split('/')[0] + '/' : '';
    const clean = {};
    for (const n of names) clean[n.slice(root.length)] = files[n];
    const p = store.createProject({ name: (root.replace('/', '') || file.name.replace(/\.zip$/i, '')).replace(/[^\w.-]+/g, '-'), template: 'blank', runtime: detectRuntime(clean), files: clean });
    toast(`Imported ${names.length} files`, 'ok');
    location.hash = '#/repl/' + p.id;
  } catch (e) { toast('Import failed: ' + e.message, 'err'); }
}

async function importGitHubDialog() {
  const url = await promptModal('🐙 Import from GitHub', 'Repository (owner/repo or URL — public repos, or private with a token in Settings)', '', 'e.g. myselflittle-collab/V2Ifps');
  if (!url) return;
  const t = el('div', { class: 'toast' }, el('span', { class: 'spinner' }), ' Importing…');
  $('#toasts').append(t);
  try {
    const r = await importRepo(url, S.settings.githubToken, (d, n) => { t.lastChild.textContent = ` Importing ${d}/${n} files…`; });
    const p = store.createProject({ name: r.name, template: 'blank', runtime: detectRuntime(r.files), files: r.files });
    t.remove(); toast(`Imported ${Object.keys(r.files).length} files from GitHub`, 'ok');
    location.hash = '#/repl/' + p.id;
  } catch (e) { t.remove(); toast(e.message, 'err'); }
}

// =====================================================================
// Workspace
// =====================================================================
function openWorkspace(p) {
  if (S.project && S.project.id !== p.id) saveNow();
  S.project = p;
  p.folders = p.folders || [];
  p.env = p.env || {};
  p.openTabs = (p.openTabs || []).filter((f) => f in p.files);
  S.dirty.clear();
  S.problems = { lint: [], static: [], runtime: [], tests: [], py: [] };
  S.tests = null; S.testOutput = ''; S.consoleText = '';
  S.page = defaultEntry('web', p.files) || 'index.html';
  S.lastRuntime = null;
  $('#home').hidden = true;
  $('#workspace').hidden = false;
  document.title = `${p.name} — Dev Engine`;
  $('#repl-name').value = p.name;
  $('#runtime-badge').textContent = `${getTemplate(p.template).icon} ${RUNTIME_LABEL[effectiveRuntime()] || p.runtime}`;
  // expand folders of open files
  S.expanded = new Set(['']);
  bindWorkspaceOnce();
  stopRun(true);
  $('#console').innerHTML = '';
  consoleSys(`Dev Engine — ${p.name}. Press ▶ Run (Ctrl+Enter) to start.`);
  $('#webframe-wrap').innerHTML = '<div class="wv-placeholder">Press <b>Run</b> to see your website here.</div>';
  $('#wv-url').value = '/' + S.page;
  renderTests();
  renderAgentHistory();
  setPanel(S.panel);
  syncModels(true);
  const first = p.activeFile && p.activeFile in p.files ? p.activeFile : defaultEntry(p.runtime, p.files) || Object.keys(p.files)[0];
  if (first) openFile(first); else showEmptyEditor();
  renderTabs();
  refreshStatic();
  setOut(p.runtime === 'web' && innerWidth > 860 ? 'webview' : 'console');
  setMobile('editor');
  connectBackend();
  if (term) resetShell();
  if (S.autoRun) { S.autoRun = false; setTimeout(() => run(), 300); }
  if (S.pendingAgent) { const t = S.pendingAgent; S.pendingAgent = null; setTimeout(() => { setOut('agent'); setMobile('agent'); agentSend(t, { display: '🛠 ' + (p.prompt || 'Build the project'), label: 'Agent build', auto: true }).then(() => run()); }, 400); }
}

function closeWorkspace(keepHomeHidden) {
  if (S.project) saveNow();
  stopRun(true);
  S.project = null;
  $('#workspace').hidden = true;
  if (!$('#builder').hidden && !keepHomeHidden) closeBuilder();
  if (keepHomeHidden) return;
  $('#builder').hidden = true;
  $('#home').hidden = false;
  document.title = 'Dev Engine — Build, Test & Fix in your browser';
  backend.disconnect();
  renderReplList();
}

function effectiveRuntime() {
  const p = S.project;
  const cfg = projectConfig();
  return cfg.runtime || p.runtime;
}
function projectConfig() {
  const f = S.project.files;
  return parseConfig(f['.devengine'] || f['.replit'] || '');
}

let bound = false;
function bindWorkspaceOnce() {
  if (bound) return;
  bound = true;
  $('#btn-home').onclick = () => { location.hash = ''; };
  $('#repl-name').onchange = (e) => { const n = e.target.value.trim().replace(/[^\w.-]+/g, '-') || 'untitled'; e.target.value = n; S.project.name = n; saveNow(); document.title = `${n} — Dev Engine`; };
  $('#btn-run').onclick = () => (S.running ? stopRun() : run());
  $('#btn-test').onclick = () => runTests();
  $('#btn-agent-top').onclick = () => { setOut('agent'); setMobile('agent'); $('#agent-text').focus(); };
  $('#btn-share').onclick = shareRepl;
  $('#btn-deploy').onclick = deployModal;
  $('#btn-more').onclick = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    menu(r.left - 140, r.bottom + 4, [
      { label: '▶ Run (Ctrl+Enter)', action: run },
      { label: '🧪 Run tests', action: runTests },
      { label: '🔎 Check code for problems', action: checkCode },
      { label: '✨ Build → Test → Fix (Agent)', action: autoFix },
      '-',
      { label: '🚀 Deploy / Publish', action: deployModal },
      { label: '🐙 Push to GitHub', action: () => githubModal(false) },
      { label: '⤓ Download .zip', action: () => exportZip(S.project) },
      { label: '🔗 Share link', action: shareRepl },
      '-',
      { label: '🕘 Create checkpoint', action: () => { store.addCheckpoint(S.project, 'Manual checkpoint'); toast('Checkpoint saved', 'ok'); if (S.panel === 'checkpoints') renderSide(); } },
      { label: '⚙ Settings', action: () => setPanel('settings') },
      { label: '🏠 Back to home', action: () => { location.hash = ''; } },
    ]);
  };
  $$('#rail button').forEach((b) => { b.onclick = () => { if (S.panel === b.dataset.panel && innerWidth > 860) { $('#sidepanel').classList.toggle('collapsed'); } else { $('#sidepanel').classList.remove('collapsed'); setPanel(b.dataset.panel); } }; });
  $$('#otabs button').forEach((b) => { b.onclick = () => setOut(b.dataset.out); });
  $$('#mobile-nav button').forEach((b) => { b.onclick = () => setMobile(b.dataset.m); });
  $('#console-clear').onclick = () => { $('#console').innerHTML = ''; S.openLine = null; S.consoleText = ''; };
  $('#console-form').onsubmit = (e) => { e.preventDefault(); consoleEval(); };
  $('#tests-run').onclick = runTests;
  $('#tests-fix').onclick = () => fixWithAgent('tests');
  $('#problems-check').onclick = checkCode;
  $('#problems-fix').onclick = () => fixWithAgent('problems');
  $('#sb-problems').onclick = () => setOut('problems');
  $('#wv-reload').onclick = () => runWeb(S.page);
  $('#wv-open').onclick = openPreviewTab;
  $('#wv-devices').onclick = () => $('#webframe-wrap').classList.toggle('mobile');
  $('#wv-url').onkeydown = (e) => { if (e.key === 'Enter') { const p = normalize(e.target.value); if (p in S.project.files) runWeb(p); else toast(`${p} not found`, 'err'); } };
  $('#agent-form').onsubmit = (e) => { e.preventDefault(); const t = $('#agent-text').value.trim(); if (t) { $('#agent-text').value = ''; agentSend(t); } };
  $('#agent-text').onkeydown = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('#agent-form').requestSubmit(); } };
  $$('.agent-quick .chip').forEach((c) => { c.onclick = () => quickAgent(c.dataset.q); });
  initResizers();
}

function setPanel(name) {
  S.panel = name;
  $$('#rail button').forEach((b) => b.classList.toggle('active', b.dataset.panel === name));
  renderSide();
}

function setOut(name) {
  S.out = name;
  $$('#otabs button').forEach((b) => b.classList.toggle('active', b.dataset.out === name));
  $$('.opane').forEach((p) => p.classList.toggle('active', p.dataset.pane === name));
  if (name === 'shell') initTerminal();
  if (name === 'agent') setTimeout(() => { const m = $('#agent-msgs'); m.scrollTop = m.scrollHeight; }, 0);
  if (innerWidth <= 860 && S.mobileMode !== 'output' && S.mobileMode !== 'agent' && S.project) setMobile(name === 'agent' ? 'agent' : 'output', true);
}

function setMobile(m, fromOut) {
  S.mobileMode = m;
  $('#ws-body').dataset.m = m;
  $$('#mobile-nav button').forEach((b) => b.classList.toggle('active', b.dataset.m === m));
  if (m === 'side') $('#sidepanel').classList.remove('collapsed');
  if (!fromOut && m === 'agent') setOut('agent');
  if (!fromOut && m === 'output' && S.out === 'agent') setOut('console');
  if (m === 'editor' && ed && ed.layout) setTimeout(() => ed.layout(), 0);
  if (fit) setTimeout(() => { try { fit.fit(); } catch { /* */ } }, 50);
}

function initResizers() {
  const lay = S.settings.layout || {};
  if (lay.side) document.documentElement.style.setProperty('--side-w', lay.side + 'px');
  if (lay.right) document.documentElement.style.setProperty('--right-w', lay.right + 'px');
  $$('.resizer').forEach((r) => {
    r.onpointerdown = (e) => {
      e.preventDefault(); r.classList.add('dragging'); r.setPointerCapture(e.pointerId);
      const frames = $$('iframe'); frames.forEach((f) => { f.style.pointerEvents = 'none'; });
      const move = (ev) => {
        if (r.dataset.resize === 'side') {
          const w = Math.max(150, Math.min(500, ev.clientX - 44));
          document.documentElement.style.setProperty('--side-w', w + 'px'); lay.side = w;
        } else {
          const w = Math.max(240, Math.min(innerWidth - 300, innerWidth - ev.clientX));
          document.documentElement.style.setProperty('--right-w', w + 'px'); lay.right = w;
        }
        if (fit) try { fit.fit(); } catch { /* */ }
      };
      const up = () => { r.classList.remove('dragging'); frames.forEach((f) => { f.style.pointerEvents = ''; }); r.removeEventListener('pointermove', move); r.removeEventListener('pointerup', up); S.settings.layout = lay; store.saveSettings(S.settings); };
      r.addEventListener('pointermove', move); r.addEventListener('pointerup', up);
    };
  });
}

// =====================================================================
// Saving
// =====================================================================
const autosave = debounce(() => saveNow(), 700);
function saveNow() {
  if (!S.project) return;
  const ok = store.saveProject(S.project);
  S.dirty.clear();
  $('#sb-saved').textContent = ok ? 'Saved' : '⚠ Storage full — download a .zip';
  renderTabs();
}
function markDirty(path) {
  S.dirty.add(path);
  $('#sb-saved').textContent = 'Saving…';
  renderTabs();
  if (S.settings.autoSave) autosave();
}

/** Replace the project's FS (used by shell, agent, python write-back, checkpoints). */
function setFS({ files, folders }) {
  const p = S.project;
  p.files = files; p.folders = folders || [];
  p.openTabs = p.openTabs.filter((t) => t in files);
  if (p.activeFile && !(p.activeFile in files)) p.activeFile = p.openTabs[0] || null;
  syncModels();
  if (p.activeFile) openFile(p.activeFile); else showEmptyEditor();
  renderTabs();
  if (S.panel === 'files') renderSide();
  saveNow();
  refreshStatic();
}

// =====================================================================
// Editor (Monaco with textarea fallback)
// =====================================================================
function loadMonaco() {
  return new Promise((resolve, reject) => {
    if (!window.require || !window.require.config) { reject(new Error('Monaco loader unavailable')); return; }
    window.MonacoEnvironment = {
      getWorkerUrl: () => `data:text/javascript;charset=utf-8,${encodeURIComponent(`self.MonacoEnvironment={baseUrl:'${MONACO_BASE}'};importScripts('${MONACO_BASE}vs/base/worker/workerMain.js');`)}`,
    };
    window.require.config({ paths: { vs: MONACO_BASE + 'vs' } });
    const t = setTimeout(() => reject(new Error('Monaco load timeout')), 25000);
    window.require(['vs/editor/editor.main'], () => { clearTimeout(t); resolve(window.monaco); }, (e) => { clearTimeout(t); reject(e); });
  });
}

let editorInit = null;
async function initEditor() {
  if (editorInit) return editorInit;
  editorInit = (async () => {
    const host = $('#editor');
    try {
      monaco = await loadMonaco();
      monaco.editor.defineTheme('devengine', {
        base: 'vs-dark', inherit: true, rules: [{ token: 'comment', foreground: '6b7a99', fontStyle: 'italic' }],
        colors: { 'editor.background': '#0e1525', 'editorGutter.background': '#0e1525', 'editor.lineHighlightBackground': '#1c233366', 'editorLineNumber.foreground': '#4b5672', 'editorLineNumber.activeForeground': '#c2c8cc', 'editorWidget.background': '#1c2333', 'editorSuggestWidget.background': '#1c2333', 'editor.selectionBackground': '#0079f255' },
      });
      const tsd = monaco.languages.typescript;
      const opts = { target: tsd.ScriptTarget.ES2020, module: tsd.ModuleKind.ESNext, moduleResolution: tsd.ModuleResolutionKind.NodeJs, allowJs: true, jsx: tsd.JsxEmit.ReactJSX, allowNonTsExtensions: true, esModuleInterop: true, allowImportingTsExtensions: true, noEmit: true, strict: false };
      tsd.typescriptDefaults.setCompilerOptions(opts);
      tsd.javascriptDefaults.setCompilerOptions(opts);
      tsd.typescriptDefaults.setDiagnosticsOptions({ noSemanticValidation: false, noSyntaxValidation: false, diagnosticCodesToIgnore: [2307, 2792, 7016, 2875, 1375, 1378, 2580, 2591, 6133, 2686] });
      tsd.javascriptDefaults.setDiagnosticsOptions({ noSemanticValidation: true, noSyntaxValidation: false });
      tsd.typescriptDefaults.setEagerModelSync(true);
      ed = monaco.editor.create(host, {
        theme: S.settings.theme === 'light' ? 'vs' : 'devengine', automaticLayout: true, fontSize: S.settings.fontSize, minimap: { enabled: S.settings.minimap },
        wordWrap: S.settings.wordWrap, tabSize: S.settings.tabSize, fontFamily: "'IBM Plex Mono', ui-monospace, Menlo, Consolas, monospace", fontLigatures: true,
        scrollBeyondLastLine: false, smoothScrolling: true, padding: { top: 8 }, bracketPairColorization: { enabled: true }, model: null, fixedOverflowWidgets: true,
        stickyScroll: { enabled: true }, renderWhitespace: 'selection', guides: { bracketPairs: true },
      });
      ed.onDidChangeModelContent(onEditorChange);
      ed.onDidChangeCursorPosition((e) => statusPos(e.position.lineNumber, e.position.column));
      ed.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => run());
      ed.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => saveFile());
      ed.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyP, () => quickOpen());
      ed.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyT, () => runTests());
      ed.addAction({ id: 'de-ask-agent', label: 'Ask Agent about selection', contextMenuGroupId: 'navigation', run: (e) => { const sel = e.getModel().getValueInRange(e.getSelection()); setOut('agent'); $('#agent-text').value = `Explain / improve this code from ${S.project.activeFile}:\n\`\`\`\n${sel}\n\`\`\`\n`; $('#agent-text').focus(); } });
      monaco.editor.onDidChangeMarkers(debounce(updateLintProblems, 300));
    } catch (err) {
      console.warn('Monaco unavailable, using basic editor', err);
      monaco = null;
      const ta = el('textarea', { class: 'editor-fallback', spellcheck: false, wrap: 'off' });
      ta.addEventListener('input', onEditorChange);
      ta.addEventListener('keydown', (e) => {
        if (e.key === 'Tab') { e.preventDefault(); const s = ta.selectionStart; ta.setRangeText('  ', s, ta.selectionEnd, 'end'); onEditorChange(); }
      });
      ta.addEventListener('keyup', () => { const v = ta.value.slice(0, ta.selectionStart).split('\n'); statusPos(v.length, v[v.length - 1].length + 1); });
      host.append(ta);
      ed = {
        textarea: ta,
        getValue: () => ta.value,
        setValue: (v) => { ta.value = v; },
        layout: () => {},
        focus: () => ta.focus(),
        reveal: (line) => { const lines = ta.value.split('\n'); const pos = lines.slice(0, line - 1).join('\n').length + (line > 1 ? 1 : 0); ta.focus(); ta.setSelectionRange(pos, pos + (lines[line - 1] || '').length); ta.scrollTop = (line - 5) * 19; },
      };
    }
    if (S.project) { syncModels(true); if (S.project.activeFile) openFile(S.project.activeFile); }
    return ed;
  })();
  return editorInit;
}

function modelUri(path) { return monaco.Uri.file('/' + path); }

/** Make Monaco models match project files. */
function syncModels(reset) {
  if (!monaco || !S.project) return;
  const files = S.project.files;
  const want = new Set(Object.keys(files).map((f) => modelUri(f).toString()));
  for (const m of monaco.editor.getModels()) {
    if (reset || !want.has(m.uri.toString())) { if (ed.getModel() === m) ed.setModel(null); m.dispose(); }
  }
  if (reset) S.viewStates.clear();
  for (const [p, c] of Object.entries(files)) {
    const uri = modelUri(p);
    let m = monaco.editor.getModel(uri);
    if (!m) m = monaco.editor.createModel(c, languageForPath(p), uri);
    else if (m.getValue() !== c) {
      S.suppress = true;
      m.pushEditOperations([], [{ range: m.getFullModelRange(), text: c }], () => null);
      S.suppress = false;
    }
  }
}

function onEditorChange() {
  if (S.suppress || !S.project) return;
  const path = S.project.activeFile;
  if (!path) return;
  const v = monaco ? ed.getModel()?.getValue() : ed.getValue();
  if (v == null || S.project.files[path] === v) return;
  S.project.files[path] = v;
  markDirty(path);
  liveReload();
  refreshStaticSoon();
}

const liveReload = debounce(() => {
  if (S.lastRuntime === 'web' && S.out === 'webview' && S.settings.liveReload !== false) runWeb(S.page, { quiet: true });
}, 900);

function showEmptyEditor() {
  $('#editor-empty').hidden = false;
  if (monaco) ed.setModel(null); else if (ed) ed.setValue('');
  $('#sb-lang').textContent = '';
}

async function openFile(path, line, col) {
  const p = S.project;
  if (!(path in p.files)) return;
  if (!p.openTabs.includes(path)) p.openTabs.push(path);
  // remember view state of previous
  if (monaco && ed && ed.getModel() && p.activeFile) S.viewStates.set(p.activeFile, ed.saveViewState());
  p.activeFile = path;
  // expand parent folders in tree
  let d = dirname(path); while (d) { S.expanded.add(d); d = dirname(d); }
  $('#editor-empty').hidden = true;
  renderTabs();
  if (S.panel === 'files') renderSide();
  $('#sb-lang').textContent = languageForPath(path);
  if (!ed) await initEditor();
  if (monaco) {
    let m = monaco.editor.getModel(modelUri(path));
    if (!m) m = monaco.editor.createModel(p.files[path], languageForPath(path), modelUri(path));
    ed.setModel(m);
    const vs = S.viewStates.get(path);
    if (vs) ed.restoreViewState(vs);
    if (line) { ed.revealLineInCenter(line); ed.setPosition({ lineNumber: line, column: col || 1 }); ed.focus(); }
  } else {
    S.suppress = true; ed.setValue(p.files[path]); S.suppress = false;
    if (line) ed.reveal(line);
  }
  if (innerWidth <= 860 && S.mobileMode === 'side') setMobile('editor');
}

function closeTab(path) {
  const p = S.project;
  const i = p.openTabs.indexOf(path);
  if (i === -1) return;
  p.openTabs.splice(i, 1);
  S.viewStates.delete(path);
  if (p.activeFile === path) {
    const next = p.openTabs[Math.min(i, p.openTabs.length - 1)];
    if (next) openFile(next); else { p.activeFile = null; showEmptyEditor(); }
  }
  renderTabs();
  saveNow();
}

function renderTabs() {
  const p = S.project; if (!p) return;
  const box = $('#tabs');
  box.innerHTML = '';
  for (const t of p.openTabs) {
    const tab = el('div', {
      class: 'tab' + (t === p.activeFile ? ' active' : '') + (S.dirty.has(t) ? ' dirty' : ''), title: t,
      onclick: () => openFile(t), onauxclick: (e) => { if (e.button === 1) closeTab(t); },
      oncontextmenu: (e) => { e.preventDefault(); menu(e.clientX, e.clientY, [{ label: 'Close', action: () => closeTab(t) }, { label: 'Close others', action: () => { p.openTabs = [t]; openFile(t); } }, { label: 'Close all', action: () => { p.openTabs = []; p.activeFile = null; showEmptyEditor(); renderTabs(); } }]); },
    }, fileIcon(t), ' ', basename(t), el('button', { class: 'x', title: 'Close', onclick: (e) => { e.stopPropagation(); closeTab(t); } }, el('span', {}, '×')));
    box.append(tab);
  }
  const act = box.querySelector('.tab.active');
  if (act) act.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

function statusPos(l, c) { $('#sb-pos').textContent = `Ln ${l}, Col ${c}`; }

async function saveFile() {
  if (monaco && S.settings.formatOnSave && ed.getModel()) {
    try { await ed.getAction('editor.action.formatDocument').run(); } catch { /* no formatter */ }
  }
  saveNow();
  toast('Saved', 'ok');
}

// =====================================================================
// Side panels
// =====================================================================
function renderSide() {
  const sp = $('#sidepanel');
  sp.innerHTML = '';
  if (!S.project) return;
  ({ files: renderFilesPanel, search: renderSearchPanel, packages: renderPackagesPanel, secrets: renderSecretsPanel, checkpoints: renderCheckpointsPanel, settings: renderSettingsPanel }[S.panel] || renderFilesPanel)(sp);
}

function panelHead(title, ...actions) {
  return el('div', { class: 'panel-head' }, el('span', {}, title), el('span', { class: 'grow' }), ...actions);
}

// ---------- Files ----------
function renderFilesPanel(sp) {
  const p = S.project;
  const upload = el('input', { type: 'file', multiple: true, hidden: true, onchange: (e) => uploadFiles(e.target.files, '') });
  sp.append(panelHead('Files',
    el('button', { class: 'btn icon sm', title: 'New file', onclick: () => newFile('') }, '📄+'),
    el('button', { class: 'btn icon sm', title: 'New folder', onclick: () => newFolder('') }, '📁+'),
    el('button', { class: 'btn icon sm', title: 'Upload files', onclick: () => upload.click() }, '⬆'),
    el('button', { class: 'btn icon sm', title: 'Collapse all', onclick: () => { S.expanded = new Set(['']); renderSide(); } }, '⊟'),
    upload));
  const body = el('div', { class: 'panel-body' });
  body.addEventListener('dragover', (e) => { e.preventDefault(); });
  body.addEventListener('drop', (e) => { e.preventDefault(); if (e.dataTransfer.files.length) uploadFiles(e.dataTransfer.files, ''); else dropMove(e, ''); });
  body.addEventListener('contextmenu', (e) => { if (e.target === body) { e.preventDefault(); menu(e.clientX, e.clientY, [{ label: '📄 New file', action: () => newFile('') }, { label: '📁 New folder', action: () => newFolder('') }]); } });
  const tree = buildTree(p.files, p.folders);
  const walk = (node, depth) => {
    for (const c of node.children) {
      const isDir = c.type === 'dir';
      const open = S.expanded.has(c.path);
      const row = el('div', {
        class: 'tree-item' + (c.path === p.activeFile ? ' active' : ''), draggable: true, title: c.path,
        style: { paddingLeft: 8 + depth * 14 + 'px' },
        onclick: () => { if (isDir) { if (open) S.expanded.delete(c.path); else S.expanded.add(c.path); renderSide(); } else openFile(c.path); },
        oncontextmenu: (e) => { e.preventDefault(); itemMenu(e, c); },
        ondragstart: (e) => { e.dataTransfer.setData('text/x-de-path', c.path); },
      },
      el('span', { class: 'caret' + (open ? ' open' : '') }, isDir ? '▶' : ''),
      el('span', {}, isDir ? (open ? '📂' : '📁') : fileIcon(c.path)),
      el('span', { class: 'name' }, c.name),
      S.dirty.has(c.path) ? el('span', { class: 'dot' }) : null,
      el('button', { class: 'more', title: 'More', onclick: (e) => { e.stopPropagation(); itemMenu(e, c); } }, '⋯'));
      if (isDir) {
        row.addEventListener('dragover', (e) => { e.preventDefault(); e.stopPropagation(); row.classList.add('drop'); });
        row.addEventListener('dragleave', () => row.classList.remove('drop'));
        row.addEventListener('drop', (e) => { e.preventDefault(); e.stopPropagation(); row.classList.remove('drop'); if (e.dataTransfer.files.length) uploadFiles(e.dataTransfer.files, c.path); else dropMove(e, c.path); });
      }
      body.append(row);
      if (isDir && open) walk(c, depth + 1);
    }
  };
  walk(tree, 0);
  if (!tree.children.length) body.append(el('div', { class: 'muted small', style: { padding: '12px' } }, 'No files. Create one with 📄+'));
  sp.append(body);
}

function itemMenu(e, c) {
  const isDir = c.type === 'dir';
  menu(e.clientX, e.clientY, [
    ...(isDir ? [{ label: '📄 New file here', action: () => newFile(c.path) }, { label: '📁 New folder here', action: () => newFolder(c.path) }, '-'] : [{ label: '📂 Open', action: () => openFile(c.path) }]),
    { label: '✏️ Rename', action: () => renamePath(c.path) },
    ...(!isDir ? [{ label: '⧉ Duplicate', action: () => duplicateFile(c.path) }, { label: '⤓ Download', action: () => download(basename(c.path), S.project.files[c.path], 'text/plain') }] : []),
    ...(!isDir && /\.html?$/.test(c.path) ? [{ label: '🌐 Preview in webview', action: () => runWeb(c.path) }] : []),
    ...(!isDir && /\.(py|m?js|ts)$/.test(c.path) ? [{ label: '▶ Run this file', action: () => runFile(c.path) }] : []),
    { label: '📋 Copy path', action: () => navigator.clipboard && navigator.clipboard.writeText(c.path) },
    '-',
    { label: '🗑 Delete', action: () => deletePath(c.path, isDir) },
  ]);
}

function validName(n) { return n && !/[<>:"|?*\\]/.test(n) && !n.split('/').some((s) => s === '..'); }

async function newFile(dir) {
  const n = await promptModal('New file', `Name (in /${dir})`, '', 'e.g. utils.js or src/app.py');
  if (!n) return;
  if (!validName(n)) return toast('Invalid file name', 'err');
  const path = join(dir, n);
  if (path in S.project.files) return toast('File already exists', 'err');
  S.project.files[path] = '';
  setFS({ files: S.project.files, folders: S.project.folders });
  openFile(path);
}

async function newFolder(dir) {
  const n = await promptModal('New folder', `Name (in /${dir})`, '');
  if (!n) return;
  if (!validName(n)) return toast('Invalid folder name', 'err');
  const path = join(dir, n);
  S.project.folders.push(path);
  S.expanded.add(path);
  setFS({ files: S.project.files, folders: [...new Set(S.project.folders)] });
}

async function renamePath(path) {
  const n = await promptModal('Rename', 'New path', path);
  if (!n || normalize(n) === path) return;
  if (!validName(n)) return toast('Invalid name', 'err');
  const to = normalize(n);
  if (to in S.project.files) return toast('A file with that name exists', 'err');
  const p = S.project;
  const res = movePath(p.files, p.folders, path, to);
  p.openTabs = p.openTabs.map((t) => (t === path ? to : t.startsWith(path + '/') ? to + t.slice(path.length) : t));
  if (p.activeFile === path) p.activeFile = to;
  else if (p.activeFile && p.activeFile.startsWith(path + '/')) p.activeFile = to + p.activeFile.slice(path.length);
  setFS(res);
}

function duplicateFile(path) {
  const ext = path.includes('.') ? path.slice(path.lastIndexOf('.')) : '';
  let n = path.slice(0, path.length - ext.length) + '-copy' + ext; let i = 2;
  while (n in S.project.files) n = path.slice(0, path.length - ext.length) + '-copy' + i++ + ext;
  S.project.files[n] = S.project.files[path];
  setFS({ files: S.project.files, folders: S.project.folders });
}

async function deletePath(path, isDir) {
  if (!(await confirmModal('Delete', `Delete ${isDir ? 'folder' : 'file'} "${path}"?`))) return;
  store.addCheckpoint(S.project, `Before deleting ${path}`);
  setFS(removePath(S.project.files, S.project.folders, path));
}

function dropMove(e, dir) {
  const from = e.dataTransfer.getData('text/x-de-path');
  if (!from || from === dir || dir.startsWith(from + '/')) return;
  const to = join(dir, basename(from));
  if (to === from) return;
  const p = S.project;
  const res = movePath(p.files, p.folders, from, to);
  p.openTabs = p.openTabs.map((t) => (t === from ? to : t.startsWith(from + '/') ? to + t.slice(from.length) : t));
  if (p.activeFile === from) p.activeFile = to;
  setFS(res);
}

async function uploadFiles(list, dir) {
  let n = 0;
  for (const f of list) {
    if (f.size > 1_000_000) { toast(`${f.name}: too large (max 1 MB)`, 'err'); continue; }
    const buf = new Uint8Array(await f.arrayBuffer());
    try { S.project.files[join(dir, f.webkitRelativePath || f.name)] = new TextDecoder('utf-8', { fatal: true }).decode(buf); n++; } catch { toast(`${f.name}: binary files are not supported`, 'err'); }
  }
  if (n) { setFS({ files: S.project.files, folders: S.project.folders }); toast(`Uploaded ${n} file(s)`, 'ok'); }
}

// ---------- Search ----------
function renderSearchPanel(sp) {
  sp.append(panelHead('Search'));
  const q = el('input', { placeholder: 'Search in all files…', value: S.searchQ || '' });
  const rep = el('input', { placeholder: 'Replace with…', value: S.replaceQ || '' });
  const rx = el('input', { type: 'checkbox', checked: !!S.searchRx });
  const cs = el('input', { type: 'checkbox', checked: !!S.searchCs });
  const res = el('div', { class: 'panel-body' });
  const go = () => {
    S.searchQ = q.value; S.replaceQ = rep.value; S.searchRx = rx.checked; S.searchCs = cs.checked;
    res.innerHTML = '';
    const r = searchFiles(S.project.files, q.value, { regex: rx.checked, caseSensitive: cs.checked });
    let last = null;
    if (q.value && !r.length) res.append(el('div', { class: 'muted small', style: { padding: '10px' } }, 'No results'));
    for (const m of r.slice(0, 500)) {
      if (m.path !== last) { res.append(el('div', { class: 'search-file' }, fileIcon(m.path), ' ', m.path)); last = m.path; }
      res.append(el('div', { class: 'search-res', title: m.text, onclick: () => openFile(m.path, m.line, m.col) }, `${m.line}: ${m.text.trim()}`));
    }
  };
  q.oninput = debounce(go, 200);
  rx.onchange = go; cs.onchange = go;
  const replaceAll = () => {
    if (!q.value) return;
    let re; try { re = new RegExp(rx.checked ? q.value : q.value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), cs.checked ? 'g' : 'gi'); } catch { return toast('Invalid regex', 'err'); }
    store.addCheckpoint(S.project, `Before replace "${q.value}"`);
    let count = 0;
    for (const [p, c] of Object.entries(S.project.files)) { const n = c.replace(re, () => { count++; return rep.value; }); S.project.files[p] = n; }
    setFS({ files: S.project.files, folders: S.project.folders });
    toast(`Replaced ${count} occurrence(s)`, 'ok');
    go();
  };
  sp.append(el('div', { class: 'panel-pad' }, q, rep,
    el('div', { style: { display: 'flex', gap: '10px', alignItems: 'center', fontSize: '12px' } },
      el('label', {}, rx, ' Regex'), el('label', {}, cs, ' Match case'), el('span', { class: 'grow' }),
      el('button', { class: 'btn sm', onclick: replaceAll }, 'Replace all'))));
  sp.append(res);
  go();
  setTimeout(() => q.focus(), 0);
}

// ---------- Packages ----------
function renderPackagesPanel(sp) {
  const p = S.project;
  const rt = effectiveRuntime();
  sp.append(panelHead('Packages'));
  const body = el('div', { class: 'panel-body' });
  const py = rt === 'python' || Object.keys(p.files).some((f) => f.endsWith('.py'));
  const js = rt !== 'python' || 'package.json' in p.files;
  if (js) {
    const input = el('input', { placeholder: 'npm package, e.g. lodash, dayjs, three' });
    const add = async () => { const n = input.value.trim(); if (n) { await npmAdd([n]); renderSide(); } };
    input.onkeydown = (e) => { if (e.key === 'Enter') add(); };
    body.append(el('div', { class: 'panel-pad' }, el('label', {}, '📦 npm (loaded from esm.sh CDN)'), el('div', { style: { display: 'flex', gap: '6px' } }, input, el('button', { class: 'btn primary sm', onclick: add }, 'Add'))));
    const deps = collectPackages(p);
    if (!Object.keys(deps).length) body.append(el('div', { class: 'muted small', style: { padding: '0 10px 10px' } }, 'No npm packages. Import any package in your code — e.g. import confetti from "canvas-confetti" — and it loads automatically.'));
    for (const [n, v] of Object.entries(deps)) body.append(el('div', { class: 'kv' }, el('span', { class: 'k' }, n), el('span', { class: 'v' }, v), el('button', { class: 'btn icon sm', title: 'Remove', onclick: () => { npmRemove(n); renderSide(); } }, '✕')));
  }
  if (py) {
    const input = el('input', { placeholder: 'pip package, e.g. requests, numpy' });
    const add = async () => { const n = input.value.trim(); if (n) { await pipAdd([n]); renderSide(); } };
    input.onkeydown = (e) => { if (e.key === 'Enter') add(); };
    body.append(el('div', { class: 'panel-pad', style: { borderTop: '1px solid var(--border)' } }, el('label', {}, '🐍 pip (Pyodide / pure-Python wheels)'), el('div', { style: { display: 'flex', gap: '6px' } }, input, el('button', { class: 'btn primary sm', onclick: add }, 'Add'))));
    const reqs = (p.files['requirements.txt'] || '').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
    for (const r of reqs) body.append(el('div', { class: 'kv' }, el('span', { class: 'k' }, r), el('button', { class: 'btn icon sm', title: 'Remove', onclick: () => { p.files['requirements.txt'] = p.files['requirements.txt'].split('\n').filter((l) => l.trim() !== r).join('\n'); setFS({ files: p.files, folders: p.folders }); renderSide(); } }, '✕')));
  }
  sp.append(body);
}

async function npmAdd(names) {
  const p = S.project;
  let pkg = {};
  try { pkg = JSON.parse(p.files['package.json'] || '{}'); } catch { return termOrToast('package.json is invalid JSON'); }
  pkg.dependencies = pkg.dependencies || {};
  for (const raw of names) {
    const m = raw.match(/^(@?[^@]+)(?:@(.+))?$/);
    if (!m) continue;
    let ver = m[2];
    if (!ver) {
      try { const r = await fetch(`https://registry.npmjs.org/${m[1]}/latest`); if (r.ok) ver = '^' + (await r.json()).version; } catch { /* offline */ }
    }
    if (!ver) { termOrToast(`npm ERR! 404 '${m[1]}' not found in the registry`); continue; }
    pkg.dependencies[m[1]] = ver;
    termOrToast(`+ ${m[1]}@${ver.replace('^', '')}`, true);
  }
  if (!pkg.name) pkg.name = S.project.name;
  p.files['package.json'] = JSON.stringify(pkg, null, 2) + '\n';
  setFS({ files: p.files, folders: p.folders });
}
function npmRemove(name) {
  const p = S.project;
  try { const pkg = JSON.parse(p.files['package.json'] || '{}'); delete (pkg.dependencies || {})[name]; delete (pkg.devDependencies || {})[name]; p.files['package.json'] = JSON.stringify(pkg, null, 2) + '\n'; } catch { /* */ }
  delete p.packages[name];
  setFS({ files: p.files, folders: p.folders });
}
async function pipAdd(names) {
  const p = S.project;
  const cur = (p.files['requirements.txt'] || '').split('\n');
  for (const n of names) if (!cur.some((l) => l.trim().split(/[=<>~]/)[0] === n.split(/[=<>~]/)[0])) cur.push(n);
  p.files['requirements.txt'] = cur.filter((l, i) => l || i < cur.length - 1).join('\n').replace(/^\n+/, '') + '\n';
  setFS({ files: p.files, folders: p.folders });
  const log = (t) => (term && S.out === 'shell' ? term.write(t.replace(/\n/g, '\r\n')) : consoleWrite(t, 'stdout'));
  await pipInstall(names, log);
}
function termOrToast(msg, ok) { if (term && S.out === 'shell') term.write(msg + '\r\n'); else toast(msg, ok ? 'ok' : 'err'); }

// ---------- Secrets ----------
function renderSecretsPanel(sp) {
  const p = S.project;
  sp.append(panelHead('Secrets'));
  const k = el('input', { placeholder: 'KEY (e.g. API_KEY)' });
  const v = el('input', { placeholder: 'value', type: 'password' });
  const add = () => {
    const key = k.value.trim().replace(/[^\w]/g, '_');
    if (!key) return;
    p.env[key] = v.value; saveNow(); renderSide(); toast(`Secret ${key} saved`, 'ok');
  };
  v.onkeydown = (e) => { if (e.key === 'Enter') add(); };
  sp.append(el('div', { class: 'panel-pad' },
    el('div', { class: 'muted small' }, 'Secrets are injected as environment variables: process.env.KEY (JS) and os.environ["KEY"] (Python). Stored only in this browser and never included in share links.'),
    k, v, el('button', { class: 'btn primary sm', onclick: add }, '+ Add secret')));
  const body = el('div', { class: 'panel-body' });
  for (const [key, val] of Object.entries(p.env)) {
    const vs = el('span', { class: 'v' }, '••••••');
    body.append(el('div', { class: 'kv' }, el('span', { class: 'k' }, key), vs,
      el('button', { class: 'btn icon sm', title: 'Show', onclick: () => { vs.textContent = vs.textContent === '••••••' ? val : '••••••'; } }, '👁'),
      el('button', { class: 'btn icon sm', title: 'Delete', onclick: () => { delete p.env[key]; saveNow(); renderSide(); } }, '✕')));
  }
  sp.append(body);
}

// ---------- Checkpoints ----------
function renderCheckpointsPanel(sp) {
  const p = S.project;
  sp.append(panelHead('Checkpoints', el('button', { class: 'btn sm', onclick: () => { store.addCheckpoint(p, 'Manual checkpoint'); renderSide(); toast('Checkpoint saved', 'ok'); } }, '+ Save')));
  const body = el('div', { class: 'panel-body' });
  const list = store.listCheckpoints(p.id);
  body.append(el('div', { class: 'muted small', style: { padding: '6px 10px' } }, 'Restore points are created automatically before every Agent edit, delete and restore.'));
  if (!list.length) body.append(el('div', { class: 'muted small', style: { padding: '10px' } }, 'No checkpoints yet.'));
  for (const cp of list) {
    body.append(el('div', { class: 'cp' },
      el('div', { class: 't' }, el('b', {}, cp.label), el('span', { class: 'muted' }, `${timeAgo(cp.at)} · ${cp.fileCount} files`)),
      el('button', { class: 'btn sm', title: 'Compare with current', onclick: () => compareCheckpoint(cp.id) }, 'Diff'),
      el('button', { class: 'btn sm', onclick: () => restoreCheckpoint(cp.id) }, 'Restore')));
  }
  sp.append(body);
}

function compareCheckpoint(id) {
  const cp = store.getCheckpoint(S.project.id, id);
  const a = cp.data.files; const b = S.project.files;
  const rows = [];
  for (const f of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (!(f in b)) rows.push(el('div', { class: 'efile' }, el('span', { class: 'del' }, 'deleted'), f));
    else if (!(f in a)) rows.push(el('div', { class: 'efile' }, el('span', { class: 'add' }, 'new'), f));
    else if (a[f] !== b[f]) { const d = diffStats(a[f], b[f]); rows.push(el('div', { class: 'efile' }, el('span', { class: 'add' }, '+' + d.add), el('span', { class: 'del' }, '-' + d.del), f)); }
  }
  modal({ title: `Changes since “${cp.label}”`, body: el('div', { class: 'edits' }, rows.length ? rows : el('div', { class: 'efile' }, 'No differences')) });
}

async function restoreCheckpoint(id) {
  if (!(await confirmModal('Restore checkpoint', 'Replace all current files with this checkpoint? (Your current state is saved as a checkpoint first.)', 'Restore', false))) return;
  const cp = store.getCheckpoint(S.project.id, id);
  store.addCheckpoint(S.project, 'Before restore');
  setFS({ files: { ...cp.data.files }, folders: [...(cp.data.folders || [])] });
  renderSide();
  toast('Checkpoint restored', 'ok');
}

// ---------- Settings ----------
function renderSettingsPanel(sp) {
  sp.append(panelHead('Settings'));
  const body = el('div', { class: 'panel-body' });
  body.append(settingsForm(true));
  sp.append(body);
}

function settingsForm(inWorkspace) {
  const s = S.settings;
  const f = el('div', { class: 'panel-pad' });
  const save = () => { store.saveSettings(s); applySettings(); };
  const field = (label, input) => el('label', { style: { display: 'flex', flexDirection: 'column', gap: '4px' } }, label, input);
  const sel = (val, opts, on) => { const x = el('select', {}, opts.map(([v, l]) => el('option', { value: v, selected: v === val }, l))); x.onchange = () => { on(x.value); save(); }; return x; };
  const chk = (val, on) => { const x = el('input', { type: 'checkbox', checked: !!val }); x.onchange = () => { on(x.checked); save(); }; return x; };
  f.append(el('b', {}, '🎨 Editor'));
  f.append(field('Theme', sel(s.theme, [['dark', 'Dark'], ['light', 'Light']], (v) => { s.theme = v; })));
  const fs = el('input', { type: 'number', min: 10, max: 28, value: s.fontSize }); fs.onchange = () => { s.fontSize = +fs.value || 14; save(); };
  f.append(field('Font size', fs));
  f.append(field('Tab size', sel(String(s.tabSize), [['2', '2'], ['4', '4']], (v) => { s.tabSize = +v; })));
  f.append(field('Word wrap', sel(s.wordWrap, [['on', 'On'], ['off', 'Off']], (v) => { s.wordWrap = v; })));
  f.append(el('label', {}, chk(s.minimap, (v) => { s.minimap = v; }), ' Minimap'));
  f.append(el('label', {}, chk(s.autoSave, (v) => { s.autoSave = v; }), ' Auto-save'));
  f.append(el('label', {}, chk(s.formatOnSave, (v) => { s.formatOnSave = v; }), ' Format on save (Ctrl+S)'));
  f.append(el('label', {}, chk(s.liveReload !== false, (v) => { s.liveReload = v; }), ' Live-reload webview while typing'));

  f.append(el('hr', { style: { border: 0, borderTop: '1px solid var(--border)', width: '100%' } }), el('b', {}, '✨ AI'));
  const ai = s.ai;
  const prov = AI_PROVIDERS[ai.provider];
  f.append(el('div', { class: 'small' }, aiReady() ? `🟢 ${prov ? prov.label : ai.provider} · ${ai.model}` : '⚪ Not connected (optional)'),
    el('button', { class: 'btn sm primary', onclick: () => connectAIModal() }, aiReady() ? '🔌 Change AI' : '🔌 Connect AI'));
  const rounds = el('input', { type: 'number', min: 1, max: 8, value: ai.maxFixRounds }); rounds.onchange = () => { ai.maxFixRounds = Math.max(1, Math.min(8, +rounds.value || 3)); save(); };
  f.append(field('Max auto-fix rounds', rounds));

  f.append(el('hr', { style: { border: 0, borderTop: '1px solid var(--border)', width: '100%' } }), el('b', {}, '🖥 Backend (real shell, C/C++/Java/Go/Rust…)'));
  const burl = el('input', { value: s.backendUrl, placeholder: 'http://localhost:3001' });
  const bstat = el('span', { class: 'muted small' }, backend.connected ? '● connected' : '○ not connected');
  burl.onchange = () => { s.backendUrl = burl.value.trim().replace(/\/$/, ''); save(); };
  f.append(field('Backend URL', burl), el('div', { style: { display: 'flex', gap: '8px', alignItems: 'center' } },
    el('button', { class: 'btn sm', onclick: async () => { s.backendUrl = burl.value.trim().replace(/\/$/, ''); save(); bstat.textContent = '… connecting'; const ok = S.project ? await connectBackend() : await new Backend().connect(s.backendUrl, 'probe'); bstat.textContent = ok ? '● connected' : '✕ could not connect'; } }, 'Connect'), bstat),
  el('div', { class: 'muted small' }, 'Start it from the repo: cd server && npm install && npm start  (or docker compose up), then paste its URL, e.g. http://localhost:3001?token=…'));
  if (inWorkspace && S.project) {
    f.append(el('label', {}, chk(S.project.useBackend, (v) => { S.project.useBackend = v; saveNow(); }), ' Run this project on the backend (when connected)'));
  }

  f.append(el('hr', { style: { border: 0, borderTop: '1px solid var(--border)', width: '100%' } }), el('b', {}, '🐙 GitHub'));
  const tok = el('input', { type: 'password', value: s.githubToken || '', placeholder: 'ghp_… (fine-grained or classic, repo scope)' });
  tok.onchange = () => { s.githubToken = tok.value.trim(); save(); };
  f.append(field('Personal access token (for Push / Deploy to Pages)', tok));

  f.append(el('hr', { style: { border: 0, borderTop: '1px solid var(--border)', width: '100%' } }), el('b', {}, '💾 Data'));
  f.append(el('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap' } },
    el('button', { class: 'btn sm', onclick: backupAll }, '⤓ Backup all projects'),
    el('button', { class: 'btn sm', onclick: restoreAll }, '⬆ Restore backup')));
  return f;
}

function settingsModal() {
  modal({ title: '⚙ Settings', body: settingsForm(false), buttons: [{ label: 'Done', class: 'primary', value: true }] });
}

function applySettings() {
  applyTheme();
  if (monaco && ed) {
    ed.updateOptions({ fontSize: S.settings.fontSize, minimap: { enabled: S.settings.minimap }, wordWrap: S.settings.wordWrap, tabSize: S.settings.tabSize });
    monaco.editor.setTheme(S.settings.theme === 'light' ? 'vs' : 'devengine');
  }
}
function applyTheme() { document.documentElement.classList.toggle('light', S.settings.theme === 'light'); }

function backupAll() {
  const all = store.listProjects().map((m) => store.loadProject(m.id)).filter(Boolean);
  download(`dev-engine-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify({ version: 1, projects: all }), 'application/json');
}
function restoreAll() {
  const inp = el('input', { type: 'file', accept: '.json' });
  inp.onchange = async () => {
    try {
      const data = JSON.parse(await inp.files[0].text());
      let n = 0;
      for (const p of data.projects || []) { if (p && p.id && p.files) { store.saveProject(p); n++; } }
      toast(`Restored ${n} projects`, 'ok'); renderReplList();
    } catch (e) { toast('Invalid backup: ' + e.message, 'err'); }
  };
  inp.click();
}

// =====================================================================
// Console
// =====================================================================
function consoleWrite(text, cls = 'stdout') {
  const box = $('#console');
  S.consoleText = (S.consoleText + text).slice(-20000);
  const atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 40;
  const parts = String(text).split('\n');
  parts.forEach((part, i) => {
    if (!S.openLine || S.openLine.dataset.cls !== cls) {
      if (part === '' && i === parts.length - 1) return;
      S.openLine = el('div', { class: 'cl ' + cls, 'data-cls': cls });
      box.append(S.openLine);
    }
    S.openLine.textContent += part;
    if (i < parts.length - 1) S.openLine = null;
  });
  while (box.childElementCount > 3000) box.firstChild.remove();
  if (atBottom) box.scrollTop = box.scrollHeight;
}
function consoleLine(text, cls = 'log', loc) {
  S.openLine = null;
  const box = $('#console');
  const line = el('div', { class: 'cl ' + cls }, text);
  if (loc && loc.file && loc.file in (S.project?.files || {})) {
    line.append(' ', el('span', { class: 'loc', onclick: () => openFile(loc.file, loc.line, loc.col) }, `${loc.file}:${loc.line || 1}`));
    if (cls === 'error') line.append(el('button', { class: 'btn sm fixbtn', onclick: () => fixWithAgent('error', { text, loc }) }, '✨ Fix with Agent'));
  }
  box.append(line);
  S.consoleText = (S.consoleText + text + '\n').slice(-20000);
  box.scrollTop = box.scrollHeight;
}
function consoleSys(text) { consoleLine(text, 'sys'); }

function consoleEval() {
  const inp = $('#console-eval');
  const code = inp.value;
  if (!code.trim()) return;
  inp.value = '';
  if (S.running && S.serverRun) { backend.stdin(code + '\n'); consoleLine(code, 'input'); return; }
  const frame = S.runFrame || $('#webframe-wrap iframe');
  consoleLine('› ' + code, 'input');
  if (!frame || !frame.contentWindow) { consoleLine('Nothing is running. Press Run first.', 'sys'); return; }
  frame.contentWindow.postMessage({ __de_eval: true, code }, '*');
}

// =====================================================================
// Running
// =====================================================================
function setRunning(on) {
  S.running = on;
  const b = $('#btn-run');
  b.classList.toggle('running', on);
  b.querySelector('.run-ico').textContent = on ? '■' : '▶';
  b.querySelector('.run-label').textContent = on ? 'Stop' : 'Run';
  $('#console-status').textContent = on ? 'Running…' : 'Ready';
}

function stopRun(silent) {
  if (S.runFrame) { S.runFrame.remove(); S.runFrame = null; }
  if (S.serverRun) { backend.kill(); S.serverRun = false; }
  S.runId++;
  Object.values(S.waiters).forEach((w) => w && w({ stopped: true }));
  S.waiters = {};
  if (S.running && !silent) consoleSys('■ Stopped');
  setRunning(false);
}

function envFor() { return { ...(S.project.env || {}) }; }

function waitFor(kind, ms) {
  return new Promise((resolve) => {
    const t = ms ? setTimeout(() => { delete S.waiters[kind]; resolve({ timeout: true }); }, ms) : null;
    S.waiters[kind] = (v) => { clearTimeout(t); delete S.waiters[kind]; resolve(v); };
  });
}

/** Run the project. Returns { errors:[...] } once the run settles. */
async function run(opts = {}) {
  if (!S.project) return { errors: [] };
  if (S.running) stopRun(true);
  saveNow();
  const cfg = projectConfig();
  let rt = cfg.runtime || S.project.runtime;
  if (S.project.useBackend && backend.connected) rt = 'server';
  S.problems.runtime = [];
  renderProblems();
  if (!opts.keepConsole) { $('#console').innerHTML = ''; S.openLine = null; S.consoleText = ''; }
  const t0 = performance.now();
  try {
    if (rt === 'web') await runWeb(cfg.entry || defaultEntry('web', S.project.files) || 'index.html', { fromRun: true });
    else if (rt === 'node') await runNode(cfg.entry || defaultEntry('node', S.project.files));
    else if (rt === 'python') await runPy(cfg.entry || defaultEntry('python', S.project.files));
    else await runServer(cfg.run);
  } catch (e) {
    consoleLine(String((e && (e.message || (e.errno != null && `File system error (errno ${e.errno})`))) || e), 'error');
    S.problems.runtime.push({ severity: 'error', message: String(e.message || e), source: 'run' });
    setRunning(false);
  }
  renderProblems();
  if (rt !== 'web' && !S.running) consoleSys(`Finished in ${((performance.now() - t0) / 1000).toFixed(2)}s`);
  return { errors: S.problems.runtime };
}

async function runFile(path, kind) {
  kind = kind || (path.endsWith('.py') ? 'python' : 'node');
  if (S.running) stopRun(true);
  saveNow();
  setOut('console');
  if (kind === 'python') await runPy(path); else await runNode(path);
  renderProblems();
}

async function runWeb(page, { quiet, fromRun } = {}) {
  const p = S.project;
  S.lastRuntime = 'web';
  S.page = page;
  const runId = ++S.runId;
  if (!quiet) consoleSys(`🌐 Serving /${page}`);
  const { files, diagnostics } = await transpileFiles(p.files);
  diagnostics.forEach((d) => S.problems.runtime.push(d));
  const doc = buildWebDoc({ files, page, packages: collectPackages(p), env: envFor(), runId });
  const wrap = $('#webframe-wrap');
  const iframe = el('iframe', { sandbox: SANDBOX, allow: 'clipboard-write; fullscreen; autoplay; camera; microphone; geolocation', title: 'Webview' });
  iframe.srcdoc = doc;
  wrap.innerHTML = '';
  wrap.append(iframe);
  $('#wv-url').value = '/' + page;
  if (fromRun && S.out !== 'webview' && innerWidth > 860) setOut('webview');
  if (fromRun && innerWidth <= 860) setMobile('output'), setOut('webview');
  await new Promise((r) => { iframe.onload = r; setTimeout(r, 4000); });
  await new Promise((r) => setTimeout(r, 900)); // collect early runtime errors
  if (runId === S.runId && !quiet) setRunning(false);
}

async function runNode(entry) {
  const p = S.project;
  if (!entry || !(entry in p.files)) throw new Error('No entry file found. Add index.js (or set "main" in package.json, or entry = "file.js" in .devengine).');
  S.lastRuntime = 'node';
  setRunning(true);
  setOut(S.out === 'webview' || S.out === 'tests' || S.out === 'problems' ? 'console' : S.out);
  consoleSys(`$ node ${entry}`);
  const { files, diagnostics } = await transpileFiles(p.files);
  diagnostics.forEach((d) => S.problems.runtime.push(d));
  const runId = ++S.runId;
  const doc = buildNodeDoc({ files, entry, packages: collectPackages(p), env: envFor(), runId });
  if (S.runFrame) S.runFrame.remove();
  S.runFrame = el('iframe', { sandbox: SANDBOX, class: 'run-frame-hidden', title: 'runner' });
  S.runFrame.srcdoc = doc;
  document.body.append(S.runFrame);
  const r = await waitFor('done', 0);
  if (runId === S.runId) setRunning(false);
  return r;
}

async function runPy(entry) {
  const p = S.project;
  if (!entry || !(entry in p.files)) throw new Error('No Python entry file found. Add main.py (or set entry = "file.py" in .devengine).');
  S.lastRuntime = 'python';
  setRunning(true);
  if (S.out === 'webview' || S.out === 'tests' || S.out === 'problems') setOut('console');
  consoleSys(`$ python ${entry}`);
  const runId = ++S.runId;
  const status = (m) => { $('#console-status').textContent = m; if (/Downloading/.test(m)) consoleSys(m); };
  const res = await runPython({
    files: p.files, entry, env: envFor(),
    io: { out: (t) => runId === S.runId && consoleWrite(t, 'stdout'), err: (t) => runId === S.runId && consoleWrite(t, 'error'), status, input: (v) => consoleWrite(v + '\n', 'input') },
  });
  if (runId !== S.runId) return;
  if (res.error) {
    S.problems.runtime.push({ file: res.error.file, line: res.error.line, severity: 'error', message: res.error.message, source: 'python' });
    consoleLine(res.error.stack.replace(/^[\s\S]*?(Traceback)/, '$1').trim(), 'error', { file: res.error.file, line: res.error.line });
  }
  // sync files written by the program
  let changed = 0;
  for (const [f, c] of Object.entries(res.files)) if (p.files[f] !== c && !/\.pyc$/.test(f)) { p.files[f] = c; changed++; }
  if (changed) { setFS({ files: p.files, folders: p.folders }); consoleSys(`${changed} file(s) written by the program were synced to the editor.`); }
  setRunning(false);
  S.lint.py = await lintPython(p.files);
  renderProblems();
}

async function runServer(cmdFromCfg) {
  if (!backend.connected) {
    const ok = await connectBackend();
    if (!ok) {
      consoleLine('This project needs the Dev Engine backend to run (C, C++, Java, Go, Rust, Bash, real Node/Python…).', 'warn');
      consoleLine('Start it with:  cd server && npm install && npm start   (or docker compose up)  — then set the URL in ⚙ Settings → Backend.', 'sys');
      return;
    }
  }
  const cmd = cmdFromCfg || defaultServerCommand(S.project.files, projectConfig().entry);
  S.lastRuntime = 'server';
  setRunning(true);
  S.serverRun = true;
  if (S.out !== 'console' && S.out !== 'shell') setOut('console');
  consoleSys('$ ' + cmd);
  const runId = ++S.runId;
  backend.run(cmd, S.project.files);
  const r = await waitFor('serverExit', 0);
  if (runId === S.runId) { S.serverRun = false; setRunning(false); if (!r.stopped) consoleSys(`exit status ${r.code}`); }
  if (r.code) S.problems.runtime.push({ severity: 'error', message: `Process exited with code ${r.code}`, source: 'backend', ...parseCompilerError(S.consoleText) });
  backend.pull();
}

function parseCompilerError(text) {
  const m = String(text).match(/(?:^|\n)\.?\/?([\w./-]+\.\w+):(\d+):(?:(\d+):)?\s*(?:fatal )?error:?\s*(.*)/) || String(text).match(/File "(?:\.\/)?([^"]+)", line (\d+)/);
  return m ? { file: m[1], line: +m[2], col: +m[3] || 1, message: m[4] ? m[4].trim() : undefined } : {};
}

function onFrameMessage(e) {
  const d = e.data;
  if (!d || !d.__devengine) return;
  if (d.kind === 'evalResult') { consoleLine(d.text, d.error ? 'error' : 'ok'); return; }
  if (d.runId !== S.runId) return;
  switch (d.kind) {
    case 'console': {
      const loc = d.level === 'error' ? parseLoc(d.text) : null;
      consoleLine(d.text, d.level === 'log' ? 'log' : d.level, loc);
      break;
    }
    case 'error': {
      const loc = { file: d.file, line: d.line, col: d.col };
      const text = d.stack && d.stack.includes(d.message.split(': ').slice(1).join(': ')) ? d.stack : d.message + (d.stack ? '\n' + d.stack : '');
      consoleLine(cleanStack(text), 'error', loc);
      S.problems.runtime.push({ file: loc.file in S.project.files ? loc.file : null, line: loc.line, col: loc.col, severity: 'error', message: d.message, source: 'runtime' });
      renderProblems();
      break;
    }
    case 'clear': $('#console').innerHTML = ''; S.openLine = null; break;
    case 'done': S.waiters.done && S.waiters.done(d); break;
    case 'test': onTestResult(d); break;
    case 'testsDone': S.waiters.testsDone && S.waiters.testsDone(d); break;
    case 'navigate': runWeb(d.path); break;
    case 'open': window.open(d.url, '_blank', 'noopener'); break;
    case 'fswrite': if (S.project.files[d.path] !== d.content) { S.project.files[d.path] = d.content; debounceFsSync(); } break;
    case 'fsdelete': delete S.project.files[d.path]; debounceFsSync(); break;
    default: break;
  }
}
const debounceFsSync = debounce(() => setFS({ files: S.project.files, folders: S.project.folders }), 300);
function cleanStack(s) { return String(s).split('\n').filter((l) => !/__de_|installRuntime|about:srcdoc|<anonymous>\)?$/.test(l) || !/^\s+at /.test(l)).join('\n'); }
function parseLoc(text) { const m = String(text).match(/([\w./-]+\.[jt]sx?|[\w./-]+\.m?js):(\d+):(\d+)/); return m ? { file: m[1], line: +m[2], col: +m[3] } : null; }

backend.on('out', (data, stream) => { if (S.serverRun || S.testServer) { if (S.testServer) S.testServerOut += data; else consoleWrite(data, stream === 'stderr' ? 'error' : 'stdout'); } });
backend.on('exit', (code) => { if (S.waiters.serverExit) S.waiters.serverExit({ code }); });
backend.on('shell', (data) => { if (term && S.shellRemote) term.write(data); });
backend.on('files', (files) => {
  if (!S.project) return;
  let changed = 0;
  for (const [f, c] of Object.entries(files)) if (S.project.files[f] !== c) { S.project.files[f] = c; changed++; }
  for (const f of Object.keys(S.project.files)) if (!(f in files)) { delete S.project.files[f]; changed++; }
  if (changed) setFS({ files: S.project.files, folders: S.project.folders });
});
backend.on('status', (on) => {
  $('#sb-backend').textContent = on ? '● Backend' : '';
  if (term) { S.shellRemote = on && backend.connected; term.write(on ? '\r\n\x1b[32m[connected to backend shell]\x1b[0m\r\n' : '\r\n\x1b[33m[backend disconnected — using browser shell]\x1b[0m\r\n'); if (on) backend.shell(''); else writePrompt(); }
});

async function connectBackend() {
  if (!S.settings.backendUrl || !S.project) { $('#sb-backend').textContent = ''; return false; }
  const ok = await backend.connect(S.settings.backendUrl, S.project.id);
  if (ok) { backend.sync(S.project.files); $('#sb-backend').textContent = '● Backend'; }
  return ok;
}

function openPreviewTab() {
  const p = S.project;
  transpileFiles(p.files).then(({ files }) => {
    const doc = buildWebDoc({ files, page: S.page, packages: collectPackages(p), env: {}, runId: 0 });
    // keep the user's code sandboxed (opaque origin) even in a new tab
    const wrapper = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(p.name)}</title><style>html,body,iframe{margin:0;border:0;width:100%;height:100%}</style></head><body><iframe sandbox="${SANDBOX}" srcdoc="${esc(doc)}"></iframe></body></html>`;
    const url = URL.createObjectURL(new Blob([wrapper], { type: 'text/html' }));
    window.open(url, '_blank');
  });
}

// =====================================================================
// Tests
// =====================================================================
function onTestResult(d) {
  if (!S.tests) S.tests = [];
  S.tests.push({ file: d.file, ...d.result });
  renderTests();
}

async function runTests() {
  if (!S.project) return { failed: 0, total: 0 };
  saveNow();
  setOut('tests');
  const p = S.project;
  const jsTests = Object.keys(p.files).filter(isJsTestFile);
  const pyTests = Object.keys(p.files).filter(isPyTestFile);
  const cfg = projectConfig();
  S.tests = []; S.testOutput = '';
  $('#tests-summary').innerHTML = '<span class="spinner"></span> Running tests…';
  $('#tests').innerHTML = '';
  if (!jsTests.length && !pyTests.length && !(cfg.test && backend.connected)) {
    S.tests = null;
    $('#tests-summary').textContent = 'No tests found';
    $('#tests').append(el('div', { class: 'test-output' }, 'No test files found.\n\nCreate files named  *.test.js / *.spec.ts  (Jest-style: describe / test / expect)\nor  test_*.py  (pytest), or set  test = "cmd"  in .devengine with the backend.\n\n'), el('button', { class: 'btn sm primary', style: { margin: '0 12px' }, onclick: () => quickAgent('tests') }, '✨ Ask the Agent to write tests'));
    return { failed: 0, total: 0 };
  }
  if (S.running) stopRun(true);
  const t0 = performance.now();
  if (jsTests.length) {
    const { files } = await transpileFiles(p.files);
    const runId = ++S.runId;
    const doc = buildNodeDoc({ files, entry: jsTests[0], packages: collectPackages(p), env: { ...envFor(), NODE_ENV: 'test' }, runId, mode: 'test', testFiles: jsTests });
    const frame = el('iframe', { sandbox: SANDBOX, class: 'run-frame-hidden', title: 'tests' });
    frame.srcdoc = doc;
    document.body.append(frame);
    const r = await waitFor('testsDone', 60000);
    frame.remove();
    if (r.timeout) S.tests.push({ file: jsTests.join(', '), name: 'Test run', status: 'failed', message: 'Timed out after 60 s' });
  }
  if (pyTests.length) {
    $('#tests-summary').innerHTML = '<span class="spinner"></span> Running pytest…';
    try {
      const r = await testPython({ files: p.files, env: envFor(), io: { out: () => {}, status: (m) => { $('#tests-summary').innerHTML = `<span class="spinner"></span> ${esc(m)}`; } } });
      S.testOutput += r.output;
      r.results.forEach((x) => S.tests.push({ file: x.name.split('::')[0], name: x.name.split('::').slice(1).join(' › ') || x.name, status: x.status, error: x.error, message: x.error ? x.error.split('\n').filter(Boolean).pop() : undefined }));
      if (!r.results.length) S.tests.push({ file: 'pytest', name: 'pytest run', status: 'failed', error: r.output.slice(-3000), message: 'No test results — see output' });
    } catch (e) { S.tests.push({ file: 'pytest', name: 'pytest', status: 'failed', error: String(e.message || e) }); }
  }
  if (cfg.test && backend.connected) {
    S.testServer = true; S.testServerOut = '';
    backend.run(cfg.test, p.files);
    const r = await waitFor('serverExit', 120000);
    S.testServer = false;
    S.testOutput += S.testServerOut;
    S.tests.push({ file: '.devengine', name: cfg.test, status: r.code === 0 ? 'passed' : 'failed', error: r.code ? S.testServerOut.slice(-3000) : undefined });
  }
  const ms = performance.now() - t0;
  renderTests(ms);
  const failed = S.tests.filter((t) => t.status === 'failed');
  S.problems.tests = failed.map((t) => ({ file: t.file in p.files ? t.file : null, line: lineFromError(t), severity: 'error', message: `Test failed: ${t.name} — ${(t.message || '').slice(0, 200)}`, source: 'test' }));
  renderProblems();
  return { failed: failed.length, total: S.tests.length };
}

function lineFromError(t) {
  const m = String(t.error || '').match(new RegExp(`${(t.file || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:(\\d+)`));
  return m ? +m[1] : undefined;
}

function renderTests(ms) {
  const box = $('#tests');
  const badge = $('#test-badge');
  if (!S.tests) { $('#tests-summary').textContent = 'No test run yet'; badge.hidden = true; $('#tests-fix').hidden = true; return; }
  box.innerHTML = '';
  const pass = S.tests.filter((t) => t.status === 'passed').length;
  const fail = S.tests.filter((t) => t.status === 'failed').length;
  const skip = S.tests.filter((t) => t.status === 'skipped').length;
  $('#tests-summary').innerHTML = `<b style="color:${fail ? 'var(--red)' : 'var(--green)'}">${fail ? '✕' : '✓'}</b> ${pass} passed${fail ? `, <span style="color:var(--red)">${fail} failed</span>` : ''}${skip ? `, ${skip} skipped` : ''}${ms ? ` · ${(ms / 1000).toFixed(2)}s` : ''}`;
  badge.hidden = false; badge.textContent = fail ? fail : pass; badge.classList.toggle('red', !!fail);
  $('#tests-fix').hidden = !fail;
  let lastFile = null;
  for (const t of S.tests) {
    if (t.file !== lastFile) { box.append(el('div', { class: 'search-file', style: { padding: '8px 12px 4px' } }, fileIcon(t.file || ''), ' ', t.file)); lastFile = t.file; }
    const ic = t.status === 'passed' ? '✅' : t.status === 'skipped' ? '⏭' : '❌';
    box.append(el('div', { class: 'trow' }, el('span', { class: 'st' }, ic),
      el('div', { style: { flex: 1, minWidth: 0 } }, el('div', {}, t.name, t.duration ? el('span', { class: 'muted small' }, ` (${t.duration} ms)`) : null), t.error ? el('pre', {}, String(t.error).slice(0, 4000)) : null)));
  }
  if (S.testOutput) box.append(el('details', { style: { padding: '8px 12px' } }, el('summary', { class: 'muted small' }, 'Raw output'), el('pre', { class: 'test-output' }, S.testOutput)));
}

// =====================================================================
// Problems (diagnostics)
// =====================================================================
function updateLintProblems() {
  if (!monaco || !S.project) return;
  const out = [];
  for (const mk of monaco.editor.getModelMarkers({})) {
    const path = mk.resource.path.replace(/^\//, '');
    if (!(path in S.project.files)) continue;
    if (mk.severity < monaco.MarkerSeverity.Warning) continue;
    out.push({ file: path, line: mk.startLineNumber, col: mk.startColumn, severity: mk.severity === monaco.MarkerSeverity.Error ? 'error' : 'warning', message: mk.message, source: mk.owner });
  }
  S.problems.lint = out;
  renderProblems();
}
const refreshStaticSoon = debounce(() => refreshStatic(), 800);
function refreshStatic() {
  if (!S.project) return;
  S.problems.static = staticChecks(S.project.files);
  renderProblems();
}

function allProblems() {
  const seen = new Set();
  return [...S.problems.runtime, ...S.problems.tests, ...S.problems.lint, ...(S.lint.py || []), ...S.problems.static].filter((p) => {
    const k = `${p.file}|${p.line}|${p.message}`; if (seen.has(k)) return false; seen.add(k); return true;
  });
}

function renderProblems() {
  if (!S.project) return;
  const list = allProblems();
  const errs = list.filter((p) => p.severity === 'error').length;
  const warns = list.length - errs;
  $('#sb-problems').textContent = `⛔ ${errs} ⚠ ${warns}`;
  const badge = $('#problem-badge');
  badge.hidden = !errs; badge.textContent = errs;
  $('#problems-summary').textContent = list.length ? `${errs} error(s), ${warns} warning(s)` : '✓ No problems detected';
  $('#problems-fix').hidden = !list.length;
  const box = $('#problems');
  box.innerHTML = '';
  for (const p of list) {
    box.append(el('div', { class: 'prow', onclick: () => p.file && openFile(p.file, p.line, p.col) },
      el('span', { class: 'sev' }, p.severity === 'error' ? '⛔' : '⚠️'),
      el('div', { style: { flex: 1, minWidth: 0 } }, el('div', {}, p.message), el('div', { class: 'where' }, `${p.file || ''}${p.line ? ':' + p.line : ''}${p.source ? ' · ' + p.source : ''}`))));
  }
}

async function checkCode() {
  if (!S.project) return;
  setOut('problems');
  $('#problems-summary').innerHTML = '<span class="spinner"></span> Checking…';
  refreshStatic();
  const { diagnostics } = await transpileFiles(S.project.files).catch(() => ({ diagnostics: [] }));
  S.problems.runtime = S.problems.runtime.filter((p) => p.source !== 'ts').concat(diagnostics);
  if (Object.keys(S.project.files).some((f) => f.endsWith('.py'))) {
    try { await loadPython((m) => { $('#problems-summary').textContent = m; }); S.lint.py = await lintPython(S.project.files); } catch { /* offline */ }
  }
  updateLintProblems();
  renderProblems();
}

// =====================================================================
// AI Agent
// =====================================================================
function agentBubble(cls, html) {
  const m = el('div', { class: 'msg ' + cls });
  if (html instanceof Node) m.append(html); else m.innerHTML = html;
  $('#agent-msgs').append(m);
  $('#agent-msgs').scrollTop = $('#agent-msgs').scrollHeight;
  return m;
}

function renderAgentHistory() {
  const box = $('#agent-msgs');
  box.innerHTML = '';
  const hist = S.project.agentChat || [];
  if (!hist.length) {
    agentBubble('ai', renderMarkdown(`👋 **Hi, I'm the Dev Engine Agent.** Tell me what to build or fix and I'll edit your files directly.\n\n- **Build → Test → Fix** runs your app and tests, then fixes errors automatically until everything passes.\n- Every change creates a checkpoint you can restore.\n\n${aiReady() ? '' : 'No AI connected — I can still build websites and template apps: try *“make a website for my café”* or *“build a quiz app”*. Tap 🔌 to connect Claude, ChatGPT, Gemini, Groq… for everything else.'}`));
  }
  for (const m of hist) {
    if (m.role === 'user') agentBubble('user', esc(m.display || m.content));
    else agentBubble('ai', renderMarkdown(stripEdits(m.content) || '(updated files)'));
  }
}

function needKey() {
  if (aiReady()) return false;
  const b = agentBubble('ai', renderMarkdown('🔌 **No AI connected yet.** Without AI I can still:\n- build websites (*“make a website for my gym”*) in the visual builder\n- create apps from templates (*“build a todo app”*, *“snake game”*, *“expense tracker”*…)\n- run, test and find problems in your code\n\nTo build **anything** from a description and auto-fix bugs, connect Claude, ChatGPT, Gemini, Groq or OpenRouter (some have free keys).'));
  b.append(el('button', { class: 'btn sm primary', style: { marginTop: '8px' }, onclick: () => connectAIModal() }, '🔌 Connect AI'));
  return true;
}

/**
 * Send a message to the agent. Returns { text, edits, applied } or null.
 * opts: { auto: apply edits automatically, label: checkpoint label, display: short text to show }
 */
async function agentSend(text, opts = {}) {
  if (!S.project) return null;
  setOut('agent');
  if (!aiReady() && !opts.auto) {
    const c = classify(text);
    if (c.type === 'website' || (c.type === 'app' && c.recipe)) { agentBubble('user', esc(opts.display || text)); await handleRequest(text, { fromAgent: true }); return null; }
  }
  if (needKey()) return null;
  if (S.agentBusy) { toast('Agent is busy…'); return null; }
  S.agentBusy = true;
  $('#agent-send').disabled = true;
  const p = S.project;
  p.agentChat = p.agentChat || [];
  agentBubble('user', esc(opts.display || text));
  const ctx = projectContext(p, { activeFile: p.activeFile, problems: allProblems(), consoleText: S.consoleText, testText: testsAsText() });
  const history = p.agentChat.slice(-8).map((m) => ({ role: m.role, content: m.role === 'assistant' ? m.content.slice(0, 6000) : m.content.slice(0, 3000) }));
  const messages = [...history, { role: 'user', content: `${ctx}\n\n=== Request ===\n${text}` }];
  const bubble = agentBubble('ai typing', '');
  const ac = new AbortController();
  S.abort = ac;
  const stopBtn = el('button', { class: 'btn sm', style: { marginTop: '6px' }, onclick: () => ac.abort() }, '■ Stop');
  bubble.after(stopBtn);
  let result = null;
  try {
    const reply = await chat(S.settings, messages, {
      signal: ac.signal,
      onToken: (t) => {
        const visible = stripEdits(t.replace(/<<<FILE\s+([^\n]+)\n[\s\S]*$/, (m, f) => `\n\n✍️ writing \`${f.trim()}\`…`));
        bubble.innerHTML = renderMarkdown(visible);
        $('#agent-msgs').scrollTop = $('#agent-msgs').scrollHeight;
      },
    });
    bubble.classList.remove('typing');
    bubble.innerHTML = renderMarkdown(stripEdits(reply) || '(no explanation)');
    const edits = parseEdits(reply);
    p.agentChat.push({ role: 'user', content: text.slice(0, 3000), display: opts.display });
    p.agentChat.push({ role: 'assistant', content: reply });
    while (p.agentChat.length > 30) p.agentChat.shift();
    result = { text: reply, edits, applied: false };
    if (edits.length) {
      const card = editsCard(edits, opts.label || 'Agent edit', () => { result.applied = true; });
      bubble.append(card);
      if (opts.auto) { card.querySelector('.apply').click(); result.applied = true; }
    }
    saveNow();
  } catch (e) {
    bubble.classList.remove('typing');
    bubble.innerHTML = renderMarkdown(e.name === 'AbortError' ? '■ Stopped.' : `⚠ ${e.message}`);
  } finally {
    stopBtn.remove();
    S.agentBusy = false; S.abort = null;
    $('#agent-send').disabled = false;
  }
  return result;
}

function editsCard(edits, label, onApplied) {
  const p = S.project;
  const rows = edits.map((e) => {
    if (e.type === 'delete') return el('div', { class: 'efile' }, el('span', { class: 'del' }, 'delete'), e.path);
    const d = diffStats(p.files[e.path] || '', e.content);
    return el('div', { class: 'efile', style: { cursor: 'pointer' }, title: 'Preview', onclick: () => previewEdit(e) }, el('span', { class: 'add' }, '+' + d.add), el('span', { class: 'del' }, '-' + d.del), e.path in p.files ? e.path : e.path + ' (new)');
  });
  const status = el('span', { class: 'grow' }, `${edits.length} file change(s)`);
  const apply = el('button', { class: 'btn sm primary apply' }, '✓ Apply');
  const discard = el('button', { class: 'btn sm' }, 'Discard');
  const card = el('div', { class: 'edits' }, el('div', { class: 'ehead' }, status, discard, apply), ...rows);
  apply.onclick = () => {
    applyEdits(edits, label);
    status.textContent = `✓ Applied ${edits.length} change(s) · checkpoint saved`;
    apply.remove(); discard.remove();
    onApplied && onApplied();
  };
  discard.onclick = () => { status.textContent = 'Discarded'; apply.remove(); discard.remove(); };
  return card;
}

function previewEdit(e) {
  const old = S.project.files[e.path] || '';
  if (monaco) {
    const host = el('div', { style: { height: '60vh', minHeight: '300px' } });
    modal({
      title: `Changes to ${e.path}`, body: host, wide: true,
      onOpen: () => {
        const lang = languageForPath(e.path);
        const de = monaco.editor.createDiffEditor(host, { theme: S.settings.theme === 'light' ? 'vs' : 'devengine', readOnly: true, automaticLayout: true, renderSideBySide: innerWidth > 700, minimap: { enabled: false } });
        de.setModel({ original: monaco.editor.createModel(old, lang), modified: monaco.editor.createModel(e.content, lang) });
      },
    });
  } else modal({ title: e.path, body: el('pre', { style: { maxHeight: '60vh', overflow: 'auto' } }, e.content), wide: true });
}

function applyEdits(edits, label) {
  const p = S.project;
  store.addCheckpoint(p, `Before: ${label}`);
  let { files, folders } = { files: { ...p.files }, folders: [...p.folders] };
  for (const e of edits) {
    if (e.type === 'delete') ({ files, folders } = removePath(files, folders, e.path));
    else files[normalize(e.path)] = e.content;
  }
  setFS({ files, folders });
  const firstWrite = edits.find((e) => e.type === 'write');
  if (firstWrite && !p.openTabs.includes(normalize(firstWrite.path))) openFile(normalize(firstWrite.path));
  toast(`Applied ${edits.length} change(s)`, 'ok');
}

function testsAsText() {
  if (!S.tests) return '';
  return S.tests.map((t) => `${t.status.toUpperCase()} ${t.file} › ${t.name}${t.error ? '\n' + String(t.error).slice(0, 1500) : ''}`).join('\n') + (S.testOutput ? '\n\nRaw output:\n' + S.testOutput.slice(-3000) : '');
}

function quickAgent(kind) {
  const f = S.project.activeFile;
  if (kind === 'autofix') return autoFix();
  const prompts = {
    explain: [`Explain what ${f || 'this project'} does, step by step, in simple terms. Do not change any files.`, `💡 Explain ${f || 'project'}`],
    tests: [`Write thorough unit tests for ${f || 'the project'} (Jest-style *.test.js for JS/TS using describe/test/expect, or pytest test_*.py for Python). Create the test files.`, `🧪 Write tests for ${f || 'project'}`],
    improve: [`Review ${f || 'the project'} for bugs, edge cases, readability and performance. Fix real problems and briefly explain each change.`, `✨ Improve ${f || 'project'}`],
  };
  const [t, d] = prompts[kind];
  agentSend(t, { display: d, label: d });
}

async function fixWithAgent(kind, info) {
  setOut('agent'); setMobile('agent');
  if (kind === 'error') return agentSend(`Fix this runtime error:\n${info.text}\n(at ${info.loc.file}:${info.loc.line})`, { display: `✨ Fix error: ${info.text.split('\n')[0].slice(0, 120)}`, label: 'Fix runtime error' });
  if (kind === 'tests') return agentSend('Some tests are failing (see "Latest test results"). Fix the code so all tests pass. Only change tests if they are clearly wrong.', { display: '✨ Fix failing tests', label: 'Fix failing tests' });
  return agentSend('Fix all the problems listed under "Current problems".', { display: '✨ Fix all problems', label: 'Fix problems' });
}

/** Replit-Agent-style loop: build → test → fix, until green or max rounds. */
async function autoFix() {
  if (!S.project) return;
  setOut('agent'); setMobile('agent', true);
  if (needKey()) return;
  const max = S.settings.ai.maxFixRounds || 3;
  agentBubble('sys', '🛠 Build → Test → Fix started');
  for (let round = 1; round <= max + 1; round++) {
    const status = agentBubble('sys', `Round ${round}: running app and tests…`);
    status.prepend(el('span', { class: 'spinner' }), ' ');
    const rt = effectiveRuntime();
    await checkCode();
    const runRes = rt === 'web' || rt === 'node' || rt === 'python' || backend.connected ? await run() : { errors: [] };
    if (S.running && rt === 'node') { await new Promise((r) => setTimeout(r, 1500)); stopRun(true); }
    const t = await runTests();
    setOut('agent');
    const errors = allProblems().filter((p) => p.severity === 'error');
    status.textContent = `Round ${round}: ${errors.length} error(s), ${t.failed}/${t.total} failing test(s)`;
    void runRes;
    if (!errors.length && !t.failed) { agentBubble('ai', renderMarkdown(`✅ **All green!** The app runs without errors${t.total ? ` and all ${t.total} tests pass` : ''}.`)); return; }
    if (round > max) { agentBubble('ai', renderMarkdown(`⚠ Stopped after ${max} fix rounds. ${errors.length} error(s) and ${t.failed} failing test(s) remain — review the Problems and Tests tabs, or run the loop again.`)); return; }
    const r = await agentSend(`Round ${round} of automatic fixing. Running the app and tests produced the problems below (see "Current problems", "Recent console/run output" and "Latest test results"). Find the root causes and fix them by returning complete updated files.`, { auto: true, label: `Auto-fix round ${round}`, display: `🛠 Auto-fix round ${round}: ${errors.length} error(s), ${t.failed} failing test(s)` });
    if (!r || !r.edits.length) { agentBubble('sys', 'The Agent made no changes — stopping.'); return; }
  }
}

// =====================================================================
// Shell (xterm.js)
// =====================================================================
let term = null; let fit = null; let shell = null; let lineBuf = ''; let histIdx = 0; let cursor = 0;
function initTerminal() {
  if (term) { setTimeout(() => { try { fit.fit(); } catch { /* */ } }, 30); return; }
  if (!window.Terminal) { $('#terminal').textContent = 'Terminal library failed to load (offline?).'; return; }
  term = new window.Terminal({ cursorBlink: true, fontSize: 13, fontFamily: "'IBM Plex Mono', Menlo, Consolas, monospace", theme: { background: '#0e1525', foreground: '#f5f9fc', cursor: '#f26207', selectionBackground: '#0079f255' }, convertEol: false, scrollback: 5000 });
  fit = new window.FitAddon.FitAddon();
  term.loadAddon(fit);
  term.open($('#terminal'));
  setTimeout(() => { try { fit.fit(); } catch { /* */ } }, 30);
  new ResizeObserver(() => { try { fit.fit(); if (S.shellRemote) backend.resize(term.cols, term.rows); } catch { /* */ } }).observe($('#terminal'));
  term.onData(onTermData);
  resetShell();
}

function resetShell() {
  if (!term) return;
  term.reset();
  S.shellRemote = backend.connected;
  shell = createShell({
    getProject: () => S.project,
    setFS: (fs) => setFS(fs),
    write: (t) => term.write(t),
    clear: () => term.clear(),
    openFile: (p) => { openFile(p); setMobile('editor'); },
    run: async () => { await run(); term.write('\x1b[2m(output shown in Console tab)\x1b[0m\r\n'); },
    test: async () => { const r = await runTests(); setOut('shell'); term.write(`${r.failed ? '\x1b[31m' : '\x1b[32m'}${r.total - r.failed} passed, ${r.failed} failed\x1b[0m\r\n`); return r.failed ? 1 : 0; },
    runFile: async (path, kind) => runFileInTerminal(path, kind),
    pip: async (pk) => { const ok = await pipAdd(pk); return ok === false ? 1 : 0; },
    npm: async (pk) => { await npmAdd(pk); return 0; },
    setEnv: (k, v) => { S.project.env[k] = v; saveNow(); },
  });
  if (S.shellRemote) { term.write('\x1b[32m[connected to backend shell]\x1b[0m\r\n'); backend.shell(''); return; }
  term.write(`\x1b[1;38;5;208mDev Engine shell\x1b[0m — type \x1b[1mhelp\x1b[0m for commands.\r\n`);
  writePrompt();
}
function writePrompt() { if (!S.shellRemote) term.write(shell.prompt()); lineBuf = ''; cursor = 0; histIdx = shell.history.length; }

async function runFileInTerminal(path, kind) {
  const p = S.project;
  if (kind === 'python') {
    const res = await runPython({ files: p.files, entry: path, env: envFor(), io: { out: (t) => term.write(t.replace(/\n/g, '\r\n')), err: () => {}, status: (m) => /Downloading/.test(m) && term.write(`\x1b[2m${m}\x1b[0m\r\n`), input: (v) => term.write(v + '\r\n') } });
    if (res.error) term.write('\x1b[31m' + res.error.stack.replace(/^[\s\S]*?(Traceback)/, '$1').trim().replace(/\n/g, '\r\n') + '\x1b[0m\r\n');
    return res.code;
  }
  const { files } = await transpileFiles(p.files);
  const runId = ++S.runId;
  const doc = buildNodeDoc({ files, entry: path, packages: collectPackages(p), env: envFor(), runId });
  const frame = el('iframe', { sandbox: SANDBOX, class: 'run-frame-hidden' });
  const handler = (e) => {
    const d = e.data; if (!d || !d.__devengine || d.runId !== runId) return;
    if (d.kind === 'console') term.write((d.level === 'error' ? '\x1b[31m' : d.level === 'warn' ? '\x1b[33m' : '') + d.text.replace(/\n/g, '\r\n') + '\x1b[0m\r\n');
    if (d.kind === 'error') term.write('\x1b[31m' + cleanStack(d.stack || d.message).replace(/\n/g, '\r\n') + '\x1b[0m\r\n');
  };
  window.addEventListener('message', handler);
  frame.srcdoc = doc;
  document.body.append(frame);
  if (S.runFrame) S.runFrame.remove();
  S.runFrame = frame;
  const r = await waitFor('done', 0);
  window.removeEventListener('message', handler);
  return r.code || 0;
}

let termBusy = false;
async function onTermData(data) {
  if (S.shellRemote) { backend.shell(data); return; }
  if (termBusy) { if (data === '\x03') { stopRun(true); term.write('^C\r\n'); } return; }
  for (let i = 0; i < data.length; i++) {
    const c = data[i];
    if (c === '\r') {
      term.write('\r\n');
      const line = lineBuf;
      termBusy = true;
      try { await shell.exec(line); } catch (e) { term.write('\x1b[31m' + e.message + '\x1b[0m\r\n'); }
      termBusy = false;
      writePrompt();
    } else if (c === '\x7f') {
      if (cursor > 0) { lineBuf = lineBuf.slice(0, cursor - 1) + lineBuf.slice(cursor); cursor--; redrawLine(); }
    } else if (c === '\x03') { term.write('^C\r\n'); writePrompt(); }
    else if (c === '\x0c') { term.clear(); }
    else if (c === '\t') {
      const opts = shell.complete(lineBuf.slice(0, cursor));
      if (opts.length === 1) {
        const words = lineBuf.slice(0, cursor).split(/\s+/);
        const last = words.pop();
        const add = opts[0].slice(last.length) + (opts[0].endsWith('/') ? '' : ' ');
        lineBuf = lineBuf.slice(0, cursor) + add + lineBuf.slice(cursor); cursor += add.length; redrawLine();
      } else if (opts.length > 1) { term.write('\r\n' + opts.join('  ') + '\r\n'); term.write(shell.prompt()); redrawLine(true); }
    } else if (data.slice(i, i + 3) === '\x1b[A') { i += 2; if (histIdx > 0) { histIdx--; lineBuf = shell.history[histIdx]; cursor = lineBuf.length; redrawLine(); } }
    else if (data.slice(i, i + 3) === '\x1b[B') { i += 2; if (histIdx < shell.history.length) { histIdx++; lineBuf = shell.history[histIdx] || ''; cursor = lineBuf.length; redrawLine(); } }
    else if (data.slice(i, i + 3) === '\x1b[D') { i += 2; if (cursor > 0) { cursor--; term.write('\x1b[D'); } }
    else if (data.slice(i, i + 3) === '\x1b[C') { i += 2; if (cursor < lineBuf.length) { cursor++; term.write('\x1b[C'); } }
    else if (c === '\x1b') { i += 2; }
    else if (c >= ' ') { lineBuf = lineBuf.slice(0, cursor) + c + lineBuf.slice(cursor); cursor++; redrawLine(); }
  }
}
function redrawLine(noClear) {
  if (!noClear) term.write('\r\x1b[K' + shell.prompt());
  term.write(lineBuf);
  const back = lineBuf.length - cursor;
  if (back > 0) term.write(`\x1b[${back}D`);
}

// =====================================================================
// Share / Export / Deploy
// =====================================================================
async function shareRepl() {
  const p = S.project;
  const data = await compress(JSON.stringify({ name: p.name, template: p.template, runtime: p.runtime, files: p.files, folders: p.folders, packages: p.packages }));
  const url = `${location.origin}${location.pathname}#/share/${data}`;
  const input = el('input', { value: url, readonly: true });
  const big = url.length > 60000;
  modal({
    title: '🔗 Share this project',
    body: el('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px' } },
      el('div', { class: 'muted small' }, 'Anyone with this link can fork a copy of your code (secrets are never included).' + (big ? ' ⚠ This project is large — the link may be too long for some apps; consider pushing to GitHub instead.' : '')),
      input,
      el('div', { style: { display: 'flex', gap: '6px' } },
        el('button', { class: 'btn primary', onclick: async () => { try { await navigator.clipboard.writeText(url); toast('Link copied', 'ok'); } catch { input.select(); document.execCommand('copy'); toast('Link copied', 'ok'); } } }, '📋 Copy link'),
        navigator.share ? el('button', { class: 'btn', onclick: () => navigator.share({ title: p.name, url }).catch(() => {}) }, '📤 Share…') : null)),
  });
}

async function exportZip(p) {
  if (!window.JSZip) return toast('ZIP library not loaded', 'err');
  const zip = new window.JSZip();
  for (const [f, c] of Object.entries(p.files)) zip.file(`${p.name}/${f}`, c);
  for (const d of p.folders || []) zip.folder(`${p.name}/${d}`);
  download(`${p.name}.zip`, await zip.generateAsync({ type: 'blob' }));
}

function deployModal() {
  const p = S.project;
  const isWeb = effectiveRuntime() === 'web';
  const opt = (icon, title, desc, action, primary) => el('button', { class: 'tpl', style: { width: '100%' }, onclick: action }, el('span', { class: 'ico', style: { background: primary ? '#0079f233' : '#ffffff11' } }, icon), el('span', {}, el('b', {}, title), el('small', {}, desc)));
  let close;
  const body = el('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px' } },
    isWeb ? opt('🌍', 'Deploy to GitHub Pages', 'Free public hosting at username.github.io/repo', () => { close(); githubModal(true); }, true) : null,
    opt('🐙', 'Push to GitHub', 'Commit all files to a GitHub repository', () => { close(); githubModal(false); }),
    isWeb ? opt('↗', 'Open live preview', 'Open your site full-screen in a new tab', () => { close(); openPreviewTab(); }) : null,
    isWeb ? opt('📄', 'Download single HTML file', 'Self-contained page you can host anywhere', async () => { close(); const { files } = await transpileFiles(p.files); download(`${p.name}.html`, buildWebDoc({ files, page: S.page, packages: collectPackages(p), env: {}, runId: 0 }), 'text/html'); }) : null,
    opt('⤓', 'Download .zip', 'All project files, ready for Netlify, Vercel, Render…', () => { close(); exportZip(p); }));
  const pr = modal({ title: '🚀 Deploy', body, buttons: [{ label: 'Close', value: null }] });
  close = () => $('#modal-root').lastChild && $('#modal-root').lastChild.remove();
  return pr;
}

async function githubModal(pages, filesOverride, repoName) {
  const p = S.project || { name: repoName || 'website', files: {} };
  const s = S.settings;
  const tok = el('input', { type: 'password', value: s.githubToken || '', placeholder: 'ghp_…' });
  const repo = el('input', { value: (filesOverride && repoName) || p.githubRepo || p.name });
  const msg = el('input', { value: pages ? 'Deploy from Dev Engine' : 'Update from Dev Engine' });
  const priv = el('input', { type: 'checkbox', checked: !pages && !!p.githubPrivate });
  const r = await modal({
    title: pages ? '🌍 Deploy to GitHub Pages' : '🐙 Push to GitHub',
    body: el('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px' } },
      el('label', {}, 'GitHub token (repo scope) — saved in this browser only', tok),
      el('label', {}, 'Repository (name or owner/name — created if it does not exist)', repo),
      el('label', {}, 'Commit message', msg),
      pages ? el('div', { class: 'muted small' }, 'GitHub Pages needs a public repo on free plans. The site goes live in about a minute.') : el('label', { style: { flexDirection: 'row', alignItems: 'center', gap: '6px' } }, priv, ' Private repository'),
      el('a', { href: 'https://github.com/settings/tokens/new?scopes=repo&description=Dev%20Engine', target: '_blank', rel: 'noopener', class: 'small' }, 'Create a token on GitHub ↗')),
    buttons: [{ label: 'Cancel', value: null }, { label: pages ? 'Deploy' : 'Push', class: 'primary', value: true }],
  });
  if (!r) return;
  s.githubToken = tok.value.trim(); store.saveSettings(s);
  if (!filesOverride) { p.githubRepo = repo.value.trim(); p.githubPrivate = priv.checked; saveNow(); }
  const t = el('div', { class: 'toast' }, el('span', { class: 'spinner' }), ' Starting…');
  $('#toasts').append(t);
  try {
    const files = filesOverride ? { ...filesOverride } : { ...p.files };
    if (pages && !filesOverride) {
      // ensure index.html exists at the root for Pages
      if (!('index.html' in files) && S.page in files) files['index.html'] = files[S.page];
      files['.nojekyll'] = '';
    }
    if (pages) files['.nojekyll'] = '';
    const res = await pushRepo({ token: s.githubToken, repo: p.githubRepo, files, message: msg.value, isPrivate: priv.checked && !pages, enablePages: pages, description: `${p.name} — built with Dev Engine`, onStep: (m) => { t.lastChild.textContent = ' ' + m; } });
    t.remove();
    modal({ title: '✅ Done', body: el('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px' } }, el('a', { href: res.url, target: '_blank', rel: 'noopener' }, '🐙 ' + res.url), res.pagesUrl ? el('a', { href: res.pagesUrl, target: '_blank', rel: 'noopener' }, '🌍 ' + res.pagesUrl + ' (live in ~1 min)') : null) });
  } catch (e) { t.remove(); toast(e.message, 'err'); }
}

// =====================================================================
// Quick open & shortcuts
// =====================================================================
function quickOpen() {
  if (!S.project) return;
  const files = Object.keys(S.project.files);
  const input = el('input', { placeholder: 'Go to file…' });
  const list = el('div', { style: { maxHeight: '50vh', overflow: 'auto' } });
  const box = el('div', { class: 'quickopen' }, input, list);
  const back = el('div', { class: 'modal-back', style: { background: 'rgba(0,0,0,.3)', alignItems: 'start' }, onclick: (e) => { if (e.target === back) back.remove(); } }, box);
  let sel = 0; let items = [];
  const score = (f, q) => { let i = 0; for (const ch of f.toLowerCase()) if (ch === q[i]) i++; return i === q.length ? (f.toLowerCase().includes(q) ? 2 : 1) : 0; };
  const draw = () => {
    const q = input.value.toLowerCase();
    items = files.map((f) => [f, score(f, q)]).filter(([, s]) => s > 0 || !q).sort((a, b) => b[1] - a[1]).map(([f]) => f).slice(0, 50);
    sel = Math.min(sel, items.length - 1);
    list.innerHTML = '';
    items.forEach((f, i) => list.append(el('div', { class: 'qo-item' + (i === sel ? ' sel' : ''), onclick: () => { back.remove(); openFile(f); } }, fileIcon(f), ' ', basename(f), el('span', { class: 'muted small' }, '  ' + dirname(f)))));
  };
  input.oninput = () => { sel = 0; draw(); };
  input.onkeydown = (e) => {
    if (e.key === 'ArrowDown') { sel = Math.min(items.length - 1, sel + 1); draw(); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { sel = Math.max(0, sel - 1); draw(); e.preventDefault(); }
    else if (e.key === 'Enter') { back.remove(); if (items[sel]) openFile(items[sel]); }
    else if (e.key === 'Escape') back.remove();
  };
  $('#modal-root').append(back);
  draw();
  input.focus();
}

function onGlobalKey(e) {
  if (!S.project || $('#workspace').hidden) return;
  const mod = e.ctrlKey || e.metaKey;
  if (mod && e.key === 'Enter') { e.preventDefault(); run(); }
  else if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); saveFile(); }
  else if (mod && !e.shiftKey && e.key.toLowerCase() === 'p') { e.preventDefault(); quickOpen(); }
  else if (mod && e.shiftKey && e.key.toLowerCase() === 't') { e.preventDefault(); runTests(); }
  else if (mod && e.shiftKey && e.key.toLowerCase() === 'f') { e.preventDefault(); setPanel('search'); }
  else if (mod && e.key.toLowerCase() === 'b') { e.preventDefault(); $('#sidepanel').classList.toggle('collapsed'); }
  else if (mod && e.key.toLowerCase() === 'i') { e.preventDefault(); setOut('agent'); $('#agent-text').focus(); }
}

// =====================================================================
// Boot
// =====================================================================
applyTheme();
renderHome();
window.addEventListener('hashchange', route);
window.addEventListener('message', onFrameMessage);
window.addEventListener('beforeunload', (e) => { saveNow(); if (S.agentBusy) e.preventDefault(); });
document.addEventListener('keydown', onGlobalKey);
route();
initEditor();

// expose for debugging / e2e tests
window.devEngine = { S, run, runTests, openFile, setFS, autoFix, agentSend, checkCode, allProblems };
void allFolders;
