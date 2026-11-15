// AI Agent: talks to Anthropic or any OpenAI-compatible API (OpenAI, OpenRouter, Groq, Ollama…)
// using the user's own key. Keys stay in this browser's localStorage only.

export const SYSTEM_PROMPT = `You are Dev Engine Agent, an expert software engineer inside a browser IDE (like Replit Agent).
You can read the user's project files and you change them by returning COMPLETE file contents.

When you change or create files, output each one in exactly this format:

<<<FILE path/to/file.ext
...the entire new file content...
>>>

To delete a file output: <<<DELETE path/to/file.ext>>>

Rules:
- Always output the full file, never partial snippets or "..." placeholders, inside FILE blocks.
- Keep explanations short (a few sentences or bullets) before the file blocks.
- Fix the root cause of errors and failing tests. Do not delete or weaken tests to make them pass unless they are clearly wrong.
- Preserve the project's language, style and structure.
- The runtime: web projects run in an iframe webview; JavaScript/TypeScript runs in a Node-like browser sandbox (ESM imports of npm packages come from esm.sh); Python runs on Pyodide (no threads, no sockets); other languages need the Dev Engine backend.`;

/** AI providers. All except Anthropic use the OpenAI-compatible /chat/completions API. */
export const AI_PROVIDERS = {
  anthropic: { id: 'anthropic', label: 'Claude', icon: '🟠', desc: 'Anthropic — best for coding', model: 'claude-sonnet-5-5', baseUrl: '', keyUrl: 'https://console.anthropic.com/settings/keys' },
  openai: { id: 'openai', label: 'ChatGPT', icon: '🟢', desc: 'OpenAI GPT models', model: 'gpt-5.4-mini', baseUrl: 'https://api.openai.com/v1', keyUrl: 'https://platform.openai.com/api-keys' },
  gemini: { id: 'gemini', label: 'Gemini', icon: '🔵', desc: 'Google — free key, no card', model: 'gemini-2.5-flash', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', keyUrl: 'https://aistudio.google.com/apikey', free: true, note: 'Google AI Studio gives a free Gemini key (no credit card). Free-tier prompts may be used by Google to improve products.' },
  groq: { id: 'groq', label: 'Groq', icon: '⚡', desc: 'Very fast open models', model: 'openai/gpt-oss-120b', baseUrl: 'https://api.groq.com/openai/v1', keyUrl: 'https://console.groq.com/keys', free: true, note: 'Groq has a free tier with rate limits (no credit card).' },
  openrouter: { id: 'openrouter', label: 'OpenRouter', icon: '🌐', desc: '300+ models, some free', model: 'openai/gpt-oss-120b:free', baseUrl: 'https://openrouter.ai/api/v1', keyUrl: 'https://openrouter.ai/keys', free: true, note: 'Models ending in “:free” cost nothing (daily limits apply).' },
  deepseek: { id: 'deepseek', label: 'DeepSeek', icon: '🐋', desc: 'Low-cost coding models', model: 'deepseek-chat', baseUrl: 'https://api.deepseek.com/v1', keyUrl: 'https://platform.deepseek.com/api_keys' },
  mistral: { id: 'mistral', label: 'Mistral', icon: '🌬️', desc: 'Mistral AI models', model: 'mistral-small-latest', baseUrl: 'https://api.mistral.ai/v1', keyUrl: 'https://console.mistral.ai/api-keys' },
  ollama: { id: 'ollama', label: 'Ollama', icon: '🦙', desc: 'Free, runs on your PC', model: 'qwen2.5-coder', baseUrl: 'http://localhost:11434/v1', keyUrl: 'https://ollama.com/download', free: true, note: 'Runs on your own computer (not on iPad). Start it with OLLAMA_ORIGINS=* ollama serve.' },
  custom: { id: 'custom', label: 'Other', icon: '🔧', desc: 'Any OpenAI-compatible API', model: '', baseUrl: 'https://', keyUrl: '' },
};

export function aiReady(settings) {
  const ai = (settings && settings.ai) || {};
  return !!(ai.apiKey || ai.provider === 'ollama');
}

/** Parse <<<FILE ...>>> and <<<DELETE ...>>> blocks from model output. */
export function parseEdits(text) {
  const edits = [];
  const re = /<<<FILE\s+([^\n]+?)\s*\n([\s\S]*?)\n?>>>(?=\s*(?:\n|$|<<<))/g;
  let m;
  while ((m = re.exec(text))) {
    let content = m[2];
    // tolerate models that wrap content in a markdown fence
    const fence = content.match(/^```[\w-]*\n([\s\S]*?)\n```\s*$/);
    if (fence) content = fence[1];
    edits.push({ type: 'write', path: m[1].trim().replace(/^\.?\//, ''), content: content.endsWith('\n') ? content : content + '\n' });
  }
  const del = /<<<DELETE\s+([^\n>]+?)\s*>>>/g;
  while ((m = del.exec(text))) edits.push({ type: 'delete', path: m[1].trim().replace(/^\.?\//, '') });
  return edits;
}

/** Text without the file blocks (for display). */
export function stripEdits(text) {
  return text
    .replace(/<<<FILE\s+([^\n]+?)\s*\n[\s\S]*?\n?>>>(?=\s*(?:\n|$|<<<))/g, '')
    .replace(/<<<DELETE\s+[^\n>]+?\s*>>>/g, '')
    .trim();
}

/** Line-level diff stats. */
export function diffStats(a = '', b = '') {
  const A = a.split('\n'); const B = b.split('\n');
  const count = (arr) => arr.reduce((m, l) => m.set(l, (m.get(l) || 0) + 1), new Map());
  const ca = count(A); const cb = count(B);
  let add = 0; let del = 0;
  for (const [l, n] of cb) add += Math.max(0, n - (ca.get(l) || 0));
  for (const [l, n] of ca) del += Math.max(0, n - (cb.get(l) || 0));
  return { add, del };
}

/** Build the project context sent with each request (size-limited). */
export function projectContext(project, { activeFile, problems = [], consoleText = '', testText = '' } = {}) {
  const LIMIT = 60000;
  let used = 0;
  const parts = [`Project "${project.name}" — runtime: ${project.runtime}`];
  parts.push('Files:\n' + Object.keys(project.files).map((f) => '- ' + f).join('\n'));
  const order = Object.keys(project.files).sort((a, b) => (a === activeFile ? -1 : b === activeFile ? 1 : 0));
  for (const f of order) {
    const c = project.files[f];
    if (used + c.length > LIMIT) { parts.push(`--- ${f} (omitted, too large) ---`); continue; }
    used += c.length;
    parts.push(`--- ${f} ---\n${c}`);
  }
  if (activeFile) parts.push(`The user currently has "${activeFile}" open.`);
  if (problems.length) parts.push('Current problems:\n' + problems.slice(0, 40).map((p) => `- [${p.severity}] ${p.file || ''}${p.line ? ':' + p.line : ''} ${p.message}`).join('\n'));
  if (consoleText) parts.push('Recent console/run output:\n' + consoleText.slice(-4000));
  if (testText) parts.push('Latest test results:\n' + testText.slice(-6000));
  return parts.join('\n\n');
}

/**
 * Call the configured model. messages: [{role:'user'|'assistant', content}]
 * onToken(textSoFar) is called as the response streams in.
 */
export async function chat(settings, messages, { system = SYSTEM_PROMPT, onToken = () => {}, signal } = {}) {
  const ai = settings.ai || {};
  if (!ai.apiKey && ai.provider !== 'ollama') throw new Error('No AI connected. Tap 🔌 Connect AI and add a key.');
  if (ai.provider === 'anthropic') return anthropic(ai, messages, system, onToken, signal);
  return openaiCompat(ai, messages, system, onToken, signal);
}

async function readSSE(res, onEvent) {
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (data === '[DONE]') return;
      try { onEvent(JSON.parse(data)); } catch { /* partial */ }
    }
  }
}

async function anthropic(ai, messages, system, onToken, signal) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST', signal,
    headers: {
      'content-type': 'application/json',
      'x-api-key': ai.apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({ model: ai.model || 'claude-sonnet-5-5', max_tokens: 16000, system, messages, stream: true }),
  });
  if (!res.ok) throw new Error(`Anthropic API ${res.status}: ${(await res.text()).slice(0, 400)}`);
  let text = '';
  await readSSE(res, (ev) => {
    if (ev.type === 'content_block_delta' && ev.delta && ev.delta.text) { text += ev.delta.text; onToken(text); }
    if (ev.type === 'error') throw new Error(ev.error && ev.error.message);
  });
  return text;
}

async function openaiCompat(ai, messages, system, onToken, signal) {
  const preset = AI_PROVIDERS[ai.provider] || AI_PROVIDERS.openai;
  const base = (ai.baseUrl && ai.baseUrl !== 'https://' ? ai.baseUrl : preset.baseUrl).replace(/\/$/, '');
  const headers = { 'content-type': 'application/json' };
  if (ai.apiKey) headers.authorization = 'Bearer ' + ai.apiKey;
  if (ai.provider === 'openrouter') { headers['HTTP-Referer'] = location.origin; headers['X-Title'] = 'Dev Engine'; }
  const res = await fetch(base + '/chat/completions', {
    method: 'POST', signal, headers,
    body: JSON.stringify({ model: ai.model, stream: true, messages: [{ role: 'system', content: system }, ...messages] }),
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${(await res.text()).slice(0, 400)}`);
  let text = '';
  await readSSE(res, (ev) => {
    const d = ev.choices && ev.choices[0] && ev.choices[0].delta;
    if (d && d.content) { text += d.content; onToken(text); }
  });
  return text;
}

/** Tiny, safe markdown → HTML for agent messages. */
export function renderMarkdown(md) {
  const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const blocks = [];
  let s = md.replace(/```([\w-]*)\n([\s\S]*?)```/g, (m, lang, code) => { blocks.push(`<pre><code>${esc(code)}</code></pre>`); return `\u0000${blocks.length - 1}\u0000`; });
  s = esc(s)
    .replace(/`([^`\n]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>')
    .replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s).,!?:]|$)/g, '$1<i>$2</i>')
    .replace(/^### (.*)$/gm, '<b>$1</b>')
    .replace(/^## (.*)$/gm, '<b>$1</b>')
    .replace(/^# (.*)$/gm, '<b>$1</b>')
    .replace(/^\s*[-*] (.*)$/gm, '• $1')
    .replace(/\n/g, '<br>');
  return s.replace(/\u0000(\d+)\u0000/g, (m, i) => blocks[+i]);
}
