import { createDrive, createStore, createDemo, ADMIN_FALLBACK } from './backend.js';

// ============================ Cấu hình mặc định ============================
const DEFAULT_CLIENT_ID = '110344757733-bnomi4d63vsrb144pt5qpss8246supmd.apps.googleusercontent.com';
const DEFAULT_FOLDER_ID = '1MurjCwIStG_1KkT8Au492FT9_2-rPSP6';
const CACHE_TTL = 20 * 60 * 1000;
const PAGE = 80;

const QS = new URLSearchParams(location.search);
const DEMO = QS.get('demo') === '1';

// ============================ Tiện ích ============================
const $ = (s) => document.querySelector(s);
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const lsGet = (k, d = null) => { try { const v = localStorage.getItem(k); return v == null ? d : v; } catch (e) { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* bỏ qua */ } };
const lsDel = (k) => { try { localStorage.removeItem(k); } catch (e) { /* bỏ qua */ } };
const show = (e, on = true) => e.classList.toggle('hidden', !on);

// ============================ i18n ============================
const I18N = {
  vi: {
    login: 'Đăng nhập', logout: 'Đăng xuất', loginTitle: 'Yêu cầu đăng nhập', loginBtn: 'Đăng nhập bằng Google',
    loginDesc: 'Trang web này yêu cầu đăng nhập bằng tài khoản Google để kiểm tra quyền truy cập thư viện ảnh.',
    loading: 'Đang tải ảnh...', reqAccess: 'Gửi yêu cầu truy cập', reqMail: 'Gửi email xin truy cập',
    search: 'Tìm theo tên ảnh...', rawOnly: 'Có RAW', favOnly: 'Yêu thích', select: 'Chọn', withRaw: 'kèm RAW',
    selAll: 'Chọn tất cả', zip: 'Tải zip', addAlbum: 'Thêm vào album', setCover: 'Làm bìa', removeFromAlbum: 'Bỏ khỏi album',
    cancel: 'Huỷ', settingsTitle: 'Cài đặt Google Drive API', settingsHelp: 'Nhập thông tin OAuth để kết nối với Google Drive.',
    requests: 'Yêu cầu truy cập', save: 'Lưu cấu hình', existAlbum: 'Album có sẵn', newAlbum: 'Hoặc tạo album mới', ok: 'Thêm',
    dlRaw: 'Tải file RAW', dl: 'Tải ảnh', home: 'Thư viện', all: 'Tất cả ảnh', fav: 'Yêu thích', albums: 'Album',
    virtualAlbums: 'Album tuyển chọn', unsorted: 'Ảnh ở thư mục gốc', photos: 'ảnh', allYears: 'Mọi năm', empty: 'Không có ảnh nào.',
    noPerm: 'Bạn chưa có quyền truy cập vào thư mục ảnh này.', month: 'Tháng', sessionExpired: 'Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại.',
    notFound: 'Không tìm thấy album.', share: 'Sao chép link', copied: 'Đã sao chép link', rename: 'Đổi tên', del: 'Xoá album',
    confirmDel: 'Xoá album này? (ảnh trên Drive không bị ảnh hưởng)', renamePrompt: 'Tên album mới:', added: 'Đã thêm vào album',
    removed: 'Đã bỏ khỏi album', coverSet: 'Đã đặt ảnh bìa', reqSent: 'Đã gửi yêu cầu cho chủ thư viện', saveErr: 'Không lưu được (Firestore từ chối hoặc chưa bật Google sign-in)',
    zipping: 'Đang nén', zipBig: 'Tổng dung lượng khoảng {mb} MB, tiếp tục?', nothing: 'Chưa chọn ảnh nào', pickOne: 'Chọn đúng 1 ảnh làm bìa',
    subAlbums: 'Album con', photosHere: 'Ảnh trong album', openDrive: 'Đang tải cây thư mục...', selected: 'đã chọn',
    infoName: 'Tên', infoDate: 'Ngày chụp', infoSize: 'Kích thước', infoFile: 'Dung lượng', infoCam: 'Máy ảnh', infoLens: 'Ống kính', infoExp: 'Thông số',
  },
  en: {
    login: 'Sign in', logout: 'Sign out', loginTitle: 'Sign-in required', loginBtn: 'Sign in with Google',
    loginDesc: 'This site requires a Google sign-in to check your access to the photo library.',
    loading: 'Loading photos...', reqAccess: 'Request access', reqMail: 'Email to request access',
    search: 'Search by file name...', rawOnly: 'Has RAW', favOnly: 'Favorites', select: 'Select', withRaw: 'with RAW',
    selAll: 'Select all', zip: 'Download zip', addAlbum: 'Add to album', setCover: 'Set cover', removeFromAlbum: 'Remove from album',
    cancel: 'Cancel', settingsTitle: 'Google Drive API settings', settingsHelp: 'Enter OAuth details to connect to Google Drive.',
    requests: 'Access requests', save: 'Save', existAlbum: 'Existing album', newAlbum: 'Or create a new album', ok: 'Add',
    dlRaw: 'Download RAW', dl: 'Download', home: 'Library', all: 'All photos', fav: 'Favorites', albums: 'Albums',
    virtualAlbums: 'Curated albums', unsorted: 'Photos in root folder', photos: 'photos', allYears: 'All years', empty: 'No photos.',
    noPerm: 'You do not have access to this photo folder.', month: 'Month', sessionExpired: 'Session expired, please sign in again.',
    notFound: 'Album not found.', share: 'Copy link', copied: 'Link copied', rename: 'Rename', del: 'Delete album',
    confirmDel: 'Delete this album? (Drive photos are not affected)', renamePrompt: 'New album name:', added: 'Added to album',
    removed: 'Removed from album', coverSet: 'Cover set', reqSent: 'Request sent to the library owner', saveErr: 'Could not save (Firestore denied or Google sign-in not enabled)',
    zipping: 'Zipping', zipBig: 'Total about {mb} MB, continue?', nothing: 'Nothing selected', pickOne: 'Select exactly 1 photo for the cover',
    subAlbums: 'Sub-albums', photosHere: 'Photos in album', openDrive: 'Loading folder tree...', selected: 'selected',
    infoName: 'Name', infoDate: 'Taken', infoSize: 'Dimensions', infoFile: 'File size', infoCam: 'Camera', infoLens: 'Lens', infoExp: 'Exposure',
  },
};
let lang = lsGet('ividlab-lang', 'vi') === 'en' ? 'en' : 'vi';
const t = (k) => I18N[lang][k] || k;
function applyI18n() {
  document.documentElement.lang = lang;
  document.querySelectorAll('[data-i18n]').forEach((n) => { n.textContent = t(n.dataset.i18n); });
  document.querySelectorAll('[data-i18n-ph]').forEach((n) => { n.placeholder = t(n.dataset.i18nPh); });
  $('#langBtn').textContent = lang.toUpperCase();
}

