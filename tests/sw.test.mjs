// Service worker: (A) khung ứng dụng lưu sẵn thành phiên bản nguyên khối, phục vụ từ cache, kiểm tra bản mới ngầm, đổi con trỏ nguyên khối;
// (B) thumbnail Google chỉ được lưu khi 200 (trước đây phản hồi lỗi 429/403 bị lưu và hiện lỗi mãi). Chạy sw.js trong môi trường giả.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const SCOPE = 'https://javisdinh0.github.io/vietduongphoto/';
const handlers = {}; const stores = new Map(); const messages = []; let claimed = 0;
globalThis.self = {
  addEventListener: (t, fn) => { handlers[t] = fn; }, skipWaiting: async () => {}, registration: { scope: SCOPE },
  clients: { claim: async () => { claimed++; }, matchAll: async () => [{ postMessage: (m) => messages.push(m) }] },
};
globalThis.location = { origin: 'https://javisdinh0.github.io' };
const keyOf = (k) => (typeof k === 'string' ? k : k.url);
globalThis.caches = {
  async open(name) {
    if (caches.fail && name.startsWith('vdphoto-shell-')) throw new Error('boom');
    if (!stores.has(name)) stores.set(name, new Map());
    const m = stores.get(name);
    return { match: async (k) => { const r = m.get(keyOf(k)); return r ? r.clone() : undefined; }, put: async (k, v) => { m.set(keyOf(k), v); }, keys: async () => [...m.keys()], delete: async (k) => m.delete(keyOf(k)) };
  },
  async keys() { return [...stores.keys()]; },
  async delete(n) { return stores.delete(n); },
};
await import('../sw.js');
const SHELL = self.VDPHOTO_SHELL;
const realFetch = globalThis.fetch; const realNow = Date.now;
let now = 1_700_000_000_000; Date.now = () => now;
test.after(() => { globalThis.fetch = realFetch; Date.now = realNow; });

// ---- máy chủ giả: nội dung theo phiên bản; có thể làm hỏng một file
let server = {}; let calls = []; let failPath = null;
const setServer = (version, over = {}) => { server = Object.fromEntries(SHELL.map((f) => [f, `${f} ${version}`])); Object.assign(server, over); };
const useServer = () => { calls = []; globalThis.fetch = async (input, init = {}) => {
  const url = input.url || String(input); calls.push({ url, cache: init.cache, mode: input.mode });
  const rel = new URL(url).pathname.replace('/vietduongphoto/', '') || 'index.html';
  if (failPath && rel === failPath) return new Response('err', { status: 500 });
  if (rel in server) return new Response(server[rel], { status: 200 });
  return new Response('not found', { status: 404 });
}; };
const reset = () => { stores.clear(); messages.length = 0; claimed = 0; failPath = null; caches.fail = false; now += 3 * 3600 * 1000; setServer('v1'); useServer(); };
const run = async (type, extra = {}) => { let p; handlers[type]({ waitUntil: (x) => { p = x; }, ...extra }); return p; };
const install = () => run('install');
const ask = async (url, { mode = 'no-cors', destination = '', method = 'GET', clientId } = {}) => {
  const waits = []; let p; handlers.fetch({ request: { method, url, mode, destination }, resultingClientId: clientId, respondWith: (x) => { p = x; }, waitUntil: (x) => waits.push(x) });
  const res = p ? await p : null; await Promise.all(waits); return res;
};
const meta = async (k) => { const m = stores.get('vdphoto-meta'); const r = m && m.get(`https://meta.invalid/${k}`); return r ? r.clone().text() : null; };
const shellCaches = () => [...stores.keys()].filter((k) => k.startsWith('vdphoto-shell-'));
const stale = () => { now += 11 * 60 * 1000; };

test('khung ứng dụng: SHELL_FILES đủ module của app.js + file tĩnh trang dùng, và các file đều tồn tại', () => {
  const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
  const seen = ['app.js']; for (let i = 0; i < seen.length; i++) for (const m of read(seen[i]).matchAll(/from '\.\/([\w-]+\.js)'/g)) if (!seen.includes(m[1])) seen.push(m[1]);
  for (const f of [...seen, 'zipworker.js', 'index.html', 'style.css', 'icons.css', 'favicon.svg', 'manifest.webmanifest']) assert.ok(SHELL.includes(f), `${f} có trong SHELL_FILES`);
  for (const f of SHELL) assert.ok(fs.existsSync(path.join(root, f)), `${f} tồn tại`);
  assert.equal(new Set(SHELL).size, SHELL.length, 'không trùng');
  const preload = [...read('index.html').matchAll(/<link rel="modulepreload" href="([^"]+)">/g)].map((m) => m[1]);
  for (const f of preload) assert.ok(SHELL.includes(f), `${f} (modulepreload) có trong SHELL_FILES`);
});

