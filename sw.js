// Service worker VietDuong Photo.
//  1) Khung ứng dụng (html/css/js/biểu tượng) được lưu sẵn thành MỘT phiên bản nguyên khối `vdphoto-shell-<mã băm>`: mở lại gần như tức thì,
//     chạy được khi mất mạng, không trộn module cũ với module mới. Trang được phục vụ từ cache ngay; sau đó (tối đa 1 lần / 10 phút) SW âm thầm
//     hỏi lại server (If-None-Match → 304 rẻ); nếu bất kỳ file nào đổi thì dựng phiên bản mới ở cache khác, đổi con trỏ rồi báo cho trang
//     ("Có bản mới — Tải lại"). Trang đang mở không bị đổi giữa chừng.
//  2) Thumbnail Google: cache-first, chỉ lưu khi 200 (xem bên dưới).
// KHÔNG cache Drive API / dữ liệu riêng tư. Mọi lỗi trong SW đều rơi về mạng thường (SW không được phép làm hỏng trang).
// Danh sách SHELL phải đủ module của app.js + file tĩnh trang dùng: tests/assets.test.mjs kiểm tra; thêm module mới thì thêm vào đây và vào modulepreload.
const SHELL_FILES = [
  'index.html', 'style.css', 'icons.css', 'favicon.svg', 'manifest.webmanifest',
  'app.js', 'util.js', 'auth.js', 'state.js', 'cache.js', 'settings.js', 'albums.js', 'i18n.js', 'gallery.js', 'router.js', 'library.js', 'select.js',
  'zipdl.js', 'lightbox.js', 'share.js', 'backend.js', 'lib.js', 'zipclient.js', 'zoom.js', 'zip.js', 'pwa.js', 'perf.js', 'zipworker.js',
];
self.VDPHOTO_SHELL = SHELL_FILES; // cho test
const SHELL_PREFIX = 'vdphoto-shell-';
const META = 'vdphoto-meta'; // con trỏ tới phiên bản đang dùng + thời điểm kiểm tra gần nhất
const IMG = 'vdphoto-img-v2'; // v2: xoá cache v1 có thể chứa phản hồi lỗi (opaque) đã bị lưu nhầm
const IMG_MAX = 600;
const CHECK_MS = 10 * 60 * 1000; // GitHub Pages cho trình duyệt giữ 10 phút; không hỏi lại thường xuyên hơn mức đó

const BASE = () => self.registration.scope;
const urlOf = (f) => new URL(f === 'index.html' ? '.' : f, BASE()).href; // 'index.html' lưu theo địa chỉ thư mục (trang được mở bằng .../vietduongphoto/)
const keyOf = urlOf; // khoá cache = địa chỉ tải
const relOf = (u) => { const base = new URL(BASE()).pathname; if (!u.pathname.startsWith(base)) return null; const r = u.pathname.slice(base.length); return r === '' ? 'index.html' : r; };

// ---- con trỏ + siêu dữ liệu
const metaGet = async (k) => { const r = await (await caches.open(META)).match(`https://meta.invalid/${k}`); return r ? r.text() : null; };
const metaSet = async (k, v) => (await caches.open(META)).put(`https://meta.invalid/${k}`, new Response(String(v)));

async function digest(buffers) {
  let n = 0; buffers.forEach((b) => { n += b.byteLength; });
  const all = new Uint8Array(n); let o = 0; buffers.forEach((b) => { all.set(new Uint8Array(b), o); o += b.byteLength; });
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', all));
  return [...h.slice(0, 8)].map((x) => x.toString(16).padStart(2, '0')).join('');
}

