import test from 'node:test';
import assert from 'node:assert/strict';
import proxy from '../proxy/worker.js';
import { seal } from '../proxy/auth.js';

const ORIGIN = 'https://javisdinh0.github.io';
const kv = () => { const m = new Map(); return { m, get: async (k, o) => (m.has(k) ? (o && o.type === 'json' ? JSON.parse(m.get(k)) : m.get(k)) : null), put: async (k, v) => { m.set(k, v); }, delete: async (k) => { m.delete(k); } }; };
const mkEnv = () => ({ GOOGLE_CLIENT_ID: 'cid', GOOGLE_CLIENT_SECRET: 'sec', TOKEN_KEY: 'k'.repeat(32), SHARES: kv(), OWNER_EMAILS: 'Owner@Example.com' });
const call = (env, path, { method = 'GET', body, origin = ORIGIN } = {}) =>
  proxy.fetch(new Request('https://w.example' + path, { method, headers: { Origin: origin, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }), env, { waitUntil() {} });

const FILE = { id: 'FILEID0001abc', name: 'IMG_1.JPG', ext: 'JPG', w: 1600, h: 1067, time: 1700000000000, size: 5 };
const FILE2 = { id: 'FILEID0002abc', name: 'IMG_2.JPG', ext: 'JPG', w: 1067, h: 1600, time: 1700000100000, size: 5 };

// Google + Drive giả. users: refresh token -> email. Ghi lại các request để kiểm tra header.
function fake(users) {
  const real = globalThis.fetch; const seen = [];
  globalThis.fetch = async (url, init = {}) => {
    url = String(url); const h = new Headers(init.headers || {}); seen.push({ url, auth: h.get('Authorization') });
    const J = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'Content-Type': 'application/json' } });
    if (url.includes('oauth2.googleapis.com/token')) { const f = Object.fromEntries(new URLSearchParams(init.body)); return users[f.refresh_token] ? J({ access_token: 'AT-' + f.refresh_token, expires_in: 3600 }) : J({ error: 'invalid_grant' }, 400); }
    if (url.includes('/oauth2/v3/userinfo')) { const e = users[(h.get('Authorization') || '').replace('Bearer AT-', '')]; return e ? J({ email: e, email_verified: true }) : J({}, 401); }
    if (url.includes('fields=thumbnailLink')) return J({ thumbnailLink: 'https://lh3.example/thumb/abc=s220' });
    if (url.startsWith('https://lh3.example/thumb/')) return new Response('THUMB:' + url.split('=s')[1], { headers: { 'Content-Type': 'image/jpeg' } });
    if (url.includes('alt=media')) return new Response('ORIGINAL-BYTES', { headers: { 'Content-Type': 'image/jpeg', 'Content-Length': '14' } });
    return new Response('nope', { status: 404 });
  };
  return { seen, restore: () => { globalThis.fetch = real; } };
}
const create = (env, rt, extra = {}) => call(env, '/share/create', { method: 'POST', body: { rt, albumId: 'v:abc', name: 'Đà Lạt', ttlDays: 30, allowDownload: true, files: [FILE, FILE2], ...extra } });

test('share: chưa cấu hình KV → 501', async () => {
  const env = mkEnv(); delete env.SHARES;
  assert.equal((await call(env, '/share/abc', {})).status, 501);
});

test('share: chỉ admin tạo/thu hồi được (origin, refresh token, email)', async () => {
  const env = mkEnv(); const rtOwner = await seal(env, 'RT-OWNER'); const rtGuest = await seal(env, 'RT-GUEST');
  const g = fake({ 'RT-OWNER': 'owner@example.com', 'RT-GUEST': 'guest@example.com' });
  try {
    assert.equal((await call(env, '/share/create', { method: 'POST', body: {}, origin: 'https://evil.example' })).status, 403);
    assert.equal((await create(env, rtGuest)).status, 403);                       // không phải owner
    assert.equal((await create(env, 'khong-phai-blob')).status, 401);             // refresh token rác
    assert.equal((await call(env, '/share/create', { method: 'GET' })).status, 405);
    assert.equal((await create(env, rtOwner, { files: [] })).status, 400);        // không có ảnh
    assert.equal((await create(env, rtOwner, { ttlDays: 5 })).status, 400);       // hạn không hợp lệ
    assert.equal((await create(env, rtOwner, { files: [{ id: '../x', name: 'a' }] })).status, 400);
    assert.equal(env.SHARES.m.size, 0, 'không lưu gì khi bị từ chối');
    const r = await create(env, rtOwner); assert.equal(r.status, 200);
    const { token, expires } = await r.json();
    assert.match(token, /^[A-Za-z0-9_-]{22}$/); assert.ok(expires > Date.now() + 29 * 86400000);
    // khách (không phải owner) không thu hồi được; owner thu hồi được
    assert.equal((await call(env, '/share/revoke', { method: 'POST', body: { rt: rtGuest, token } })).status, 403);
    assert.equal((await call(env, '/share/' + token)).status, 200);
    assert.equal((await call(env, '/share/revoke', { method: 'POST', body: { rt: rtOwner, token } })).status, 200);
    assert.equal((await call(env, '/share/' + token)).status, 404);
  } finally { g.restore(); }
});

