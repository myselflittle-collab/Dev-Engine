// Visual website builder: Figma-like editing + animations + chat assistant.
import { $, $$, el, esc, toast, debounce, modal, confirmModal, download } from './ui.js';
import { SECTION_LIBRARY, ELEMENT_LIBRARY, KINDS, FONTS, generateSite, make3D } from './sitegen.js';
import { renderSite, exportDocument, runtime, ENTRANCES, HOVERS, LOOPS, BG_EFFECTS, MODEL_VIEWER_URL } from './siterender.js';
import { runCommand, HELP } from './assistant.js';
import { addAsset, listAssets, resolveSrc, getAsset, deleteAsset, blobToDataURL, extFor, isModel } from './media.js';
import { renderMarkdown } from './ai.js';

const B = {
  project: null, site: null, deps: null, selected: null, hist: [], future: [], assets: [],
  device: 'desktop', leftTab: 'add', rightTab: 'edit', shadow: null, chat: [], busy: false, bound: false,
};
const allEls = () => B.site.sections.flatMap((s) => s.elements);
const findEl = (id) => { for (const s of B.site.sections) { const i = s.elements.findIndex((e) => e.id === id); if (i >= 0) return { sec: s, el: s.elements[i], idx: i }; } return null; };
const findSec = (id) => B.site.sections.find((s) => s.id === id);

export async function openBuilder(project, deps) {
  B.project = project; B.deps = deps;
  B.site = project.site || generateSite(project.prompt || project.name);
  project.site = B.site;
  B.selected = null; B.hist = []; B.future = [];
  B.chat = project.builderChat || [];
  $('#home').hidden = true; $('#workspace').hidden = true; $('#builder').hidden = false;
  document.title = `${B.site.name} — Dev Engine Builder`;
  bindOnce();
  $('#bd-name').value = B.site.name;
  try { B.assets = await listAssets(project.id); } catch { B.assets = []; }
  setDevice(innerWidth < 760 ? 'mobile' : 'desktop');
  render();
  renderLeft(); renderRight();
  renderChat();
  if (!B.chat.length) {
    botSay(`🎉 **${esc(B.site.name)}** is ready! Tap anything on the page to edit it — text, images, videos, buttons, colours.\n\nTell me how to animate it, for example:\n• *animate the hero with bounce*\n• *make buttons pulse*\n• *typewriter title*\n• *add floating bubbles*\n\nType **help** for everything I understand.`);
  }
  if (innerWidth < 760) setMobilePanel(null);
}

export function closeBuilder() { $('#builder').hidden = true; save(true); }

// ------------------------------------------------------------------ history / save
const saveSoon = debounce(() => save(), 600);
function save(now) { if (!B.project) return; B.project.site = B.site; B.project.name = B.site.name; B.project.builderChat = B.chat.slice(-60); B.deps.saveProject(B.project); if (now) return; }
function snapshot() { B.hist.push(JSON.stringify(B.site)); if (B.hist.length > 80) B.hist.shift(); B.future = []; updateUndo(); }
function commit() { render(); renderRight(); if (B.leftTab === 'layers') renderLeft(); saveSoon(); }
function undo() { if (!B.hist.length) return toast('Nothing to undo'); B.future.push(JSON.stringify(B.site)); B.site = JSON.parse(B.hist.pop()); afterTimeTravel(); }
function redo() { if (!B.future.length) return; B.hist.push(JSON.stringify(B.site)); B.site = JSON.parse(B.future.pop()); afterTimeTravel(); }
function afterTimeTravel() { B.project.site = B.site; if (B.selected && !findEl(B.selected) && !findSec(B.selected)) B.selected = null; $('#bd-name').value = B.site.name; commit(); updateUndo(); }
function updateUndo() { $('#bd-undo').disabled = !B.hist.length; $('#bd-redo').disabled = !B.future.length; }
/** Run a mutation with undo support. */
function change(fn) { snapshot(); fn(); commit(); }

// ------------------------------------------------------------------ canvas
function loadFonts(url) {
  if (!url) return;
  let l = document.getElementById('bd-fonts');
  if (!l) { l = el('link', { id: 'bd-fonts', rel: 'stylesheet' }); document.head.append(l); }
  if (l.href !== url) l.href = url;
}

function render() {
  if (!B.shadow) {
    B.shadow = $('#bd-host').attachShadow({ mode: 'open' });
    B.shadow.addEventListener('click', onCanvasClick, true);
    B.shadow.addEventListener('pointerdown', onCanvasPointerDown);
    B.shadow.addEventListener('submit', (e) => e.preventDefault(), true);
  }
  const r = renderSite(B.site, { mode: 'editor', resolve: resolveSrc, selected: B.selected });
  loadFonts(r.fonts);
  if (r.needs3d && !document.getElementById('bd-mv')) document.head.append(el('script', { id: 'bd-mv', type: 'module', src: MODEL_VIEWER_URL }));
  const scrollTop = $('#bd-canvas').scrollTop;
  B.shadow.innerHTML = `<style>${r.css}\n:host{display:block}</style>${r.body}`;
  $('#bd-canvas').scrollTop = scrollTop;
  placeToolbar();
}

function setDevice(d) {
  B.device = d;
  const w = { desktop: '100%', tablet: '820px', mobile: '390px' }[d];
  $('#bd-host').style.width = w;
  $$('#bd-devices button').forEach((b) => b.classList.toggle('active', b.dataset.d === d));
  setTimeout(placeToolbar, 50);
}

function play(quiet) {
  const site = B.shadow.querySelector('.site');
  site.classList.add('playing');
  B.shadow.querySelectorAll('.a-in').forEach((x) => { x.classList.remove('in'); const t = x.querySelector('[data-typed]'); if (t) { delete t.dataset.typed; } });
  void site.offsetWidth;
  runtime(B.shadow, $('#bd-canvas'));
  clearTimeout(B.playT);
  B.playT = setTimeout(() => { site.classList.remove('playing'); }, 6000);
  if (quiet !== true) toast('▶ Playing animations — scroll the page to see scroll animations');
}

function select(id, { scroll } = {}) {
  B.selected = id;
  B.shadow.querySelectorAll('.sel,.sel-sec').forEach((x) => x.classList.remove('sel', 'sel-sec'));
  const node = id && (B.shadow.querySelector(`[data-eid="${id}"]`) || B.shadow.querySelector(`[data-sid="${id}"]`));
  if (node) {
    node.classList.add(node.dataset.eid ? 'sel' : 'sel-sec');
    if (scroll) node.scrollIntoView({ block: 'center', behavior: 'smooth' });
    if (findEl(id) && findEl(id).sec.layout === 'free') render();
  }
  renderRight();
  if (B.leftTab === 'layers') renderLeft();
  placeToolbar();
}

