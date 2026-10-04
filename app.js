import { createDrive, createStore, createDemo, ADMIN_FALLBACK } from './backend.js';
import { buildLibrary, applyFilters as filterList, groupDays, parseHash, thumbAt, signature } from './lib.js';
import { zipToBlob, zipToWritable } from './zipclient.js';

// ============================ Cấu hình mặc định ============================
const DEFAULT_CLIENT_ID = '110344757733-bnomi4d63vsrb144pt5qpss8246supmd.apps.googleusercontent.com';
const DEFAULT_FOLDER_ID = '1MurjCwIStG_1KkT8Au492FT9_2-rPSP6';
const CACHE_TTL = 5 * 60 * 1000; // dưới mức này: dùng cache, không hỏi Drive
const FULL_REFRESH = 24 * 3600 * 1000; // quá mức này: tải lại toàn bộ thay vì đồng bộ tăng dần
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
    updated: 'Đã cập nhật thư viện', by_day: 'Theo ngày', by_month: 'Theo tháng', by_year: 'Theo năm', cancelled: 'Đã huỷ',
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
    updated: 'Library updated', by_day: 'By day', by_month: 'By month', by_year: 'By year', cancelled: 'Cancelled',
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
  loaded: false, partial: false, justified: lsGet('vdphoto_layout') === 'justified',
};
let clientId = lsGet('vd_photo_client_id') || DEFAULT_CLIENT_ID;
let folderId = lsGet('vd_photo_folder_id') || DEFAULT_FOLDER_ID;
let apiKey = lsGet('vd_photo_api_key') || '';
let proxyUrl = lsGet('vd_photo_proxy') || '';
let tokenClient = null;
let refreshTimer = null;

function toast(msg) { const n = $('#toast'); n.textContent = msg; show(n); clearTimeout(toast.t); toast.t = setTimeout(() => show(n, false), 2600); }

// ============================ Xây thư viện (logic ở lib.js) ============================
function applyRaw(raw) {
  const L = buildLibrary(raw, folderId);
  S.folders = L.folders; S.photos = L.photos; S.byId = L.byId; S.root = L.root;
}

