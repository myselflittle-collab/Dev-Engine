// "Build me a … app" generator + intent router (works without any AI key).
import { detectKind, extractName, KINDS } from './sitegen.js';

export const APPS = [
  { id: 'todo', name: 'Todo List', icon: '✅', words: ['todo', 'to-do', 'to do', 'task', 'checklist', 'reminder list'], files: ['index.html', 'style.css', 'app.js', 'logic.js', 'logic.test.js'] },
  { id: 'calculator', name: 'Calculator', icon: '🧮', words: ['calculator', 'calc', 'math'], files: ['index.html', 'style.css', 'app.js', 'logic.js', 'logic.test.js'] },
  { id: 'expense', name: 'Expense Tracker', icon: '💰', words: ['expense', 'budget', 'money', 'finance', 'spending', 'income', 'khata', 'account book'], files: ['index.html', 'style.css', 'app.js', 'logic.js', 'logic.test.js'] },
  { id: 'notes', name: 'Notes', icon: '📝', words: ['note', 'notes', 'notepad', 'diary', 'journal', 'memo'], files: ['index.html', 'style.css', 'app.js'] },
  { id: 'quiz', name: 'Quiz', icon: '🧠', words: ['quiz', 'trivia', 'mcq', 'exam', 'test app', 'question'], files: ['index.html', 'style.css', 'app.js'] },
  { id: 'timer', name: 'Timer & Stopwatch', icon: '⏱️', words: ['timer', 'stopwatch', 'pomodoro', 'countdown', 'clock'], files: ['index.html', 'style.css', 'app.js'] },
  { id: 'weather', name: 'Weather', icon: '🌤️', words: ['weather', 'forecast', 'temperature', 'rain'], files: ['index.html', 'style.css', 'app.js'] },
  { id: 'tictactoe', name: 'Tic Tac Toe', icon: '❌', words: ['tic tac toe', 'tictactoe', 'tic-tac-toe', 'noughts', 'xo game'], files: ['index.html', 'style.css', 'app.js', 'logic.js', 'logic.test.js'] },
  { id: 'snake', name: 'Snake Game', icon: '🐍', words: ['snake', 'arcade', 'game'], files: ['index.html', 'style.css', 'app.js'] },
  { id: 'password', name: 'Password Generator', icon: '🔐', words: ['password', 'passcode', 'random string'], files: ['index.html', 'style.css', 'app.js'] },
  { id: 'converter', name: 'Unit Converter', icon: '🔁', words: ['convert', 'converter', 'unit', 'units', 'temperature converter'], files: ['index.html', 'style.css', 'app.js'] },
  { id: 'drawing', name: 'Drawing Pad', icon: '🎨', words: ['draw', 'drawing', 'paint', 'sketch', 'canvas', 'whiteboard', 'doodle'], files: ['index.html', 'style.css', 'app.js'] },
  { id: 'kanban', name: 'Kanban Board', icon: '📋', words: ['kanban', 'trello', 'project board', 'task board', 'project management'], files: ['index.html', 'style.css', 'app.js'] },
];

const WEBSITE_RE = /\b(web ?site|web ?page|landing ?page|home ?page|site\b|portfolio|blog|business page)/i;
const APP_RE = /\b(app|application|software|tool|game|tracker|calculator|program|system|dashboard|generator|converter|bot|utility|board|timer|clock|todo|to-do|quiz)\b/i;
const BUILD_RE = /\b(make|create|build|design|generate|develop|code|write|start|i want|i need|give me|new)\b/i;
const LANG_RE = /\b(python|javascript|typescript|node|c\+\+|cpp|java|golang|go|rust|bash|c)\b(?:\s+(?:program|script|code|app|project))?/i;

/**
 * Classify a free-text request.
 * → { type:'website', kind, name } | { type:'app', recipe, name } | { type:'code', lang } | { type:'chat' }
 */
export function classify(text) {
  const t = String(text || '').trim();
  if (!t) return { type: 'chat' };
  const name = extractName(t);
  const appWord = APP_RE.test(t);
  const siteWord = WEBSITE_RE.test(t);
  const recipe = matchRecipe(t);
  const wantsBuild = BUILD_RE.test(t) || appWord || siteWord;
  if (!wantsBuild) return { type: 'chat' };
  // "web app for X" / "todo website" → app when we have a matching recipe
  if (recipe && (appWord || !siteWord || /\bweb ?app\b/i.test(t))) return { type: 'app', recipe: recipe.id, name: name || recipe.name, confident: true };
  if (siteWord && !/\bweb ?app\b/i.test(t)) return { type: 'website', kind: detectKind(t), name };
  const lang = t.match(LANG_RE);
  if (lang && /\b(program|script|code|cli|function|algorithm)\b/i.test(t)) return { type: 'code', lang: normLang(lang[1]), name };
  if (appWord) return { type: 'app', recipe: recipe ? recipe.id : null, name: name || guessAppName(t), confident: !!recipe };
  return { type: 'chat' };
}

export function matchRecipe(text) {
  const t = ` ${String(text).toLowerCase()} `;
  let best = null; let score = 0;
  for (const a of APPS) for (const w of a.words) {
    if (t.includes(w) && w.length > score) {
      // "game" alone is weak — only use it if nothing else matched
      const s = w === 'game' ? 1 : w.length;
      if (s > score) { best = a; score = s; }
    }
  }
  return best;
}

function normLang(l) {
  l = l.toLowerCase();
  return { 'c++': 'cpp', golang: 'go', javascript: 'node', typescript: 'typescript', node: 'node' }[l] || l;
}
function guessAppName(t) {
  const m = t.match(/\b(?:an?|my|the)\s+([\w\s-]{3,30}?)\s+(?:app|application|software|tool|game|tracker|system|dashboard)\b/i);
  return m ? m[1].trim().replace(/\b\w/g, (c) => c.toUpperCase()) + ' App' : 'My App';
}

/** Load an app recipe's files. `fetchText(path)` lets tests read from disk. */
export async function loadApp(id, appName, fetchText = defaultFetch) {
  const app = APPS.find((a) => a.id === id);
  if (!app) throw new Error('Unknown app ' + id);
  const base = await fetchText('apps/_base.css');
  const files = {};
  for (const f of app.files) {
    let c = await fetchText(`apps/${id}/${f}`);
    c = c.split('{{APP_NAME}}').join(appName || app.name);
    if (f === 'style.css') c = c.replace("@import url('_base.css');", base.trim());
    files[f] = c;
  }
  files['README.md'] = `# ${appName || app.name}\n\nGenerated by Dev Engine.\n\n- Press **▶ Run** to open it in the Webview.\n${app.files.includes('logic.test.js') ? '- Press **🧪 Test** to run the unit tests in `logic.test.js`.\n' : ''}- Ask the ✨ Agent (with an AI connected) to add features, or edit the code yourself.\n`;
  return files;
}

async function defaultFetch(path) {
  const r = await fetch(path, { cache: 'no-cache' });
  if (!r.ok) throw new Error(`Could not load ${path} (${r.status})`);
  return r.text();
}

export function describeKinds() { return Object.values(KINDS).map((k) => `${k.emoji} ${k.label}`).join(', '); }
