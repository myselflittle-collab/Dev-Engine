// Media library: images & videos stored in IndexedDB (too big for localStorage).
const DB = 'devengine-media';
let dbp = null;
const urls = new Map();

function db() {
  if (!dbp) {
    dbp = new Promise((res, rej) => {
      const r = indexedDB.open(DB, 1);
      r.onupgradeneeded = () => { const s = r.result.createObjectStore('assets', { keyPath: 'id' }); s.createIndex('site', 'site'); };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  }
  return dbp;
}
const tx = async (mode, fn) => { const d = await db(); return new Promise((res, rej) => { const t = d.transaction('assets', mode); const out = fn(t.objectStore('assets')); t.oncomplete = () => res(out && out.result !== undefined ? out.result : out); t.onerror = () => rej(t.error); }); };

export async function addAsset(siteId, file) {
  const id = 'a' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const blob = file.type.startsWith('image/') && file.size > 1_500_000 && !/gif|svg/.test(file.type) ? await shrinkImage(file, 2000) : file;
  const type = blob.type || file.type || (/\.glb$/i.test(file.name) ? 'model/gltf-binary' : /\.gltf$/i.test(file.name) ? 'model/gltf+json' : '');
  await tx('readwrite', (s) => s.put({ id, site: siteId, name: file.name, type, size: blob.size, blob, at: Date.now() }));
  urls.set(id, URL.createObjectURL(blob));
  return { id, name: file.name, type, size: blob.size };
}

export async function listAssets(siteId) {
  const all = await tx('readonly', (s) => s.index('site').getAll(siteId));
  for (const a of all) if (!urls.has(a.id)) urls.set(a.id, URL.createObjectURL(a.blob));
  return all.map(({ blob, ...rest }) => rest).sort((a, b) => b.at - a.at);
}

export async function getAsset(id) { return tx('readonly', (s) => s.get(id)); }
export async function deleteAsset(id) { await tx('readwrite', (s) => s.delete(id)); if (urls.has(id)) { URL.revokeObjectURL(urls.get(id)); urls.delete(id); } }

/** 'asset:ID' → object URL (call listAssets first); other URLs pass through. */
export function resolveSrc(src) {
  if (!src) return '';
  if (src.startsWith('asset:')) return urls.get(src.slice(6)) || '';
  return src;
}

export function blobToDataURL(blob) {
  return new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(blob); });
}

export const extFor = (type) => ({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/svg+xml': 'svg', 'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov', 'model/gltf-binary': 'glb', 'model/gltf+json': 'gltf' }[type] || (type.split('/')[1] || 'bin'));

async function shrinkImage(file, max) {
  try {
    const bmp = await createImageBitmap(file);
    const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    return await new Promise((r) => c.toBlob((b) => r(b || file), 'image/jpeg', 0.85));
  } catch { return file; }
}

export const isModel = (a) => /^model\//.test(a.type || '') || /\.(glb|gltf)$/i.test(a.name || '');
