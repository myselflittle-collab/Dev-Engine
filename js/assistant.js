// Offline design assistant for the visual builder — understands plain-English commands
// like "animate the hero with bounce", "make buttons pulse", "change title to Fresh Cakes",
// "make background dark", "add a pricing section". No API key needed.
import { SECTION_LIBRARY, KINDS, FONTS, el, make3D } from './sitegen.js';

const COLORS = {
  red: '#ef4444', crimson: '#dc2626', orange: '#f97316', amber: '#f59e0b', yellow: '#facc15', gold: '#d4a017', lime: '#84cc16', green: '#16a34a',
  emerald: '#10b981', teal: '#0d9488', cyan: '#06b6d4', sky: '#0ea5e9', blue: '#2563eb', navy: '#1e3a8a', indigo: '#4f46e5', violet: '#7c3aed',
  purple: '#9333ea', magenta: '#c026d3', pink: '#ec4899', rose: '#e11d48', brown: '#92400e', black: '#0a0a0a', white: '#ffffff', grey: '#6b7280',
  gray: '#6b7280', silver: '#cbd5e1', beige: '#f5f0e6', cream: '#fffaf0', maroon: '#7f1d1d', saffron: '#ff9933', peach: '#fdba74', mint: '#a7f3d0',
};

const ENTRANCE_WORDS = [
  [/typewriter|typing|type out|types?\b/, 'typewriter'], [/bounce[ -]?in|bouncy entr|pop[ -]?in|pop up|popup/, 'bounce-in'],
  [/slide[s]? ?up|fade[s]? ?up|fade[s]? in up|rise|rising|from (the )?bottom|come up/, 'fade-up'], [/slide[s]? ?down|fade[s]? ?down|from (the )?top|drop in|fall/, 'fade-down'],
  [/from (the )?left|slide[s]? (in )?(from )?left|slide[s]? right/, 'from-left'], [/from (the )?right|slide[s]? (in )?(from )?right|slide[s]? left/, 'from-right'],
  [/zoom[ -]?out|shrink in/, 'zoom-out'], [/zoom|scale up|grow in/, 'zoom-in'], [/flip/, 'flip'], [/rotate[ -]?in|spin[ -]?in|twist/, 'rotate-in'],
  [/blur/, 'blur-in'], [/slide/, 'fade-up'], [/fade/, 'fade'],
];
const LOOP_WORDS = [[/heart ?beat/, 'heartbeat'], [/puls/, 'pulse'], [/float|hover(ing)? up and down|levitat/, 'float'], [/spin|rotat/, 'spin'], [/wiggle|shake|jiggle/, 'wiggle'], [/bounc|jump/, 'bounce'], [/glow|shine|neon/, 'glow']];
const HOVER_WORDS = [[/grow|bigger|scale|zoom/, 'grow'], [/lift|rise|raise|up/, 'lift'], [/glow|shine|neon/, 'glow'], [/tilt|3d/, 'tilt'], [/shake|wiggle/, 'shake'], [/shrink|smaller/, 'shrink']];

const SECTION_WORDS = {
  navbar: /nav ?bar|navigation|menu|header/, hero: /hero|banner|top section|first section|landing/, features: /feature|service|offer/, about: /about/,
  gallery: /gallery|photos section|portfolio section|images section/, video: /video section/, testimonials: /testimonial|review/, pricing: /pric|plan|package/,
  cta: /call to action|\bcta\b|get started section/, contact: /contact|form section/, footer: /footer|bottom/, free: /free (canvas|section)|canvas/,
};
const KIND_WORDS = {
  heading: /title|heading|headline|h1/, text: /paragraph|text|subtitle|tagline|description/, button: /button|btn|cta button/, image: /image|picture|photo|img/,
  video: /video/, card: /card|box/, icon: /icon|emoji/, quote: /quote|testimonial card/, price: /price card|pricing card/, shape: /shape|circle|blob/, form: /form/,
};

