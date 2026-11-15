// Renders a builder site (JSON) to HTML/CSS/JS — used by the editor canvas and for export.

export const ENTRANCES = {
  none: 'None', fade: 'Fade in', 'fade-up': 'Slide up', 'fade-down': 'Slide down', 'from-left': 'From left', 'from-right': 'From right',
  'zoom-in': 'Zoom in', 'zoom-out': 'Zoom out', flip: 'Flip', 'bounce-in': 'Bounce in', 'rotate-in': 'Rotate in', 'blur-in': 'Blur in', typewriter: 'Typewriter', 'flip-3d': '3D flip', 'rise-3d': '3D rise',
};
export const HOVERS = { none: 'None', grow: 'Grow', lift: 'Lift', glow: 'Glow', tilt: 'Tilt', tilt3d: '3D tilt (follows finger)', shake: 'Shake', shrink: 'Shrink' };
export const LOOPS = { none: 'None', pulse: 'Pulse', float: 'Float', spin: 'Spin', wiggle: 'Wiggle', bounce: 'Bounce', heartbeat: 'Heartbeat', glow: 'Glow pulse' };
export const BG_EFFECTS = { none: 'None', 'gradient-shift': 'Moving gradient', parallax: 'Parallax image', 'ken-burns': 'Slow zoom image', bubbles: 'Floating bubbles', '3d-grid': '3D grid floor' };
export const MODEL_VIEWER_URL = 'https://cdn.jsdelivr.net/npm/@google/model-viewer@4.4.0/dist/model-viewer.min.js';
export const uses3DModel = (site) => site.sections.some((s) => s.elements.some((e) => e.kind === 'model3d' && e.props.src));

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const txt = (s) => esc(s).replace(/\n/g, '<br>');
const ANCHOR = { navbar: 'top', hero: 'hero', features: 'services', about: 'about', gallery: 'gallery', video: 'video', testimonials: 'testimonials', pricing: 'pricing', cta: 'cta', contact: 'contact', footer: 'footer', free: 'canvas' };

export function fontsUrl(site) {
  const fams = [...new Set([site.theme.font, site.theme.headingFont, ...site.sections.flatMap((s) => s.elements.map((e) => e.style && e.style.font))].filter(Boolean))];
  if (!fams.length) return '';
  return 'https://fonts.googleapis.com/css2?' + fams.map((f) => `family=${encodeURIComponent(f).replace(/%20/g, '+')}:wght@400;600;700;800`).join('&') + '&display=swap';
}

function isYouTube(u) { return /youtu\.?be/.test(u || ''); }
function ytEmbed(u) {
  const m = String(u).match(/(?:v=|youtu\.be\/|embed\/|shorts\/)([\w-]{6,})/);
  return m ? `https://www.youtube.com/embed/${m[1]}?autoplay=1&mute=1&loop=1&playlist=${m[1]}&rel=0` : u;
}

/**
 * opts: { mode: 'editor'|'export', resolve(src) -> url, selected: id }
 * returns { body, css, js, fonts }
 */
