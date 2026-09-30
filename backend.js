// Backend cho VietDuong Photo: Google Drive (đọc), Firestore (album ảo + yêu cầu truy cập),
// và chế độ demo (?demo=1) dùng dữ liệu giả sinh trong trình duyệt để test không cần đăng nhập.
import { mergeDelta, buildBatch, parseBatch } from './lib.js';
const FB_VER = '10.12.5';
const FB_CONFIG = {
  apiKey: 'AIzaSyB8-vSVDKhOLuTA6xmYZzwHVrWX58eT3d4',
  authDomain: 'ividlab-rficonsole.firebaseapp.com',
  projectId: 'ividlab-rficonsole',
  storageBucket: 'ividlab-rficonsole.firebasestorage.app',
  messagingSenderId: '447726977999',
  appId: '1:447726977999:web:68355281ff424892ea48ba',
};
export const ADMIN_FALLBACK = 'dinhvietdung.vn@gmail.com';
const FOLDER_MIME = 'application/vnd.google-apps.folder';
// Danh sách chỉ lấy trường nhẹ; EXIF đầy đủ lấy riêng khi mở lightbox (drive.meta).
const LIST_FIELDS = 'nextPageToken,files(id,name,mimeType,createdTime,modifiedTime,thumbnailLink,webContentLink,size,parents,imageMediaMetadata(width,height,time))';
const FOLDER_FIELDS = 'nextPageToken,files(id,name,parents)';

const chunks = (a, n) => { const r = []; for (let i = 0; i < a.length; i += n) r.push(a.slice(i, i + n)); return r; };
const lc = (s) => (s || '').trim().toLowerCase();

// ---------------------------------------------------------------- Drive (thật)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// fetch có exponential backoff cho 429 / 5xx / 403 rateLimit (quota Drive).
async function retryFetch(url, opts, tries = 5) {
  for (let i = 0; ; i++) {
    let r;
    try { r = await fetch(url, opts); } catch (e) { if (i >= tries - 1) throw e; await sleep(500 * 2 ** i); continue; }
    let limited = r.status === 429 || r.status >= 500;
    if (r.status === 403) { try { const j = await r.clone().json(); limited = /rateLimit|quota/i.test(JSON.stringify((j.error && j.error.errors) || '')); } catch (e) { /* không phải JSON */ } }
    if (!limited || i >= tries - 1) return r;
    await sleep(500 * 2 ** i + Math.random() * 300);
  }
}

