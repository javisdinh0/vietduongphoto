// Service worker VietDuong Photo: mở nhanh + dùng lại thumbnail đã xem. KHÔNG cache Drive API / dữ liệu riêng tư.
const SHELL = 'vdphoto-shell-v1';
const IMG = 'vdphoto-img-v1';
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
      const cache = await caches.open(IMG); const hit = await cache.match(req); if (hit) return hit;
      const res = await fetch(req);
      if (res.ok || res.type === 'opaque') { cache.put(req, res.clone()); trim(cache); }
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