export const HELP = `Here are things you can type (no AI key needed):
• **animate the hero with bounce** / **make all sections fade up** / **typewriter title**
• **make buttons pulse** / **make the logo spin** / **images zoom on hover**
• **make it faster** / **slower** / **one by one** / **remove animations**
• **change title to "Fresh Cakes Daily"** / **change button to "Order now"**
• **make the theme purple** / **dark mode** / **background of hero pink**
• **use font Poppins** / **rounded buttons** / **bigger title**
• **add a pricing section** / **remove the gallery** / **add a button "Call us"**
• **moving gradient background** / **parallax** / **floating bubbles**
• **make it 3D** / **add a 3D model** / **3D tilt cards** / **3D grid floor** / **3D scroll**
• **undo** · **help**
Connect an AI (⚙) to describe anything else in your own words.`;

const lower = (s) => String(s).toLowerCase();
function quoted(text) {
  const m = text.match(/["“'‘]([^"”'’]+)["”'’]/);
  if (m) return m[1];
  const m2 = text.match(/\b(?:to|as|say|says|reads?|:)\s+(.+)$/i);
  return m2 ? m2[1].trim().replace(/[.!]$/, '') : null;
}
function color(text) {
  const hex = text.match(/#([0-9a-f]{6}|[0-9a-f]{3})\b/i);
  if (hex) return hex[0];
  for (const [n, c] of Object.entries(COLORS)) if (new RegExp(`\\b${n}\\b`).test(text)) return c;
  return null;
}

/** Collect target elements and sections from the text. */
export function findTargets(site, text, selectedId) {
  const t = lower(text);
  let secs = Object.entries(SECTION_WORDS).filter(([, re]) => re.test(t)).flatMap(([type]) => site.sections.filter((s) => s.type === type));
  const kinds = Object.entries(KIND_WORDS).filter(([, re]) => re.test(t)).map(([k]) => k);
  const everything = /\b(all|every|everything|whole|entire|website|site|page)\b/.test(t);
  const sel = /\b(this|it|selected|selection)\b/.test(t) && selectedId;
  if (/\blogo\b|\bbrand\b/.test(t)) {
    const heroIcon = site.sections.find((s) => s.type === 'hero')?.elements.find((e) => e.kind === 'icon');
    if (heroIcon) return { sections: [], elements: [heroIcon] };
  }
  if (sel) {
    const secSel = site.sections.find((s) => s.id === selectedId);
    if (secSel) return { sections: [secSel], elements: secSel.elements };
    const e = site.sections.flatMap((s) => s.elements).find((x) => x.id === selectedId);
    if (e) return { sections: [], elements: [e] };
  }
  if (!secs.length && (everything || kinds.length)) secs = site.sections;
  if (!secs.length && /\bsection/.test(t)) secs = site.sections.filter((s) => s.type !== 'navbar');
  let elements = secs.flatMap((s) => s.elements);
  if (kinds.length) elements = elements.filter((e) => kinds.includes(e.kind));
  return { sections: secs, elements };
}

function pick(list, t) { for (const [re, v] of list) if (re.test(t)) return v; return null; }

/**
 * Apply a command to the site (mutates it). Returns { changed, reply }.
 * ctx: { selectedId }
 */
export function runCommand(site, text, ctx = {}) {
  const t = lower(text).trim();
  if (!t) return { changed: false, reply: '' };
  if (/^(help|\?|what can you do|commands)/.test(t)) return { changed: false, reply: HELP };

  // ---------- 3D ----------
  if (/\b(3d|3-d|three ?d)\b/.test(t)) {
    if (/\b(model|object|product|viewer|glb)\b/.test(t) && /\b(add|insert|put|show)\b/.test(t)) {
      const sel = ctx.selectedId && site.sections.find((s) => s.id === ctx.selectedId || s.elements.some((e) => e.id === ctx.selectedId));
      const named = findTargets(site, t.replace(/\b(model|object|product)\b/g, ''), null).sections.filter((s) => s.type !== 'navbar');
      const target = sel || (named.length && named.length < site.sections.length ? named[0] : null) || site.sections.find((s) => s.type === 'hero') || site.sections[0];
      const e = el('model3d', { src: '', emoji: site.emoji || '⭐', autoRotate: true, ar: true }, { col: 1 }, { in: 'zoom-in', dur: 1.1 });
      target.elements.push(e);
      return { changed: true, reply: `Added a 3D model to ${names([target])}. Select it → Edit → upload your .glb file (until then it shows a spinning 3D badge).`, select: e.id };
    }
    if (/\b(grid|floor|synthwave|retro)\b/.test(t)) {
      let { sections } = findTargets(site, t, ctx.selectedId); if (!sections.length) sections = site.sections.filter((s) => s.type === 'hero');
      sections.forEach((s) => { s.anim = { ...s.anim, bgEffect: '3d-grid' }; });
      return { changed: true, reply: `Added a moving 3D grid floor to ${names(sections)}.` };
    }
    if (/\b(tilt|hover|follow)\b/.test(t)) {
      const { elements } = targetsOrAll(site, t, ctx);
      const list = elements.filter((e) => ['card', 'quote', 'price', 'image', 'video', 'model3d', 'button'].includes(e.kind));
      list.forEach((e) => { e.anim = { ...e.anim, hover: 'tilt3d' }; });
      return { changed: true, reply: `${describe(list.length, 'element')} now tilt in 3D following your finger/mouse.` };
    }
    if (/\b(flip|rise|entrance|appear)\b/.test(t)) {
      const { elements } = targetsOrAll(site, t, ctx);
      const kind = /rise/.test(t) ? 'rise-3d' : 'flip-3d';
      elements.forEach((e) => { e.anim = { ...e.anim, in: kind, dur: e.anim?.dur || 0.9 }; });
      return { changed: true, reply: `Added a ${kind === 'rise-3d' ? '3D rise' : '3D flip'} entrance to ${describe(elements.length, 'element')}.` };
    }
    if (/\bscroll/.test(t)) {
      site.sections.forEach((s) => { if (s.type !== 'navbar' && s.type !== 'footer') s.anim = { ...s.anim, scroll3d: true }; });
      return { changed: true, reply: 'Sections now tilt into view in 3D as you scroll.' };
    }
    make3D(site);
    return { changed: true, reply: '🧊 Made the website 3D: a rotating 3D model in the hero (upload your own .glb to replace the badge), a moving 3D grid floor, 3D rise/flip entrances, cards that tilt in 3D under your finger, and sections that tilt into view while scrolling. Press ▶ Play.' };
  }

  // ---------- remove animations ----------
  if (/(remove|stop|no|disable|turn off|clear)\b.*\banimation/.test(t) || /\bstatic\b/.test(t)) {
    const { elements, sections } = targetsOrAll(site, t, ctx);
    elements.forEach((e) => { e.anim = {}; });
    sections.forEach((s) => { s.anim = { ...s.anim, bgEffect: 'none' }; });
    return { changed: true, reply: `Removed animations from ${describe(elements.length, 'element')}.` };
  }

  // ---------- speed / stagger ----------
  if (/\b(faster|quicker|speed up)\b|\b(slower|slow down|smoother)\b|(\d+(\.\d+)?)\s*(s|sec|second)/.test(t) && /(anim|faster|slower|speed|second|sec\b|quick|slow)/.test(t)) {
    const { elements } = targetsOrAll(site, t, ctx);
    const secs = t.match(/(\d+(\.\d+)?)\s*(s|sec|second)/);
    const f = /faster|quicker|speed up/.test(t) ? 0.6 : 1.6;
    let n = 0;
    elements.forEach((e) => { if (e.anim && e.anim.in && e.anim.in !== 'none') { e.anim.dur = secs ? +secs[1] : Math.round((e.anim.dur || 0.8) * f * 100) / 100; n++; } });
    return { changed: n > 0, reply: n ? `Animation speed updated on ${describe(n, 'element')}${secs ? ` (${secs[1]}s)` : ''}.` : 'There are no entrance animations to speed up yet — try “make everything fade up”.' };
  }
  if (/one by one|stagger|sequence|one after another/.test(t)) {
    const { sections } = targetsOrAll(site, t, ctx);
    sections.forEach((s) => s.elements.forEach((e, i) => { e.anim = { in: 'fade-up', dur: 0.7, ...e.anim, delay: Math.round(i * 0.12 * 100) / 100 }; if (e.anim.in === 'none') e.anim.in = 'fade-up'; }));
    return { changed: true, reply: `Elements in ${describe(sections.length, 'section')} now appear one by one.` };
  }

  // ---------- section background effects ----------
  const bgFx = /parallax/.test(t) ? 'parallax' : /ken ?burns|zoom(ing)? background|background zoom/.test(t) ? 'ken-burns' : /bubble|particle|floating (dots|circles)/.test(t) ? 'bubbles' : /(moving|animated|shifting|flowing) (gradient|background)|gradient (animation|shift)/.test(t) ? 'gradient-shift' : null;
  if (bgFx) {
    let { sections } = findTargets(site, t, ctx.selectedId);
    if (!sections.length) sections = site.sections.filter((s) => s.type === 'hero');
    sections.forEach((s) => {
      s.anim = { ...s.anim, bgEffect: bgFx };
      if (bgFx === 'gradient-shift' && !s.style.bg && !s.style.bgImage) s.style.bgGradient = true;
    });
    const needImg = (bgFx === 'parallax' || bgFx === 'ken-burns') && sections.some((s) => !s.style.bgImage);
    return { changed: true, reply: `Added a ${bgFx.replace('-', ' ')} background to ${names(sections)}.${needImg ? ' Tip: select the section and set a background image so the effect is visible.' : ''}` };
  }

  // ---------- undo is handled by the UI ----------

  // ---------- add section ----------
  const addSec = t.match(/\b(add|insert|create|include)\b.*?\b(nav ?bar|navigation|menu|hero|banner|feature|service|about|gallery|video|testimonial|review|pric|plan|call to action|cta|contact|footer|free canvas|canvas)/);
  if (addSec && (/section|page|area|block|part/.test(t) || !/button|text|image|heading|title/.test(t))) {
    const type = Object.entries(SECTION_WORDS).find(([, re]) => re.test(addSec[2]))?.[0] || (/review/.test(addSec[2]) ? 'testimonials' : 'features');
    const k = KINDS[site.kind] || KINDS.business;
    const sec = SECTION_LIBRARY[type].make(site.name, { ...k, theme: site.theme });
    const footerIdx = site.sections.findIndex((s) => s.type === 'footer');
    const at = type === 'navbar' ? 0 : type === 'footer' || footerIdx === -1 ? site.sections.length : footerIdx;
    site.sections.splice(at, 0, sec);
    return { changed: true, reply: `Added a **${SECTION_LIBRARY[type].label}** section. Tap it to edit.`, select: sec.id };
  }

  // ---------- remove section ----------
  const rm = t.match(/\b(remove|delete|hide|get rid of)\b/);
  if (rm && !/animation|button|image|text|title|heading/.test(t)) {
    const { sections } = findTargets(site, t, ctx.selectedId);
    const del = sections.length && sections.length < site.sections.length ? sections : [];
    if (!del.length) return { changed: false, reply: 'Which section should I remove? e.g. “remove the pricing section”.' };
    site.sections = site.sections.filter((s) => !del.includes(s));
    return { changed: true, reply: `Removed ${names(del)}.` };
  }

  // ---------- add element ----------
  const addEl = t.match(/\b(add|insert|put)\b\s+(an?\s+)?(button|heading|title|text|paragraph|image|picture|photo|video|card|emoji|icon|shape|circle|quote|divider|spacer|map|form)/);
  if (addEl) {
    const word = addEl[3];
    const kind = { title: 'heading', paragraph: 'text', picture: 'image', photo: 'image', emoji: 'icon', circle: 'shape' }[word] || word;
    const label = quoted(text.replace(/^.*?\b(add|insert|put)\b\s+(an?\s+)?\w+\s*/i, ''));
    const sel = ctx.selectedId && site.sections.find((s) => s.id === ctx.selectedId || s.elements.some((e) => e.id === ctx.selectedId));
    const { sections } = findTargets(site, t, null);
    const target = sel || sections.find((s) => s.type !== 'navbar') || site.sections.find((s) => s.type === 'hero') || site.sections[0];
    const props = { heading: { text: label || 'New heading', level: 2 }, text: { text: label || 'New text' }, button: { text: label || 'Click me', href: '#contact', variant: 'solid' }, image: { src: '' }, video: { src: /youtu/.test(text) ? text.match(/\S*youtu\S+/)[0] : '' }, card: { icon: '✨', title: label || 'New card', text: 'Describe it here.' }, icon: { text: label || '⭐' }, shape: { shape: 'circle' }, quote: { text: label || 'Amazing!', author: 'Customer', rating: 5 }, divider: {}, spacer: {}, map: { query: label || 'Bhubaneswar' }, form: { fields: ['Name', 'Email', 'Message'], button: 'Send' } }[kind] || {};
    const e = el(kind, props, kind === 'shape' ? { bg: site.theme.accent, width: 15 } : {}, { in: 'fade-up' });
    if (target.layout === 'free') e.pos = { x: 10, y: 10 };
    const idx = ctx.selectedId ? target.elements.findIndex((x) => x.id === ctx.selectedId) : -1;
    target.elements.splice(idx >= 0 ? idx + 1 : target.elements.length, 0, e);
    return { changed: true, reply: `Added a ${kind} to ${names([target])}.${['image', 'video'].includes(kind) ? ' Use “Replace” in the panel to upload yours.' : ''}`, select: e.id };
  }

  // ---------- change text ----------
  const chText = t.match(/\b(change|set|rename|update|make|edit|write|call)\b.*?\b(title|heading|headline|subtitle|tagline|text|button|brand|name|business|company|website|site|shop|store)\b/);
  const newText = quoted(text);
  const isRename = chText && (/brand|name/.test(chText[2]) || (/business|company|website|site|shop|store/.test(chText[2]) && /\brename|\bname\b|\bcall (it|the)/.test(t)));
  if (chText && newText && (isRename || !/business|company|website|site|shop|store/.test(chText[2])) && !/colou?r|background|font|theme/.test(t) && /\b(to|as|say|says|reads?)\b|["“']/.test(text)) {
    const what = chText[2];
    if (isRename) {
      const old = site.name;
      site.name = newText; site.seo = { ...site.seo, title: newText };
      site.sections.forEach((s) => s.elements.forEach((e) => {
        if (e.kind === 'nav') e.props.brand = e.props.brand.replace(old, newText);
        if (e.props && typeof e.props.text === 'string') e.props.text = e.props.text.split(old).join(newText);
        if (e.props && typeof e.props.title === 'string') e.props.title = e.props.title.split(old).join(newText);
      }));
      return { changed: true, reply: `Renamed the website to **${newText}** everywhere.` };
    }
    const kind = /button/.test(what) ? 'button' : /subtitle|tagline|text/.test(what) ? 'text' : 'heading';
    let { elements } = findTargets(site, t.replace(/\b(title|heading|headline|subtitle|tagline|text|button)\b/g, ''), ctx.selectedId);
    let target = (ctx.selectedId && site.sections.flatMap((s) => s.elements).find((e) => e.id === ctx.selectedId && (e.kind === kind || ['heading', 'text', 'button'].includes(e.kind))))
      || elements.find((e) => e.kind === kind)
      || site.sections.find((s) => s.type === 'hero')?.elements.filter((e) => e.kind === kind)[kind === 'text' ? 1 : 0]
      || site.sections.flatMap((s) => s.elements).find((e) => e.kind === kind);
    if (kind === 'text' && !target) target = site.sections.find((s) => s.type === 'hero')?.elements.find((e) => e.kind === 'text');
    if (!target) return { changed: false, reply: `I couldn't find a ${kind} to change. Tap one first, then say “change it to …”.` };
    target.props.text = newText;
    void elements;
    return { changed: true, reply: `Changed the ${kind} to “${newText}”.`, select: target.id };
  }

  // ---------- theme / colours ----------
  if (/\bdark (mode|theme)\b|make it dark|\bdark\b.*\b(website|site|theme|background)/.test(t)) {
    Object.assign(site.theme, { bg: '#0b0f19', text: '#e5e7eb' });
    site.sections.forEach((s) => { if (s.style.bg && s.type !== 'footer' && s.type !== 'cta') delete s.style.bg; });
    return { changed: true, reply: 'Switched to a dark theme 🌙.' };
  }
  if (/\blight (mode|theme)\b|make it light|\b(white|light)\b.*\b(website|site|theme)\b/.test(t)) {
    Object.assign(site.theme, { bg: '#ffffff', text: '#0f172a' });
    site.sections.forEach((s) => { if (s.style.bg && s.type !== 'footer' && s.type !== 'cta') delete s.style.bg; });
    return { changed: true, reply: 'Switched to a light theme ☀️.' };
  }
  const c = color(t);
  if (c && /\b(background|bg)\b/.test(t)) {
    let { sections } = findTargets(site, t, ctx.selectedId);
    const all = /\b(all|whole|entire|website|site|page)\b/.test(t) || !sections.length;
    if (all) { site.theme.bg = c; site.theme.text = isDarkHex(c) ? '#f8fafc' : '#0f172a'; return { changed: true, reply: `Website background is now ${c}.` }; }
    sections.forEach((s) => { s.style.bg = c; s.style.color = isDarkHex(c) ? '#ffffff' : ''; delete s.style.bgGradient; });
    return { changed: true, reply: `Background of ${names(sections)} is now ${c}.` };
  }
  if (c && /\b(text|font|title|heading) colou?r\b|\bcolou?r (of )?(the )?(text|title|heading)/.test(t)) {
    const { elements } = targetsOrAll(site, t, ctx);
    elements.filter((e) => ['heading', 'text'].includes(e.kind)).forEach((e) => { e.style.color = c; });
    return { changed: true, reply: `Text colour changed to ${c}.` };
  }
  if (c && /\baccent|second(ary)? colou?r/.test(t)) { site.theme.accent = c; return { changed: true, reply: `Accent colour is now ${c}.` }; }
  if (c && (/\b(theme|primary|main|brand|button)s?\b|colou?r|\bmake (it|the (site|website)) \w+$/.test(t) || /^(make it |go )?\w+$/.test(t))) {
    site.theme.primary = c;
    return { changed: true, reply: `Main colour is now ${c} — buttons, links and highlights updated.` };
  }

  // ---------- fonts ----------
  const font = FONTS.find((f) => t.includes(f.toLowerCase()));
  if (font || /\bfont\b/.test(t)) {
    const f = font || (/(fancy|elegant|classy|serif)/.test(t) ? 'Playfair Display' : /(fun|playful|handwrit|script)/.test(t) ? 'Pacifico' : /(modern|clean|simple)/.test(t) ? 'Inter' : /(bold|strong|sport)/.test(t) ? 'Bebas Neue' : /(odia|oriya)/.test(t) ? 'Noto Sans Oriya' : null);
    if (!f) return { changed: false, reply: `Which font? Try: ${FONTS.slice(0, 8).join(', ')}.` };
    if (/\b(heading|title)s?\b/.test(t)) site.theme.headingFont = f;
    else if (/\b(body|text|paragraph)\b/.test(t)) site.theme.font = f;
    else { site.theme.headingFont = f; if (!/display|pacifico|bebas/i.test(f)) site.theme.font = f; }
    return { changed: true, reply: `Font changed to **${f}**.` };
  }

  // ---------- shapes / sizes / alignment ----------
  if (/\b(rounded|round|pill|curved)\b/.test(t)) { site.theme.radius = /pill/.test(t) ? 40 : 18; return { changed: true, reply: 'Corners are now rounded.' }; }
  if (/\b(square|sharp)\b.*\b(corner|button|edge)/.test(t)) { site.theme.radius = 0; return { changed: true, reply: 'Corners are now square.' }; }
  if (/\b(bigger|larger|increase|smaller|decrease|tiny|huge)\b/.test(t) && !/hover/.test(t)) {
    const up = /bigger|larger|increase|huge/.test(t);
    let { elements } = targetsOrAll(site, t, ctx);
    if (!/\b(all|every)\b/.test(t) && !ctx.selectedId) elements = elements.filter((e) => ['heading', 'text', 'icon', 'button', 'image', 'video'].includes(e.kind));
    elements.forEach((e) => {
      if (['image', 'video', 'shape', 'map'].includes(e.kind)) e.style.width = Math.max(20, Math.min(100, (e.style.width || 100) + (up ? 15 : -15)));
      else e.style.fontSize = Math.round((e.style.fontSize || (e.kind === 'heading' ? (e.props.level === 1 ? 56 : 40) : e.kind === 'icon' ? 72 : 17)) * (up ? 1.2 : 0.83));
    });
    return { changed: elements.length > 0, reply: `Made ${describe(elements.length, 'element')} ${up ? 'bigger' : 'smaller'}.` };
  }
  const align = /\bcent(er|re)\b/.test(t) ? 'center' : /\balign left|to the left\b|left align/.test(t) ? 'left' : /\balign right|right align\b/.test(t) ? 'right' : null;
  if (align && /align|cent(er|re)|left|right/.test(t)) {
    let { sections } = findTargets(site, t, ctx.selectedId);
    if (!sections.length) sections = site.sections.filter((s) => s.type === 'hero');
    sections.forEach((s) => { s.style.align = align; });
    return { changed: true, reply: `Aligned ${names(sections)} to the ${align}.` };
  }

  // ---------- animations ----------
  const isHover = /\b(on hover|when hover|hover|mouse ?over|when i (point|touch))\b/.test(t);
  const loop = !isHover && (/\b(keep|always|continuous|forever|loop|repeat)/.test(t) || /pulse|pulsing|float|floating|spin|spinning|rotating|wiggl|shak|jiggl|bouncing|bounce(?! ?in)|heart ?beat|glow/.test(t)) ? pick(LOOP_WORDS, t) : null;
  const entrance = !isHover && !loop ? pick(ENTRANCE_WORDS, t) : null;
  const hover = isHover ? pick(HOVER_WORDS, t.replace(/hover/g, '')) || 'lift' : null;
  if (entrance || loop || hover || /\banimat|\bmove|\bmotion|\beffect|\bcome alive|\bfancy\b/.test(t)) {
    let { elements, sections } = findTargets(site, t, ctx.selectedId);
    if (!elements.length) {
      if (/\b(all|every|everything|website|site|page)\b/.test(t) || !sections.length) { sections = site.sections; elements = site.sections.flatMap((s) => s.elements); }
    }
    elements = elements.filter((e) => e.kind !== 'nav' || hover);
    if (!elements.length) return { changed: false, reply: 'What should I animate? e.g. “animate the hero”, “make buttons pulse”, or tap an element and say “make it bounce”.' };
    const kind = entrance || (!loop && !hover ? 'fade-up' : null);
    elements.forEach((e, i) => {
      e.anim = e.anim || {};
      if (kind) { e.anim.in = kind; e.anim.dur = e.anim.dur || (kind === 'typewriter' ? 2 : 0.8); if (elements.length > 1 && sections.length <= 2) e.anim.delay = Math.round(Math.min(i, 8) * 0.12 * 100) / 100; e.anim.trigger = sections.some((s) => s.type === 'hero' || s.type === 'navbar') && !/scroll/.test(t) ? e.anim.trigger || 'scroll' : 'scroll'; }
      if (loop) e.anim.loop = loop;
      if (hover) e.anim.hover = hover;
    });
    const what = kind ? `“${kind}” entrance` : loop ? `continuous “${loop}”` : `“${hover}” hover effect`;
    return { changed: true, reply: `Added a ${what} animation to ${describe(elements.length, 'element')}${sections.length && sections.length < site.sections.length ? ` in ${names(sections)}` : ''}. Press ▶ Play to watch it.` };
  }

  return { changed: false, reply: null };
}

function targetsOrAll(site, t, ctx) {
  const r = findTargets(site, t, ctx.selectedId);
  if (r.elements.length || r.sections.length) return r;
  return { sections: site.sections, elements: site.sections.flatMap((s) => s.elements) };
}
function describe(n, w) { return `${n} ${w}${n === 1 ? '' : 's'}`; }
function names(secs) { const u = [...new Set(secs.map((s) => s.name))]; return u.length > 3 ? `${u.length} sections` : u.map((x) => `the ${x}`).join(', ') || 'the page'; }
function isDarkHex(hex) {
  let h = hex.replace('#', ''); if (h.length === 3) h = h.split('').map((x) => x + x).join('');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  return (r * 299 + g * 587 + b * 114) / 1000 < 128;
}
