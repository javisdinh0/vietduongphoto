// Chia sẻ album công khai: người có link xem ảnh KHÔNG cần đăng nhập Google.
// Ảnh vẫn riêng tư trên Drive: Worker giữ refresh token (mã hoá) của admin tạo link và tự lấy ảnh thay người xem.
//  - POST /share/create|list|revoke  (chỉ admin: refresh token hợp lệ + email thuộc OWNER_EMAILS, đúng ALLOWED_ORIGIN)
//  - GET  /share/<token>               metadata album (tên, danh sách ảnh, cho tải không, hạn)
//  - GET  /share/<token>/img/<id>?q=s800   thumbnail (cache riêng tư 1 giờ)
//  - GET  /share/<token>/dl/<id>       ảnh gốc, chỉ khi link cho phép tải
// Token là chuỗi ngẫu nhiên 128 bit trong KV (binding SHARES); hết hạn/thu hồi có hiệu lực ngay ở lần gọi kế tiếp.
// Chỉ phục vụ ảnh có trong danh sách của link — không bao giờ cho đọc file Drive tuỳ ý.
import { open } from './auth.js';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const USERINFO_URL = 'https://www.googleapis.com/oauth2/v3/userinfo';
const DEFAULT_DRIVE = 'https://www.googleapis.com';
const TOKEN_RE = /^[A-Za-z0-9_-]{22}$/;
const ID_RE = /^[A-Za-z0-9_-]{10,100}$/;
const TTL_DAYS = [0, 7, 30, 90];
const MAX_FILES = 3000;

const b64 = (u8) => btoa(String.fromCharCode(...u8)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const json = (obj, status = 200, extra = {}) => new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...extra } });
const err = (status, error) => json({ error }, status);
const form = (o) => new URLSearchParams(o).toString();