export function createDrive(getToken, apiKey, base = 'https://www.googleapis.com') {
  base = base.replace(/\/+$/, '');
  const auth = () => ({ headers: { Authorization: 'Bearer ' + getToken() } });
  async function list(q, fields) {
    const out = []; let pt = '';
    do {
      let url = base + '/drive/v3/files?q=' + encodeURIComponent(q) +
        '&fields=' + encodeURIComponent(fields) + '&pageSize=1000&supportsAllDrives=true&includeItemsFromAllDrives=true';
      if (apiKey) url += '&key=' + encodeURIComponent(apiKey);
      if (pt) url += '&pageToken=' + encodeURIComponent(pt);
      const r = await retryFetch(url, auth());
      if (r.status === 401) throw new Error('UNAUTH');
      if (r.status === 403 || r.status === 404) throw new Error('PERMISSION_DENIED');
      if (!r.ok) { let m = 'HTTP ' + r.status; try { m = (await r.json()).error.message; } catch (e) { /* bỏ qua */ } throw new Error(m); }
      const d = await r.json(); out.push(...(d.files || [])); pt = d.nextPageToken;
    } while (pt);
    return out;
  }
  const inParents = (ids) => '(' + ids.map((i) => `'${i}' in parents`).join(' or ') + ')';

  async function loadFolders(rootId, onProgress) {
    const folders = [{ id: rootId, name: '', parent: null }];
    let level = [rootId];
    while (level.length) {
      const next = [];
      // các truy vấn cùng 1 tầng chạy song song (tối đa 3 luồng)
      const groups = chunks(level, 20);
      for (let i = 0; i < groups.length; i += 3) {
        await Promise.all(groups.slice(i, i + 3).map(async (grp) => {
          try {
            const fs = await list(inParents(grp) + ` and mimeType='${FOLDER_MIME}' and trashed=false`, FOLDER_FIELDS);
            fs.forEach((f) => { folders.push({ id: f.id, name: f.name, parent: f.parents && f.parents[0] }); next.push(f.id); });
          } catch (e) { if (e.message === 'UNAUTH' || grp.includes(rootId)) throw e; }
        }));
      }
      level = next; onProgress && onProgress(folders.length, 0);
    }
    return folders;
  }
  async function listFiles(folderIds, extra, fields, onProgress, base) {
    const files = []; const groups = chunks(folderIds, 20);
    for (let i = 0; i < groups.length; i += 3) {
      await Promise.all(groups.slice(i, i + 3).map(async (grp) => {
        try { files.push(...await list(inParents(grp) + extra, fields)); } catch (e) { if (e.message === 'UNAUTH' || grp.includes(folderIds[0])) throw e; }
      }));
      onProgress && onProgress(base, files.length);
    }
    return files;
  }
  const notFolder = ` and mimeType!='${FOLDER_MIME}'`;

  return {
    // Tải đầy đủ. Trả thêm syncedAt để lần sau chỉ lấy phần thay đổi.
    async loadAll(rootId, onProgress, onTree) {
      const syncedAt = Date.now() - 60000;
      const folders = await loadFolders(rootId, onProgress);
      onTree && onTree(folders);
      const files = await listFiles(folders.map((f) => f.id), notFolder + ' and trashed=false', LIST_FIELDS, onProgress, folders.length);
      return { folders, files, syncedAt };
    },
    // Đồng bộ tăng dần: dựng lại cây thư mục (rẻ) + chỉ file có modifiedTime mới hơn lần trước (kể cả đã vào thùng rác).
    async refresh(rootId, prev, onProgress) {
      const syncedAt = Date.now() - 60000;
      const folders = await loadFolders(rootId, onProgress);
      const since = new Date(prev.syncedAt).toISOString();
      const delta = await listFiles(folders.map((f) => f.id), notFolder + ` and modifiedTime > '${since}'`, LIST_FIELDS.replace('files(', 'files(trashed,'), onProgress, folders.length);
      return { folders, files: mergeDelta(prev.files, delta, new Set(folders.map((f) => f.id))), syncedAt };
    },
    async userEmail() {
      const r = await retryFetch('https://www.googleapis.com/oauth2/v3/userinfo', auth());
      if (r.status === 401) throw new Error('UNAUTH');
      return r.ok ? lc((await r.json()).email) : '';
    },
    // EXIF đầy đủ, lấy khi mở lightbox (danh sách chỉ lấy width/height/time cho nhẹ).
    async meta(id) {
      const r = await retryFetch(`${base}/drive/v3/files/${id}?fields=${encodeURIComponent('imageMediaMetadata,size')}&supportsAllDrives=true`, auth());
      return r.ok ? r.json() : null;
    },
    // Link thumbnail mới (link cũ hết hạn sau vài giờ).
    async thumb(id) {
      const r = await retryFetch(`${base}/drive/v3/files/${id}?fields=thumbnailLink&supportsAllDrives=true`, auth());
      return r.ok ? (await r.json()).thumbnailLink || null : null;
    },
    // Gộp nhiều files.get thumbnailLink vào 1 request batch (tối đa 50). Lỗi/không hỗ trợ → tự rơi về từng request.
    async thumbs(ids) {
      const out = {};
      for (const grp of chunks(ids, 50)) {
        let got = null;
        try {
          const boundary = 'vdbatch' + Math.random().toString(36).slice(2);
          const r = await retryFetch(`${base}/batch/drive/v3`, { method: 'POST', headers: { Authorization: 'Bearer ' + getToken(), 'Content-Type': `multipart/mixed; boundary=${boundary}` }, body: buildBatch(grp, boundary) });
          if (r.ok) got = parseBatch(await r.text(), r.headers.get('Content-Type'), grp);
        } catch (e) { got = null; }
        if (got) Object.assign(out, got);
        for (const id of grp) if (!(id in out)) { try { const l = await this.thumb(id); if (l) out[id] = l; } catch (e) { /* bỏ qua */ } }
      }
      return out;
    },
    async stream(item) {
      const r = await retryFetch(`${base}/drive/v3/files/${item.id}?alt=media&supportsAllDrives=true`, auth());
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.body;
    },
    async blob(item) {
      const r = await retryFetch(`${base}/drive/v3/files/${item.id}?alt=media&supportsAllDrives=true`, auth());
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.blob();
    },
  };
}

