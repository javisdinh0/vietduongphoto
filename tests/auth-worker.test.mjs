import test from 'node:test';
import assert from 'node:assert/strict';
import proxy from '../proxy/worker.js';

const ORIGIN = 'https://javisdinh0.github.io';
const env = { GOOGLE_CLIENT_ID: 'cid', GOOGLE_CLIENT_SECRET: 'sec', TOKEN_KEY: 'k'.repeat(32) };
const call = (path, body, { origin = ORIGIN, method = 'POST', e = env } = {}) =>
  proxy.fetch(new Request('https://w.example' + path, { method, headers: { Origin: origin, 'Content-Type': 'application/json' }, body: method === 'POST' ? JSON.stringify(body) : undefined }), e, { waitUntil() {} });

// Google giả: ghi lại form gửi lên, trả theo kịch bản.
function fakeGoogle(handler) {
  const real = globalThis.fetch; const seen = [];
  globalThis.fetch = async (url, init) => { const form = Object.fromEntries(new URLSearchParams(init.body)); seen.push({ url: String(url), form }); return handler(String(url), form); };
  return { seen, restore: () => { globalThis.fetch = real; } };
}
const j = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });

test('auth: chưa cấu hình secret → 501; sai origin → 403; không phải POST → 405', async () => {
  assert.equal((await call('/auth/code', { code: 'x' }, { e: {} })).status, 501);
  assert.equal((await call('/auth/code', { code: 'x' }, { origin: 'https://evil.example' })).status, 403);
  assert.equal((await call('/auth/code', null, { method: 'GET' })).status, 405);
  assert.equal((await call('/auth/nope', {})).status, 404);
});

test('auth: code → access token + blob mã hoá; refresh dùng refresh token thật; revoke', async () => {
  const g = fakeGoogle((url, f) => {
    if (url.endsWith('/revoke')) return j({});
    if (f.grant_type === 'authorization_code') return j({ access_token: 'AT1', expires_in: 3599, refresh_token: 'RT-secret' });
    if (f.grant_type === 'refresh_token' && f.refresh_token === 'RT-secret') return j({ access_token: 'AT2', expires_in: 3599 });
    return j({ error: 'invalid_grant' }, 400);
  });
  try {
    const r1 = await call('/auth/code', { code: 'abc' }); const b1 = await r1.json();
    assert.equal(r1.status, 200); assert.equal(b1.access_token, 'AT1');
    assert.ok(b1.rt && !b1.rt.includes('RT-secret'), 'refresh token không lộ nguyên văn');
    assert.deepEqual(g.seen[0].form, { client_id: 'cid', client_secret: 'sec', code: 'abc', grant_type: 'authorization_code', redirect_uri: 'postmessage' });
    const r2 = await call('/auth/refresh', { rt: b1.rt }); const b2 = await r2.json();
    assert.equal(b2.access_token, 'AT2'); assert.equal(r2.headers.get('Access-Control-Allow-Origin'), ORIGIN);
    assert.equal((await call('/auth/revoke', { rt: b1.rt })).status, 200);
    assert.equal(g.seen.at(-1).form.token, 'RT-secret');
    // blob của khoá khác / bị sửa → 401, không gọi Google
    const n = g.seen.length;
    assert.equal((await call('/auth/refresh', { rt: b1.rt }, { e: { ...env, TOKEN_KEY: 'z'.repeat(32) } })).status, 401);
    assert.equal((await call('/auth/refresh', { rt: b1.rt.slice(0, -2) + 'AA' })).status, 401);
    assert.equal((await call('/auth/refresh', {})).status, 401);
    assert.equal(g.seen.length, n);
  } finally { g.restore(); }
});

test('auth: Google từ chối (invalid_grant → 401, thiếu refresh_token → rt null, code sai → 400)', async () => {
  let mode = 'norefresh';
  const g = fakeGoogle((url, f) => {
    if (f.grant_type === 'authorization_code') return mode === 'bad' ? j({ error: 'invalid_grant' }, 400) : j({ access_token: 'A', expires_in: 3600 });
    return j({ error: 'invalid_grant' }, 400);
  });
  try {
    assert.equal((await (await call('/auth/code', { code: 'c' })).json()).rt, null);
    mode = 'bad'; assert.equal((await call('/auth/code', { code: 'c' })).status, 400);
    assert.equal((await call('/auth/code', {})).status, 400);
    // refresh token đã bị thu hồi phía Google
    g.restore();
    const g2 = fakeGoogle(() => j({ access_token: 'A', expires_in: 1, refresh_token: 'R' }));
    const rt = (await (await call('/auth/code', { code: 'c' })).json()).rt; g2.restore();
    const g3 = fakeGoogle(() => j({ error: 'invalid_grant' }, 400));
    try { assert.equal((await call('/auth/refresh', { rt })).status, 401); } finally { g3.restore(); }
  } finally { g.restore(); }
});