// ============================ Tải dữ liệu ============================
async function loadLibrary(force) {
  show($('#errorMessage'), false);
  const key = 'lib:' + folderId;
  const useCache = !S.backend.demo || QS.get('cache') === '1'; // demo mặc định không cache; ?cache=1 để test SWR
  const cached = !force && useCache ? await cget(key) : null;
  const usable = cached && cached.email === S.email;
  let shown = false;
  const render = async (raw, first) => {
    const y = window.scrollY;
    applyRaw(raw);
    if (first) { try { S.vAlbums = await S.backend.store.listAlbums(); } catch (e) { S.vAlbums = []; } }
    S.loaded = true; show($('#app')); fillYears(); route();
    if (!first) window.scrollTo(0, y);
  };
  if (usable) { await render(cached.raw, true); shown = true; show($('#loader'), false); } else { show($('#loader')); $('#loaderText').textContent = t('openDrive'); show($('#app'), false); }
  try {
    if (usable && Date.now() - cached.t < CACHE_TTL) return; // cache còn mới
    // Lần đầu (chưa có cache): hiện danh sách album ngay khi có cây thư mục, số ảnh/ảnh bìa điền sau khi tải xong file.
    const onTree = (folders) => { if (shown) return; S.partial = true; applyRaw({ folders, files: [] }); S.loaded = true; show($('#loader'), false); show($('#app')); route(); };
    const progress = (nf, nfile) => { if (!shown) $('#loaderText').textContent = `${t('loading')} ${nf} / ${nfile}`; };
    const canDelta = usable && cached.raw.syncedAt && Date.now() - (cached.full || 0) < FULL_REFRESH;
    const raw = canDelta ? await S.backend.drive.refresh(folderId, cached.raw, progress) : await S.backend.drive.loadAll(folderId, progress, onTree);
    if (useCache) cset(key, { t: Date.now(), full: canDelta ? cached.full : Date.now(), email: S.email, raw });
    if (!shown) { S.partial = false; await render(raw, true); }
    else if (signature(raw) !== signature(cached.raw)) { await render(raw, false); toast(t('updated')); }
  } catch (err) { if (!shown || err.message === 'UNAUTH') showError(err); }
  finally { show($('#loader'), false); }
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
  S.backend = { demo: false, drive: createDrive(() => S.token, apiKey, proxyUrl || undefined), store: createStore() };
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
// Ghi nhớ vị trí cuộn theo từng trang để quay lại (Back) không mất chỗ.
const scrollMap = new Map(); let lastHash = location.hash;
window.addEventListener('hashchange', () => {
  scrollMap.set(lastHash, window.scrollY); lastHash = location.hash;
  if (!S.loaded) return;
  if (!S.selectMode || S.route.type === 'home') exitSelect();
  route(); restoreScroll(scrollMap.get(location.hash) || 0);
});
function restoreScroll(y) {
  requestAnimationFrame(() => {
    let guard = 0;
    while (S.loadMore && document.documentElement.scrollHeight < y + window.innerHeight && guard++ < 200) { if (!S.loadMore()) break; }
    window.scrollTo(0, y);
  });
}

function route() {
  S.route = parseHash(location.hash);
  S.loadMore = null;
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
  } else if (r.type === 'photo') {
    addCrumb(t('home'), '#/'); addCrumb(t('all')); renderPhotos(view, S.photos); updateSelectBar();
    if (S.byId.has(r.id)) openLightbox(r.id); else toast(t('notFound'));
    return;
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
    if (c.cover) { const img = el('img'); img.loading = 'lazy'; img.src = thumbAt(c.cover, 400); img.alt = c.name; cover.appendChild(img); } else cover.innerHTML = '<i class="fas fa-images"></i>';
    const info = el('div', 'album-info'); info.appendChild(el('div', 'album-name', c.name)); info.appendChild(el('div', 'album-count', S.partial ? '…' : `${c.count} ${t('photos')}`));
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
const applyFilters = (list) => filterList(list, S.filters, S.favs);
const saveFilters = () => { try { sessionStorage.setItem('vdphoto_filters', JSON.stringify(S.filters)); } catch (e) { /* bỏ qua */ } };

let spy = null;
const TL_MODES = ['day', 'month', 'year'];
function renderPhotos(container, list) {
  const items = applyFilters(list);
  S.visible = items;
  const tl = $('#timeline'); tl.innerHTML = '';
  if (spy) { spy.disconnect(); spy = null; }
  newRecycler();
  if (!items.length) { container.appendChild(el('p', 'empty-state', t('empty'))); show(tl, false); return; }
  const { rows, days } = groupDays(items, lang);
  const box = el('div', S.selectMode ? 'select-mode' : ''); box.id = 'photoBox'; container.appendChild(box);
  let pos = 0; let grid = null;
  const sentinel = el('div', 'more-sentinel');
  // Scroll-spy: tô mục timeline tương ứng ngày đang xem (theo ngày / tháng / năm tuỳ chế độ).
  spy = new IntersectionObserver((es) => {
    es.forEach((e) => {
      if (!e.isIntersecting) return;
      const [y, mo, da] = e.target.id.slice(2).split('-'); const mode = tl.dataset.mode;
      let active = null;
      tl.querySelectorAll('a').forEach((a) => { const on = mode === 'day' ? a.dataset.key === `${y}-${mo}-${da}` : mode === 'month' ? a.dataset.mkey === `${y}-${mo}` : a.dataset.year === y; a.classList.toggle('active', on); if (on) active = a; });
      if (active) active.scrollIntoView({ block: 'nearest' });
    });
  }, { rootMargin: '-80px 0px -80% 0px' });
  const more = (n) => {
    const end = Math.min(rows.length, pos + n);
    for (; pos < end; pos++) {
      const r = rows[pos];
      if (r.h) {
        const h = el('h2', 'date-header', r.h.title); h.id = 'g-' + r.h.key;
        h.appendChild(el('span', 'day-count', ` · ${r.h.count} ${t('photos')}`));
        box.appendChild(h); spy.observe(h);
        grid = el('div', 'gallery' + (S.justified ? ' justified' : '')); box.appendChild(grid);
      } else grid.appendChild(photoCard(r.p));
    }
    if (pos >= rows.length) { io.disconnect(); sentinel.remove(); }
  };
  const io = new IntersectionObserver((es) => { if (es[0].isIntersecting) more(PAGE); }, { rootMargin: '800px' });
  container.appendChild(sentinel); io.observe(sentinel); more(PAGE);
  S.loadMore = () => { if (pos >= rows.length) return false; more(PAGE); return true; };
  const jump = (idx, key) => { while (pos <= idx) more(PAGE); document.getElementById('g-' + key).scrollIntoView({ behavior: 'smooth' }); };
  if (days.length > 1) {
    // Mặc định theo ngày; thư viện quá dài (>150 ngày) mà người dùng chưa chọn thì gom theo tháng cho gọn.
    let mode = lsGet('vdphoto_tl'); if (!TL_MODES.includes(mode)) mode = days.length > 150 ? 'month' : 'day';
    tl.dataset.mode = mode;
    const nextMode = TL_MODES[(TL_MODES.indexOf(mode) + 1) % TL_MODES.length];
    const tog = el('button', 'tl-toggle', t('by_' + nextMode));
    tog.addEventListener('click', () => { lsSet('vdphoto_tl', nextMode); route(); });
    tl.appendChild(tog);
    const seen = new Set(); let first = true; let lastMonth = '';
    days.forEach((d) => {
      const k = mode === 'day' ? d.key : mode === 'month' ? d.mkey : String(d.year);
      if (seen.has(k)) return; seen.add(k);
      if (mode === 'day' && d.mkey !== lastMonth) { lastMonth = d.mkey; tl.appendChild(el('span', 'tl-month', d.mlabel)); } // nhãn tháng chia nhóm các ngày
      const a = el('a', first ? 'active' : '', mode === 'day' ? d.label : mode === 'month' ? d.mlabel : String(d.year));
      first = false; a.href = '#g-' + d.key; a.dataset.key = d.key; a.dataset.mkey = d.mkey; a.dataset.year = String(d.year);
      a.addEventListener('click', (e) => { e.preventDefault(); jump(d.idx, d.key); });
      tl.appendChild(a);
    });
    show(tl);
  } else show(tl, false);
}

const SIZES = '(max-width:420px) 100vw,(max-width:768px) 50vw,(max-width:1024px) 33vw,25vw';
function setThumb(img, p) {
  if (p.tb) { img.srcset = [400, 800, 1200].map((w) => `${thumbAt(p, w)} ${w}w`).join(', '); img.sizes = SIZES; img.src = thumbAt(p, 600); }
  else img.src = thumbAt(p, 600);
}
// Xin link thumbnail mới cho ảnh lỗi: gom các yêu cầu trong 60ms thành 1 request batch.
const renewQ = new Map(); let renewTimer = null;
function renewThumb(p) {
  return new Promise((res) => {
    renewQ.set(p.id, [...(renewQ.get(p.id) || []), res]);
    clearTimeout(renewTimer);
    renewTimer = setTimeout(async () => {
      const q = new Map(renewQ); renewQ.clear();
      let links = {}; try { links = await S.backend.drive.thumbs([...q.keys()]); } catch (e) { /* bỏ qua */ }
      q.forEach((cbs, id) => cbs.forEach((cb) => cb(links[id] || null)));
    }, 60);
  });
}
// Nội dung thẻ chỉ tồn tại khi thẻ ở gần màn hình; cuộn xa thì gỡ <img> & nút (giữ khung theo tỉ lệ) → DOM nhẹ dù hàng nghìn ảnh.
function fillCard(item, p) {
  if (item._filled) return; item._filled = true;
  if (p.tb) item.style.backgroundImage = `url("${thumbAt(p, 32)}")`; // blur-up: ảnh 32px phóng lớn làm nền trong lúc ảnh chính tải
  const img = el('img'); img.loading = 'lazy'; img.alt = p.name; img.decoding = 'async';
  img.addEventListener('load', () => {
    img.classList.add('ok');
    // Thiếu metadata kích thước: lấy tỉ lệ thật từ thumbnail vừa tải để khung không cắt ảnh
    if (!(p.w && p.h) && img.naturalWidth && img.naturalHeight) { p.w = img.naturalWidth; p.h = img.naturalHeight; setCardRatio(item, p); }
  });
  img.addEventListener('error', async () => {
    if (!p._renewed) {
      p._renewed = true;
      const link = await renewThumb(p);
      if (link && /=s\d+/.test(link)) { p.tb = link.replace(/=s\d+.*/, ''); img.removeAttribute('srcset'); setThumb(img, p); return; }
    }
    const d = `https://drive.google.com/uc?id=${p.id}`;
    if (img.src !== d) { img.removeAttribute('srcset'); img.src = d; } else img.classList.add('ok');
  });
  setThumb(img, p);
  item.appendChild(img);
  item.appendChild(el('span', 'badge', p.onlyRaw ? 'RAW' : (p.raw ? p.ext + '+RAW' : p.ext)));
  const box = el('span', 'sel-box'); box.innerHTML = '<i class="fas fa-check"></i>'; item.appendChild(box);
  const fav = el('button', 'fav-btn' + (S.favs.has(p.id) ? ' on' : '')); fav.innerHTML = '<i class="fas fa-heart"></i>'; fav.title = t('fav');
  fav.addEventListener('click', (e) => { e.stopPropagation(); toggleFav(p.id); fav.classList.toggle('on', S.favs.has(p.id)); });
  item.appendChild(fav); item.appendChild(el('div', 'gallery-item-overlay', p.name));
}
function setCardRatio(item, p) {
  const ar = p.w && p.h ? p.w / p.h : 1.5;
  item.style.aspectRatio = `${ar}`; item.style.flex = `${Math.round(ar * 100)} 1 ${Math.round(ar * 200)}px`; // flex dùng cho chế độ lưới đều
}
function emptyCard(item) { item._filled = false; item.textContent = ''; item.style.backgroundImage = ''; }
let recycler = null;
function photoCard(p) {
  const item = el('div', 'gallery-item' + (S.selected.has(p.id) ? ' selected' : '')); item.dataset.id = p.id;
  setCardRatio(item, p);
  item._p = p;
  item.addEventListener('click', () => { if (S.selectMode) { toggleSelect(p.id, item); } else openLightbox(p.id); });
  fillCard(item, p);
  if (recycler) recycler.observe(item);
  return item;
}
function newRecycler() {
  if (recycler) recycler.disconnect();
  recycler = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) fillCard(e.target, e.target._p); else emptyCard(e.target); }), { rootMargin: '2500px 0px' });
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

