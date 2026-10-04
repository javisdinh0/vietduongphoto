// Đổi authorization code của Google lấy refresh token, rồi cấp access token mới khi cần => đăng nhập 1 lần, không hết hạn sau 1 giờ.
// Secret nằm ở Worker (GOOGLE_CLIENT_SECRET); refresh token chỉ rời Worker dưới dạng blob mã hoá AES-GCM bằng TOKEN_KEY,
// nên trình duyệt giữ blob nhưng không dùng được ở nơi khác. Worker chỉ phục vụ GOOGLE_CLIENT_ID đã cấu hình và đúng ALLOWED_ORIGIN.
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke';

const b64 = (u8) => btoa(String.fromCharCode(...u8)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64 = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

async function aesKey(env) {
  const raw = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(env.TOKEN_KEY));
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}
async function seal(env, text) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await aesKey(env), new TextEncoder().encode(text)));
  return b64(Uint8Array.from([...iv, ...ct]));
}
async function open(env, blob) {
  const u = unb64(blob);
  return new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: u.slice(0, 12) }, await aesKey(env), u.slice(12)));
}
const form = (o) => new URLSearchParams(o).toString();
const post = (url, body) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: form(body) });

export async function handleAuth(req, env, url, allowedOrigin) {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || !env.TOKEN_KEY) return json({ error: 'not_configured' }, 501);
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  if (req.headers.get('Origin') !== allowedOrigin) return json({ error: 'forbidden_origin' }, 403); // trình duyệt luôn gửi Origin ở POST chéo site
  let body; try { body = await req.json(); } catch (e) { return json({ error: 'bad_request' }, 400); }
  const tokenUrl = env.TOKEN_ENDPOINT || TOKEN_URL; const revokeUrl = env.REVOKE_ENDPOINT || REVOKE_URL;
  const creds = { client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET };

  if (url.pathname === '/auth/code') {
    if (typeof body.code !== 'string' || !body.code) return json({ error: 'bad_request' }, 400);
    const res = await post(tokenUrl, { ...creds, code: body.code, grant_type: 'authorization_code', redirect_uri: 'postmessage' });
    const j = await res.json().catch(() => ({}));
    if (!res.ok || !j.access_token) return json({ error: j.error || 'exchange_failed' }, res.status === 400 ? 400 : 502);
    return json({ access_token: j.access_token, expires_in: j.expires_in, rt: j.refresh_token ? await seal(env, j.refresh_token) : null });
  }
  if (url.pathname === '/auth/refresh' || url.pathname === '/auth/revoke') {
    let refresh; try { refresh = await open(env, String(body.rt || '')); } catch (e) { return json({ error: 'invalid_grant' }, 401); }
    if (url.pathname === '/auth/revoke') { await post(revokeUrl, { token: refresh }).catch(() => {}); return json({ ok: true }); }
    const res = await post(tokenUrl, { ...creds, refresh_token: refresh, grant_type: 'refresh_token' });
    const j = await res.json().catch(() => ({}));
    if (j.error === 'invalid_grant') return json({ error: 'invalid_grant' }, 401);
    if (!res.ok || !j.access_token) return json({ error: j.error || 'refresh_failed' }, 502);
    return json({ access_token: j.access_token, expires_in: j.expires_in });
  }
  return json({ error: 'not_found' }, 404);
}
