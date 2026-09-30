// Logic thuần (không đụng DOM/localStorage) của VietDuong Photo — test bằng `npm test` (tests/vietduongphoto.test.mjs).
export const RAW_EXT = ['arw', 'cr2', 'cr3', 'nef', 'dng', 'raf', 'orf', 'rw2'];
export const STD_EXT = ['jpg', 'jpeg', 'png', 'heic', 'heif', 'webp', 'gif', 'bmp'];

export const parseTaken = (s) => {
  const m = /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/.exec(s || '');
  return m ? new Date(+m[1], m[2] - 1, +m[3], +m[4], +m[5], +m[6]).getTime() : 0;
};

const driveThumb = (id, w) => `https://drive.google.com/thumbnail?id=${id}&sz=w${w}`;
const driveDl = (id) => `https://drive.google.com/uc?id=${id}&export=download`;

// URL thumbnail theo kích thước mong muốn (thumbnailLink của Drive có đuôi =s<px>).
export function thumbAt(p, size) {
  if (p.tb) return `${p.tb}=s${size}`;
  return p.thumbRaw || driveThumb(p.id, size);
}

// raw = { folders: [{id,name,parent}], files: [Drive file + parents] } → thư viện đã ghép cặp JPG/RAW.
export function buildLibrary(raw, rootId) {
  const folders = new Map();
  raw.folders.forEach((f) => folders.set(f.id, { id: f.id, name: f.name, parent: f.parent, children: [], photos: [], deep: [] }));
  folders.forEach((f) => { const p = folders.get(f.parent); if (p) p.children.push(f); });
  const groups = new Map();
  raw.files.forEach((f) => {
    const parent = f.parents && f.parents[0];
    if (!folders.has(parent) || f.trashed) return;
    const m = /^(.*)\.([A-Za-z0-9]+)$/.exec(f.name);
    const base = m ? m[1] : f.name; const ext = m ? m[2].toLowerCase() : '';
    const isRaw = RAW_EXT.includes(ext);
    const isImg = STD_EXT.includes(ext) || ((f.mimeType || '').startsWith('image/') && !isRaw);
    if (!isRaw && !isImg) return;
    const key = parent + '|' + base.toLowerCase();
    let g = groups.get(key);
    if (!g) { g = { parent, std: null, raw: null }; groups.set(key, g); }
    if (isRaw) g.raw = f;
    else if (!g.std) g.std = f;
    else groups.set(key + '|' + f.id, { parent, std: f, raw: null }); // trùng tên hoàn toàn: coi là ảnh độc lập
  });
  const photos = [];
  groups.forEach((g) => {
    const f = g.std || g.raw; const md = f.imageMediaMetadata || {};
    const link = f.thumbnailLink || '';
    const scaled = /=s\d+/.test(link);
    const nm = /^(.*)\.([A-Za-z0-9]+)$/.exec(f.name);
    photos.push({
      id: f.id, name: f.name, parent: g.parent, ext: (nm ? nm[2] : 'JPG').toUpperCase().replace('JPEG', 'JPG'),
      time: parseTaken(md.time) || (f.createdTime ? new Date(f.createdTime).getTime() : 0),
      w: md.width || 0, h: md.height || 0, size: +f.size || 0, meta: md,
      tb: scaled ? link.replace(/=s\d+.*/, '') : '', thumbRaw: link && !scaled ? link : '',
      dl: f.webContentLink || driveDl(f.id), onlyRaw: !g.std,
      raw: g.std && g.raw ? { id: g.raw.id, name: g.raw.name, dl: g.raw.webContentLink || driveDl(g.raw.id), size: +g.raw.size || 0 } : null,
    });
  });
  photos.sort((a, b) => b.time - a.time);
  photos.forEach((p) => folders.get(p.parent).photos.push(p));
  const deep = (f) => { f.deep = f.photos.slice(); f.children.forEach((c) => { deep(c); f.deep.push(...c.deep); }); f.deep.sort((a, b) => b.time - a.time); };
  const root = folders.get(rootId) || folders.values().next().value;
  if (root) deep(root);
  return { folders, photos, byId: new Map(photos.map((p) => [p.id, p])), root };
}

// Gộp thay đổi tăng dần (files có modifiedTime > lần đồng bộ trước) vào danh sách file đã cache.
export function mergeDelta(files, delta, folderIds) {
  const map = new Map(files.map((f) => [f.id, f]));
  delta.forEach((f) => { if (f.trashed) map.delete(f.id); else map.set(f.id, f); });
  return [...map.values()].filter((f) => f.parents && folderIds.has(f.parents[0]));
}

// Chữ ký để biết dữ liệu nền có thay đổi so với đang hiển thị không.
export function signature(raw) {
  let mx = ''; raw.files.forEach((f) => { if (f.modifiedTime && f.modifiedTime > mx) mx = f.modifiedTime; });
  return `${raw.folders.length}|${raw.files.length}|${mx}`;
}

export function applyFilters(list, f, favs) {
  const q = (f.q || '').trim().toLowerCase();
  return list.filter((p) => (!q || p.name.toLowerCase().includes(q)) &&
    (!f.year || String(new Date(p.time).getFullYear()) === f.year) &&
    (!f.raw || p.raw || p.onlyRaw) && (!f.fav || favs.has(p.id)));
}

export function groupMonths(items, lang = 'vi') {
  const rows = []; const months = []; let cur = '';
  items.forEach((p) => {
    const d = new Date(p.time); const key = `${d.getFullYear()}-${d.getMonth() + 1}`;
    if (key !== cur) {
      cur = key;
      const m = { key, year: d.getFullYear(), idx: rows.length, label: `${d.getMonth() + 1}/${d.getFullYear()}`,
        title: lang === 'vi' ? `Tháng ${d.getMonth() + 1}, ${d.getFullYear()}` : `${d.toLocaleString('en', { month: 'long' })} ${d.getFullYear()}` };
      months.push(m); rows.push({ h: m });
    }
    rows.push({ p });
  });
  return { rows, months };
}

export function parseHash(hash) {
  const [a, b] = hash.replace(/^#\/?/, '').split('/');
  if (a === 'all') return { type: 'all' };
  if (a === 'fav') return { type: 'fav' };
  if (a === 'f' && b) return { type: 'folder', id: decodeURIComponent(b) };
  if (a === 'v' && b) return { type: 'valbum', id: decodeURIComponent(b) };
  if (a === 'p' && b) return { type: 'photo', id: decodeURIComponent(b) };
  return { type: 'home' };
}

// Drive batch (multipart/mixed): gộp nhiều files.get thumbnailLink vào 1 request.
export function buildBatch(ids, boundary) {
  return ids.map((id, i) => `--${boundary}\r\nContent-Type: application/http\r\nContent-ID: <item${i}>\r\n\r\n` +
    `GET /drive/v3/files/${id}?fields=thumbnailLink&supportsAllDrives=true\r\n\r\n`).join('') + `--${boundary}--`;
}
export function parseBatch(text, contentType, ids) {
  const m = /boundary=("?)([^";]+)\1/.exec(contentType || ''); const out = {};
  if (!m) return out;
  text.split('--' + m[2]).forEach((part) => {
    const c = /Content-ID:\s*<response-item(\d+)>/i.exec(part); if (!c) return;
    if (!/HTTP\/1\.1 200/.test(part)) return;
    const j = /(\{[\s\S]*\})\s*$/.exec(part.trim()); if (!j) return;
    try { const link = JSON.parse(j[1]).thumbnailLink; if (link) out[ids[+c[1]]] = link; } catch (e) { /* bỏ qua */ }
  });
  return out;
}