function onCanvasClick(e) {
  if (e.target.closest('[contenteditable="true"]')) return;
  e.preventDefault(); e.stopPropagation();
  if (B.dragged) { B.dragged = false; return; }
  const elNode = e.target.closest('[data-eid]');
  const secNode = e.target.closest('[data-sid]');
  if (elNode) {
    const id = elNode.dataset.eid;
    if (B.selected === id) { startInlineEdit(elNode, e.target); return; }
    select(id);
  } else if (secNode) select(secNode.dataset.sid);
  else select(null);
  if (innerWidth < 760 && B.selected) setMobilePanel(null);
}

function startInlineEdit(elNode, target) {
  const field = target.closest('[data-edit]') || elNode.querySelector('[data-edit]');
  if (!field) { setRightTab('edit'); return; }
  const f = findEl(elNode.dataset.eid); if (!f) return;
  field.contentEditable = 'true';
  field.focus();
  const range = document.createRange(); range.selectNodeContents(field);
  const sel = B.shadow.getSelection ? B.shadow.getSelection() : window.getSelection();
  try { sel.removeAllRanges(); sel.addRange(range); } catch { /* */ }
  const key = field.dataset.edit;
  const done = () => {
    field.removeEventListener('blur', done);
    field.contentEditable = 'false';
    let v = field.innerText.replace(/\n{3,}/g, '\n\n').trim();
    if (key === 'author') v = v.replace(/^—\s*/, '');
    const prop = key === 'text' && f.el.kind === 'nav' ? 'brand' : key;
    if (f.el.props[prop] !== v) change(() => { f.el.props[prop] = v; });
  };
  field.addEventListener('blur', done);
  field.addEventListener('keydown', (k) => { if (k.key === 'Enter' && !k.shiftKey && !['text'].includes(f.el.kind)) { k.preventDefault(); field.blur(); } if (k.key === 'Escape') field.blur(); });
}

// drag & resize in free-canvas sections
function onCanvasPointerDown(e) {
  const node = e.target.closest('[data-eid]');
  if (!node || node.dataset.eid !== B.selected) return;
  const f = findEl(B.selected);
  if (!f || f.sec.layout !== 'free' || e.target.closest('[contenteditable="true"]')) return;
  const wrap = node.closest('.wrap');
  const rect = wrap.getBoundingClientRect();
  const resizing = !!e.target.dataset.resize;
  const start = { x: e.clientX, y: e.clientY, pos: { ...(f.el.pos || { x: 10, y: 10 }) }, w: f.el.style.width || (node.getBoundingClientRect().width / rect.width) * 100 };
  let moved = false;
  snapshot();
  const move = (ev) => {
    const dx = ((ev.clientX - start.x) / rect.width) * 100;
    const dy = ((ev.clientY - start.y) / rect.height) * 100;
    if (Math.abs(dx) + Math.abs(dy) > 0.5) moved = true;
    if (resizing) { f.el.style.width = Math.round(Math.max(5, Math.min(100, start.w + dx))); node.style.width = f.el.style.width + '%'; }
    else { f.el.pos = { x: Math.round(Math.max(0, Math.min(95, start.pos.x + dx)) * 10) / 10, y: Math.round(Math.max(0, Math.min(95, start.pos.y + dy)) * 10) / 10 }; node.style.left = f.el.pos.x + '%'; node.style.top = f.el.pos.y + '%'; }
    placeToolbar();
  };
  const up = () => {
    window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up);
    if (moved) { B.dragged = true; commit(); } else B.hist.pop();
  };
  window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
}

// floating toolbar over the selection
function placeToolbar() {
  const tb = $('#bd-tools');
  const node = B.selected && B.shadow && (B.shadow.querySelector(`[data-eid="${B.selected}"]`) || B.shadow.querySelector(`[data-sid="${B.selected}"]`));
  if (!node) { tb.hidden = true; return; }
  const cr = $('#bd-canvas').getBoundingClientRect();
  const r = node.getBoundingClientRect();
  tb.hidden = false;
  const top = Math.max(cr.top + 4, r.top - 42);
  tb.style.top = top - cr.top + $('#bd-canvas').scrollTop + 'px';
  tb.style.left = Math.max(4, Math.min(r.left - cr.left, cr.width - tb.offsetWidth - 8)) + 'px';
  $('#bd-tools .lbl').textContent = findEl(B.selected) ? kindLabel(findEl(B.selected).el.kind) : `§ ${findSec(B.selected)?.name || ''}`;
}
const kindLabel = (k) => (ELEMENT_LIBRARY.find((x) => x[0] === k) || [k, '', k])[2] || k;