// ============================ Zip ============================
// Có File System Access API (Chrome/Edge desktop): ghi luồng ra file, RAM không tăng theo dung lượng.
// Không có: gom trong RAM (tải song song 3 luồng, tự thử lại khi lỗi mạng).
async function withRetry(fn, tries = 3) { for (let i = 0; ; i++) { try { return await fn(); } catch (e) { if (i >= tries - 1) throw e; await new Promise((r) => setTimeout(r, 800 * (i + 1))); } } }
const ZIP = { cancel: false };
window.__zip = { zipToWritable, zipToBlob }; // phục vụ test
function zipProgress(txt) { const b = $('#zipProg'); b.textContent = txt || ''; show(b, !!txt); show($('#zipCancel'), !!txt); }
async function downloadZip() {
  const picks = [...S.selected].map((i) => S.byId.get(i)).filter(Boolean);
  if (!picks.length) return toast(t('nothing'));
  const withRaw = $('#zipRaw').checked; const jobs = [];
  picks.forEach((p) => { jobs.push({ name: p.name, ref: p }); if (withRaw && p.raw) jobs.push({ name: p.raw.name, ref: p.raw }); });
  const total = jobs.reduce((s, j) => s + (j.ref.size || 0), 0);
  if (total > 400e6 && !window.showSaveFilePicker && !confirm(t('zipBig').replace('{mb}', Math.round(total / 1e6)))) return;
  let handle = null;
  if (window.showSaveFilePicker && QS.get('nopicker') !== '1') {
    try { handle = await window.showSaveFilePicker({ suggestedName: 'vietduong-photo.zip', types: [{ description: 'Zip', accept: { 'application/zip': ['.zip'] } }] }); }
    catch (e) { if (e.name === 'AbortError') return; handle = null; }
  }
  const btn = $('#selZip'); btn.disabled = true; ZIP.cancel = false;
  const used = new Set(); const uniq = (n) => { let x = n; while (used.has(x)) x = '_' + x; used.add(x); return x; };
  try {
    if (handle) {
      const w = await handle.createWritable();
      await zipToWritable(w, jobs.map((j) => ({ name: uniq(j.name), open: () => withRetry(() => S.backend.drive.stream(j.ref)) })),
        { shouldStop: () => ZIP.cancel, onProgress: (i, n) => zipProgress(`${t('zipping')} ${i}/${n}`) });
    } else {
      const entries = new Array(jobs.length); let next = 0; let done = 0;
      const worker = async () => {
        while (next < jobs.length) {
          if (ZIP.cancel) throw new Error('CANCELLED');
          const i = next++;
          const b = await withRetry(() => S.backend.drive.blob(jobs[i].ref));
          entries[i] = { name: jobs[i].name, data: new Uint8Array(await b.arrayBuffer()) };
          zipProgress(`${t('zipping')} ${++done}/${jobs.length}`);
        }
      };
      await Promise.all([worker(), worker(), worker()]);
      entries.forEach((e) => { e.name = uniq(e.name); });
      const url = URL.createObjectURL(await zipToBlob(entries));
      const a = el('a'); a.href = url; a.download = 'vietduong-photo.zip'; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
    }
    toast('OK');
  } catch (e) { toast(e.message === 'CANCELLED' ? t('cancelled') : e.message); }
  finally { btn.disabled = false; zipProgress(''); }
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
const LB = { idx: 0, zoom: false, x: 0, y: 0, drag: null, play: null, pre: [] };
const lbImg = () => $('#lightboxImg');
function openLightbox(id) { LB.idx = Math.max(0, S.visible.findIndex((p) => p.id === id)); show($('#lightbox')); lbShow(); }
function closeLightbox() {
  lbStop(); show($('#lightbox'), false); lbImg().src = ''; LB.pre.forEach((i) => { i.onload = null; i.src = ''; }); LB.pre = [];
  if (S.route.type === 'photo') location.hash = '#/all';
}
function lbStop() { clearInterval(LB.play); LB.play = null; const b = $('#lbPlay'); b.classList.remove('on'); b.firstElementChild.className = 'fas fa-play'; }
function lbTogglePlay() {
  if (LB.play) return lbStop();
  const b = $('#lbPlay'); b.classList.add('on'); b.firstElementChild.className = 'fas fa-pause';
  LB.play = setInterval(() => { if (LB.idx >= S.visible.length - 1) LB.idx = -1; lbMove(1); }, 4000);
}
function lbShow() {
  const p = S.visible[LB.idx]; if (!p) return closeLightbox();
  lbReset();
  const img = lbImg(); img.alt = p.name; img.src = thumbAt(p, 600); // hiện ngay thumbnail đã có, ảnh lớn tải xong thì thay
  const big = new Image(); const cur = p.id; const full = thumbAt(p, 2000);
  big.onload = () => { const q = S.visible[LB.idx]; if (q && q.id === cur) img.src = full; }; big.src = full;
  $('#lbCount').textContent = `${LB.idx + 1} / ${S.visible.length}  ·  ${p.name}`;
  const dl = $('#downloadBtn'); dl.href = p.dl; dl.download = p.name; dl._item = p; dl.querySelector('span').textContent = `${t('dl')} (${p.onlyRaw ? 'RAW' : p.ext})`;
  const dr = $('#downloadRawBtn'); show(dr, !!p.raw); if (p.raw) { dr.href = p.raw.dl; dr.download = p.raw.name; dr._item = p.raw; }
  $('#lbFav').classList.toggle('on', S.favs.has(p.id)); $('#lbFav').firstElementChild.className = S.favs.has(p.id) ? 'fas fa-heart' : 'far fa-heart';
  renderInfo(p);
  if (!p.metaFull && !S.backend.demo) S.backend.drive.meta(p.id).then((m) => { p.metaFull = true; if (m && m.imageMediaMetadata) { p.meta = { ...p.meta, ...m.imageMediaMetadata }; if (S.visible[LB.idx] === p) renderInfo(p); } }).catch(() => {});
  // preload ±1 ảnh; hủy preload cũ khi lướt nhanh
  LB.pre.forEach((i) => { i.onload = null; i.src = ''; }); LB.pre = [];
  [S.visible[LB.idx + 1], S.visible[LB.idx - 1]].forEach((n) => { if (n) { const i = new Image(); i.src = thumbAt(n, 2000); LB.pre.push(i); } });
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
function lbToggleFav() { const p = S.visible[LB.idx]; if (!p) return; toggleFav(p.id); lbShow(); const c = document.querySelector(`.gallery-item[data-id="${p.id}"] .fav-btn`); if (c) c.classList.toggle('on', S.favs.has(p.id)); }
function lbShare() { const p = S.visible[LB.idx]; if (!p) return; const u = `${location.origin}${location.pathname}#/p/${encodeURIComponent(p.id)}`; (navigator.clipboard ? navigator.clipboard.writeText(u) : Promise.reject()).then(() => toast(t('copied')), () => prompt(t('share'), u)); }
function initLightbox() {
  $('#lbClose').addEventListener('click', closeLightbox);
  $('#lbPrev').addEventListener('click', () => lbMove(-1)); $('#lbNext').addEventListener('click', () => lbMove(1));
  $('#lbInfo').addEventListener('click', () => $('#lbPanel').classList.toggle('hidden'));
  $('#lbFav').addEventListener('click', lbToggleFav); $('#lbPlay').addEventListener('click', lbTogglePlay); $('#lbShare').addEventListener('click', lbShare);
  document.addEventListener('keydown', (e) => {
    if ($('#lightbox').classList.contains('hidden') || (e.target.matches && e.target.matches('input,textarea,select')) || e.ctrlKey || e.metaKey) return;
    const k = e.key.toLowerCase();
    if (k === 'escape') closeLightbox(); else if (k === 'arrowleft') lbMove(-1); else if (k === 'arrowright') lbMove(1);
    else if (k === 'f') lbToggleFav(); else if (k === 'i') $('#lbPanel').classList.toggle('hidden'); else if (k === ' ') { e.preventDefault(); lbTogglePlay(); }
    else if (k === 's') { const p = S.visible[LB.idx]; if (p) { if (!S.selectMode) enterSelect(); S.selected.add(p.id); const n = document.querySelector(`.gallery-item[data-id="${p.id}"]`); if (n) n.classList.add('selected'); updateSelectBar(); toast(`${S.selected.size} ${t('selected')}`); } }
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
  $('#clientId').value = clientId; $('#apiKey').value = apiKey; $('#folderId').value = folderId; $('#proxyUrl').value = proxyUrl;
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
  clientId = $('#clientId').value.trim(); apiKey = $('#apiKey').value.trim(); folderId = $('#folderId').value.trim(); proxyUrl = $('#proxyUrl').value.trim();
  const m = folderId.match(/folders\/([a-zA-Z0-9-_]+)/); if (m) folderId = m[1];
  lsSet('vd_photo_client_id', clientId); lsSet('vd_photo_api_key', apiKey); lsSet('vd_photo_folder_id', folderId); lsSet('vd_photo_proxy', proxyUrl);
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
  let qt; $('#searchInput').addEventListener('input', (e) => { clearTimeout(qt); qt = setTimeout(() => { S.filters.q = e.target.value; saveFilters(); route(); }, 200); });
  $('#yearSel').addEventListener('change', (e) => { S.filters.year = e.target.value; saveFilters(); route(); });
  $('#rawOnly').addEventListener('change', (e) => { S.filters.raw = e.target.checked; saveFilters(); route(); });
  $('#favOnly').addEventListener('change', (e) => { S.filters.fav = e.target.checked; saveFilters(); route(); });
  $('#refreshBtn').addEventListener('click', () => loadLibrary(true));
  $('#selectBtn').addEventListener('click', () => (S.selectMode ? exitSelect() : enterSelect()));
  $('#selCancel').addEventListener('click', exitSelect);
  $('#selAll').addEventListener('click', () => { S.visible.forEach((p) => S.selected.add(p.id)); document.querySelectorAll('.gallery-item').forEach((n) => n.classList.add('selected')); updateSelectBar(); });
  // Tải thẳng về máy (kể cả điện thoại): attribute `download` bị bỏ qua với link khác origin → tự fetch blob rồi lưu, không mở tab mới.
  ['#downloadBtn', '#downloadRawBtn'].forEach((sel) => {
    const btn = $(sel); let busy = false;
    btn.addEventListener('click', async (e) => {
      const it = btn._item; if (!it) return;
      e.preventDefault(); if (busy) return; busy = true; btn.classList.add('disabled');
      try {
        const url = URL.createObjectURL(await S.backend.drive.blob(it));
        const a = el('a'); a.href = url; a.download = it.name; document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 60000);
      } catch (err) { toast(t('dlFail') || 'Không tải được, thử lại'); }
      busy = false; btn.classList.remove('disabled');
    });
  });
  $('#selZip').addEventListener('click', downloadZip); $('#selAlbum').addEventListener('click', openAlbumModal);
  $('#selRemove').addEventListener('click', removeFromAlbum); $('#selCover').addEventListener('click', setCover);
  $('#requestAccessBtn').addEventListener('click', async () => { try { await S.backend.store.sendRequest(S.email, ''); toast(t('reqSent')); } catch (e) { toast(t('saveErr')); } });
  $('#layoutBtn').addEventListener('click', () => { S.justified = !S.justified; lsSet('vdphoto_layout', S.justified ? 'justified' : 'masonry'); $('#layoutBtn').firstElementChild.className = S.justified ? 'fas fa-table-cells-large' : 'fas fa-table-columns'; route(); });
  $('#layoutBtn').firstElementChild.className = S.justified ? 'fas fa-table-cells-large' : 'fas fa-table-columns';
  $('#zipCancel').addEventListener('click', () => { ZIP.cancel = true; });
  initLightbox();
}

try {
  const f = JSON.parse(sessionStorage.getItem('vdphoto_filters') || 'null');
  if (f) { S.filters = { q: f.q || '', year: f.year || '', raw: !!f.raw, fav: !!f.fav }; $('#searchInput').value = S.filters.q; $('#rawOnly').checked = S.filters.raw; $('#favOnly').checked = S.filters.fav; }
} catch (e) { /* bỏ qua */ }
if ('serviceWorker' in navigator && !DEMO && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
applyI18n(); applyTheme(document.documentElement.getAttribute('data-theme') || 'light'); bind();
if (!DEMO && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') import('/traffic-track.js').catch(() => {});
initAuth();
window.__vd = S; // phục vụ debug/test