test('cài đặt: tải đủ khung ứng dụng (bỏ qua cache HTTP), lưu thành một cache có mã băm và đặt con trỏ', async () => {
  reset(); await install();
  assert.equal(calls.length, SHELL.length); assert.ok(calls.every((c) => c.cache === 'reload'));
  const names = shellCaches(); assert.equal(names.length, 1); assert.match(names[0], /^vdphoto-shell-[0-9a-f]{16}$/);
  assert.equal(stores.get(names[0]).size, SHELL.length);
  assert.equal(await meta('current'), names[0]);
});

test('cài đặt thất bại (một file lỗi) → không đặt con trỏ, không để lại cache dở', async () => {
  reset(); failPath = 'gallery.js';
  await assert.rejects(install(), /shell fetch failed/);
  assert.equal(await meta('current'), null); assert.equal(shellCaches().length, 0);
});

test('phục vụ từ cache không gọi mạng: điều hướng (bỏ query), index.html, module', async () => {
  reset(); await install(); calls.length = 0;
  assert.equal(await (await ask(`${SCOPE}?demo=1`, { mode: 'navigate' })).text(), 'index.html v1');
  assert.equal(await (await ask(`${SCOPE}?w=https%3A%2F%2Fx.workers.dev`, { mode: 'navigate' })).text(), 'index.html v1');   // link chia sẻ: query bị bỏ qua
  assert.equal(await (await ask(`${SCOPE}index.html`, { mode: 'navigate' })).text(), 'index.html v1');
  assert.equal(await (await ask(`${SCOPE}gallery.js?x=1`)).text(), 'gallery.js v1');
  assert.equal(await (await ask(`${SCOPE}zipworker.js`)).text(), 'zipworker.js v1');
  assert.equal(calls.length, 0, 'mới cài xong nên chưa tới lúc kiểm tra lại: không có yêu cầu mạng nào');
});

test('không can thiệp: file ngoài khung ứng dụng, POST, tài nguyên khác origin không phải ảnh Google', async () => {
  reset(); await install();
  assert.equal(await ask(`${SCOPE}docs/README.md`), null);
  assert.equal(await ask(`${SCOPE}gallery.js`, { method: 'POST' }), null);
  assert.equal(await ask('https://accounts.google.com/gsi/client'), null);
  assert.equal(await ask('https://www.googleapis.com/drive/v3/files'), null);
});

test('hỏi lại server tối đa 1 lần / 10 phút (điều hướng liên tiếp chỉ kiểm tra một lần)', async () => {
  reset(); await install(); stale(); calls.length = 0;
  await ask(SCOPE, { mode: 'navigate' }); await ask(SCOPE, { mode: 'navigate' }); await ask(`${SCOPE}app.js`);
  assert.equal(calls.length, SHELL.length, 'đúng một đợt kiểm tra');
  assert.ok(calls.every((c) => c.cache === 'no-cache'), 'kiểm tra bằng yêu cầu có điều kiện (304 rẻ), không phải tải lại');
});

test('bản mới: trang đang mở vẫn nhận bản cũ ngay, SW dựng phiên bản mới ở cache khác rồi đổi con trỏ và báo cho trang', async () => {
  reset(); await install(); const v1 = await meta('current'); stale();
  setServer('v2');
  assert.equal(await (await ask(SCOPE, { mode: 'navigate' })).text(), 'index.html v1', 'phục vụ ngay từ bản đang dùng');
  const v2 = await meta('current'); assert.notEqual(v2, v1); assert.equal(await meta('prev'), v1);
  assert.deepEqual(messages, [{ type: 'vdphoto-update', name: v2 }]);
  assert.equal(await (await ask(SCOPE, { mode: 'navigate' })).text(), 'index.html v2', 'lần tải sau dùng bản mới');
  assert.equal(await (await ask(`${SCOPE}lightbox.js`)).text(), 'lightbox.js v2', 'toàn bộ module cùng một phiên bản (không trộn)');
  assert.deepEqual(shellCaches().sort(), [v1, v2].sort(), 'giữ bản trước một nhịp');
  // cập nhật lần nữa: bản đầu tiên bị dọn
  stale(); setServer('v3'); await ask(SCOPE, { mode: 'navigate' });
  const v3 = await meta('current'); assert.deepEqual(shellCaches().sort(), [v2, v3].sort()); assert.ok(!shellCaches().includes(v1));
});

