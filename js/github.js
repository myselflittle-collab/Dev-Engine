// GitHub integration: import public repos, push projects, deploy to GitHub Pages.
const API = 'https://api.github.com';

async function gh(token, method, path, body) {
  const res = await fetch(API + path, {
    method,
    headers: { accept: 'application/vnd.github+json', ...(token ? { authorization: 'Bearer ' + token } : {}), ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null; try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) { const e = new Error(`GitHub ${res.status}: ${(data && data.message) || text}`); e.status = res.status; throw e; }
  return data;
}

/** Parse "owner/repo", "https://github.com/owner/repo/tree/branch/sub/dir" etc. */
export function parseRepoRef(input) {
  const s = String(input || '').trim().replace(/\.git$/, '').replace(/^git@github\.com:/, 'https://github.com/');
  const m = s.match(/^(?:https?:\/\/github\.com\/)?([\w.-]+)\/([\w.-]+)(?:\/tree\/([^/]+)(?:\/(.*))?)?\/?$/);
  if (!m) return null;
  return { owner: m[1], repo: m[2], branch: m[3] || null, dir: m[4] || '' };
}

const TEXT_EXT = /\.(html?|css|scss|less|m?js|cjs|jsx|tsx?|json|md|txt|py|c|h|cpp|hpp|cc|java|go|rs|sh|rb|php|sql|xml|svg|ya?ml|toml|ini|cfg|env|gitignore|csv|kt|cs|swift|lua|r|vue|svelte)$/i;
const TEXT_NAMES = /(^|\/)(Dockerfile|Makefile|LICENSE|Procfile|\.devengine|\.replit|requirements\.txt|\.gitignore)$/;

export async function importRepo(input, token, onProgress = () => {}) {
  const ref = parseRepoRef(input);
  if (!ref) throw new Error('Enter a GitHub repo like owner/repo or a github.com URL');
  const meta = await gh(token, 'GET', `/repos/${ref.owner}/${ref.repo}`);
  const branch = ref.branch || meta.default_branch;
  const tree = await gh(token, 'GET', `/repos/${ref.owner}/${ref.repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`);
  const prefix = ref.dir ? ref.dir.replace(/\/$/, '') + '/' : '';
  const blobs = tree.tree.filter((t) => t.type === 'blob' && t.path.startsWith(prefix) && t.size < 400000
    && (TEXT_EXT.test(t.path) || TEXT_NAMES.test(t.path)) && !/(^|\/)(node_modules|dist|build|\.git|__pycache__|venv|\.venv)\//.test(t.path));
  if (blobs.length > 300) throw new Error(`Repository has ${blobs.length} text files — too large to import (max 300).`);
  const files = {};
  let done = 0;
  const queue = [...blobs];
  const worker = async () => {
    while (queue.length) {
      const b = queue.shift();
      const url = `https://raw.githubusercontent.com/${ref.owner}/${ref.repo}/${encodeURIComponent(branch)}/${b.path.split('/').map(encodeURIComponent).join('/')}`;
      const r = await fetch(url);
      if (r.ok) files[b.path.slice(prefix.length)] = await r.text();
      onProgress(++done, blobs.length);
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));
  return { name: ref.dir ? ref.dir.split('/').pop() : ref.repo, files, description: meta.description || '' };
}

/**
 * Push files to a repo (creates it if needed) as one commit that mirrors the project.
 * Returns { url, pagesUrl? }
 */
export async function pushRepo({ token, repo, files, message = 'Update from Dev Engine', isPrivate = false, description = '', enablePages = false, onStep = () => {} }) {
  if (!token) throw new Error('Add a GitHub personal access token in Settings first (scope: repo).');
  onStep('Checking account…');
  const me = await gh(token, 'GET', '/user');
  let owner = me.login; let name = repo;
  if (repo.includes('/')) [owner, name] = repo.split('/');
  name = name.trim().replace(/[^\w.-]+/g, '-');
  let meta;
  try { meta = await gh(token, 'GET', `/repos/${owner}/${name}`); } catch (e) {
    if (e.status !== 404) throw e;
    onStep('Creating repository…');
    meta = owner === me.login
      ? await gh(token, 'POST', '/user/repos', { name, private: isPrivate, description, auto_init: true })
      : await gh(token, 'POST', `/orgs/${owner}/repos`, { name, private: isPrivate, description, auto_init: true });
    await new Promise((r) => setTimeout(r, 1500));
  }
  const branch = meta.default_branch || 'main';
  onStep('Preparing commit…');
  let parent = null;
  try { parent = (await gh(token, 'GET', `/repos/${owner}/${name}/git/ref/heads/${branch}`)).object.sha; } catch { parent = null; }
  const tree = await gh(token, 'POST', `/repos/${owner}/${name}/git/trees`, {
    tree: Object.entries(files).map(([path, content]) => ({ path, mode: path.endsWith('.sh') ? '100755' : '100644', type: 'blob', content })),
  });
  const commit = await gh(token, 'POST', `/repos/${owner}/${name}/git/commits`, { message, tree: tree.sha, parents: parent ? [parent] : [] });
  onStep('Pushing…');
  if (parent) await gh(token, 'PATCH', `/repos/${owner}/${name}/git/refs/heads/${branch}`, { sha: commit.sha, force: true });
  else await gh(token, 'POST', `/repos/${owner}/${name}/git/refs`, { ref: `refs/heads/${branch}`, sha: commit.sha });
  const out = { url: meta.html_url || `https://github.com/${owner}/${name}` };
  if (enablePages) {
    onStep('Enabling GitHub Pages…');
    try { await gh(token, 'POST', `/repos/${owner}/${name}/pages`, { source: { branch, path: '/' } }); } catch (e) { if (e.status !== 409) throw e; }
    out.pagesUrl = `https://${owner.toLowerCase()}.github.io/${name}/`;
  }
  return out;
}