export function renderSite(site, opts = {}) {
  const mode = opts.mode || 'export';
  const resolve = opts.resolve || ((s) => s);
  const U = mode === 'export' ? 'vw' : 'cqi';
  const fs = (px) => (px > 22 ? `clamp(${Math.round(px * 0.55)}px, ${(px / 13).toFixed(2)}${U}, ${px}px)` : `${px}px`);
  const ed = mode === 'editor';

  function innerStyle(st = {}, kind) {
    const s = [];
    if (st.color) s.push(`color:${st.color}`);
    if (st.bg && kind !== 'shape') s.push(`background:${st.bg}`);
    if (st.fontSize) s.push(`font-size:${fs(+st.fontSize)}`);
    if (st.weight) s.push(`font-weight:${st.weight}`);
    if (st.font) s.push(`font-family:'${st.font}',sans-serif`);
    if (st.align) s.push(`text-align:${st.align}`);
    if (st.radius != null && st.radius !== '') s.push(`border-radius:${st.radius}px`);
    if (st.padding) s.push(`padding:${st.padding}px`);
    if (st.opacity != null && st.opacity !== '') s.push(`opacity:${st.opacity}`);
    if (st.letterSpacing) s.push(`letter-spacing:${st.letterSpacing}px`);
    if (st.lineHeight) s.push(`line-height:${st.lineHeight}`);
    if (st.upper) s.push('text-transform:uppercase');
    if (st.italic) s.push('font-style:italic');
    if (st.shadow) s.push('box-shadow:0 20px 50px -12px rgba(0,0,0,.35)');
    if (st.border) s.push(`border:2px solid ${st.border}`);
    if (kind === 'spacer') s.push(`height:${st.height || 40}px`);
    if (kind === 'shape') s.push(`background:${st.bg || 'var(--accent)'}`);
    return s.join(';');
  }

  function elementInner(e) {
    const p = e.props || {}; const st = e.style || {};
    const a = e.anim || {};
    const cls = ['x', `k-${e.kind}`, a.hover && a.hover !== 'none' ? 'h-' + a.hover : '', a.loop && a.loop !== 'none' ? 'l-' + a.loop : ''].filter(Boolean).join(' ');
    const style = innerStyle(st, e.kind);
    const attr = `class="${cls}"${style ? ` style="${esc(style)}"` : ''}`;
    switch (e.kind) {
      case 'heading': { const l = Math.min(4, Math.max(1, p.level || 2)); return `<h${l} ${attr} data-edit="text">${txt(p.text)}</h${l}>`; }
      case 'text': return `<p ${attr} data-edit="text">${txt(p.text)}</p>`;
      case 'button': return `<a ${attr.replace('class="', `class="btn btn-${p.variant || 'solid'} `)} href="${esc(p.href || '#')}"${/^https?:/.test(p.href || '') ? ' target="_blank" rel="noopener"' : ''} data-edit="text">${esc(p.text)}</a>`;
      case 'image': {
        const src = resolve(p.src);
        if (!src) return ed ? `<div ${attr.replace('class="', 'class="ph ')}>📷<span>Tap, then “Replace image”</span></div>` : '';
        return `<img ${attr} src="${esc(src)}" alt="${esc(p.alt || '')}" loading="lazy">`;
      }
      case 'video': {
        if (isYouTube(p.src)) return `<div ${attr.replace('class="', 'class="vwrap ')}><iframe src="${esc(ytEmbed(p.src))}" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe></div>`;
        const src = resolve(p.src);
        if (!src) return ed ? `<div ${attr.replace('class="', 'class="ph ')}>🎬<span>Tap, then “Replace video”</span></div>` : '';
        return `<video ${attr} src="${esc(src)}" ${p.controls ? 'controls' : ''} autoplay muted loop playsinline${p.poster ? ` poster="${esc(resolve(p.poster))}"` : ''}></video>`;
      }
      case 'card': {
        const img = resolve(p.img);
        return `<div ${attr}>${img ? `<img src="${esc(img)}" alt="" class="card-img">` : `<div class="card-ic">${esc(p.icon || '✨')}</div>`}<h3 data-edit="title">${txt(p.title)}</h3><p data-edit="text">${txt(p.text)}</p></div>`;
      }
      case 'icon': return `<div ${attr} data-edit="text">${esc(p.text)}</div>`;
      case 'shape': return `<div ${attr.replace('class="', `class="shape-${p.shape || 'circle'} `)}></div>`;
      case 'quote': return `<figure ${attr}><div class="stars">${'★'.repeat(p.rating || 5)}</div><blockquote data-edit="text">${txt(p.text)}</blockquote><figcaption data-edit="author">— ${esc(p.author)}</figcaption></figure>`;
      case 'price': return `<div ${attr.replace('class="', `class="${p.featured ? 'featured ' : ''}`)}><h3>${esc(p.name)}</h3><div class="amt">${esc(p.price)}<small>${esc(p.per || '')}</small></div><ul>${(p.features || []).map((f) => `<li>✓ ${esc(f)}</li>`).join('')}</ul><a class="btn btn-${p.featured ? 'solid' : 'outline'}" href="#contact">${esc(p.cta || 'Choose')}</a></div>`;
      case 'stats': return `<div ${attr}>${(p.items || []).map(([v, l]) => `<div><b>${esc(v)}</b><span>${esc(l)}</span></div>`).join('')}</div>`;
      case 'form': return `<form ${attr} data-email="${esc(p.email || '')}">${(p.fields || []).map((f) => (/message|note|comment/i.test(f) ? `<textarea placeholder="${esc(f)}" name="${esc(f)}" rows="4"></textarea>` : `<input placeholder="${esc(f)}" name="${esc(f)}">`)).join('')}<button class="btn btn-solid" type="submit">${esc(p.button || 'Send')}</button><p class="thanks" hidden>✅ Thank you! We will get back to you soon.</p></form>`;
      case 'social': return `<div ${attr}>${(p.links || []).map((l) => `<a href="${esc(l.href || '#')}" target="_blank" rel="noopener">${esc(l.icon)}</a>`).join('')}</div>`;
      case 'divider': return `<hr ${attr}>`;
      case 'spacer': return `<div ${attr}></div>`;
      case 'model3d': {
        const src = resolve(p.src);
        if (src) return `<model-viewer ${attr} src="${esc(src)}" alt="${esc(p.alt || '3D model')}"${p.autoRotate !== false ? ' auto-rotate' : ''}${ed ? '' : ' camera-controls touch-action="pan-y"'}${p.ar !== false && !ed ? ' ar ar-modes="webxr scene-viewer quick-look"' : ''} shadow-intensity="1" exposure="1.1" interaction-prompt="none"></model-viewer>`;
        const layers = Array.from({ length: 10 }, (_, i) => `<i style="transform:translateZ(${(i - 5) * 2}px)"></i>`).join('');
        return `<div ${attr.replace('class="', 'class="css3d ')}><div class="stage3d${p.autoRotate !== false ? ' spinning' : ''}"><div class="coin">${layers}<b class="f">${esc(p.emoji || '⭐')}</b><b class="bk">${esc(p.emoji || '⭐')}</b></div><div class="shadow3d"></div></div>${ed ? '<span class="hint3d">Tap → Edit → Upload a .glb 3D model</span>' : ''}</div>`;
      }
      case 'map': return `<div ${attr.replace('class="', 'class="vwrap ')}><iframe loading="lazy" src="https://maps.google.com/maps?q=${encodeURIComponent(p.query || '')}&output=embed"></iframe></div>`;
      case 'nav': return `<nav ${attr}><a class="brand" href="#hero" data-edit="brand">${esc(p.brand)}</a><div class="links">${(p.links || []).map((l) => `<a href="${esc(l.href)}">${esc(l.text)}</a>`).join('')}</div>${p.cta ? `<a class="btn btn-solid" href="${esc(p.ctaHref || '#contact')}">${esc(p.cta)}</a>` : ''}<button class="burger" aria-label="Menu">☰</button></nav>`;
      default: return `<div ${attr}>${esc(p.text || '')}</div>`;
    }
  }

  function elementHTML(e, sec) {
    const a = e.anim || {}; const st = e.style || {};
    const w = [];
    if (sec.layout === 'free' && e.pos) w.push(`left:${e.pos.x}%`, `top:${e.pos.y}%`);
    if (st.width && ['image', 'video', 'shape', 'map', 'button', 'card', 'form', 'text', 'heading'].includes(e.kind)) w.push(`width:${st.width}%`);
    if (sec.layout === 'split' && st.col != null) w.push(`grid-column:${+st.col + 1}`);
    if (st.span) w.push('grid-column:1/-1');
    if (st.align === 'center' && st.width) w.push('margin-left:auto;margin-right:auto');
    const anim = a.in && a.in !== 'none';
    if (anim) w.push(`--d:${a.dur || 0.8}s`, `--dl:${a.delay || 0}s`);
    const cls = ['el', `w-${e.kind}`, anim ? 'a-in' : '', ed && opts.selected === e.id ? 'sel' : ''].filter(Boolean).join(' ');
    return `<div class="${cls}" data-eid="${e.id}"${anim ? ` data-in="${a.in}" data-trigger="${a.trigger || 'scroll'}"` : ''}${w.length ? ` style="${esc(w.join(';'))}"` : ''}>${elementInner(e)}${ed && opts.selected === e.id && sec.layout === 'free' ? '<i class="rz" data-resize="1"></i>' : ''}</div>`;
  }

  function sectionHTML(s, idx, seen) {
    const st = s.style || {}; const fx = (s.anim && s.anim.bgEffect) || 'none';
    const css = [];
    const bgImg = resolve(st.bgImage);
    if (st.bg) css.push(`background-color:${st.bg}`);
    else if (st.bgAlt) css.push('background-color:var(--bg-alt)');
    if (st.bgGradient && !bgImg) css.push('background-image:linear-gradient(135deg,color-mix(in srgb,var(--primary) 16%,var(--bg)) 0%,var(--bg) 45%,color-mix(in srgb,var(--accent) 18%,var(--bg)) 100%)');
    if (bgImg && fx !== 'ken-burns') css.push(`background-image:${st.overlay !== false ? 'linear-gradient(rgba(0,0,0,.45),rgba(0,0,0,.45)),' : ''}url('${bgImg}')`, 'background-size:cover', 'background-position:center');
    if (st.color) css.push(`color:${st.color}`);
    else if (bgImg) css.push('color:#fff');
    if (st.padY != null) css.push(`padding-top:${st.padY}px;padding-bottom:${st.padY}px`);
    if (st.minH) css.push(`min-height:${st.minH}px`);
    if (st.align) css.push(`text-align:${st.align}`);
    const anchor = ANCHOR[s.type] && !seen.has(ANCHOR[s.type]) ? ANCHOR[s.type] : s.id;
    seen.add(anchor);
    const cls = ['sec', `t-${s.type}`, `lay-${s.layout}`, s.anim && s.anim.scroll3d ? 'sc-3d' : '', st.sticky ? 'sticky' : '', st.shadow ? 'shadowed' : '', fx !== 'none' ? 'fx-' + fx : '', ed && opts.selected === s.id ? 'sel-sec' : '', st.align === 'center' ? 'center' : ''].filter(Boolean).join(' ');
    let fxLayer = '';
    if (fx === 'ken-burns' && bgImg) fxLayer = `<div class="kb" style="background-image:url('${bgImg}')"></div><div class="kb-ov"></div>`;
    if (fx === '3d-grid') fxLayer = '<div class="grid3d"></div>';
    if (fx === 'bubbles') fxLayer = `<div class="bubbles">${Array.from({ length: 10 }, (_, i) => `<span style="left:${(i * 37) % 100}%;--s:${20 + ((i * 13) % 50)}px;--t:${8 + (i % 5) * 3}s;--dl:${-i * 1.7}s"></span>`).join('')}</div>`;
    // group consecutive buttons into a row
    let inner = ''; let row = [];
    const flush = () => { if (row.length) { inner += `<div class="btnrow"${row[0].style && row[0].style.col != null && s.layout === 'split' ? ` style="grid-column:${+row[0].style.col + 1}"` : ''}>${row.map((e) => elementHTML(e, s)).join('')}</div>`; row = []; } };
    for (const e of s.elements) {
      if (e.kind === 'button' && s.layout !== 'free') row.push(e);
      else { flush(); inner += elementHTML(e, s); }
    }
    flush();
    if (s.layout === 'split') {
      const cols = [[], []];
      const colOf = (e) => (e.style && e.style.col != null ? +e.style.col : (['image', 'video', 'icon', 'form', 'map', 'shape'].includes(e.kind) ? 1 : 0));
      for (const e of s.elements) cols[colOf(e) ? 1 : 0].push(e);
      const flat = { ...s, layout: 'stack' };
      const renderCol = (list) => {
        let out = ''; let r = [];
        const fl = () => { if (r.length) { out += `<div class="btnrow">${r.map((e) => elementHTML(e, flat)).join('')}</div>`; r = []; } };
        for (const e of list) { if (e.kind === 'button') r.push(e); else { fl(); out += elementHTML(e, flat); } }
        fl();
        return out;
      };
      inner = `<div class="col">${renderCol(cols[0])}</div><div class="col">${renderCol(cols[1])}</div>`;
    }
    return `<section id="${anchor}" class="${cls}" data-sid="${s.id}"${css.length ? ` style="${esc(css.join(';'))}"` : ''}>${fxLayer}<div class="wrap">${inner || (ed ? '<div class="empty-sec">Empty section — add elements from the left panel</div>' : '')}</div></section>`;
  }

  const seen = new Set();
  const body = site.sections.map((s, i) => sectionHTML(s, i, seen)).join('\n');
  const t = site.theme;
  const dark = isDark(t.bg);
  let css = `:root,.site{--primary:${t.primary};--accent:${t.accent};--bg:${t.bg};--text:${t.text};--radius:${t.radius ?? 12}px;--font:'${t.font}',system-ui,sans-serif;--hfont:'${t.headingFont || t.font}',system-ui,sans-serif;--bg-alt:color-mix(in srgb,var(--primary) ${dark ? 10 : 5}%,var(--bg));--card:${dark ? 'rgba(255,255,255,.06)' : '#ffffff'};--line:${dark ? 'rgba(255,255,255,.12)' : 'rgba(0,0,0,.08)'}}
${BASE_CSS}`;
  if (mode === 'export') css = css.replace(/@container\s*\(/g, '@media (').replace(/\.site\{container-type:inline-size;?/g, '.site{');
  return { body: `<div class="site${ed ? ' editing' : ''}">${body}</div>`, css, js: `(${runtime.toString()})(document);`, fonts: fontsUrl(site), needs3d: uses3DModel(site) };
}

export function isDark(hex) {
  const m = String(hex || '').replace('#', '').match(/^([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i);
  if (!m) return false;
  const [r, g, b] = m.slice(1).map((x) => parseInt(x, 16));
  return (r * 299 + g * 587 + b * 114) / 1000 < 128;
}

/** Full standalone HTML document. */
export function exportDocument(site, resolve) {
  const r = renderSite(site, { mode: 'export', resolve });
  return {
    html: `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(site.seo?.title || site.name)}</title>
<meta name="description" content="${esc(site.seo?.description || '')}">
${r.fonts ? `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n<link rel="stylesheet" href="${r.fonts}">` : ''}
<link rel="stylesheet" href="style.css">
${r.needs3d ? `<script type="module" src="${MODEL_VIEWER_URL}"></script>\n` : ''}</head>
<body>
${r.body}
<script src="script.js"></script>
</body>
</html>
`,
    css: r.css,
    js: r.js + '\n',
  };
}

/** Animation + interaction runtime (serialised into script.js and run in the editor preview). */
export function runtime(doc, scrollRoot) {
  const root = doc.querySelector ? doc : document;
  const typeIt = (el) => {
    if (el.dataset.in !== 'typewriter') return;
    const t = el.querySelector('[data-edit="text"]') || el.firstElementChild;
    if (!t || t.dataset.typed) return;
    const full = t.textContent; t.dataset.typed = '1'; t.textContent = '';
    let i = 0; const step = Math.max(15, (parseFloat(getComputedStyle(el).getPropertyValue('--d')) || 1) * 1000 / Math.max(full.length, 1));
    setTimeout(function tick() { t.textContent = full.slice(0, ++i); if (i < full.length) setTimeout(tick, step); }, (parseFloat(getComputedStyle(el).getPropertyValue('--dl')) || 0) * 1000);
  };
  const show = (el) => { el.classList.add('in'); typeIt(el); };
  const els = root.querySelectorAll('.a-in');
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { show(e.target); io.unobserve(e.target); } }), { root: scrollRoot || null, threshold: 0.12 });
    els.forEach((el) => (el.dataset.trigger === 'load' ? requestAnimationFrame(() => show(el)) : io.observe(el)));
  } else els.forEach(show);
  root.querySelectorAll('.burger').forEach((b) => b.addEventListener('click', () => b.closest('nav').classList.toggle('open')));
  root.querySelectorAll('nav .links a').forEach((a) => a.addEventListener('click', () => a.closest('nav').classList.remove('open')));
  root.querySelectorAll('form.k-form').forEach((f) => f.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const to = f.dataset.email;
    if (to) {
      const body = [...f.elements].filter((x) => x.name).map((x) => `${x.name}: ${x.value}`).join('\n');
      window.location.href = `mailto:${to}?subject=${encodeURIComponent('Website enquiry')}&body=${encodeURIComponent(body)}`;
    }
    f.querySelector('.thanks').hidden = false; f.reset();
  }));
  // 3D tilt that follows the pointer / finger
  root.querySelectorAll('.h-tilt3d').forEach((el) => {
    const move = (e) => { const r = el.getBoundingClientRect(); const x = (e.clientX - r.left) / r.width - 0.5; const y = (e.clientY - r.top) / r.height - 0.5; el.style.transform = `perspective(700px) rotateY(${x * 18}deg) rotateX(${-y * 18}deg) translateZ(12px)`; };
    el.addEventListener('pointermove', move); el.addEventListener('pointerleave', () => { el.style.transform = ''; });
  });
  // scroll-driven 3D sections
  const sc3d = root.querySelectorAll('.sc-3d');
  if (sc3d.length) {
    const sr = scrollRoot || window;
    const upd = () => {
      const top0 = scrollRoot ? scrollRoot.getBoundingClientRect().top : 0;
      const vh = scrollRoot ? scrollRoot.clientHeight : window.innerHeight;
      sc3d.forEach((s) => { const t = s.getBoundingClientRect().top - top0; const p = Math.max(0, Math.min(1, (vh - t) / (vh * 0.55))); s.style.setProperty('--p', p.toFixed(3)); });
    };
    sr.addEventListener('scroll', upd, { passive: true }); upd();
  }
  const parallax = root.querySelectorAll('.fx-parallax');
  if (parallax.length) {
    const sc = scrollRoot || window;
    const on = () => parallax.forEach((s) => { const r = s.getBoundingClientRect(); s.style.backgroundPositionY = `calc(50% + ${Math.round(r.top * -0.3)}px)`; });
    sc.addEventListener('scroll', on, { passive: true }); on();
  }
}