// ============================ Theme ============================
function applyTheme(th) {
  document.documentElement.setAttribute('data-theme', th);
  lsSet('ividlab-theme', th);
  $('#themeBtn').innerHTML = th === 'dark' ? '<i class="fas fa-sun"></i>' : '<i class="fas fa-moon"></i>';
}

// ============================ Cache IndexedDB ============================
const idb = () => new Promise((res, rej) => { const r = indexedDB.open('vdphoto', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
async function cget(k) { try { const db = await idb(); return await new Promise((res) => { const q = db.transaction('kv').objectStore('kv').get(k); q.onsuccess = () => res(q.result); q.onerror = () => res(null); }); } catch (e) { return null; } }
async function cset(k, v) { try { const db = await idb(); db.transaction('kv', 'readwrite').objectStore('kv').put(v, k); } catch (e) { /* bỏ qua */ } }
async function cclear() { try { const db = await idb(); db.transaction('kv', 'readwrite').objectStore('kv').clear(); } catch (e) { /* bỏ qua */ } }

// ============================ State ============================
const S = {
  token: null, email: '', isAdmin: false, backend: null,
  folders: new Map(), photos: [], byId: new Map(), vAlbums: [],
  filters: { q: '', year: '', raw: false, fav: false },
  visible: [], selectMode: false, selected: new Set(), route: { type: 'home' },
  favs: new Set(JSON.parse(lsGet('vdphoto_fav', '[]') || '[]')),
  loaded: false,
};
let clientId = lsGet('vd_photo_client_id') || DEFAULT_CLIENT_ID;
let folderId = lsGet('vd_photo_folder_id') || DEFAULT_FOLDER_ID;
let apiKey = lsGet('vd_photo_api_key') || '';
let tokenClient = null;
let refreshTimer = null;

function toast(msg) { const n = $('#toast'); n.textContent = msg; show(n); clearTimeout(toast.t); toast.t = setTimeout(() => show(n, false), 2600); }

// ============================ Xây thư viện ============================
const RAW_EXT = ['arw', 'cr2', 'cr3', 'nef', 'dng', 'raf', 'orf', 'rw2'];
const STD_EXT = ['jpg', 'jpeg', 'png', 'heic', 'heif', 'webp', 'gif', 'bmp'];
const parseTaken = (s) => { const m = /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/.exec(s || ''); return m ? new Date(+m[1], m[2] - 1, +m[3], +m[4], +m[5], +m[6]).getTime() : 0; };

function buildLibrary(raw) {
  S.folders = new Map();
  raw.folders.forEach((f) => S.folders.set(f.id, { id: f.id, name: f.name, parent: f.parent, children: [], photos: [] }));
  S.folders.forEach((f) => { const p = S.folders.get(f.parent); if (p) p.children.push(f); });
  const groups = new Map();
  raw.files.forEach((f) => {
    const parent = f.parents && f.parents[0];
    if (!S.folders.has(parent)) return;
    const m = /^(.*)\.([A-Za-z0-9]+)$/.exec(f.name);
    const base = m ? m[1] : f.name; const ext = m ? m[2].toLowerCase() : '';
    const isRaw = RAW_EXT.includes(ext);
    const isImg = STD_EXT.includes(ext) || (f.mimeType || '').startsWith('image/') && !isRaw;
    if (!isRaw && !isImg) return;
    const key = parent + '|' + base.toLowerCase();
    const g = groups.get(key) || { parent, std: null, raw: null };
    if (isRaw) g.raw = f; else if (!g.std) g.std = f; else groups.set(key + '|' + f.id, { parent, std: f, raw: null });
    groups.set(key, g);
  });
  const photos = [];
  groups.forEach((g) => {
    const f = g.std || g.raw; const md = f.imageMediaMetadata || {};
    const thumb = f.thumbnailLink || '';
    const scaled = /=s\d+/.test(thumb);
    const nm = /^(.*)\.([A-Za-z0-9]+)$/.exec(f.name);
    photos.push({
      id: f.id, name: f.name, parent: g.parent, ext: (nm ? nm[2] : 'JPG').toUpperCase().replace('JPEG', 'JPG'),
      time: parseTaken(md.time) || (f.createdTime ? new Date(f.createdTime).getTime() : 0),
      w: md.width || 0, h: md.height || 0, size: +f.size || 0, meta: md,
      thumb: thumb ? (scaled ? thumb.replace(/=s\d+.*/, '=s600') : thumb) : `https://drive.google.com/thumbnail?id=${f.id}&sz=w600`,
      full: thumb ? (scaled ? thumb.replace(/=s\d+.*/, '=s2000') : thumb) : `https://drive.google.com/thumbnail?id=${f.id}&sz=w2000`,
      dl: f.webContentLink || `https://drive.google.com/uc?id=${f.id}&export=download`,
      onlyRaw: !g.std,
      raw: g.std && g.raw ? { id: g.raw.id, name: g.raw.name, dl: g.raw.webContentLink || `https://drive.google.com/uc?id=${g.raw.id}&export=download`, size: +g.raw.size || 0 } : null,
    });
  });
  photos.sort((a, b) => b.time - a.time);
  S.photos = photos; S.byId = new Map(photos.map((p) => [p.id, p]));
  photos.forEach((p) => S.folders.get(p.parent).photos.push(p));
  // đếm sâu + ảnh bìa cho từng thư mục
  const deep = (f) => { f.deep = f.photos.slice(); f.children.forEach((c) => { deep(c); f.deep.push(...c.deep); }); f.deep.sort((a, b) => b.time - a.time); };
  const root = S.folders.get(folderId) || S.folders.values().next().value;
  deep(root); S.root = root;
}

// ============================ Tải dữ liệu ============================
async function loadLibrary(force) {
  show($('#loader')); $('#loaderText').textContent = t('openDrive');
  show($('#errorMessage'), false); show($('#app'), false);
  const key = 'lib:' + folderId;
  try {
    let raw = null;
    if (!force && !S.backend.demo) { const c = await cget(key); if (c && Date.now() - c.t < CACHE_TTL) raw = c.raw; }
    if (!raw) {
      raw = await S.backend.drive.loadAll(folderId, (nf, nfile) => { $('#loaderText').textContent = `${t('loading')} ${nf} / ${nfile}`; });
      if (!S.backend.demo) cset(key, { t: Date.now(), raw });
    }
    buildLibrary(raw);
    try { S.vAlbums = await S.backend.store.listAlbums(); } catch (e) { S.vAlbums = []; }
    S.loaded = true;
    show($('#app'));
    fillYears(); route();
  } catch (err) { showError(err); } finally { show($('#loader'), false); }
}

function showError(err) {
  show($('#errorMessage')); show($('#app'), false); show($('#timeline'), false);
  const denied = err.message === 'PERMISSION_DENIED';
  if (err.message === 'UNAUTH') { doLogoutState(); $('#errorText').textContent = ''; show($('#errorMessage'), false); toast(t('sessionExpired')); return; }
  $('#errorText').textContent = denied ? t('noPerm') : err.message;
  show($('#requestAccessBtn'), denied); show($('#requestMailBtn'), denied);
  if (denied) $('#requestMailBtn').href = 'mailto:' + ADMIN_FALLBACK + '?subject=' + encodeURIComponent('Yêu cầu truy cập VietDuong Photo') +
    '&body=' + encodeURIComponent('Chào Dũng,\n\nVui lòng cấp quyền truy cập thư viện ảnh cho email Google của tôi: ' + S.email + '\n\nCảm ơn bạn!');
}

// ============================ Đăng nhập ============================
const waitGoogle = () => new Promise((res) => { const i = setInterval(() => { if (window.google && google.accounts && google.accounts.oauth2) { clearInterval(i); res(); } }, 100); });

async function onToken(accessToken, expiresIn) {
  S.token = accessToken;
  if (!DEMO) {
    lsSet('vd_photo_access_token', accessToken);
    lsSet('vd_photo_token_expiry', String(Date.now() + expiresIn * 1000 - 60000));
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => { try { tokenClient.requestAccessToken({ prompt: '' }); } catch (e) { /* bỏ qua */ } }, Math.max(60000, expiresIn * 1000 - 120000));
  }
  if (S.loaded) return; // làm mới token im lặng: không tải lại thư viện
  await afterLogin();
}

async function afterLogin() {
  show($('#loginScreen'), false); show($('#loginBtn'), false); show($('#logoutBtn'));
  try {
    S.email = await S.backend.drive.userEmail();
    await S.backend.store.signIn(S.token);
    S.isAdmin = S.email === ADMIN_FALLBACK || await S.backend.store.isOwner(S.email);
  } catch (e) { if (e.message === 'UNAUTH') return showError(e); S.isAdmin = S.email === ADMIN_FALLBACK; }
  show($('#settingsBtn'), S.isAdmin);
  document.querySelectorAll('.admin-only').forEach((b) => show(b, S.isAdmin));
  await loadLibrary(false);
}

function doLogoutState() {
  S.token = null; S.loaded = false; S.isAdmin = false; S.selectMode = false; S.selected.clear();
  clearTimeout(refreshTimer); lsDel('vd_photo_access_token'); lsDel('vd_photo_token_expiry');
  show($('#logoutBtn'), false); show($('#loginBtn')); show($('#settingsBtn'), false);
  show($('#app'), false); show($('#timeline'), false); show($('#selectBar'), false); show($('#loginScreen'));
}

async function initAuth() {
  if (DEMO) {
    S.backend = createDemo(QS.get('guest') === '1');
    await onToken('demo', 3600); return;
  }
  S.backend = { demo: false, drive: createDrive(() => S.token, apiKey), store: createStore() };
  if (!clientId) { show($('#loginScreen'), false); show($('#errorMessage')); $('#errorText').textContent = 'Chưa cấu hình OAuth.'; show($('#settingsBtn')); return; }
  show($('#loginBtn'));
  await waitGoogle();
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: clientId, scope: 'https://www.googleapis.com/auth/drive.readonly email',
    callback: (r) => { if (r && r.access_token) onToken(r.access_token, +r.expires_in || 3600); },
    error_callback: () => { /* người dùng đóng popup */ },
  });
  const tok = lsGet('vd_photo_access_token'); const exp = +lsGet('vd_photo_token_expiry', '0');
  if (tok && Date.now() < exp) onToken(tok, Math.floor((exp - Date.now()) / 1000) + 60);
}