// ---------------------------------------------------------------- Firestore (thật)
export function createStore() {
  let fb = null;
  async function init() {
    if (fb) return fb;
    const base = `https://www.gstatic.com/firebasejs/${FB_VER}/`;
    const [a, au, f] = await Promise.all([
      import(base + 'firebase-app.js'), import(base + 'firebase-auth.js'), import(base + 'firebase-firestore.js'),
    ]);
    const app = a.getApps().length ? a.getApp() : a.initializeApp(FB_CONFIG);
    fb = { au, f, auth: au.getAuth(app), db: f.getFirestore(app) };
    return fb;
  }
  return {
    // Đổi access token Google (GIS) thành phiên Firebase để rules Firestore nhận email.
    async signIn(accessToken) {
      const { au, auth } = await init();
      const cred = au.GoogleAuthProvider.credential(null, accessToken);
      await au.signInWithCredential(auth, cred);
    },
    async signOut() { try { const { au, auth } = await init(); await au.signOut(auth); } catch (e) { /* bỏ qua */ } },
    async isOwner(email) {
      try {
        const { f, db } = await init();
        const s = await f.getDoc(f.doc(db, 'config', 'owners'));
        const emails = (s.exists() && s.data().emails) || [];
        return emails.map(lc).includes(email);
      } catch (e) { return false; }
    },
    async listAlbums() {
      const { f, db } = await init();
      const s = await f.getDocs(f.collection(db, 'photoAlbums'));
      return s.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    },
    async createAlbum(name, fileIds) {
      const { f, db } = await init();
      const ref = await f.addDoc(f.collection(db, 'photoAlbums'), { name, fileIds, cover: fileIds[0] || null, createdAt: f.serverTimestamp() });
      return ref.id;
    },
    async updateAlbum(id, patch) {
      const { f, db } = await init();
      await f.updateDoc(f.doc(db, 'photoAlbums', id), patch);
    },
    async deleteAlbum(id) {
      const { f, db } = await init();
      await f.deleteDoc(f.doc(db, 'photoAlbums', id));
    },
    async sendRequest(email, note) {
      const { f, db } = await init();
      await f.setDoc(f.doc(db, 'photoRequests', lc(email)), { email: lc(email), note: note || '', ts: f.serverTimestamp() });
    },
    async listRequests() {
      const { f, db } = await init();
      const s = await f.getDocs(f.collection(db, 'photoRequests'));
      return s.docs.map((d) => d.data().email);
    },
    async deleteRequest(email) {
      const { f, db } = await init();
      await f.deleteDoc(f.doc(db, 'photoRequests', lc(email)));
    },
  };
}

// ---------------------------------------------------------------- Demo
function svgUri(w, h, hue, label) {
  const s = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
    `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${hue},70%,55%)"/>` +
    `<stop offset="1" stop-color="hsl(${(hue + 60) % 360},70%,35%)"/></linearGradient></defs>` +
    `<rect width="100%" height="100%" fill="url(#g)"/><circle cx="${w * 0.7}" cy="${h * 0.3}" r="${Math.min(w, h) * 0.12}" fill="rgba(255,255,255,.35)"/>` +
    `<text x="50%" y="55%" font-family="sans-serif" font-size="${Math.min(w, h) / 9}" fill="#fff" text-anchor="middle">${label}</text></svg>`;
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(s);
}