test('chỉ đổi một file cũng tạo phiên bản mới nguyên khối (mọi file đủ trong cache mới)', async () => {
  reset(); await install(); const v1 = await meta('current'); stale();
  setServer('v1', { 'style.css': 'style.css CHANGED' });
  await ask(SCOPE, { mode: 'navigate' });
  const v2 = await meta('current'); assert.notEqual(v2, v1); assert.equal(stores.get(v2).size, SHELL.length);
  assert.equal(await (await ask(`${SCOPE}style.css`)).text(), 'style.css CHANGED');
  assert.equal(await (await ask(`${SCOPE}app.js`)).text(), 'app.js v1');
});

test('server không đổi → không dựng cache mới, không báo; lần kiểm tra bị ghi nhận (không hỏi lại ngay)', async () => {
  reset(); await install(); const v1 = await meta('current'); stale(); calls.length = 0;
  await ask(SCOPE, { mode: 'navigate' });
  assert.equal(await meta('current'), v1); assert.equal(shellCaches().length, 1); assert.equal(messages.length, 0);
  const n = calls.length; await ask(SCOPE, { mode: 'navigate' }); assert.equal(calls.length, n, 'đã ghi nhận lần kiểm tra');
});

test('kiểm tra lỗi (một file 500 hoặc mất mạng) → giữ nguyên bản hiện tại, không báo; sau đó thử lại được', async () => {
  reset(); await install(); const v1 = await meta('current'); stale(); setServer('v2'); failPath = 'zoom.js';
  await ask(SCOPE, { mode: 'navigate' });
  assert.equal(await meta('current'), v1); assert.equal(messages.length, 0); assert.equal(shellCaches().length, 1);
  failPath = null; stale(); await ask(SCOPE, { mode: 'navigate' });
  assert.notEqual(await meta('current'), v1); assert.equal(messages.length, 1);
  // mất mạng hoàn toàn
  const v2 = await meta('current'); stale(); globalThis.fetch = async () => { throw new TypeError('Failed to fetch'); };
  assert.equal(await (await ask(SCOPE, { mode: 'navigate' })).text(), 'index.html v2', 'ngoại tuyến vẫn mở được'); assert.equal(await meta('current'), v2);
});

test('tin nhắn {type:"check"} từ trang kích hoạt kiểm tra (vẫn bị giới hạn tần suất); tin khác bị bỏ qua', async () => {
  reset(); await install(); stale(); setServer('v2'); const v1 = await meta('current');
  await run('message', { data: { type: 'bậy bạ' } }); assert.equal(await meta('current'), v1);
  await run('message', { data: { type: 'check' } }); assert.notEqual(await meta('current'), v1); assert.equal(messages.length, 1);
  const n = calls.length; await run('message', { data: { type: 'check' } }); assert.equal(calls.length, n, 'giới hạn tần suất');
});

test('kích hoạt: dọn cache cũ (kể cả vdphoto-shell-v1 của SW trước) nhưng giữ bản đang dùng + bản trước + ảnh + siêu dữ liệu', async () => {
  reset(); await install(); const cur = await meta('current');
  for (const n of ['vdphoto-shell-v1', 'vdphoto-shell-deadbeefdeadbeef', 'cache-la']) (await caches.open(n));
  await (await caches.open('vdphoto-img-v2')).put('https://lh3.googleusercontent.com/a', new Response('x'));
  await run('activate');
  assert.deepEqual([...stores.keys()].sort(), [cur, 'vdphoto-img-v2', 'vdphoto-meta'].sort()); assert.equal(claimed, 1);
});

test('an toàn: lỗi bên trong SW (cache hỏng) thì rơi về mạng thường, trang vẫn chạy', async () => {
  reset(); await install(); caches.fail = true;
  const res = await ask(`${SCOPE}gallery.js`); assert.equal(await res.text(), 'gallery.js v1');   // lấy từ "mạng" giả
  caches.fail = false;
});