function moveSelected(dir) {
  const f = findEl(B.selected);
  change(() => {
    if (f) {
      const arr = f.sec.elements; const j = f.idx + dir;
      if (j >= 0 && j < arr.length) [arr[f.idx], arr[j]] = [arr[j], arr[f.idx]];
      else {
        // move into neighbouring section
        const si = B.site.sections.indexOf(f.sec) + dir;
        const ns = B.site.sections[si];
        if (ns) { arr.splice(f.idx, 1); if (dir > 0) ns.elements.unshift(f.el); else ns.elements.push(f.el); if (ns.layout === 'free' && !f.el.pos) f.el.pos = { x: 10, y: 10 }; }
      }
    } else {
      const arr = B.site.sections; const i = arr.findIndex((s) => s.id === B.selected); const j = i + dir;
      if (i >= 0 && j >= 0 && j < arr.length) [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  });
  setTimeout(() => select(B.selected, { scroll: true }), 30);
}
function duplicateSelected() {
  const f = findEl(B.selected);
  const clone = (o, p) => ({ ...JSON.parse(JSON.stringify(o)), id: p + Math.random().toString(36).slice(2, 9) });
  change(() => {
    if (f) { const c = clone(f.el, 'e'); if (c.pos) c.pos = { x: c.pos.x + 4, y: c.pos.y + 4 }; f.sec.elements.splice(f.idx + 1, 0, c); B.selected = c.id; }
    else { const i = B.site.sections.findIndex((s) => s.id === B.selected); if (i < 0) return; const c = clone(B.site.sections[i], 's'); c.elements = c.elements.map((e) => clone(e, 'e')); B.site.sections.splice(i + 1, 0, c); B.selected = c.id; }
  });
}
async function deleteSelected() {
  const f = findEl(B.selected);
  if (!f) { const s = findSec(B.selected); if (!s || !(await confirmModal('Delete section', `Delete the “${s.name}” section?`))) return; }
  change(() => {
    if (f) f.sec.elements.splice(f.idx, 1);
    else B.site.sections = B.site.sections.filter((s) => s.id !== B.selected);
    B.selected = null;
  });
}

// ------------------------------------------------------------------ left panel
function setLeftTab(t) { B.leftTab = t; renderLeft(); }
function renderLeft() {
  $$('#bd-ltabs button').forEach((b) => b.classList.toggle('active', b.dataset.t === B.leftTab));
  const box = $('#bd-left-body');
  box.innerHTML = '';
  if (B.leftTab === 'add') {
    box.append(el('div', { class: 'bd-h' }, 'Elements'), el('div', { class: 'bd-grid' }, ELEMENT_LIBRARY.map(([kind, icon, label, make]) => el('button', { class: 'bd-tile', onclick: () => addElement(make()) }, el('span', {}, icon), label))));
    box.append(el('div', { class: 'bd-h' }, 'Sections'), el('div', { class: 'bd-grid' }, Object.entries(SECTION_LIBRARY).map(([type, def]) => el('button', { class: 'bd-tile', onclick: () => addSection(type) }, el('span', {}, def.icon), def.label))));
  } else if (B.leftTab === 'layers') {
    B.site.sections.forEach((s, i) => {
      box.append(el('div', { class: 'bd-layer sec' + (B.selected === s.id ? ' active' : ''), onclick: () => select(s.id, { scroll: true }) },
        el('span', { class: 'grow' }, `§ ${s.name}`),
        el('button', { title: 'Move up', onclick: (e) => { e.stopPropagation(); B.selected = s.id; moveSelected(-1); } }, '▲'),
        el('button', { title: 'Move down', onclick: (e) => { e.stopPropagation(); B.selected = s.id; moveSelected(1); } }, '▼')));
      s.elements.forEach((e) => box.append(el('div', { class: 'bd-layer' + (B.selected === e.id ? ' active' : ''), onclick: () => select(e.id, { scroll: true }) },
        el('span', { class: 'grow' }, `${(ELEMENT_LIBRARY.find((x) => x[0] === e.kind) || ['', '▫'])[1]} ${String(e.props.text || e.props.title || e.props.brand || e.props.name || kindLabel(e.kind)).slice(0, 28)}`),
        e.anim && (e.anim.in || e.anim.loop || e.anim.hover) && (e.anim.in !== 'none' || e.anim.loop) ? el('span', { title: 'Animated' }, '✨') : null)));
      void i;
    });
  } else {
    const inp = el('input', { type: 'file', accept: 'image/*,video/*,.glb,.gltf,model/gltf-binary', multiple: true, hidden: true, onchange: (e) => uploadFiles(e.target.files) });
    box.append(el('button', { class: 'btn primary', style: { width: '100%' }, onclick: () => inp.click() }, '⬆ Upload photos / videos / 3D'), inp,
      el('div', { class: 'muted small', style: { margin: '6px 0 10px' } }, 'From your iPad Photos or Files. Then tap one to add it, or select an image/video and press “Use”.'));
    const grid = el('div', { class: 'bd-media' });
    if (!B.assets.length) grid.append(el('div', { class: 'muted small' }, 'No media yet.'));
    for (const a of B.assets) {
      const url = resolveSrc('asset:' + a.id);
      const isVid = a.type.startsWith('video');
      grid.append(el('div', { class: 'bd-m' },
        isModel(a) ? el('div', { class: 'bd-m3d' }, '🧊', el('small', {}, a.name)) : isVid ? el('video', { src: url, muted: true, playsInline: true }) : el('img', { src: url, alt: a.name }),
        el('div', { class: 'bd-m-actions' },
          el('button', { class: 'btn sm primary', onclick: () => useAsset(a) }, B.selected ? 'Use' : 'Add'),
          el('button', { class: 'btn sm', onclick: async () => { await deleteAsset(a.id); B.assets = B.assets.filter((x) => x.id !== a.id); renderLeft(); } }, '🗑'))));
    }
    box.append(grid);
  }
}

function targetSection() {
  const f = findEl(B.selected);
  if (f) return f.sec;
  return findSec(B.selected) || B.site.sections.find((s) => s.type === 'hero') || B.site.sections[0];
}
function addElement(e) {
  const sec = targetSection();
  if (!sec) return;
  change(() => {
    if (sec.layout === 'free') e.pos = { x: 10, y: 10 };
    const f = findEl(B.selected);
    sec.elements.splice(f ? f.idx + 1 : sec.elements.length, 0, e);
    B.selected = e.id;
  });
  setTimeout(() => select(e.id, { scroll: true }), 30);
  if (innerWidth < 1100) setMobilePanel(null);
}
function addSection(type) {
  const k = KINDS[B.site.kind] || KINDS.business;
  const s = SECTION_LIBRARY[type].make(B.site.name, { ...k, theme: B.site.theme });
  change(() => {
    const cur = B.site.sections.findIndex((x) => x.id === B.selected || x.elements.some((e) => e.id === B.selected));
    const footer = B.site.sections.findIndex((x) => x.type === 'footer');
    const at = cur >= 0 ? cur + 1 : footer >= 0 ? footer : B.site.sections.length;
    B.site.sections.splice(type === 'navbar' ? 0 : at, 0, s);
    B.selected = s.id;
  });
  setTimeout(() => select(s.id, { scroll: true }), 30);
  if (innerWidth < 1100) setMobilePanel(null);
}

async function uploadFiles(files, apply) {
  const added = [];
  for (const f of files) {
    if (!/^(image|video)\//.test(f.type) && !/\.(glb|gltf)$/i.test(f.name)) { toast(`${f.name}: use an image, video or .glb 3D model`, 'err'); continue; }
    if (f.size > 80 * 1024 * 1024) { toast(`${f.name}: too large (max 80 MB)`, 'err'); continue; }
    try { added.push(await addAsset(B.project.id, f)); } catch (e) { toast('Could not store file: ' + e.message, 'err'); }
  }
  B.assets = await listAssets(B.project.id);
  if (added.length) toast(`Added ${added.length} file(s) to Media`, 'ok');
  if (apply && added[0]) apply(added[0]); else if (B.leftTab === 'media') renderLeft();
  return added;
}

function useAsset(a) {
  const src = 'asset:' + a.id;
  const isVid = a.type.startsWith('video');
  const f = findEl(B.selected);
  const s = !f && findSec(B.selected);
  if (isModel(a)) {
    if (f && f.el.kind === 'model3d') change(() => { f.el.props.src = src; });
    else addElement({ id: 'e' + Math.random().toString(36).slice(2, 9), kind: 'model3d', props: { src, autoRotate: true, ar: true }, style: {}, anim: { in: 'zoom-in' } });
    return;
  }
  if (f && ['image', 'video', 'card'].includes(f.el.kind)) {
    change(() => {
      if (f.el.kind === 'card') f.el.props.img = src;
      else if (isVid !== (f.el.kind === 'video')) { f.el.kind = isVid ? 'video' : 'image'; f.el.props = { src }; }
      else f.el.props.src = src;
    });
  } else if (s && !isVid) change(() => { s.style.bgImage = src; });
  else addElement({ id: 'e' + Math.random().toString(36).slice(2, 9), kind: isVid ? 'video' : 'image', props: { src }, style: { radius: 16 }, anim: { in: 'zoom-in' } });
}

function pickMedia(accept, apply) {
  const inp = el('input', { type: 'file', accept });
  inp.onchange = () => uploadFiles(inp.files, apply);
  inp.click();
}

// ------------------------------------------------------------------ right panel
function setRightTab(t) { B.rightTab = t; renderRight(); if (innerWidth < 760) setMobilePanel('right'); }
function renderRight() {
  $$('#bd-rtabs button').forEach((b) => b.classList.toggle('active', b.dataset.t === B.rightTab));
  $('#bd-chat').hidden = B.rightTab !== 'chat';
  const box = $('#bd-right-body');
  box.hidden = B.rightTab === 'chat';
  if (B.rightTab === 'chat') { setTimeout(() => { const m = $('#bd-msgs'); m.scrollTop = m.scrollHeight; }, 0); return; }
  box.innerHTML = '';
  const f = findEl(B.selected); const s = !f && findSec(B.selected);
  if (B.rightTab === 'edit') {
    if (f) box.append(...elementEditor(f));
    else if (s) box.append(...sectionEditor(s));
    else box.append(...themeEditor());
  } else {
    if (f) box.append(...animEditor(f.el));
    else if (s) box.append(...sectionAnimEditor(s));
    else box.append(...globalAnimEditor());
  }
}

// form helpers
const row = (label, input) => el('label', { class: 'bd-row' }, el('span', {}, label), input);
function inputFor(obj, key, { type = 'text', after, placeholder, min, max, step, rows } = {}) {
  const tag = type === 'textarea' ? 'textarea' : 'input';
  const i = el(tag, { type: tag === 'input' ? type : undefined, placeholder, min, max, step, rows: rows || 3 });
  i.value = obj[key] ?? (type === 'color' ? '#000000' : '');
  const apply = () => change(() => { obj[key] = type === 'number' || type === 'range' ? (i.value === '' ? undefined : +i.value) : i.value; after && after(); });
  i.addEventListener(type === 'range' || type === 'color' ? 'input' : 'change', type === 'range' || type === 'color' ? debounce(apply, 120) : apply);
  return i;
}
function selectFor(obj, key, options, after) {
  const s = el('select', {}, Object.entries(options).map(([v, l]) => el('option', { value: v, selected: String(obj[key] ?? '') === v }, l)));
  s.onchange = () => change(() => { obj[key] = s.value; after && after(); });
  return s;
}
function checkFor(obj, key, label) {
  const c = el('input', { type: 'checkbox', checked: !!obj[key] });
  c.onchange = () => change(() => { obj[key] = c.checked; });
  return el('label', { class: 'bd-check' }, c, ' ', label);
}
function colorFor(obj, key, label) {
  const c = inputFor(obj, key, { type: 'color' });
  return el('div', { class: 'bd-row' }, el('span', {}, label), el('div', { class: 'bd-color' }, c, el('button', { class: 'btn sm', title: 'Reset', onclick: () => change(() => { delete obj[key]; }) }, '↺')));
}
const linesToArr = (v) => String(v).split('\n').map((x) => x.trim()).filter(Boolean);
function linesInput(obj, key, toLines, fromLines, placeholder) {
  const t = el('textarea', { rows: 4, placeholder });
  t.value = toLines(obj[key] || []);
  t.onchange = () => change(() => { obj[key] = fromLines(linesToArr(t.value)); });
  return t;
}
function mediaButtons(e, key, accept) {
  const urlIn = el('input', { placeholder: accept.startsWith('video') ? 'or paste YouTube / MP4 link' : accept.includes('glb') ? 'or paste a .glb link' : 'or paste image link', value: String(e.props[key] || '').startsWith('asset:') ? '' : e.props[key] || '' });
  urlIn.onchange = () => change(() => { e.props[key] = urlIn.value.trim(); });
  return el('div', { class: 'bd-media-btns' },
    el('button', { class: 'btn primary sm', onclick: () => pickMedia(accept, (a) => change(() => { e.props[key] = 'asset:' + a.id; })) }, `⬆ ${e.props[key] ? 'Replace' : 'Upload'} ${accept.startsWith('video') ? 'video' : accept.includes('glb') ? '3D model (.glb)' : 'image'}`),
    el('button', { class: 'btn sm', onclick: () => { setLeftTab('media'); setMobilePanel('left'); } }, '🖼 From media'),
    urlIn);
}

function elementEditor({ el: e, sec }) {
  const p = e.props; const st = e.style;
  const out = [el('div', { class: 'bd-title' }, `${(ELEMENT_LIBRARY.find((x) => x[0] === e.kind) || ['', '▫'])[1]} ${kindLabel(e.kind)}`, el('span', { class: 'muted small' }, ` in ${sec.name}`))];
  const content = [];
  const textKinds = { heading: 'text', text: 'text', button: 'text', icon: 'text' };
  if (textKinds[e.kind]) content.push(row(e.kind === 'icon' ? 'Emoji / symbol' : 'Text', inputFor(p, 'text', { type: e.kind === 'text' ? 'textarea' : 'text' })));
  if (e.kind === 'heading') content.push(row('Size', selectFor(p, 'level', { 1: 'H1 — page title', 2: 'H2 — section title', 3: 'H3', 4: 'H4' }, () => { p.level = +p.level; })));
  if (e.kind === 'button') content.push(row('Link (URL or #section)', inputFor(p, 'href', { placeholder: 'https://… or #contact or tel:…' })), row('Style', selectFor(p, 'variant', { solid: 'Solid', outline: 'Outline', light: 'Light', ghost: 'Text link' })));
  if (e.kind === 'image') content.push(mediaButtons(e, 'src', 'image/*'), row('Alt text', inputFor(p, 'alt')));
  if (e.kind === 'video') content.push(mediaButtons(e, 'src', 'video/*'), checkFor(p, 'controls', 'Show play controls'));
  if (e.kind === 'card') content.push(row('Icon', inputFor(p, 'icon')), row('Title', inputFor(p, 'title')), row('Text', inputFor(p, 'text', { type: 'textarea' })), mediaButtons(e, 'img', 'image/*'));
  if (e.kind === 'shape') content.push(row('Shape', selectFor(p, 'shape', { circle: 'Circle', rect: 'Rounded square', blob: 'Blob' })));
  if (e.kind === 'quote') content.push(row('Quote', inputFor(p, 'text', { type: 'textarea' })), row('Author', inputFor(p, 'author')), row('Stars', inputFor(p, 'rating', { type: 'number', min: 1, max: 5 })));
  if (e.kind === 'price') content.push(row('Plan', inputFor(p, 'name')), row('Price', inputFor(p, 'price')), row('Per', inputFor(p, 'per')), row('Features (one per line)', linesInput(p, 'features', (a) => a.join('\n'), (a) => a)), row('Button', inputFor(p, 'cta')), checkFor(p, 'featured', 'Highlight this plan'));
  if (e.kind === 'stats') content.push(row('Stats (value | label)', linesInput(p, 'items', (a) => a.map((x) => x.join(' | ')).join('\n'), (a) => a.map((l) => l.split('|').map((x) => x.trim())))));
  if (e.kind === 'form') content.push(row('Fields (one per line)', linesInput(p, 'fields', (a) => a.join('\n'), (a) => a)), row('Button text', inputFor(p, 'button')), row('Send to email (optional)', inputFor(p, 'email', { placeholder: 'you@example.com' })));
  if (e.kind === 'social') content.push(row('Links (icon | url)', linesInput(p, 'links', (a) => a.map((x) => `${x.icon} | ${x.href}`).join('\n'), (a) => a.map((l) => { const [icon, href] = l.split('|').map((x) => x.trim()); return { icon, href: href || '#' }; }))));
  if (e.kind === 'map') content.push(row('Address / place', inputFor(p, 'query')));
  if (e.kind === 'model3d') content.push(
    mediaButtons(e, 'src', '.glb,.gltf,model/gltf-binary'),
    el('div', { class: 'muted small' }, 'Upload a .glb 3D model (free ones: Sketchfab, Poly Pizza, or make one with an AI 3D generator). Until then a spinning 3D emoji badge is shown.'),
    row('Badge emoji (no model)', inputFor(p, 'emoji')),
    checkFor(p, 'autoRotate', 'Auto-rotate'), checkFor(p, 'ar', 'Allow “View in your room” (AR on iPhone/iPad/Android)'),
    row('Height (px)', inputFor(e.style, 'height', { type: 'number', min: 200, max: 1000, placeholder: 'auto' })));
  if (e.kind === 'nav') content.push(row('Brand', inputFor(p, 'brand')), row('Links (text | #section)', linesInput(p, 'links', (a) => a.map((x) => `${x.text} | ${x.href}`).join('\n'), (a) => a.map((l) => { const [text, href] = l.split('|').map((x) => x.trim()); return { text, href: href || '#' }; }))), row('Button', inputFor(p, 'cta')));
  out.push(group('Content', content));
  const style = [];
  if (!['shape', 'spacer', 'divider'].includes(e.kind)) style.push(colorFor(st, 'color', 'Text colour'));
  style.push(colorFor(st, 'bg', e.kind === 'shape' ? 'Colour' : 'Background'));
  if (['heading', 'text', 'button', 'icon', 'card', 'quote'].includes(e.kind)) style.push(row('Font size (px)', inputFor(st, 'fontSize', { type: 'number', min: 8, max: 200, placeholder: 'auto' })), row('Weight', selectFor(st, 'weight', { '': 'Default', 400: 'Regular', 600: 'Semi-bold', 700: 'Bold', 800: 'Extra bold' })), row('Font', selectFor(st, 'font', { '': 'Theme font', ...Object.fromEntries(FONTS.map((x) => [x, x])) })), row('Align', selectFor(st, 'align', { '': 'Default', left: 'Left', center: 'Center', right: 'Right' })));
  if (['image', 'video', 'shape', 'map', 'card', 'form', 'text', 'heading', 'button'].includes(e.kind)) style.push(row('Width %', inputFor(st, 'width', { type: 'range', min: 5, max: 100 })));
  if (e.kind === 'spacer') style.push(row('Height (px)', inputFor(st, 'height', { type: 'number', min: 4, max: 400 })));
  style.push(row('Corner radius', inputFor(st, 'radius', { type: 'range', min: 0, max: 60 })), row('Padding', inputFor(st, 'padding', { type: 'number', min: 0, max: 120, placeholder: 'auto' })), row('Opacity', inputFor(st, 'opacity', { type: 'range', min: 0.1, max: 1, step: 0.05 })), checkFor(st, 'shadow', 'Drop shadow'), checkFor(st, 'upper', 'UPPERCASE'), checkFor(st, 'italic', 'Italic'));
  if (sec.layout === 'split') style.push(row('Column', selectFor(st, 'col', { '': 'Auto', 0: 'Left', 1: 'Right' }, () => { if (st.col === '') delete st.col; else st.col = +st.col; })));
  if (sec.layout.startsWith('grid')) style.push(checkFor(st, 'span', 'Full width in grid'));
  out.push(group('Style', style, true));
  out.push(actionsRow());
  out.push(el('button', { class: 'btn sm', style: { width: '100%', marginTop: '8px' }, onclick: () => setRightTab('anim') }, '✨ Animate this element →'));
  return out;
}

function sectionEditor(s) {
  const st = s.style;
  const bgBtns = el('div', { class: 'bd-media-btns' },
    el('button', { class: 'btn sm primary', onclick: () => pickMedia('image/*', (a) => change(() => { st.bgImage = 'asset:' + a.id; })) }, st.bgImage ? '⬆ Replace background image' : '⬆ Background image'),
    st.bgImage ? el('button', { class: 'btn sm', onclick: () => change(() => { delete st.bgImage; }) }, 'Remove image') : null);
  return [
    el('div', { class: 'bd-title' }, `§ ${s.name} section`),
    group('Section', [
      row('Name', inputFor(s, 'name')),
      row('Layout', selectFor(s, 'layout', { stack: 'Stacked', split: 'Two columns', grid2: 'Grid — 2', grid3: 'Grid — 3', grid4: 'Grid — 4', free: 'Free canvas (drag anywhere)' }, () => { if (s.layout === 'free') s.elements.forEach((e, i) => { e.pos = e.pos || { x: 8 + (i % 3) * 30, y: 10 + Math.floor(i / 3) * 25 }; }); })),
      row('Align', selectFor(st, 'align', { '': 'Default', left: 'Left', center: 'Center' })),
    ]),
    group('Background', [colorFor(st, 'bg', 'Colour'), checkFor(st, 'bgGradient', 'Soft gradient'), checkFor(st, 'bgAlt', 'Tinted'), bgBtns, st.bgImage ? checkFor(st, 'overlay', 'Dark overlay (readable text)') : null, colorFor(st, 'color', 'Text colour')].filter(Boolean)),
    group('Spacing', [row('Vertical padding', inputFor(st, 'padY', { type: 'range', min: 0, max: 220 })), row('Min height', inputFor(st, 'minH', { type: 'number', min: 0, max: 1400, placeholder: 'auto' })), checkFor(st, 'sticky', 'Stick to top while scrolling'), checkFor(st, 'shadow', 'Shadow')], true),
    actionsRow(),
    el('div', { class: 'muted small', style: { marginTop: '8px' } }, 'Tip: with a section selected, tap any element in the left panel to add it here.'),
  ];
}

function themeEditor() {
  const t = B.site.theme;
  return [
    el('div', { class: 'bd-title' }, '🎨 Website theme'),
    el('div', { class: 'muted small', style: { marginBottom: '8px' } }, 'Tap any element or section on the page to edit it.'),
    group('Brand', [row('Website name', inputFor(B.site, 'name', { after: () => { $('#bd-name').value = B.site.name; B.site.seo = { ...B.site.seo, title: B.site.name }; } })), row('Description (for Google)', inputFor(B.site.seo = B.site.seo || {}, 'description', { type: 'textarea' }))]),
    group('Colours', [colorFor(t, 'primary', 'Main'), colorFor(t, 'accent', 'Accent'), colorFor(t, 'bg', 'Background'), colorFor(t, 'text', 'Text'),
      el('div', { class: 'bd-swatches' }, [['#2563eb', '#f59e0b', '#ffffff', '#0f172a'], ['#0d9488', '#f97316', '#f0fdfa', '#0f2e2b'], ['#7c3aed', '#22d3ee', '#0b0b12', '#f4f4f5'], ['#db2777', '#fbbf24', '#fff7fb', '#3b0a24'], ['#ef4444', '#facc15', '#0a0a0a', '#fafafa'], ['#16a34a', '#84cc16', '#f7fee7', '#14290f']].map(([a, b, c, d]) =>
        el('button', { class: 'bd-sw', title: 'Apply palette', style: { background: `linear-gradient(135deg,${a} 0 33%,${b} 33% 66%,${c} 66%)` }, onclick: () => change(() => Object.assign(t, { primary: a, accent: b, bg: c, text: d })) })))]),
    group('Typography', [row('Headings', selectFor(t, 'headingFont', Object.fromEntries(FONTS.map((x) => [x, x])))), row('Body', selectFor(t, 'font', Object.fromEntries(FONTS.map((x) => [x, x])))), row('Corner roundness', inputFor(t, 'radius', { type: 'range', min: 0, max: 40 }))]),
    group('Start over', [row('Template', selectFor({ k: B.site.kind }, 'k', Object.fromEntries(Object.entries(KINDS).map(([k, v]) => [k, `${v.emoji} ${v.label}`])), function () { /* handled below */ }))].map((g) => { const sel = g.querySelector('select'); sel.onchange = async () => { if (await confirmModal('Switch template', 'Replace the whole page with a new template? (You can undo.)', 'Replace', false)) change(() => { const n = generateSite(B.site.name, sel.value); n.name = B.site.name; B.site = n; B.project.site = n; }); }; return g; }), true),
  ];
}

function animEditor(e) {
  const a = e.anim = e.anim || {};
  const preview = () => {
    const node = B.shadow.querySelector(`[data-eid="${e.id}"]`);
    if (!node) return;
    const site = B.shadow.querySelector('.site');
    site.classList.add('playing'); node.classList.remove('in'); void node.offsetWidth;
    const t = node.querySelector('[data-typed]'); if (t) delete t.dataset.typed;
    node.classList.add('in');
    if (a.in === 'typewriter') runtime({ querySelectorAll: (q) => (q === '.a-in' ? [node] : []), querySelector: () => null }, null);
    setTimeout(() => site.classList.remove('playing'), ((a.dur || 0.8) + (a.delay || 0)) * 1000 + 600);
  };
  return [
    el('div', { class: 'bd-title' }, `✨ Animate ${kindLabel(e.kind)}`),
    group('Entrance (when it appears)', [
      el('div', { class: 'bd-chips' }, Object.entries(ENTRANCES).map(([k, l]) => el('button', { class: 'chip' + ((a.in || 'none') === k ? ' on' : ''), onclick: () => { change(() => { a.in = k; a.dur = a.dur || (k === 'typewriter' ? 2 : 0.8); }); setTimeout(preview, 60); } }, l))),
      row('Starts', selectFor(a, 'trigger', { scroll: 'When scrolled into view', load: 'As soon as page loads' })),
      row(`Duration (s)`, inputFor(a, 'dur', { type: 'range', min: 0.2, max: 4, step: 0.1 })),
      row('Delay (s)', inputFor(a, 'delay', { type: 'range', min: 0, max: 3, step: 0.05 })),
      el('button', { class: 'btn sm primary', onclick: preview }, '▶ Preview'),
    ]),
    group('Hover effect', [el('div', { class: 'bd-chips' }, Object.entries(HOVERS).map(([k, l]) => el('button', { class: 'chip' + ((a.hover || 'none') === k ? ' on' : ''), onclick: () => change(() => { a.hover = k; }) }, l)))]),
    group('Continuous (loops forever)', [el('div', { class: 'bd-chips' }, Object.entries(LOOPS).map(([k, l]) => el('button', { class: 'chip' + ((a.loop || 'none') === k ? ' on' : ''), onclick: () => change(() => { a.loop = k; }) }, l)))]),
    el('div', { class: 'muted small' }, '💡 Or just tell the 🤖 Assistant: “make this bounce”, “slower”, “spin forever”.'),
  ];
}

function sectionAnimEditor(s) {
  const a = s.anim = s.anim || {};
  return [
    el('div', { class: 'bd-title' }, `✨ Animate “${s.name}”`),
    group('Background effect', [el('div', { class: 'bd-chips' }, Object.entries(BG_EFFECTS).map(([k, l]) => el('button', { class: 'chip' + ((a.bgEffect || 'none') === k ? ' on' : ''), onclick: () => change(() => { a.bgEffect = k; if (k === 'gradient-shift' && !s.style.bg && !s.style.bgImage) s.style.bgGradient = true; }) }, l))),
      ['parallax', 'ken-burns'].includes(a.bgEffect) && !s.style.bgImage ? el('div', { class: 'muted small' }, '⚠ Add a background image in the Edit tab to see this effect.') : null].filter(Boolean)),
    group('All elements in this section', [el('div', { class: 'bd-chips' }, Object.entries(ENTRANCES).map(([k, l]) => el('button', { class: 'chip', onclick: () => change(() => s.elements.forEach((e, i) => { e.anim = { ...e.anim, in: k, dur: e.anim?.dur || 0.8, delay: Math.round(i * 0.12 * 100) / 100 }; })) }, l))),
      el('div', { class: 'muted small' }, 'Applied one-by-one (staggered).')]),
    group('3D', [checkFor(a, 'scroll3d', 'Tilt into view in 3D while scrolling')]),
    el('button', { class: 'btn sm primary', onclick: play }, '▶ Play all animations'),
  ];
}

function globalAnimEditor() {
  const presets = [
    ['✨ Smooth & elegant', () => allEls().forEach((e, i) => { e.anim = { ...e.anim, in: 'fade-up', dur: 0.9, delay: (i % 4) * 0.1 }; })],
    ['🎉 Fun & bouncy', () => allEls().forEach((e, i) => { e.anim = { ...e.anim, in: 'bounce-in', dur: 0.9, delay: (i % 4) * 0.1, hover: e.kind === 'button' || e.kind === 'card' ? 'grow' : e.anim?.hover }; })],
    ['🚀 Bold & dramatic', () => { allEls().forEach((e, i) => { e.anim = { ...e.anim, in: i % 2 ? 'from-right' : 'from-left', dur: 1, delay: (i % 3) * 0.12 }; }); B.site.sections.forEach((s) => { if (s.type === 'hero' || s.type === 'cta') s.anim = { ...s.anim, bgEffect: 'gradient-shift' }; }); }],
    ['🧊 Full 3D experience', () => make3D(B.site)],
    ['🍃 Minimal (fade only)', () => allEls().forEach((e) => { e.anim = { in: 'fade', dur: 0.8 }; })],
    ['🚫 No animation', () => { allEls().forEach((e) => { e.anim = {}; }); B.site.sections.forEach((s) => { s.anim = {}; }); }],
  ];
  return [
    el('div', { class: 'bd-title' }, '✨ Animation presets'),
    el('div', { class: 'muted small', style: { marginBottom: '8px' } }, 'Apply a style to the whole website, or select something on the page to animate it individually.'),
    ...presets.map(([l, fn]) => el('button', { class: 'btn', style: { width: '100%', marginBottom: '6px', justifyContent: 'flex-start' }, onclick: () => { change(fn); setTimeout(play, 80); } }, l)),
    el('button', { class: 'btn primary', style: { width: '100%', marginTop: '6px' }, onclick: play }, '▶ Play animations'),
  ];
}

function group(title, children, collapsed) {
  return el('details', { class: 'bd-group', open: !collapsed || innerWidth > 1200 }, el('summary', {}, title), el('div', { class: 'bd-gbody' }, children));
}
function actionsRow() {
  return el('div', { class: 'bd-actions' },
    el('button', { class: 'btn sm', onclick: () => moveSelected(-1) }, '▲ Up'), el('button', { class: 'btn sm', onclick: () => moveSelected(1) }, '▼ Down'),
    el('button', { class: 'btn sm', onclick: duplicateSelected }, '⧉ Copy'), el('button', { class: 'btn sm danger', onclick: deleteSelected }, '🗑'));
}

// ------------------------------------------------------------------ chat assistant
function renderChat() {
  const box = $('#bd-msgs'); box.innerHTML = '';
  for (const m of B.chat) box.append(el('div', { class: 'msg ' + (m.role === 'user' ? 'user' : 'ai'), html: m.role === 'user' ? esc(m.text) : renderMarkdown(m.text) }));
  box.scrollTop = box.scrollHeight;
}
function botSay(text) { B.chat.push({ role: 'bot', text }); renderChat(); saveSoon(); }

async function chatSend(text) {
  text = text.trim(); if (!text || B.busy) return;
  B.chat.push({ role: 'user', text }); renderChat();
  const low = text.toLowerCase();
  if (/^(undo|go back|revert)\b/.test(low)) { undo(); return botSay('↩️ Undone.'); }
  if (/^redo\b/.test(low)) { redo(); return botSay('↪️ Redone.'); }
  if (/^(play|preview|show me)\b/.test(low)) { play(); return botSay('▶ Playing animations.'); }
  const before = JSON.stringify(B.site);
  const work = JSON.parse(before);
  let r = runCommand(work, text, { selectedId: B.selected });
  const replies = [];
  let selId = r.select;
  if (r.reply === null) {
    // try multiple commands joined with "and" / "then" / commas
    const parts = text.split(/\s*(?:,|;|\band then\b|\bthen\b|\band also\b|\band\b)\s*/i).filter((x) => x.length > 2);
    if (parts.length > 1) {
      const w2 = JSON.parse(before); const rs = parts.map((p) => runCommand(w2, p, { selectedId: B.selected }));
      if (rs.every((x) => x.reply !== null)) { r = { changed: rs.some((x) => x.changed), reply: rs.map((x) => x.reply).join('\n') }; Object.assign(work, w2); selId = rs.map((x) => x.select).filter(Boolean).pop(); }
    }
  }
  if (r.reply !== null) {
    if (r.changed) { B.hist.push(before); B.future = []; B.site = work; B.project.site = work; if (selId) B.selected = selId; commit(); updateUndo(); setTimeout(() => { if (selId) selectAndScroll(selId); play(true); }, 120); }
    replies.push(r.reply);
    return botSay(replies.join('\n'));
  }
  // not understood offline → AI if connected
  if (B.deps.aiReady()) return aiEdit(text);
  botSay(`🤔 I didn't understand that one yet. Try commands like:\n• *animate the gallery with zoom*\n• *make the hero background dark blue*\n• *change title to "Your text"*\n\nType **help** for the full list — or tap ⚙ **Connect AI** (Claude, ChatGPT, Gemini, Groq…) so you can ask for anything in your own words.`);
}
function selectAndScroll(id) { select(id, { scroll: true }); }

async function aiEdit(text) {
  B.busy = true;
  const bubble = el('div', { class: 'msg ai typing' }, '🤖 Thinking…'); $('#bd-msgs').append(bubble);
  try {
    const sys = `You are the design assistant of a visual website builder. The website is a JSON document.
Schema: { name, kind, theme:{primary,accent,bg,text,font,headingFont,radius}, seo:{title,description}, sections:[{id,type,name,layout:'stack'|'split'|'grid2'|'grid3'|'grid4'|'free',style:{bg,color,padY,minH,align,bgImage,bgGradient,bgAlt,overlay,sticky,shadow},anim:{bgEffect:'none'|'gradient-shift'|'parallax'|'ken-burns'|'bubbles'|'3d-grid',scroll3d:boolean},elements:[{id,kind:'heading'|'text'|'button'|'image'|'video'|'card'|'icon'|'shape'|'quote'|'price'|'stats'|'form'|'social'|'divider'|'spacer'|'map'|'nav'|'model3d' (props:{src: .glb url or "",emoji,autoRotate,ar}),props:{...},style:{color,bg,fontSize,weight,font,align,radius,padding,width,opacity,shadow,upper,col,span},anim:{in:${Object.keys(ENTRANCES).map((x) => `'${x}'`).join('|')},dur,delay,trigger:'scroll'|'load',hover:${Object.keys(HOVERS).map((x) => `'${x}'`).join('|')},loop:${Object.keys(LOOPS).map((x) => `'${x}'`).join('|')}},pos:{x,y} (free layout only, percent)}]}]}
Keep existing ids and "asset:" image/video sources unchanged. New ids: any unique string. Fonts must be Google Fonts.
Reply with ONE short sentence describing the change, then the COMPLETE updated JSON in a \`\`\`json code block.`;
    const reply = await B.deps.chat([{ role: 'user', content: `Current website JSON:\n\`\`\`json\n${JSON.stringify(B.site)}\n\`\`\`\nSelected id: ${B.selected || 'none'}\n\nRequest: ${text}` }], { system: sys, onToken: (t) => { bubble.textContent = '🤖 ' + t.split('```')[0].slice(0, 300); } });
    const m = reply.match(/```(?:json)?\s*([\s\S]*?)```/);
    const json = JSON.parse(m ? m[1] : reply);
    if (!json || !Array.isArray(json.sections)) throw new Error('The AI returned an unexpected format.');
    bubble.remove();
    change(() => { B.site = json; B.project.site = json; });
    setTimeout(() => play(true), 100);
    botSay('✅ ' + (reply.split('```')[0].trim() || 'Done.'));
  } catch (e) { bubble.remove(); botSay('⚠ ' + e.message); } finally { B.busy = false; }
}

// ------------------------------------------------------------------ export / publish
async function collectMedia(mode) {
  // mode: 'dataurl' (inline everything) or 'files' (assets/ folder)
  const map = {}; const files = {};
  const srcs = new Set();
  const walk = (o) => { if (!o || typeof o !== 'object') return; for (const v of Object.values(o)) { if (typeof v === 'string' && v.startsWith('asset:')) srcs.add(v); else walk(v); } };
  walk(B.site);
  for (const src of srcs) {
    const a = await getAsset(src.slice(6));
    if (!a) continue;
    if (mode === 'dataurl') map[src] = await blobToDataURL(a.blob);
    else { const path = `assets/${a.id}.${extFor(a.type)}`; map[src] = path; files[path] = a.blob; }
  }
  return { resolve: (s) => (s && s.startsWith('asset:') ? map[s] || '' : s), files };
}

async function siteFiles(mode) {
  const { resolve, files } = await collectMedia(mode);
  const d = exportDocument(B.site, resolve);
  return { 'index.html': d.html, 'style.css': d.css, 'script.js': d.js, ...files };
}

async function previewFull() {
  const d = exportDocument(B.site, resolveSrc);
  const html = d.html.replace('<link rel="stylesheet" href="style.css">', `<style>${d.css}</style>`).replace('<script src="script.js"></script>', `<script>${d.js}<\/script>`);
  const frame = el('iframe', { class: 'bd-preview-frame', title: 'Preview' });
  const close = el('button', { class: 'btn bd-preview-close', onclick: () => wrap.remove() }, '✕ Close preview');
  const wrap = el('div', { class: 'bd-preview' }, frame, close);
  document.body.append(wrap);
  frame.srcdoc = html;
}

async function publishModal() {
  let closeIt;
  const opt = (icon, title, desc, fn, primary) => el('button', { class: 'tpl', style: { width: '100%' }, onclick: async () => { closeIt(); await fn(); } }, el('span', { class: 'ico', style: { background: primary ? '#0079f233' : '#ffffff11' } }, icon), el('span', {}, el('b', {}, title), el('small', {}, desc)));
  const body = el('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px' } },
    opt('👁', 'Preview full screen', 'See the real website with all animations', previewFull, true),
    opt('🌍', 'Publish to GitHub Pages', 'Free hosting at username.github.io/your-site', () => B.deps.publishGitHub(B.site.name, siteFiles('files')), true),
    opt('</>', 'Open in code editor', 'Edit the generated HTML/CSS/JS, add features, run tests', async () => B.deps.openAsCode(B.site.name, await siteFiles('dataurl'))),
    opt('⤓', 'Download .zip', 'index.html + style.css + script.js + your media', downloadZip),
    opt('📄', 'Download single HTML file', 'Everything in one file (media embedded)', async () => { const f = await siteFiles('dataurl'); download(`${slug()}.html`, f['index.html'].replace('<link rel="stylesheet" href="style.css">', `<style>${f['style.css']}</style>`).replace('<script src="script.js"></script>', `<script>${f['script.js']}<\/script>`), 'text/html'); }),
  );
  const p = modal({ title: '🚀 Publish your website', body, buttons: [{ label: 'Close', value: null }] });
  closeIt = () => { const r = $('#modal-root').lastChild; if (r) r.remove(); };
  return p;
}
const slug = () => B.site.name.toLowerCase().replace(/[^\w]+/g, '-').replace(/^-|-$/g, '') || 'website';
async function downloadZip() {
  if (!window.JSZip) return toast('ZIP library not loaded', 'err');
  const f = await siteFiles('files');
  const zip = new window.JSZip();
  for (const [k, v] of Object.entries(f)) zip.file(`${slug()}/${k}`, v);
  download(`${slug()}.zip`, await zip.generateAsync({ type: 'blob' }));
}

// ------------------------------------------------------------------ layout / bindings
function setMobilePanel(which) {
  const bd = $('#builder');
  bd.dataset.panel = which || '';
  $$('#bd-mnav button').forEach((b) => b.classList.toggle('active', b.dataset.p === (which === 'right' ? 'r-' + B.rightTab : which === 'left' ? 'l-' + B.leftTab : 'canvas')));
  setTimeout(placeToolbar, 60);
}

function bindOnce() {
  if (B.bound) return;
  B.bound = true;
  $('#bd-back').onclick = () => { save(); location.hash = ''; };
  $('#bd-name').onchange = (e) => change(() => { B.site.name = e.target.value.trim() || 'My Website'; });
  $$('#bd-devices button').forEach((b) => { b.onclick = () => setDevice(b.dataset.d); });
  $('#bd-undo').onclick = undo; $('#bd-redo').onclick = redo;
  $('#bd-play').onclick = () => play();
  $('#bd-preview').onclick = previewFull;
  $('#bd-publish').onclick = publishModal;
  $('#bd-code').onclick = async () => B.deps.openAsCode(B.site.name, await siteFiles('dataurl'));
  $('#bd-ai').onclick = () => B.deps.connectAI();
  $$('#bd-ltabs button').forEach((b) => { b.onclick = () => setLeftTab(b.dataset.t); });
  $$('#bd-rtabs button').forEach((b) => { b.onclick = () => setRightTab(b.dataset.t); });
  $('#bd-chat-form').onsubmit = (e) => { e.preventDefault(); const t = $('#bd-chat-text'); chatSend(t.value); t.value = ''; };
  $('#bd-chat-text').onkeydown = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('#bd-chat-form').requestSubmit(); } };
  $$('#bd-chips .chip').forEach((c) => { c.onclick = () => chatSend(c.dataset.q || c.textContent); });
  $('#bd-tools').addEventListener('click', (e) => {
    const a = e.target.closest('button'); if (!a) return;
    ({ up: () => moveSelected(-1), down: () => moveSelected(1), dup: duplicateSelected, del: deleteSelected, edit: () => setRightTab('edit'), anim: () => setRightTab('anim'), media: () => { setLeftTab('media'); setMobilePanel('left'); } })[a.dataset.a]?.();
  });
  $('#bd-canvas').addEventListener('scroll', () => placeToolbar(), { passive: true });
  window.addEventListener('resize', debounce(placeToolbar, 100));
  $$('#bd-mnav button').forEach((b) => {
    b.onclick = () => {
      const [side, tab] = b.dataset.p.split('-');
      if (b.dataset.p === 'canvas') return setMobilePanel(null);
      if (side === 'l') { B.leftTab = tab; renderLeft(); setMobilePanel('left'); } else { B.rightTab = tab; renderRight(); setMobilePanel('right'); }
    };
  });
  $('#bd-scrim').onclick = () => setMobilePanel(null);
  document.addEventListener('keydown', (e) => {
    if ($('#builder').hidden) return;
    const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName) || B.shadow?.activeElement?.isContentEditable;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); }
    else if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); }
    else if (!typing && (e.key === 'Delete' || e.key === 'Backspace') && B.selected) { e.preventDefault(); deleteSelected(); }
    else if (!typing && e.key === 'Escape') select(null);
    else if (mod && e.key.toLowerCase() === 'd' && B.selected) { e.preventDefault(); duplicateSelected(); }
  });
  // drag & drop files from Files / Finder onto the canvas
  $('#bd-canvas').addEventListener('dragover', (e) => e.preventDefault());
  $('#bd-canvas').addEventListener('drop', (e) => { e.preventDefault(); if (e.dataTransfer.files.length) uploadFiles(e.dataTransfer.files, (a) => useAsset(a)); });
}

// for tests
window.devEngineBuilder = { B, chatSend, select, play, undo, siteFiles };