export function createDemo(guest) {
  const folders = [
    { id: 'root', name: '', parent: null },
    { id: 'f-dalat', name: 'Đà Lạt 2025', parent: 'root' },
    { id: 'f-hoian', name: 'Hội An 2024', parent: 'root' },
    { id: 'f-pho', name: 'Phố cổ', parent: 'f-hoian' },
    { id: 'f-locked', name: 'Riêng tư', parent: 'root' },
  ];
  const files = [];
  const sizes = [[1600, 1067], [1067, 1600], [1600, 900], [1200, 1200], [1600, 1067], [900, 1600]];
  const add = (parent, prefix, n, y, m, hue0, start = 0) => {
    for (let i = start; i < start + n; i++) {
      const [w, h] = sizes[i % sizes.length];
      const name = `${prefix}_${String(i + 1).padStart(3, '0')}`;
      const uri = svgUri(w, h, (hue0 + i * 23) % 360, name);
      const d = new Date(y, m - 1, 1 + ((i * 3) % 27), 8 + (i % 10), i % 60);
      files.push({
        id: `${parent}-${i}`, name: name + '.JPG', mimeType: 'image/jpeg', parents: [parent], createdTime: d.toISOString(),
        thumbnailLink: uri, webContentLink: uri, size: String(2000000 + i * 1000),
        imageMediaMetadata: { width: w, height: h, time: `${y}:${String(m).padStart(2, '0')}:${String(1 + ((i * 3) % 27)).padStart(2, '0')} 09:00:00`,
          cameraMake: 'SONY', cameraModel: 'ILCE-7M3', lens: 'FE 35mm F1.8', aperture: 1.8, exposureTime: 0.004, focalLength: 35, isoSpeed: 100 },
      });
      if (i % 3 === 0) files.push({ id: `${parent}-${i}-raw`, name: name + '.ARW', mimeType: 'image/x-sony-arw', parents: [parent], createdTime: d.toISOString(), webContentLink: uri, size: '25000000' });
    }
  };
  add('root', 'ROOT', 3, 2025, 9, 200);
  add('f-dalat', 'DALAT', 14, 2025, 3, 20);
  add('f-hoian', 'HOIAN', 6, 2024, 7, 140);
  add('f-pho', 'PHO', 5, 2024, 7, 300);
  add('f-locked', 'LOCK', 2, 2024, 1, 0);
  const many = +new URLSearchParams(location.search).get('many') || 0; // test: thêm N ảnh để thử virtual recycling
  if (many) add('f-dalat', 'BULK', many, 2023, 5, 60, 1000);

  const LS = (k, v) => { try { if (v === undefined) return JSON.parse(localStorage.getItem(k) || 'null'); localStorage.setItem(k, JSON.stringify(v)); } catch (e) { return null; } };
  const albums = () => LS('vdphoto_demo_albums') || [];
  const reqs = () => LS('vdphoto_demo_reqs') || [];
  return {
    demo: true,
    drive: {
      async loadAll(rootId, onProgress, onTree) {
        const r = { folders: folders.filter((f) => guest ? f.id !== 'f-locked' : true), files: files.filter((f) => guest ? f.parents[0] !== 'f-locked' : true), syncedAt: Date.now() };
        onTree && onTree(r.folders);
        const slow = +new URLSearchParams(location.search).get('slow') || 0;
        if (slow) await new Promise((res) => setTimeout(res, slow)); // test: giữ khoảng trống giữa cây thư mục và file
        return r;
      },
      async refresh() { return this.loadAll(); },
      async meta() { return null; },
      async thumb() { return null; },
      async thumbs() { return {}; },
      async stream(item) { return (await fetch(item.dl)).body; },
      async userEmail() { return guest ? 'khach@example.com' : ADMIN_FALLBACK; },
      async blob(item) { return (await fetch(item.dl)).blob(); },
    },
    store: {
      async signIn() {}, async signOut() {},
      async isOwner() { return !guest; },
      async listAlbums() { return albums(); },
      async createAlbum(name, ids) { const a = albums(); const id = 'va' + Date.now(); a.push({ id, name, fileIds: ids, cover: ids[0] || null }); LS('vdphoto_demo_albums', a); return id; },
      async updateAlbum(id, patch) { LS('vdphoto_demo_albums', albums().map((x) => x.id === id ? { ...x, ...patch } : x)); },
      async deleteAlbum(id) { LS('vdphoto_demo_albums', albums().filter((x) => x.id !== id)); },
      async sendRequest(email) { const r = reqs().filter((x) => x !== email); r.push(email); LS('vdphoto_demo_reqs', r); },
      async listRequests() { return reqs(); },
      async deleteRequest(email) { LS('vdphoto_demo_reqs', reqs().filter((x) => x !== email)); },
    },
  };
}
