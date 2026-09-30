// Backend cho VietDuong Photo: Google Drive (đọc), Firestore (album ảo + yêu cầu truy cập),
// và chế độ demo (?demo=1) dùng dữ liệu giả sinh trong trình duyệt để test không cần đăng nhập.
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
const FIELDS = 'nextPageToken,files(id,name,mimeType,createdTime,thumbnailLink,webContentLink,size,parents,' +
  'imageMediaMetadata(width,height,time,cameraMake,cameraModel,lens,aperture,exposureTime,focalLength,isoSpeed,rotation))';

const chunks = (a, n) => { const r = []; for (let i = 0; i < a.length; i += n) r.push(a.slice(i, i + n)); return r; };
const lc = (s) => (s || '').trim().toLowerCase();

// ---------------------------------------------------------------- Drive (thật)
export function createDrive(getToken, apiKey) {
  async function list(q) {
    const out = []; let pt = '';
    do {
      let url = 'https://www.googleapis.com/drive/v3/files?q=' + encodeURIComponent(q) +
        '&fields=' + encodeURIComponent(FIELDS) + '&pageSize=1000&supportsAllDrives=true&includeItemsFromAllDrives=true';
      if (apiKey) url += '&key=' + encodeURIComponent(apiKey);
      if (pt) url += '&pageToken=' + encodeURIComponent(pt);
      const r = await fetch(url, { headers: { Authorization: 'Bearer ' + getToken() } });
      if (r.status === 401) throw new Error('UNAUTH');
      if (r.status === 403 || r.status === 404) throw new Error('PERMISSION_DENIED');
      if (!r.ok) { let m = 'HTTP ' + r.status; try { m = (await r.json()).error.message; } catch (e) {} throw new Error(m); }
      const d = await r.json(); out.push(...(d.files || [])); pt = d.nextPageToken;
    } while (pt);
    return out;
  }
  const inParents = (ids) => '(' + ids.map((i) => `'${i}' in parents`).join(' or ') + ')';
  return {
    // Duyệt cây thư mục theo tầng, mỗi tầng gộp 20 thư mục / 1 truy vấn.
    async loadAll(rootId, onProgress) {
      const folders = [{ id: rootId, name: '', parent: null }];
      let level = [rootId];
      while (level.length) {
        const next = [];
        for (const grp of chunks(level, 20)) {
          try {
            const fs = await list(inParents(grp) + ` and mimeType='${FOLDER_MIME}' and trashed=false`);
            fs.forEach((f) => { folders.push({ id: f.id, name: f.name, parent: f.parents && f.parents[0] }); next.push(f.id); });
          } catch (e) { if (e.message === 'UNAUTH' || grp.includes(rootId)) throw e; }
        }
        level = next;
        onProgress && onProgress(folders.length, 0);
      }
      const files = [];
      for (const grp of chunks(folders.map((f) => f.id), 20)) {
        try {
          const fs = await list(inParents(grp) + ` and mimeType!='${FOLDER_MIME}' and trashed=false`);
          files.push(...fs);
        } catch (e) { if (e.message === 'UNAUTH' || grp.includes(rootId)) throw e; }
        onProgress && onProgress(folders.length, files.length);
      }
      return { folders, files };
    },
    async userEmail() {
      const r = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', { headers: { Authorization: 'Bearer ' + getToken() } });
      if (r.status === 401) throw new Error('UNAUTH');
      return r.ok ? lc((await r.json()).email) : '';
    },
    async blob(item) {
      const r = await fetch(`https://www.googleapis.com/drive/v3/files/${item.id}?alt=media`, { headers: { Authorization: 'Bearer ' + getToken() } });
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
  const add = (parent, prefix, n, y, m, hue0) => {
    for (let i = 0; i < n; i++) {
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

  const LS = (k, v) => { try { if (v === undefined) return JSON.parse(localStorage.getItem(k) || 'null'); localStorage.setItem(k, JSON.stringify(v)); } catch (e) { return null; } };
  const albums = () => LS('vdphoto_demo_albums') || [];
  const reqs = () => LS('vdphoto_demo_reqs') || [];
  return {
    demo: true,
    drive: {
      async loadAll() {
        return { folders: folders.filter((f) => guest ? f.id !== 'f-locked' : true), files: files.filter((f) => guest ? f.parents[0] !== 'f-locked' : true) };
      },
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