test('share: xem công khai (không cần đăng nhập) — metadata, thumbnail, tải gốc; không lộ refresh token', async () => {
  const env = mkEnv(); const rt = await seal(env, 'RT-OWNER');
  const g = fake({ 'RT-OWNER': 'owner@example.com' });
  try {
    const { token } = await (await create(env, rt)).json();
    const meta = await call(env, '/share/' + token); const text = await meta.text(); const m = JSON.parse(text);
    assert.equal(m.name, 'Đà Lạt'); assert.equal(m.files.length, 2); assert.equal(m.allowDownload, true);
    assert.ok(!text.includes(rt) && !/"rt"|refresh/i.test(text), 'metadata không chứa refresh token');
    // thumbnail: kích thước theo ?q=s1200, mặc định 800, giới hạn 2400; gọi Drive bằng token của admin
    const t1 = await call(env, `/share/${token}/img/${FILE.id}?q=s1200`); assert.equal(await t1.text(), 'THUMB:1200');
    assert.equal(await (await call(env, `/share/${token}/img/${FILE.id}`)).text(), 'THUMB:800');
    assert.equal(await (await call(env, `/share/${token}/img/${FILE.id}?q=s99999`)).text(), 'THUMB:800');
    assert.match(t1.headers.get('Cache-Control'), /private/);
    assert.ok(g.seen.some((s) => s.url.includes('lh3.example') && s.auth === 'Bearer AT-RT-OWNER'));
    // ảnh không thuộc link → 404 (không thể đọc file Drive tuỳ ý)
    assert.equal((await call(env, `/share/${token}/img/OTHERFILE00001`)).status, 404);
    assert.equal((await call(env, `/share/${token}/dl/OTHERFILE00001`)).status, 404);
    // tải gốc
    const dl = await call(env, `/share/${token}/dl/${FILE.id}?download=1`);
    assert.equal(await dl.text(), 'ORIGINAL-BYTES');
    assert.match(dl.headers.get('Content-Disposition'), /attachment; filename\*=UTF-8''IMG_1\.JPG/);
    assert.equal(dl.headers.get('Cache-Control'), 'no-store');
    // token sai định dạng / không tồn tại → 404
    assert.equal((await call(env, '/share/short')).status, 404);
    assert.equal((await call(env, '/share/' + 'A'.repeat(22))).status, 404);
  } finally { g.restore(); }
});

test('share: link không cho tải → 403; hết hạn → 404; danh sách link của album', async () => {
  const env = mkEnv(); const rt = await seal(env, 'RT-OWNER');
  const g = fake({ 'RT-OWNER': 'owner@example.com' });
  try {
    const a = await (await create(env, rt, { allowDownload: false, ttlDays: 7 })).json();
    const b = await (await create(env, rt, { ttlDays: 0 })).json();
    assert.equal((await call(env, `/share/${a.token}/dl/${FILE.id}`)).status, 403);
    assert.equal((await call(env, `/share/${a.token}/img/${FILE.id}`)).status, 200); // vẫn xem được
    const list = await (await call(env, '/share/list', { method: 'POST', body: { rt, albumId: 'v:abc' } })).json();
    assert.deepEqual(list.shares.map((s) => s.token).sort(), [a.token, b.token].sort());
    assert.equal(list.shares.find((s) => s.token === b.token).expires, 0);          // không hết hạn
    assert.equal((await (await call(env, '/share/list', { method: 'POST', body: { rt, albumId: 'v:khac' } })).json()).shares.length, 0);
    // giả lập hết hạn: sửa record trong KV
    const rec = JSON.parse(env.SHARES.m.get('s:' + a.token)); rec.expires = Date.now() - 1000; env.SHARES.m.set('s:' + a.token, JSON.stringify(rec));
    assert.equal((await call(env, '/share/' + a.token)).status, 404);
    assert.equal((await call(env, `/share/${a.token}/img/${FILE.id}`)).status, 404);
  } finally { g.restore(); }
});