// ---------------- thumbnail Google
const URL1 = 'https://lh3.googleusercontent.com/abc=s600';
const imgReq = (url = URL1) => ask(url, { destination: 'image' });
const withFetch = (impl) => { const c = []; globalThis.fetch = async (input) => { const r = { url: input.url || String(input), mode: input.mode || 'no-cors' }; c.push(r); return impl(r, c.length); }; return c; };

test('thumbnail: 200 được lưu và lần sau phục vụ từ cache (không gọi mạng)', async () => {
  reset(); const c = withFetch(() => new Response('IMG', { status: 200 }));
  assert.equal(await (await imgReq()).text(), 'IMG'); assert.equal(c.length, 1); assert.equal(c[0].mode, 'cors');   // tải CORS để đọc được mã trạng thái
  assert.equal(await (await imgReq()).text(), 'IMG'); assert.equal(c.length, 1);
});

test('thumbnail: 429/403 KHÔNG được lưu; hết lỗi thì tải lại và lưu', async () => {
  reset(); let status = 429; const c = withFetch(() => new Response('x', { status }));
  assert.equal((await imgReq()).status, 429); assert.equal((await imgReq()).status, 429); assert.equal(c.length, 2, 'mỗi lần đều tải lại, không dùng lỗi đã lưu');
  status = 200; assert.equal((await imgReq()).status, 200); assert.equal(c.length, 3);
  assert.equal((await imgReq()).status, 200); assert.equal(c.length, 3, 'thành công thì mới được lưu');
});

test('thumbnail: CORS bị chặn → tải thường và không lưu', async () => {
  reset(); const c = withFetch((r) => { if (r.mode === 'cors') throw new TypeError('Failed to fetch'); return new Response('OPAQUE-OK', { status: 200 }); });
  assert.equal(await (await imgReq()).text(), 'OPAQUE-OK'); assert.deepEqual(c.map((x) => x.mode), ['cors', 'no-cors']);
  await imgReq(); assert.equal(c.length, 4, 'không lưu phản hồi không đọc được trạng thái');
});

test('trạng thái: trang nạp bản cũ rồi bản mới được dựng mà tin báo bị lỡ → hỏi lại vẫn biết "stale"; bản mới nạp sau thì không stale; "check" có force bỏ qua giới hạn', async () => {
  reset(); await install(); const v1 = await meta('current');
  await ask(SCOPE, { mode: 'navigate', clientId: 'tab1' });                       // trang tab1 nạp bản v1
  const got = []; const src = (id) => ({ id, postMessage: (m) => got.push(m) });
  await run('message', { data: { type: 'status' }, source: src('tab1') });
  assert.equal(got.at(-1).type, 'vdphoto-status'); assert.equal(got.at(-1).loaded, v1); assert.equal(got.at(-1).stale, false);
  stale(); setServer('v2'); await ask(SCOPE, { mode: 'navigate', clientId: 'tab2' });  // tab2 mở lại → SW dựng v2 ở nền
  const v2 = await meta('current'); assert.notEqual(v2, v1);
  await run('message', { data: { type: 'status' }, source: src('tab1') });
  assert.equal(got.at(-1).stale, true, 'tab1 vẫn chạy v1'); assert.equal(got.at(-1).current, v2);
  await run('message', { data: { type: 'status' }, source: src('tab2') }); assert.equal(got.at(-1).loaded, v1, 'tab2 được phục vụ v1 (nạp ngay từ cache) rồi mới cập nhật nền');
  await run('message', { data: { type: 'status' }, source: src('lạ') }); assert.equal(got.at(-1).loaded, null); assert.equal(got.at(-1).stale, false, 'không biết thì không kết luận');
  // force: bỏ qua giới hạn 10 phút, trả kết quả
  setServer('v3'); await run('message', { data: { type: 'check' }, source: src('tab1') }); assert.equal(await meta('current'), v2, 'không force: bị giới hạn tần suất');
  await run('message', { data: { type: 'check', force: true }, source: src('tab1') });
  assert.notEqual(await meta('current'), v2); assert.equal(got.at(-1).result, 'updated');
  await run('message', { data: { type: 'check', force: true }, source: src('tab1') }); assert.equal(got.at(-1).result, 'same');
});