const BASE_CSS = `*{box-sizing:border-box}
.site{container-type:inline-size;margin:0;background:var(--bg);color:var(--text);font-family:var(--font);line-height:1.6;overflow-x:hidden;-webkit-font-smoothing:antialiased}
html{scroll-behavior:smooth}body{margin:0}
.site h1,.site h2,.site h3,.site h4{font-family:var(--hfont);line-height:1.15;margin:0 0 .5em}
.site h1{font-size:clamp(34px,6cqi,60px)}.site h2{font-size:clamp(28px,4.4cqi,44px)}.site h3{font-size:20px}
.site p{margin:0 0 1em}.site a{color:inherit}
.sec{position:relative;padding:80px 0;overflow:hidden}
.sec .wrap{position:relative;z-index:1;max-width:1140px;margin:0 auto;padding:0 24px}
.sec.center .wrap{text-align:center}.sec.center .btnrow{justify-content:center}
.lay-grid2 .wrap,.lay-grid3 .wrap,.lay-grid4 .wrap{display:grid;gap:24px;align-items:stretch}
.lay-grid2 .wrap{grid-template-columns:repeat(2,1fr)}.lay-grid3 .wrap{grid-template-columns:repeat(3,1fr)}.lay-grid4 .wrap{grid-template-columns:repeat(4,1fr)}
.lay-grid2 .w-heading,.lay-grid3 .w-heading,.lay-grid4 .w-heading,.lay-grid2 .w-text,.lay-grid3 .w-text,.lay-grid4 .w-text{grid-column:1/-1}
.lay-split .wrap{display:grid;grid-template-columns:1fr 1fr;gap:48px;align-items:center}
.lay-free .wrap{position:relative;min-height:inherit;height:100%}.lay-free{min-height:480px}
.lay-free .el{position:absolute;max-width:90%}
.sticky{position:sticky;top:0;z-index:50;padding:14px 0!important;backdrop-filter:blur(10px)}
.shadowed{box-shadow:0 2px 20px rgba(0,0,0,.08)}
.btnrow{display:flex;flex-wrap:wrap;gap:12px;margin:8px 0 16px}
.btn{display:inline-block;padding:13px 26px;border-radius:var(--radius);font-weight:700;text-decoration:none;cursor:pointer;border:2px solid var(--primary);transition:transform .25s,box-shadow .25s,background .25s;font-size:16px;font-family:inherit}
.btn-solid{background:var(--primary);color:#fff!important}.btn-outline{background:transparent;color:var(--primary)!important}
.btn-light{background:#fff;color:var(--primary)!important;border-color:#fff}.btn-ghost{background:transparent;border-color:transparent;color:inherit!important;text-decoration:underline}
.k-image{width:100%;display:block;border-radius:var(--radius);object-fit:cover;aspect-ratio:4/3}
.k-video{width:100%;display:block;border-radius:var(--radius);background:#000}
.vwrap{position:relative;width:100%;aspect-ratio:16/9;border-radius:var(--radius);overflow:hidden}.vwrap iframe{position:absolute;inset:0;width:100%;height:100%;border:0}
.k-card,.k-quote,.k-price{height:100%;background:var(--card);border:1px solid var(--line);border-radius:calc(var(--radius) + 4px);padding:28px;text-align:left;transition:transform .3s,box-shadow .3s}
.card-ic{font-size:38px;width:68px;height:68px;display:grid;place-items:center;border-radius:18px;background:color-mix(in srgb,var(--primary) 14%,transparent);margin-bottom:16px}
.card-img{width:100%;aspect-ratio:16/10;object-fit:cover;border-radius:var(--radius);margin-bottom:14px}
.k-card p,.k-quote figcaption{opacity:.75;margin:0}
.k-quote{margin:0}.k-quote blockquote{margin:10px 0 14px;font-size:17px}.stars{color:#f59e0b;letter-spacing:2px}
.k-price{text-align:center}.k-price .amt{font-size:40px;font-weight:800;color:var(--primary);margin:6px 0 12px}.k-price small{font-size:15px;opacity:.6;font-weight:500}
.k-price ul{list-style:none;padding:0;margin:0 0 20px;line-height:2.1}.k-price.featured{border:2px solid var(--primary);transform:scale(1.04);box-shadow:0 24px 60px -20px color-mix(in srgb,var(--primary) 60%,transparent)}
.k-icon{font-size:72px;line-height:1;text-align:center;filter:drop-shadow(0 20px 30px rgba(0,0,0,.18))}
.k-stats{display:flex;gap:28px;flex-wrap:wrap;margin-top:12px}.k-stats b{display:block;font-size:30px;color:var(--primary);font-family:var(--hfont)}.k-stats span{opacity:.7;font-size:14px}
.shape-circle{aspect-ratio:1;border-radius:50%}.shape-rect{aspect-ratio:1;border-radius:var(--radius)}.shape-blob{aspect-ratio:1;border-radius:42% 58% 63% 37%/41% 44% 56% 59%}
.w-shape{width:20%}
.k-form{display:grid;gap:12px;background:var(--card);border:1px solid var(--line);padding:24px;border-radius:calc(var(--radius) + 4px);text-align:left}
.k-form input,.k-form textarea{font:inherit;padding:13px 14px;border-radius:var(--radius);border:1px solid var(--line);background:transparent;color:inherit;width:100%}
.k-form .btn{justify-self:start}.thanks{color:#16a34a;font-weight:600;margin:0}
.k-social{display:flex;gap:14px;font-size:26px;justify-content:inherit}.center .k-social,.k-social[style*="center"]{justify-content:center}
.k-social a{text-decoration:none;transition:transform .25s}
.k-divider{border:0;border-top:1px solid var(--line);margin:24px 0}
.k-nav{display:flex;align-items:center;gap:24px}.k-nav .brand{font-family:var(--hfont);font-weight:800;font-size:22px;text-decoration:none;margin-right:auto}
.k-nav .links{display:flex;gap:22px}.k-nav .links a{text-decoration:none;font-weight:600;opacity:.8}.k-nav .links a:hover{opacity:1;color:var(--primary)}
.k-nav .btn{padding:10px 20px;font-size:14px}.burger{display:none;background:none;border:0;font-size:26px;color:inherit;cursor:pointer}
.el{position:relative}
.ph{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;aspect-ratio:4/3;width:100%;border:2px dashed color-mix(in srgb,var(--text) 30%,transparent);border-radius:var(--radius);font-size:40px;opacity:.7}.ph span{font-size:13px}
/* entrance animations */
.a-in{opacity:0}.a-in.in{animation:var(--an,deFade) var(--d,.8s) cubic-bezier(.2,.75,.25,1) var(--dl,0s) both}
[data-in=fade]{--an:deFade}[data-in=fade-up]{--an:deUp}[data-in=fade-down]{--an:deDown}[data-in=from-left]{--an:deLeft}[data-in=from-right]{--an:deRight}
[data-in=zoom-in]{--an:deZoomIn}[data-in=zoom-out]{--an:deZoomOut}[data-in=flip]{--an:deFlip}[data-in=bounce-in]{--an:deBounceIn}[data-in=rotate-in]{--an:deRotate}[data-in=blur-in]{--an:deBlur}[data-in=typewriter]{--an:deFade}[data-in=flip-3d]{--an:deFlip3d}[data-in=rise-3d]{--an:deRise3d}
@keyframes deFlip3d{from{opacity:0;transform:perspective(900px) rotateY(-80deg) translateZ(-80px)}to{opacity:1;transform:none}}
@keyframes deRise3d{from{opacity:0;transform:perspective(900px) rotateX(55deg) translateY(70px) translateZ(-120px)}to{opacity:1;transform:none}}
@keyframes deFade{from{opacity:0}to{opacity:1}}
@keyframes deUp{from{opacity:0;transform:translateY(50px)}to{opacity:1;transform:none}}
@keyframes deDown{from{opacity:0;transform:translateY(-50px)}to{opacity:1;transform:none}}
@keyframes deLeft{from{opacity:0;transform:translateX(-80px)}to{opacity:1;transform:none}}
@keyframes deRight{from{opacity:0;transform:translateX(80px)}to{opacity:1;transform:none}}
@keyframes deZoomIn{from{opacity:0;transform:scale(.7)}to{opacity:1;transform:none}}
@keyframes deZoomOut{from{opacity:0;transform:scale(1.3)}to{opacity:1;transform:none}}
@keyframes deFlip{from{opacity:0;transform:perspective(800px) rotateX(75deg)}to{opacity:1;transform:none}}
@keyframes deBounceIn{0%{opacity:0;transform:scale(.3)}50%{opacity:1;transform:scale(1.08)}70%{transform:scale(.95)}100%{opacity:1;transform:none}}
@keyframes deRotate{from{opacity:0;transform:rotate(-15deg) scale(.85)}to{opacity:1;transform:none}}
@keyframes deBlur{from{opacity:0;filter:blur(16px)}to{opacity:1;filter:none}}
/* hover */
.h-grow,.h-lift,.h-glow,.h-tilt,.h-shrink{transition:transform .3s cubic-bezier(.2,.75,.25,1),box-shadow .3s}
.h-grow:hover{transform:scale(1.07)}.h-shrink:hover{transform:scale(.94)}.h-lift:hover{transform:translateY(-8px);box-shadow:0 22px 40px -14px rgba(0,0,0,.35)}
.h-glow:hover{box-shadow:0 0 0 4px color-mix(in srgb,var(--primary) 30%,transparent),0 0 40px color-mix(in srgb,var(--primary) 60%,transparent)}
.h-tilt:hover{transform:perspective(600px) rotateX(6deg) rotateY(-8deg)}.h-shake:hover{animation:deWiggle .4s 2}
/* loops */
.l-pulse{animation:dePulse 2s ease-in-out infinite}.l-float{animation:deFloat 3.5s ease-in-out infinite}.l-spin{animation:deSpin 8s linear infinite}
.l-wiggle{animation:deWiggle 1.6s ease-in-out infinite}.l-bounce{animation:deBounce 1.6s ease infinite}.l-heartbeat{animation:deHeart 1.4s ease-in-out infinite}.l-glow{animation:deGlow 2.2s ease-in-out infinite}
@keyframes dePulse{50%{transform:scale(1.06)}}@keyframes deFloat{50%{transform:translateY(-16px)}}@keyframes deSpin{to{transform:rotate(360deg)}}
@keyframes deWiggle{0%,100%{transform:rotate(0)}25%{transform:rotate(-6deg)}75%{transform:rotate(6deg)}}
@keyframes deBounce{0%,100%{transform:translateY(0)}40%{transform:translateY(-22px)}60%{transform:translateY(-10px)}}
@keyframes deHeart{0%,100%{transform:scale(1)}15%{transform:scale(1.15)}30%{transform:scale(1)}45%{transform:scale(1.1)}}
@keyframes deGlow{50%{box-shadow:0 0 30px 6px color-mix(in srgb,var(--primary) 55%,transparent)}}
/* 3D */
.h-tilt3d{transition:transform .2s ease-out;transform-style:preserve-3d;will-change:transform}
.sc-3d .wrap{transform:perspective(1200px) rotateX(calc((1 - var(--p,1)) * 20deg)) translateY(calc((1 - var(--p,1)) * 70px)) scale(calc(.9 + var(--p,1) * .1));opacity:calc(.25 + var(--p,1) * .75);transform-origin:50% 0;will-change:transform,opacity}
.grid3d{position:absolute;left:-50%;right:-50%;bottom:-2%;height:58%;pointer-events:none;background-image:linear-gradient(color-mix(in srgb,var(--primary) 55%,transparent) 1.5px,transparent 1.5px),linear-gradient(90deg,color-mix(in srgb,var(--primary) 55%,transparent) 1.5px,transparent 1.5px);background-size:64px 64px;transform:perspective(420px) rotateX(62deg);transform-origin:50% 100%;-webkit-mask-image:linear-gradient(to top,#000 10%,transparent 90%);mask-image:linear-gradient(to top,#000 10%,transparent 90%);animation:deGridMove 2.4s linear infinite}
@keyframes deGridMove{to{background-position:0 64px,0 64px}}
model-viewer.k-model3d{width:100%;height:clamp(300px,42cqi,520px);display:block;background:transparent;--poster-color:transparent}
.css3d{display:grid;place-items:center;min-height:clamp(260px,36cqi,440px);perspective:900px;position:relative}
.stage3d{position:relative;width:clamp(160px,22cqi,260px);aspect-ratio:1;transform-style:preserve-3d}
.stage3d.spinning .coin{animation:deSpin3d 7s linear infinite}
.coin{position:absolute;inset:0;transform-style:preserve-3d;transform:rotateX(-12deg)}
.coin i{position:absolute;inset:0;border-radius:50%;background:linear-gradient(135deg,color-mix(in srgb,var(--primary) 85%,#fff),color-mix(in srgb,var(--primary) 70%,#000))}
.coin b{position:absolute;inset:0;border-radius:50%;display:grid;place-items:center;font-size:clamp(70px,10cqi,120px);background:radial-gradient(circle at 30% 25%,#fff8,transparent 45%),linear-gradient(135deg,color-mix(in srgb,var(--primary) 40%,#fff),var(--primary));box-shadow:inset 0 0 0 6px color-mix(in srgb,var(--accent) 80%,#fff);backface-visibility:hidden}
.coin b.f{transform:translateZ(11px)}.coin b.bk{transform:rotateY(180deg) translateZ(11px)}
.shadow3d{position:absolute;left:10%;right:10%;bottom:-22%;height:14%;border-radius:50%;background:radial-gradient(rgba(0,0,0,.35),transparent 70%);transform:rotateX(80deg);animation:dePulse 3.5s ease-in-out infinite}
@keyframes deSpin3d{from{transform:rotateX(-12deg) rotateY(0)}to{transform:rotateX(-12deg) rotateY(360deg)}}
.hint3d{position:absolute;bottom:4px;font-size:12px;opacity:.6}
/* section background effects */
.fx-gradient-shift{background-size:300% 300%!important;animation:deGrad 12s ease infinite}
@keyframes deGrad{0%,100%{background-position:0% 50%}50%{background-position:100% 50%}}
.fx-parallax{background-attachment:fixed}
.kb{position:absolute;inset:-6%;background-size:cover;background-position:center;animation:deKB 22s ease-in-out infinite alternate}.kb-ov{position:absolute;inset:0;background:rgba(0,0,0,.45)}
@keyframes deKB{from{transform:scale(1)}to{transform:scale(1.18) translate(-2%,-2%)}}
.fx-ken-burns{color:#fff}
.bubbles{position:absolute;inset:0;pointer-events:none}.bubbles span{position:absolute;bottom:-80px;width:var(--s);height:var(--s);border-radius:50%;background:color-mix(in srgb,var(--accent) 35%,transparent);animation:deRise var(--t) linear var(--dl) infinite}
@keyframes deRise{to{transform:translateY(-130cqh) translateX(30px);opacity:0}}
@media (prefers-reduced-motion:reduce){.coin,.grid3d{animation:none!important}.a-in{opacity:1!important;animation:none!important}.l-pulse,.l-float,.l-spin,.l-wiggle,.l-bounce,.l-heartbeat,.l-glow,.fx-gradient-shift,.kb,.bubbles span{animation:none!important}}
/* responsive */
@container (max-width:760px){
.lay-split .wrap,.lay-grid2 .wrap,.lay-grid3 .wrap,.lay-grid4 .wrap{grid-template-columns:1fr}
.lay-split .wrap>.col:last-child:empty{display:none}
.sec{padding:56px 0}.k-icon{font-size:110px!important}
.k-nav .links{display:none}.k-nav .btn{display:none}.burger{display:block}
.k-nav.open{flex-wrap:wrap}.k-nav.open .links{display:flex;flex-direction:column;width:100%;order:3;gap:10px;padding:10px 0}
.lay-free .el{position:relative;left:auto!important;top:auto!important;width:auto!important;margin:12px 0}.lay-free{min-height:0!important}
.k-price.featured{transform:none}
}
/* editor-only */
.editing .a-in{opacity:1}.editing:not(.playing) .a-in.in,.editing:not(.playing) .a-in{animation:none}
.editing .el:hover{outline:1px dashed color-mix(in srgb,var(--primary) 70%,#fff);outline-offset:3px;cursor:pointer}
.editing .sel{outline:2px solid #0079f2!important;outline-offset:3px;z-index:5}
.editing .sel-sec{box-shadow:inset 0 0 0 3px #f26207}
.editing .vwrap iframe,.editing model-viewer{pointer-events:none}
.editing a{pointer-events:auto}
.editing [contenteditable=true]{outline:2px solid #f26207;outline-offset:4px;cursor:text}
.editing .rz{position:absolute;right:-9px;bottom:-9px;width:18px;height:18px;border-radius:50%;background:#0079f2;border:3px solid #fff;cursor:nwse-resize;touch-action:none}
.editing .lay-free .el{touch-action:none}
.empty-sec{padding:40px;text-align:center;opacity:.6;border:2px dashed var(--line);border-radius:12px}
`;
