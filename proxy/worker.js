// Proxy tuỳ chọn (Cloudflare Worker) đặt trước Google Drive API cho VietDuong Photo.
// - Chuyển tiếp header Authorization của CHÍNH người dùng => quyền xem vẫn do Drive quyết định, proxy không giữ khoá/secret nào.
// - Cache phản hồi metadata (liệt kê, files.get) 60s theo từng token => nhiều lần mở trang không tốn quota Drive.
// - alt=media (tải file) và batch được stream thẳng, không cache.
// - CORS chỉ cho ALLOWED_ORIGIN (mặc định https://ividlab.com). Xem docs/vietduongphoto/README.md để triển khai.
const DRIVE = 'https://www.googleapis.com';
const OK_PATH = /^\/(drive\/v3\/files(\/[\w-]+)?|batch\/drive\/v3)$/;
const TTL = 60;

const sha = async (s) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))].map((b) => b.toString(16).padStart(2, '0')).join('');

export default {
  async fetch(req, env, ctx) {
    const origin = (env && env.ALLOWED_ORIGIN) || 'https://ividlab.com';
    const cors = (res) => {
      const r = new Response(res.body, res);
      r.headers.set('Access-Control-Allow-Origin', origin);
      r.headers.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
      r.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      r.headers.set('Vary', 'Origin');
      return r;
    };
    if (req.method === 'OPTIONS') return cors(new Response(null, { status: 204 }));
    const url = new URL(req.url);
    const auth = req.headers.get('Authorization');
    if (!auth) return cors(new Response('unauthorized', { status: 401 }));
    if (!OK_PATH.test(url.pathname) || !['GET', 'POST'].includes(req.method)) return cors(new Response('not found', { status: 404 }));

    const cacheable = req.method === 'GET' && url.searchParams.get('alt') !== 'media';
    const cache = typeof caches !== 'undefined' ? caches.default : null;
    const key = cacheable && cache ? new Request(`${url.origin}${url.pathname}${url.search}#${await sha(auth)}`) : null;
    if (key) { const hit = await cache.match(key); if (hit) return cors(hit); }

    const init = { method: req.method, headers: { Authorization: auth } };
    const ct = req.headers.get('Content-Type'); if (ct) init.headers['Content-Type'] = ct;
    if (req.method === 'POST') init.body = req.body;
    const res = await fetch(DRIVE + url.pathname + url.search, init);
    if (key && res.ok) {
      const copy = new Response(res.clone().body, res);
      copy.headers.set('Cache-Control', `private, max-age=${TTL}`);
      ctx.waitUntil(cache.put(key, copy));
    }
    return cors(res);
  },
};
