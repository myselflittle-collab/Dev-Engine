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
  if (!ai.apiKey && ai.provider !== 'ollama') throw new Error('No API key set. Open ⚙ Settings → AI Agent and add your key.');
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
  const base = (ai.provider === 'ollama' ? ai.baseUrl || 'http://localhost:11434/v1' : ai.baseUrl || 'https://api.openai.com/v1').replace(/\/$/, '');
  const headers = { 'content-type': 'application/json' };
  if (ai.apiKey) headers.authorization = 'Bearer ' + ai.apiKey;
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
    .replace(/^### (.*)$/gm, '<b>$1</b>')
    .replace(/^## (.*)$/gm, '<b>$1</b>')
    .replace(/^# (.*)$/gm, '<b>$1</b>')
    .replace(/^\s*[-*] (.*)$/gm, '• $1')
    .replace(/\n/g, '<br>');
  return s.replace(/\u0000(\d+)\u0000/g, (m, i) => blocks[+i]);
}