// access token theo từng refresh token (RAM của isolate), để không refresh ở mỗi ảnh
const atCache = new Map();
async function accessFor(env, rtSealed) {
  const hit = atCache.get(rtSealed);
  if (hit && hit.exp > Date.now()) return hit.at;
  const refresh = await open(env, rtSealed).catch(() => null);
  if (!refresh) throw Object.assign(new Error('invalid_grant'), { status: 401 });
  const r = await fetch(env.TOKEN_ENDPOINT || TOKEN_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form({ client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET, refresh_token: refresh, grant_type: 'refresh_token' }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) throw Object.assign(new Error(j.error || 'refresh_failed'), { status: j.error === 'invalid_grant' ? 401 : 502 });
  atCache.set(rtSealed, { at: j.access_token, exp: Date.now() + Math.max(60, (+j.expires_in || 3600) - 120) * 1000 });
  return j.access_token;
}
const owners = (env) => (env.OWNER_EMAILS || 'dinhvietdung.vn@gmail.com').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
// Trả email của người sở hữu refresh token nếu họ là admin; ngược lại ném lỗi 401/403.
async function requireOwner(env, rtSealed) {
  if (typeof rtSealed !== 'string' || !rtSealed) throw Object.assign(new Error('invalid_grant'), { status: 401 });
  const at = await accessFor(env, rtSealed);
  const r = await fetch(env.USERINFO_ENDPOINT || USERINFO_URL, { headers: { Authorization: 'Bearer ' + at } });
  const u = await r.json().catch(() => ({}));
  const email = String(u.email || '').toLowerCase();
  if (!r.ok || !email || u.email_verified === false || !owners(env).includes(email)) throw Object.assign(new Error('forbidden'), { status: 403 });
  return email;
}
const live = (rec) => rec && (!rec.expires || rec.expires > Date.now());
const getRec = async (env, token) => (TOKEN_RE.test(token) ? env.SHARES.get('s:' + token, { type: 'json' }) : null);
const driveBase = (env) => env.DRIVE_ORIGIN || DEFAULT_DRIVE;

async function readIndex(env, albumId) { return (await env.SHARES.get('a:' + albumId, { type: 'json' })) || []; }
async function writeIndex(env, albumId, list) { await env.SHARES.put('a:' + albumId, JSON.stringify(list)); }

function cleanFiles(files) {
  if (!Array.isArray(files) || !files.length || files.length > MAX_FILES) return null;
  const out = [];
  for (const f of files) {
    if (!f || typeof f.id !== 'string' || !ID_RE.test(f.id) || typeof f.name !== 'string') return null;
    out.push({ id: f.id, name: f.name.slice(0, 200), ext: String(f.ext || 'JPG').slice(0, 8), w: +f.w || 0, h: +f.h || 0, time: +f.time || 0, size: +f.size || 0 });
  }
  return out;
}

export async function handleShare(req, env, url, allowedOrigin) {
  if (!env.SHARES || !env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || !env.TOKEN_KEY) return err(501, 'not_configured');
  const parts = url.pathname.split('/').filter(Boolean); // ['share', ...]
  const sub = parts[1];

  // ------------------------------------------------ quản trị (POST)
  if (['create', 'list', 'revoke'].includes(sub) && parts.length === 2) {
    if (req.method !== 'POST') return err(405, 'method_not_allowed');
    if (req.headers.get('Origin') !== allowedOrigin) return err(403, 'forbidden_origin');
    let body; try { body = await req.json(); } catch (e) { return err(400, 'bad_request'); }
    let email;
    try { email = await requireOwner(env, body.rt); } catch (e) { return err(e.status || 502, e.message); }
    const albumId = String(body.albumId || '').slice(0, 120);
    if (sub !== 'revoke' && !albumId) return err(400, 'bad_request');

    if (sub === 'create') {
      const files = cleanFiles(body.files); const ttl = +body.ttlDays;
      if (!files || !TTL_DAYS.includes(ttl)) return err(400, 'bad_request');
      const token = b64(crypto.getRandomValues(new Uint8Array(16)));
      const now = Date.now(); const expires = ttl ? now + ttl * 86400000 : 0;
      const rec = { name: String(body.name || '').slice(0, 200) || 'Album', files, allowDownload: body.allowDownload !== false, expires, rt: body.rt, by: email, albumId, createdAt: now };
      await env.SHARES.put('s:' + token, JSON.stringify(rec), ttl ? { expirationTtl: ttl * 86400 } : undefined);
      const idx = (await readIndex(env, albumId)).filter((x) => !x.expires || x.expires > now);
      idx.push({ token, expires, allowDownload: rec.allowDownload, createdAt: now });
      await writeIndex(env, albumId, idx);
      return json({ token, expires });
    }
    if (sub === 'list') {
      const now = Date.now();
      return json({ shares: (await readIndex(env, albumId)).filter((x) => !x.expires || x.expires > now) });
    }
    // revoke
    const token = String(body.token || '');
    const rec = await getRec(env, token);
    if (rec) { await env.SHARES.delete('s:' + token); const idx = (await readIndex(env, rec.albumId)).filter((x) => x.token !== token); await writeIndex(env, rec.albumId, idx); }
    return json({ ok: true });
  }

  // ------------------------------------------------ công khai (GET)
  if (req.method !== 'GET') return err(405, 'method_not_allowed');
  const rec = await getRec(env, sub || '');
  if (!live(rec)) return err(404, 'gone');
  if (parts.length === 2) return json({ name: rec.name, files: rec.files, allowDownload: rec.allowDownload, expires: rec.expires }, 200, { 'Cache-Control': 'private, max-age=60' });

  const kind = parts[2]; const id = parts[3];
  if (parts.length !== 4 || !['img', 'dl'].includes(kind) || !rec.files.some((f) => f.id === id)) return err(404, 'not_found');
  let at; try { at = await accessFor(env, rec.rt); } catch (e) { return err(502, 'upstream_auth'); }
  const auth = { Authorization: 'Bearer ' + at };

  if (kind === 'img') {
    const m = /^s(\d{2,4})$/.exec(url.searchParams.get('q') || ''); const size = Math.min(2400, m ? +m[1] : 800);
    const meta = await fetch(`${driveBase(env)}/drive/v3/files/${id}?fields=thumbnailLink&supportsAllDrives=true`, { headers: auth });
    const link = meta.ok ? (await meta.json().catch(() => ({}))).thumbnailLink : '';
    if (!link) return err(404, 'no_thumbnail');
    const up = await fetch(link.replace(/=s\d+.*/, '') + '=s' + size, { headers: auth });
    if (!up.ok) return err(502, 'thumbnail_failed');
    return new Response(up.body, { status: 200, headers: { 'Content-Type': up.headers.get('Content-Type') || 'image/jpeg', 'Cache-Control': 'private, max-age=3600' } });
  }
  // dl
  if (!rec.allowDownload) return err(403, 'download_disabled');
  const up = await fetch(`${driveBase(env)}/drive/v3/files/${id}?alt=media&supportsAllDrives=true`, { headers: auth });
  if (!up.ok) return err(502, 'download_failed');
  const f = rec.files.find((x) => x.id === id);
  const h = { 'Content-Type': up.headers.get('Content-Type') || 'application/octet-stream', 'Cache-Control': 'no-store' };
  const len = up.headers.get('Content-Length'); if (len) h['Content-Length'] = len;
  if (url.searchParams.get('download') === '1') h['Content-Disposition'] = `attachment; filename*=UTF-8''${encodeURIComponent(f.name)}`;
  return new Response(up.body, { status: 200, headers: h });
}