// Tải toàn bộ khung ứng dụng (bypass cache HTTP khi mode='reload' để có ảnh chụp nhất quán) và tính mã băm của nội dung.
async function fetchShell(mode) {
  const res = await Promise.all(SHELL_FILES.map((f) => fetch(urlOf(f), { cache: mode })));
  const bad = res.find((r) => !r.ok); if (bad) throw new Error('shell fetch failed: ' + bad.status + ' ' + bad.url);
  const sig = await digest(await Promise.all(res.map((r) => r.clone().arrayBuffer())));
  return { res, name: SHELL_PREFIX + sig };
}
async function storeShell({ res, name }) {
  const cache = await caches.open(name);
  await Promise.all(SHELL_FILES.map((f, i) => cache.put(keyOf(f), res[i])));
  return cache;
}
async function pruneShells(keep) { for (const k of await caches.keys()) if (k.startsWith(SHELL_PREFIX) && !keep.includes(k)) await caches.delete(k); }

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const shell = await fetchShell('reload'); // lỗi ở đây → cài đặt thất bại, bản cũ (hoặc mạng thường) vẫn chạy
    const prev = await metaGet('current');
    await storeShell(shell);
    await metaSet('current', shell.name); await metaSet('prev', prev && prev !== shell.name ? prev : ''); await metaSet('checked', Date.now());
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keep = [await metaGet('current'), await metaGet('prev')].filter(Boolean);
    for (const k of await caches.keys()) { if (k === IMG || k === META) continue; if (k.startsWith(SHELL_PREFIX) && keep.includes(k)) continue; await caches.delete(k); } // gồm cả cache cũ 'vdphoto-shell-v1'
    await self.clients.claim();
  })());
});

// ---- kiểm tra bản mới (giới hạn tần suất, không chạy song song)
let checking = null;
function maybeUpdate() {
  if (checking) return checking;
  checking = (async () => {
    try {
      const last = +(await metaGet('checked')) || 0;
      if (Date.now() - last < CHECK_MS) return 'throttled';
      await metaSet('checked', Date.now());
      let shell; try { shell = await fetchShell('no-cache'); } catch (err) { return 'error'; } // mất mạng / lỗi tạm: giữ nguyên bản hiện tại
      const cur = await metaGet('current');
      if (shell.name === cur) return 'same';
      await storeShell(shell);
      await metaSet('prev', cur || ''); await metaSet('current', shell.name);
      await pruneShells([shell.name, cur].filter(Boolean));
      for (const c of await self.clients.matchAll({ type: 'window' })) c.postMessage({ type: 'vdphoto-update', name: shell.name });
      return 'updated';
    } finally { checking = null; }
  })();
  return checking;
}
self.addEventListener('message', (e) => { if (e.data && e.data.type === 'check') e.waitUntil(maybeUpdate()); });

async function trim(cache) {
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - IMG_MAX; i++) await cache.delete(keys[i]);
}

self.addEventListener('fetch', (e) => {
  const req = e.request; const url = new URL(req.url);
  if (req.method !== 'GET') return;
  // Ảnh thumbnail của Google (lh3.googleusercontent.com...): cache-first (cho phép opaque).
  if (req.destination === 'image' && /googleusercontent\.com$/.test(url.hostname)) {
    e.respondWith((async () => {
      const cache = await caches.open(IMG); const hit = await cache.match(req.url); if (hit) return hit;
      // Tải ở chế độ CORS để biết được mã trạng thái: chỉ lưu khi 200. Phản hồi "opaque" (no-cors) không cho biết lỗi 429/403 nên
      // trước đây ảnh bị Google giới hạn tốc độ cũng bị lưu và hiện lỗi mãi. CORS bị chặn / mạng lỗi: tải thường và KHÔNG lưu.
      let res;
      try { res = await fetch(new Request(req.url, { mode: 'cors', credentials: 'omit', referrerPolicy: 'no-referrer' })); }
      catch (err) { return fetch(req); }
      if (res.ok) { cache.put(req.url, res.clone()); trim(cache); }
      return res;
    })());
    return;
  }
  // File của chính trang: phục vụ từ phiên bản khung ứng dụng đang dùng (bỏ qua query/hash: ?demo=1, ?w=…#/s/…).
  if (url.origin === location.origin) {
    const rel = relOf(url);
    if (!rel || !SHELL_FILES.includes(rel)) return; // không thuộc khung ứng dụng: để trình duyệt xử lý bình thường
    e.respondWith((async () => {
      try {
        const name = await metaGet('current');
        const hit = name && await (await caches.open(name)).match(keyOf(rel));
        if (rel === 'index.html' || req.mode === 'navigate') e.waitUntil(maybeUpdate().catch(() => {}));
        if (hit) return hit;
      } catch (err) { /* rơi về mạng */ }
      return fetch(req);
    })());
  }
});