function requestLogin() { if (!tokenClient) return toast('Google chưa sẵn sàng'); tokenClient.requestAccessToken(); }

// ============================ Yêu thích ============================
const saveFavs = () => lsSet('vdphoto_fav', JSON.stringify([...S.favs]));
function toggleFav(id) { if (S.favs.has(id)) S.favs.delete(id); else S.favs.add(id); saveFavs(); }

// ============================ Router ============================
function parseHash() {
  const h = location.hash.replace(/^#\/?/, '');
  const [a, b] = h.split('/');
  if (a === 'all') return { type: 'all' };
  if (a === 'fav') return { type: 'fav' };
  if (a === 'f' && b) return { type: 'folder', id: decodeURIComponent(b) };
  if (a === 'v' && b) return { type: 'valbum', id: decodeURIComponent(b) };
  return { type: 'home' };
}
window.addEventListener('hashchange', () => { if (S.loaded) { exitSelect(); route(); } });

function route() {
  S.route = parseHash();
  const view = $('#view'); view.innerHTML = ''; view.className = '';
  const crumbs = $('#crumbs'); crumbs.innerHTML = ''; $('#viewActions').innerHTML = '';
  const addCrumb = (label, href) => { if (crumbs.children.length) crumbs.appendChild(el('span', 'sep', '/')); if (href) { const a = el('a', '', label); a.href = href; crumbs.appendChild(a); } else crumbs.appendChild(el('span', 'cur', label)); };
  const r = S.route;
  const searching = !!S.filters.q.trim();
  if (r.type === 'home') {
    addCrumb(t('home'));
    if (searching) return renderPhotos(view, S.photos);
    renderAlbumGrid(view, [
      { name: t('all'), count: S.photos.length, cover: S.photos[0], href: '#/all' },
      ...(S.favs.size ? [{ name: t('fav'), count: [...S.favs].filter((i) => S.byId.has(i)).length, cover: S.byId.get([...S.favs].find((i) => S.byId.has(i))), href: '#/fav' }] : []),
      ...S.root.children.map(folderCard),
    ], t('albums'));
    if (S.vAlbums.length) renderAlbumGrid(view, S.vAlbums.map(vCard), t('virtualAlbums'));
    if (S.root.photos.length) { view.appendChild(el('h3', 'section-title', t('unsorted'))); renderPhotos(view, S.root.photos); }
    else { show($('#timeline'), false); S.visible = []; }
    if (S.isAdmin) viewActionBtn('fa-folder-plus', t('addAlbum'), () => toast(t('select')) || enterSelect());
  } else if (r.type === 'all') { addCrumb(t('home'), '#/'); addCrumb(t('all')); renderPhotos(view, S.photos); }
  else if (r.type === 'fav') { addCrumb(t('home'), '#/'); addCrumb(t('fav')); renderPhotos(view, S.photos.filter((p) => S.favs.has(p.id))); }
  else if (r.type === 'folder') {
    const f = S.folders.get(r.id);
    if (!f) { view.appendChild(el('p', 'empty-state', t('notFound'))); return; }
    addCrumb(t('home'), '#/');
    const chain = []; for (let c = f; c && c.id !== S.root.id; c = S.folders.get(c.parent)) chain.unshift(c);
    chain.forEach((c, i) => addCrumb(c.name, i === chain.length - 1 ? null : '#/f/' + encodeURIComponent(c.id)));
    if (f.children.length) renderAlbumGrid(view, f.children.map(folderCard), t('subAlbums'));
    if (f.photos.length) { if (f.children.length) view.appendChild(el('h3', 'section-title', t('photosHere'))); renderPhotos(view, f.photos); }
    else if (!f.children.length) { view.appendChild(el('p', 'empty-state', t('empty'))); }
    viewActionBtn('fa-link', t('share'), copyLink);
  } else if (r.type === 'valbum') {
    const a = S.vAlbums.find((x) => x.id === r.id);
    if (!a) { addCrumb(t('home'), '#/'); view.appendChild(el('p', 'empty-state', t('notFound'))); return; }
    addCrumb(t('home'), '#/'); addCrumb(a.name);
    viewActionBtn('fa-link', t('share'), copyLink);
    if (S.isAdmin) {
      viewActionBtn('fa-pen', t('rename'), async () => { const n = prompt(t('renamePrompt'), a.name); if (n && n.trim()) { try { await S.backend.store.updateAlbum(a.id, { name: n.trim() }); a.name = n.trim(); route(); } catch (e) { toast(t('saveErr')); } } });
      viewActionBtn('fa-trash', t('del'), async () => { if (confirm(t('confirmDel'))) { try { await S.backend.store.deleteAlbum(a.id); S.vAlbums = S.vAlbums.filter((x) => x.id !== a.id); location.hash = '#/'; } catch (e) { toast(t('saveErr')); } } }, 'btn-danger');
    }
    renderPhotos(view, (a.fileIds || []).map((i) => S.byId.get(i)).filter(Boolean));
  }
  updateSelectBar();
}
function viewActionBtn(icon, label, fn, cls = '') { const b = el('button', 'btn btn-sm ' + cls); b.innerHTML = `<i class="fas ${icon}"></i> `; b.appendChild(document.createTextNode(label)); b.addEventListener('click', fn); $('#viewActions').appendChild(b); }
function copyLink() { const u = location.href; (navigator.clipboard ? navigator.clipboard.writeText(u) : Promise.reject()).then(() => toast(t('copied')), () => prompt(t('share'), u)); }

const folderCard = (f) => ({ name: f.name, count: f.deep.length, cover: f.deep[0], href: '#/f/' + encodeURIComponent(f.id) });
const vCard = (a) => ({ name: a.name, count: (a.fileIds || []).filter((i) => S.byId.has(i)).length, cover: S.byId.get(a.cover) || S.byId.get((a.fileIds || []).find((i) => S.byId.has(i))), href: '#/v/' + encodeURIComponent(a.id), virtual: true });

function renderAlbumGrid(container, cards, title) {
  container.appendChild(el('h3', 'section-title', title));
  const grid = el('div', 'album-grid');
  cards.forEach((c) => {
    const card = el('div', 'album-card' + (c.virtual ? ' album-virtual' : ''));
    const cover = el('div', 'album-cover');
    if (c.cover) { const img = el('img'); img.loading = 'lazy'; img.src = c.cover.thumb; img.alt = c.name; cover.appendChild(img); } else cover.innerHTML = '<i class="fas fa-images"></i>';
    const info = el('div', 'album-info'); info.appendChild(el('div', 'album-name', c.name)); info.appendChild(el('div', 'album-count', `${c.count} ${t('photos')}`));
    card.append(cover, info); card.addEventListener('click', () => { location.hash = c.href; });
    grid.appendChild(card);
  });
  container.appendChild(grid);
}

// ============================ Lọc + render ảnh ============================
function fillYears() {
  const years = [...new Set(S.photos.map((p) => new Date(p.time).getFullYear()))].sort((a, b) => b - a);
  const sel = $('#yearSel'); sel.innerHTML = '';
  sel.appendChild(new Option(t('allYears'), ''));
  years.forEach((y) => sel.appendChild(new Option(String(y), String(y))));
  sel.value = S.filters.year;
}
function applyFilters(list) {
  const q = S.filters.q.trim().toLowerCase();
  return list.filter((p) => (!q || p.name.toLowerCase().includes(q)) && (!S.filters.year || String(new Date(p.time).getFullYear()) === S.filters.year) &&
    (!S.filters.raw || p.raw || p.onlyRaw) && (!S.filters.fav || S.favs.has(p.id)));
}

function renderPhotos(container, list) {
  const items = applyFilters(list);
  S.visible = items;
  const tl = $('#timeline'); tl.innerHTML = '';
  if (!items.length) { container.appendChild(el('p', 'empty-state', t('empty'))); show(tl, false); return; }
  const rows = []; const months = []; let cur = '';
  items.forEach((p) => {
    const d = new Date(p.time); const key = `${d.getFullYear()}-${d.getMonth() + 1}`;
    if (key !== cur) { cur = key; months.push({ key, idx: rows.length, label: `${d.getMonth() + 1}/${d.getFullYear()}`, title: lang === 'vi' ? `Tháng ${d.getMonth() + 1}, ${d.getFullYear()}` : `${d.toLocaleString('en', { month: 'long' })} ${d.getFullYear()}` }); rows.push({ h: months[months.length - 1] }); }
    rows.push({ p });
  });
  const box = el('div', S.selectMode ? 'select-mode' : ''); box.id = 'photoBox'; container.appendChild(box);
  let pos = 0; let grid = null;
  const sentinel = el('div', 'more-sentinel');
  const more = (n) => {
    const end = Math.min(rows.length, pos + n);
    for (; pos < end; pos++) {
      const r = rows[pos];
      if (r.h) { const h = el('h2', 'date-header', r.h.title); h.id = 'g-' + r.h.key; box.appendChild(h); grid = el('div', 'gallery'); box.appendChild(grid); }
      else grid.appendChild(photoCard(r.p));
    }
    if (pos >= rows.length) { io.disconnect(); sentinel.remove(); }
  };
  const io = new IntersectionObserver((es) => { if (es[0].isIntersecting) more(PAGE); }, { rootMargin: '600px' });
  container.appendChild(sentinel); io.observe(sentinel); more(PAGE);
  if (months.length > 1) {
    months.forEach((m, i) => {
      const a = el('a', i === 0 ? 'active' : '', m.label); a.href = '#g-' + m.key;
      a.addEventListener('click', (e) => { e.preventDefault(); while (pos <= m.idx) more(PAGE); tl.querySelectorAll('a').forEach((x) => x.classList.remove('active')); a.classList.add('active'); document.getElementById('g-' + m.key).scrollIntoView({ behavior: 'smooth' }); });
      tl.appendChild(a);
    });
    show(tl);
  } else show(tl, false);
}

function photoCard(p) {
  const item = el('div', 'gallery-item' + (S.selected.has(p.id) ? ' selected' : '')); item.dataset.id = p.id;
  if (p.w && p.h) item.style.aspectRatio = `${p.w} / ${p.h}`; else item.style.minHeight = '160px';
  const img = el('img'); img.loading = 'lazy'; img.alt = p.name; img.src = p.thumb;
  img.addEventListener('load', () => img.classList.add('ok'));
  img.addEventListener('error', () => { const d = `https://drive.google.com/uc?id=${p.id}`; if (img.src !== d) img.src = d; else img.classList.add('ok'); });
  item.appendChild(img);
  item.appendChild(el('span', 'badge', p.onlyRaw ? 'RAW' : (p.raw ? p.ext + '+RAW' : p.ext)));
  const box = el('span', 'sel-box'); box.innerHTML = '<i class="fas fa-check"></i>'; item.appendChild(box);
  const fav = el('button', 'fav-btn' + (S.favs.has(p.id) ? ' on' : '')); fav.innerHTML = '<i class="fas fa-heart"></i>'; fav.title = t('fav');
  fav.addEventListener('click', (e) => { e.stopPropagation(); toggleFav(p.id); fav.classList.toggle('on', S.favs.has(p.id)); });
  item.appendChild(fav); item.appendChild(el('div', 'gallery-item-overlay', p.name));
  item.addEventListener('click', () => { if (S.selectMode) { toggleSelect(p.id, item); } else openLightbox(p.id); });
  return item;
}

// ============================ Chế độ chọn ============================
function enterSelect() { S.selectMode = true; const b = $('#photoBox'); if (b) b.classList.add('select-mode'); updateSelectBar(); }
function exitSelect() { S.selectMode = false; S.selected.clear(); const b = $('#photoBox'); if (b) { b.classList.remove('select-mode'); b.querySelectorAll('.selected').forEach((n) => n.classList.remove('selected')); } updateSelectBar(); }
function toggleSelect(id, node) { if (S.selected.has(id)) S.selected.delete(id); else S.selected.add(id); node.classList.toggle('selected', S.selected.has(id)); updateSelectBar(); }
function updateSelectBar() {
  show($('#selectBar'), S.selectMode);
  $('#selCount').textContent = `${S.selected.size} ${t('selected')}`;
  show($('#selRemove'), S.isAdmin && S.route.type === 'valbum');
}

// ============================ Zip (store, không nén) ============================
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(u8) { let c = 0xFFFFFFFF; for (let i = 0; i < u8.length; i++) c = CRC[(c ^ u8[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
function makeZip(entries) {
  const enc = new TextEncoder(); const parts = []; const cd = []; let off = 0;
  entries.forEach((e) => {
    const name = enc.encode(e.name); const crc = crc32(e.data); const sz = e.data.length;
    const lh = new DataView(new ArrayBuffer(30)); lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true);
    lh.setUint32(14, crc, true); lh.setUint32(18, sz, true); lh.setUint32(22, sz, true); lh.setUint16(26, name.length, true);
    parts.push(lh.buffer, name, e.data);
    const ch = new DataView(new ArrayBuffer(46)); ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true);
    ch.setUint32(16, crc, true); ch.setUint32(20, sz, true); ch.setUint32(24, sz, true); ch.setUint16(28, name.length, true); ch.setUint32(42, off, true);
    cd.push(ch.buffer, name); off += 30 + name.length + sz;
  });
  const cdSize = cd.reduce((s, b) => s + b.byteLength, 0);
  const end = new DataView(new ArrayBuffer(22)); end.setUint32(0, 0x06054b50, true); end.setUint16(8, entries.length, true); end.setUint16(10, entries.length, true); end.setUint32(12, cdSize, true); end.setUint32(16, off, true);
  return new Blob([...parts, ...cd, end.buffer], { type: 'application/zip' });
}
async function downloadZip() {
  const picks = [...S.selected].map((i) => S.byId.get(i)).filter(Boolean);
  if (!picks.length) return toast(t('nothing'));
  const withRaw = $('#zipRaw').checked; const jobs = [];
  picks.forEach((p) => { jobs.push({ name: p.name, ref: p }); if (withRaw && p.raw) jobs.push({ name: p.raw.name, ref: p.raw }); });
  const total = jobs.reduce((s, j) => s + (j.ref.size || 0), 0);
  if (total > 400e6 && !confirm(t('zipBig').replace('{mb}', Math.round(total / 1e6)))) return;
  const btn = $('#selZip'); btn.disabled = true; const used = new Set(); const entries = [];
  try {
    for (let i = 0; i < jobs.length; i++) {
      toast(`${t('zipping')} ${i + 1}/${jobs.length}...`);
      let name = jobs[i].name; while (used.has(name)) name = '_' + name; used.add(name);
      const b = await S.backend.drive.blob(jobs[i].ref);
      entries.push({ name, data: new Uint8Array(await b.arrayBuffer()) });
    }
    const url = URL.createObjectURL(makeZip(entries));
    const a = el('a'); a.href = url; a.download = 'vietduong-photo.zip'; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000); toast('OK');
  } catch (e) { toast(e.message); } finally { btn.disabled = false; }
}

// ============================ Album ảo (admin) ============================
function openAlbumModal() {
  if (!S.selected.size) return toast(t('nothing'));
  const sel = $('#albumSel'); sel.innerHTML = ''; sel.appendChild(new Option('—', ''));
  S.vAlbums.forEach((a) => sel.appendChild(new Option(a.name, a.id)));
  $('#albumName').value = ''; show($('#albumModal'));
}
async function confirmAlbum() {
  const ids = [...S.selected]; const name = $('#albumName').value.trim(); const sel = $('#albumSel').value;
  try {
    if (name) { const id = await S.backend.store.createAlbum(name, ids); S.vAlbums.push({ id, name, fileIds: ids, cover: ids[0] }); }
    else if (sel) { const a = S.vAlbums.find((x) => x.id === sel); const merged = [...new Set([...(a.fileIds || []), ...ids])]; await S.backend.store.updateAlbum(sel, { fileIds: merged }); a.fileIds = merged; if (!a.cover) a.cover = merged[0]; }
    else return;
    show($('#albumModal'), false); toast(t('added')); exitSelect(); route();
  } catch (e) { toast(t('saveErr')); }
}
async function removeFromAlbum() {
  const a = S.vAlbums.find((x) => x.id === S.route.id); if (!a || !S.selected.size) return toast(t('nothing'));
  const ids = (a.fileIds || []).filter((i) => !S.selected.has(i));
  try { await S.backend.store.updateAlbum(a.id, { fileIds: ids }); a.fileIds = ids; toast(t('removed')); exitSelect(); route(); } catch (e) { toast(t('saveErr')); }
}
async function setCover() {
  if (S.selected.size !== 1) return toast(t('pickOne'));
  const id = [...S.selected][0];
  let a = S.route.type === 'valbum' ? S.vAlbums.find((x) => x.id === S.route.id) : null;
  if (!a) return toast(t('addAlbum'));
  try { await S.backend.store.updateAlbum(a.id, { cover: id }); a.cover = id; toast(t('coverSet')); exitSelect(); route(); } catch (e) { toast(t('saveErr')); }
}

// ============================ Lightbox ============================
const LB = { idx: 0, zoom: false, x: 0, y: 0, drag: null };
const lbImg = () => $('#lightboxImg');
function openLightbox(id) { LB.idx = Math.max(0, S.visible.findIndex((p) => p.id === id)); show($('#lightbox')); lbShow(); }
function closeLightbox() { show($('#lightbox'), false); lbImg().src = ''; }
function lbShow() {
  const p = S.visible[LB.idx]; if (!p) return closeLightbox();
  lbReset(); lbImg().src = p.full; lbImg().alt = p.name;
  $('#lbCount').textContent = `${LB.idx + 1} / ${S.visible.length}  ·  ${p.name}`;
  const dl = $('#downloadBtn'); dl.href = p.dl; dl.download = p.name; dl.querySelector('span').textContent = `${t('dl')} (${p.onlyRaw ? 'RAW' : p.ext})`;
  const dr = $('#downloadRawBtn'); show(dr, !!p.raw); if (p.raw) { dr.href = p.raw.dl; dr.download = p.raw.name; }
  $('#lbFav').classList.toggle('on', S.favs.has(p.id)); $('#lbFav').firstElementChild.className = S.favs.has(p.id) ? 'fas fa-heart' : 'far fa-heart';
  renderInfo(p);
  [S.visible[LB.idx + 1], S.visible[LB.idx - 1]].forEach((n) => { if (n) new Image().src = n.full; });
}
function lbMove(d) { const n = LB.idx + d; if (n < 0 || n >= S.visible.length) return; LB.idx = n; lbShow(); }
function lbReset() { LB.zoom = false; LB.x = LB.y = 0; lbImg().style.transform = ''; lbImg().classList.remove('zoomed'); }
function lbApply() { lbImg().style.transform = LB.zoom ? `translate(${LB.x}px,${LB.y}px) scale(2.5)` : ''; lbImg().classList.toggle('zoomed', LB.zoom); }
function renderInfo(p) {
  const m = p.meta || {}; const panel = $('#lbPanel'); panel.innerHTML = '';
  const dl = el('dl');
  const row = (k, v) => { if (!v) return; dl.appendChild(el('dt', '', k)); dl.appendChild(el('dd', '', v)); };
  row(t('infoName'), p.name); row(t('infoDate'), p.time ? new Date(p.time).toLocaleString(lang === 'vi' ? 'vi-VN' : 'en-GB') : '');
  row(t('infoSize'), p.w && p.h ? `${p.w} × ${p.h}` : ''); row(t('infoFile'), p.size ? (p.size / 1e6).toFixed(1) + ' MB' : '');
  row(t('infoCam'), [m.cameraMake, m.cameraModel].filter(Boolean).join(' ')); row(t('infoLens'), m.lens);
  const exp = [m.aperture && `f/${m.aperture}`, m.exposureTime && (m.exposureTime < 1 ? `1/${Math.round(1 / m.exposureTime)}s` : `${m.exposureTime}s`), m.isoSpeed && `ISO ${m.isoSpeed}`, m.focalLength && `${m.focalLength}mm`].filter(Boolean).join(' · ');
  row(t('infoExp'), exp); panel.appendChild(dl);
}
function initLightbox() {
  $('#lbClose').addEventListener('click', closeLightbox);
  $('#lbPrev').addEventListener('click', () => lbMove(-1)); $('#lbNext').addEventListener('click', () => lbMove(1));
  $('#lbInfo').addEventListener('click', () => $('#lbPanel').classList.toggle('hidden'));
  $('#lbFav').addEventListener('click', () => { const p = S.visible[LB.idx]; if (!p) return; toggleFav(p.id); lbShow(); const c = document.querySelector(`.gallery-item[data-id="${p.id}"] .fav-btn`); if (c) c.classList.toggle('on', S.favs.has(p.id)); });
  document.addEventListener('keydown', (e) => {
    if ($('#lightbox').classList.contains('hidden')) return;
    if (e.key === 'Escape') closeLightbox(); else if (e.key === 'ArrowLeft') lbMove(-1); else if (e.key === 'ArrowRight') lbMove(1);
  });
  const stage = $('#lbStage'); const img = lbImg();
  img.addEventListener('click', (e) => { if (LB.moved) { LB.moved = false; return; } LB.zoom = !LB.zoom; if (LB.zoom) { const r = img.getBoundingClientRect(); LB.x = -(e.clientX - r.left - r.width / 2) * 1.5; LB.y = -(e.clientY - r.top - r.height / 2) * 1.5; } lbApply(); });
  stage.addEventListener('wheel', (e) => { e.preventDefault(); LB.zoom = e.deltaY < 0; if (!LB.zoom) LB.x = LB.y = 0; lbApply(); }, { passive: false });
  stage.addEventListener('pointerdown', (e) => { LB.drag = { x: e.clientX, y: e.clientY, ox: LB.x, oy: LB.y }; LB.moved = false; });
  stage.addEventListener('pointermove', (e) => { if (!LB.drag || !LB.zoom) return; const dx = e.clientX - LB.drag.x; const dy = e.clientY - LB.drag.y; if (Math.abs(dx) + Math.abs(dy) > 4) LB.moved = true; LB.x = LB.drag.ox + dx; LB.y = LB.drag.oy + dy; lbApply(); });
  stage.addEventListener('pointerup', (e) => { const d = LB.drag; LB.drag = null; if (d && !LB.zoom) { const dx = e.clientX - d.x; if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(e.clientY - d.y)) { LB.moved = true; lbMove(dx < 0 ? 1 : -1); } } });
  stage.addEventListener('click', (e) => { if (e.target === stage && !LB.zoom) closeLightbox(); });
}

// ============================ Cài đặt / yêu cầu truy cập ============================
async function openSettings() {
  $('#clientId').value = clientId; $('#apiKey').value = apiKey; $('#folderId').value = folderId;
  const ul = $('#reqList'); ul.innerHTML = '';
  try {
    (await S.backend.store.listRequests()).forEach((em) => {
      const li = el('li'); li.appendChild(el('span', '', em)); const b = el('button', '', '✕'); b.title = 'Xoá';
      b.addEventListener('click', async () => { await S.backend.store.deleteRequest(em); li.remove(); }); li.appendChild(b); ul.appendChild(li);
    });
  } catch (e) { /* chưa đủ quyền */ }
  show($('#settingsModal'));
}
function saveSettings() {
  clientId = $('#clientId').value.trim(); apiKey = $('#apiKey').value.trim(); folderId = $('#folderId').value.trim();
  const m = folderId.match(/folders\/([a-zA-Z0-9-_]+)/); if (m) folderId = m[1];
  lsSet('vd_photo_client_id', clientId); lsSet('vd_photo_api_key', apiKey); lsSet('vd_photo_folder_id', folderId);
  show($('#settingsModal'), false); cclear(); location.reload();
}

// ============================ Khởi động ============================
function bind() {
  $('#loginBtn').addEventListener('click', requestLogin); $('#loginScreenBtn').addEventListener('click', requestLogin);
  $('#logoutBtn').addEventListener('click', () => {
    if (S.token && !DEMO && window.google) google.accounts.oauth2.revoke(S.token, () => {});
    S.backend.store.signOut(); cclear(); doLogoutState(); $('#view').innerHTML = '';
    if (DEMO) location.href = location.pathname;
  });
  $('#settingsBtn').addEventListener('click', openSettings); $('#closeSettings').addEventListener('click', () => show($('#settingsModal'), false));
  $('#saveSettings').addEventListener('click', saveSettings);
  $('#closeAlbum').addEventListener('click', () => show($('#albumModal'), false)); $('#albumOk').addEventListener('click', confirmAlbum);
  window.addEventListener('click', (e) => { if (e.target === $('#settingsModal')) show($('#settingsModal'), false); if (e.target === $('#albumModal')) show($('#albumModal'), false); });
  $('#langBtn').addEventListener('click', () => { lang = lang === 'vi' ? 'en' : 'vi'; lsSet('ividlab-lang', lang); applyI18n(); if (S.loaded) { fillYears(); route(); } });
  $('#themeBtn').addEventListener('click', () => applyTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark'));
  let qt; $('#searchInput').addEventListener('input', (e) => { clearTimeout(qt); qt = setTimeout(() => { S.filters.q = e.target.value; route(); }, 200); });
  $('#yearSel').addEventListener('change', (e) => { S.filters.year = e.target.value; route(); });
  $('#rawOnly').addEventListener('change', (e) => { S.filters.raw = e.target.checked; route(); });
  $('#favOnly').addEventListener('change', (e) => { S.filters.fav = e.target.checked; route(); });
  $('#refreshBtn').addEventListener('click', () => loadLibrary(true));
  $('#selectBtn').addEventListener('click', () => (S.selectMode ? exitSelect() : enterSelect()));
  $('#selCancel').addEventListener('click', exitSelect);
  $('#selAll').addEventListener('click', () => { S.visible.forEach((p) => S.selected.add(p.id)); document.querySelectorAll('.gallery-item').forEach((n) => n.classList.add('selected')); updateSelectBar(); });
  $('#selZip').addEventListener('click', downloadZip); $('#selAlbum').addEventListener('click', openAlbumModal);
  $('#selRemove').addEventListener('click', removeFromAlbum); $('#selCover').addEventListener('click', setCover);
  $('#requestAccessBtn').addEventListener('click', async () => { try { await S.backend.store.sendRequest(S.email, ''); toast(t('reqSent')); } catch (e) { toast(t('saveErr')); } });
  initLightbox();
}

applyI18n(); applyTheme(document.documentElement.getAttribute('data-theme') || 'light'); bind();
if (!DEMO && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') import('/traffic-track.js').catch(() => {});
initAuth();
window.__vd = S; // phục vụ debug/test
