// Service worker VietDuong Photo: mở nhanh + dùng lại thumbnail đã xem. KHÔNG cache Drive API / dữ liệu riêng tư.
const SHELL = 'vdphoto-shell-v1';
const IMG = 'vdphoto-img-v2'; // v2: xoá cache v1 có thể chứa phản hồi lỗi (opaque) đã bị lưu nhầm
const IMG_MAX = 600;

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (![SHELL, IMG].includes(k)) await caches.delete(k);
    await self.clients.claim();
  })());
});

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
  // File của chính trang (html/js/css): network-first, mất mạng thì dùng bản đã lưu — luôn ra bản mới sau khi deploy.
  if (url.origin === location.origin) {
    e.respondWith((async () => {
      const cache = await caches.open(SHELL);
      try { const res = await fetch(req); if (res.ok) cache.put(req, res.clone()); return res; }
      catch (err) { const hit = await cache.match(req); if (hit) return hit; throw err; }
    })());
  }
});
