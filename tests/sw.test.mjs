// Service worker: thumbnail Google chỉ được lưu khi tải thành công (200). Trước đây phản hồi "opaque" của ảnh bị giới hạn tốc độ (429)
// cũng bị lưu và hiện lỗi mãi.
import test from 'node:test';
import assert from 'node:assert/strict';

const handlers = {}; const stores = new Map();
globalThis.self = { addEventListener: (t, fn) => { handlers[t] = fn; }, skipWaiting() {}, clients: { claim: async () => {} } };
globalThis.location = { origin: 'https://javisdinh0.github.io' };
globalThis.caches = {
  async open(name) {
    if (!stores.has(name)) stores.set(name, new Map());
    const m = stores.get(name);
    return { match: async (k) => m.get(typeof k === 'string' ? k : k.url), put: async (k, v) => { m.set(typeof k === 'string' ? k : k.url, v); }, keys: async () => [...m.keys()], delete: async (k) => m.delete(k) };
  },
  async keys() { return [...stores.keys()]; },
  async delete(n) { return stores.delete(n); },
};
await import('../sw.js');

const URL1 = 'https://lh3.googleusercontent.com/abc=s600';
const ask = async (url = URL1) => { let p; handlers.fetch({ request: { method: 'GET', url, destination: 'image' }, respondWith: (x) => { p = x; } }); return p; };
const realFetch = globalThis.fetch;
const withFetch = (impl) => { const calls = []; globalThis.fetch = async (input) => { const r = { url: input.url || String(input), mode: input.mode || 'no-cors' }; calls.push(r); return impl(r, calls.length); }; return calls; };

test('sw: 200 được lưu và lần sau phục vụ từ cache (không gọi mạng)', async () => {
  stores.clear();
  const calls = withFetch(() => new Response('IMG', { status: 200 }));
  try {
    assert.equal(await (await ask()).text(), 'IMG');
    assert.equal(calls.length, 1); assert.equal(calls[0].mode, 'cors');       // tải CORS để đọc được mã trạng thái
    assert.equal(await (await ask()).text(), 'IMG');
    assert.equal(calls.length, 1);                                            // lần 2 từ cache
  } finally { globalThis.fetch = realFetch; }
});

test('sw: 429/403 KHÔNG được lưu; hết lỗi thì tải lại và lưu', async () => {
  stores.clear();
  let status = 429;
  const calls = withFetch(() => new Response('x', { status }));
  try {
    assert.equal((await ask()).status, 429);
    assert.equal((await ask()).status, 429);
    assert.equal(calls.length, 2, 'mỗi lần đều tải lại, không dùng lỗi đã lưu');
    status = 200;
    assert.equal((await ask()).status, 200);
    assert.equal(calls.length, 3);
    assert.equal((await ask()).status, 200);
    assert.equal(calls.length, 3, 'thành công thì mới được lưu');
  } finally { globalThis.fetch = realFetch; }
});

test('sw: CORS bị chặn → tải thường và không lưu', async () => {
  stores.clear();
  const calls = withFetch((r) => { if (r.mode === 'cors') throw new TypeError('Failed to fetch'); return new Response('OPAQUE-OK', { status: 200 }); });
  try {
    assert.equal(await (await ask()).text(), 'OPAQUE-OK');
    assert.deepEqual(calls.map((c) => c.mode), ['cors', 'no-cors']);
    await ask(); assert.equal(calls.length, 4, 'không lưu phản hồi không đọc được trạng thái');
  } finally { globalThis.fetch = realFetch; }
});

test('sw: kích hoạt xoá cache ảnh phiên bản cũ (có thể chứa lỗi đã lưu nhầm)', async () => {
  stores.clear();
  await (await caches.open('vdphoto-img-v1')).put('https://lh3.googleusercontent.com/old', new Response('bad'));
  await (await caches.open('vdphoto-shell-v1')).put('https://javisdinh0.github.io/x', new Response('ok'));
  let done; handlers.activate({ waitUntil: (p) => { done = p; } }); await done;
  assert.deepEqual([...stores.keys()].sort(), ['vdphoto-shell-v1']);
});
