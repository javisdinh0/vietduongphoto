// Test tích hợp: chạy code Drive THẬT của app (createDrive) và proxy worker qua HTTP với một Drive giả đúng giao thức
// (liệt kê có phân trang, truy vấn `in parents`, modifiedTime, thùng rác, batch multipart, 401/403/429, alt=media).
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createDrive } from '../backend.js';
import { buildLibrary } from '../lib.js';
import { zipToWritable } from '../zipclient.js';
import proxy from '../proxy/worker.js';

const FOLDER = 'application/vnd.google-apps.folder';
const day = (n) => new Date(Date.UTC(2025, 0, n)).toISOString();
const db = {
  files: [
    { id: 'root', name: 'root', mimeType: FOLDER, parents: ['top'], modifiedTime: day(1) },
    { id: 'a', name: 'Album A', mimeType: FOLDER, parents: ['root'], modifiedTime: day(1) },
    { id: 'b', name: 'Sub B', mimeType: FOLDER, parents: ['a'], modifiedTime: day(1) },
    { id: 'secret', name: 'Secret', mimeType: FOLDER, parents: ['root'], modifiedTime: day(1) },
    ...Array.from({ length: 5 }, (_, i) => ({ id: 'p' + i, name: `IMG_${i}.JPG`, mimeType: 'image/jpeg', parents: ['a'], modifiedTime: day(2), size: '10', thumbnailLink: `https://lh3/x${i}=s220`, imageMediaMetadata: { width: 100, height: 50, time: '2025:01:0' + (i + 1) + ' 10:00:00' } })),
    { id: 'r0', name: 'IMG_0.ARW', mimeType: 'application/octet-stream', parents: ['a'], modifiedTime: day(2), size: '99' },
    { id: 'deep', name: 'deep.png', mimeType: 'image/png', parents: ['b'], modifiedTime: day(3), size: '5' },
  ],
};
let calls = []; let failNextList = 0; let batchCalls = 0;

function handler(req, res) {
  const u = new URL(req.url, 'http://x'); calls.push(req.method + ' ' + u.pathname);
  const send = (code, body, type = 'application/json') => { res.writeHead(code, { 'Content-Type': type }); res.end(typeof body === 'string' ? body : JSON.stringify(body)); };
  if (req.headers.authorization !== 'Bearer good') return send(401, { error: { message: 'unauth' } });
  if (u.pathname === '/drive/v3/files' && req.method === 'GET') {
    if (failNextList > 0) { failNextList--; return send(429, { error: { errors: [{ reason: 'rateLimitExceeded' }] } }); }
    const q = u.searchParams.get('q');
    const parents = [...q.matchAll(/'([^']+)' in parents/g)].map((m) => m[1]);
    if (parents.includes('secret')) return send(403, { error: { errors: [{ reason: 'forbidden' }] } });
    const since = /modifiedTime > '([^']+)'/.exec(q);
    let list = db.files.filter((f) => f.parents.some((p) => parents.includes(p)) && !f.trashed || (since && f.parents.some((p) => parents.includes(p))));
    if (/mimeType='[^']*folder'/.test(q) && !/mimeType!=/.test(q)) list = list.filter((f) => f.mimeType === FOLDER);
    if (/mimeType!=/.test(q)) list = list.filter((f) => f.mimeType !== FOLDER);
    if (/trashed=false/.test(q)) list = list.filter((f) => !f.trashed);
    if (since) list = list.filter((f) => f.modifiedTime > since[1]);
    const size = 3; const start = +(u.searchParams.get('pageToken') || 0); // phân trang 3 file/trang
    const page = list.slice(start, start + size);
    return send(200, { files: page, ...(start + size < list.length ? { nextPageToken: String(start + size) } : {}) });
  }
  const m = /^\/drive\/v3\/files\/([\w-]+)$/.exec(u.pathname);
  if (m && req.method === 'GET') {
    const f = db.files.find((x) => x.id === m[1]); if (!f) return send(404, {});
    if (u.searchParams.get('alt') === 'media') return send(200, 'DATA-' + f.id, 'application/octet-stream');
    return send(200, { thumbnailLink: f.thumbnailLink, imageMediaMetadata: { ...f.imageMediaMetadata, cameraModel: 'X100', lens: 'L' }, size: f.size });
  }
  if (u.pathname === '/batch/drive/v3' && req.method === 'POST') {
    batchCalls++; let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      const b = 'RESP'; let out = '';
      [...body.matchAll(/Content-ID: <item(\d+)>[\s\S]*?GET \/drive\/v3\/files\/([\w-]+)\?/g)].forEach((mm) => {
        const f = db.files.find((x) => x.id === mm[2]);
        out += `--${b}\r\nContent-Type: application/http\r\nContent-ID: <response-item${mm[1]}>\r\n\r\n` + (f ? `HTTP/1.1 200 OK\r\nContent-Type: application/json\r\n\r\n${JSON.stringify({ thumbnailLink: f.thumbnailLink + 'NEW' })}\r\n` : 'HTTP/1.1 404 Not Found\r\n\r\n{}\r\n');
      });
      res.writeHead(200, { 'Content-Type': `multipart/mixed; boundary=${b}` }); res.end(out + `--${b}--`);
    });
    return;
  }
  send(404, {});
}

let server; let base;
test.before(async () => { server = http.createServer(handler); await new Promise((r) => server.listen(0, r)); base = 'http://127.0.0.1:' + server.address().port; });
test.after(() => { server.closeAllConnections(); server.close(); });

const mk = (tok = 'good', b) => createDrive(() => tok, '', b || base);

test('loadAll: duyệt cây thư mục, phân trang, ghép RAW, thư mục cấm bị bỏ qua', async () => {
  calls = [];
  let tree = null;
  const raw = await mk().loadAll('root', () => {}, (f) => { tree = f.length; });
  assert.equal(tree, 4); // root, a, b, secret — báo cây thư mục trước khi tải file
  assert.deepEqual(raw.folders.map((f) => f.id).sort(), ['a', 'b', 'root', 'secret']);
  assert.equal(raw.files.length, 7); // 5 jpg + arw + deep.png (phân trang 3/trang đã gộp đủ)
  const L = buildLibrary(raw, 'root');
  assert.equal(L.photos.length, 6); assert.equal(L.byId.get('p0').raw.id, 'r0'); assert.equal(L.folders.get('a').deep.length, 6);
  assert.ok(raw.syncedAt > 0);
});

test('refresh: chỉ lấy file thay đổi, xử lý xoá/thêm', async () => {
  const drive = mk();
  const prev = await drive.loadAll('root');
  prev.syncedAt = Date.parse(day(2)) + 1; // coi như đã đồng bộ sau day(2)
  db.files.find((f) => f.id === 'p1').trashed = true; db.files.find((f) => f.id === 'p1').modifiedTime = day(10);
  db.files.push({ id: 'new1', name: 'NEW.JPG', mimeType: 'image/jpeg', parents: ['a'], modifiedTime: day(11), size: '1' });
  const next = await drive.refresh('root', prev);
  const ids = next.files.map((f) => f.id);
  assert.ok(!ids.includes('p1')); assert.ok(ids.includes('new1')); assert.ok(ids.includes('p0')); assert.equal(next.files.length, 7);
  db.files.find((f) => f.id === 'p1').trashed = false; db.files.pop();
});

test('backoff: 429 rateLimit được thử lại', async () => {
  failNextList = 1; const t0 = Date.now();
  const raw = await mk().loadAll('root');
  assert.ok(raw.files.length >= 7); assert.ok(Date.now() - t0 >= 400);
});

test('401 → UNAUTH; 403 ở thư mục gốc → PERMISSION_DENIED', async () => {
  await assert.rejects(mk('bad').loadAll('root'), /UNAUTH/);
  await assert.rejects(mk().loadAll('secret'), /PERMISSION_DENIED/);
});

test('meta / thumb / thumbs (batch) / stream / blob', async () => {
  const d = mk();
  assert.equal((await d.meta('p0')).imageMediaMetadata.cameraModel, 'X100');
  assert.equal(await d.thumb('p1'), 'https://lh3/x1=s220');
  batchCalls = 0;
  const t = await d.thumbs(['p0', 'p2', 'nope']);
  assert.equal(batchCalls, 1); assert.equal(t.p0, 'https://lh3/x0=s220NEW'); assert.equal(t.p2, 'https://lh3/x2=s220NEW'); assert.ok(!('nope' in t));
  assert.equal(await (await d.blob({ id: 'p3' })).text(), 'DATA-p3');
  assert.equal(await new Response(await d.stream({ id: 'p4' })).text(), 'DATA-p4');
});

test('thumbs: batch lỗi → rơi về từng request', async () => {
  const bad = createDrive(() => 'good', '', base);
  const orig = globalThis.fetch;
  globalThis.fetch = async (u, o) => (String(u).includes('/batch/') ? new Response('x', { status: 400 }) : orig(u, o));
  try { const t = await bad.thumbs(['p0']); assert.equal(t.p0, 'https://lh3/x0=s220'); } finally { globalThis.fetch = orig; }
});

test('proxy worker đứng trước Drive: chạy toàn bộ loadAll qua proxy, cache metadata', async () => {
  const store = new Map();
  globalThis.caches = { default: { match: async (k) => store.get(k.url)?.clone(), put: async (k, r) => { store.set(k.url, r); } } };
  const env = { DRIVE_ORIGIN: base, ALLOWED_ORIGIN: 'https://ividlab.com' };
  const pserver = http.createServer(async (req, res) => {
    const chunks = []; for await (const c of req) chunks.push(c);
    const r = new Request('http://p' + req.url, { method: req.method, headers: req.headers, body: req.method === 'POST' ? Buffer.concat(chunks) : undefined });
    const out = await proxy.fetch(r, env, { waitUntil: () => {} });
    res.writeHead(out.status, Object.fromEntries(out.headers)); res.end(Buffer.from(await out.arrayBuffer()));
  });
  await new Promise((r) => pserver.listen(0, r)); const pbase = 'http://127.0.0.1:' + pserver.address().port;
  try {
    calls = []; const d = mk('good', pbase);
    const raw = await d.loadAll('root'); assert.equal(raw.files.length >= 7, true);
    const n1 = calls.length; await d.loadAll('root'); // lần 2: metadata thành công được cache 60s theo token; chỉ các truy vấn 403 (không cache) mới gọi lại Drive
    assert.ok(calls.length - n1 < n1 / 2, `lần 2 gọi thêm ${calls.length - n1} so với lần đầu ${n1}`);
    assert.equal((await d.blob({ id: 'p2' })).size > 0, true); // alt=media đi thẳng
    assert.equal((await d.thumbs(['p0'])).p0, 'https://lh3/x0=s220NEW'); // batch qua proxy
    await assert.rejects(mk('bad', pbase).loadAll('root'), /UNAUTH/); // Drive từ chối token → proxy chuyển tiếp 401
  } finally { pserver.closeAllConnections(); pserver.close(); }
});

test('zip ghi luồng từ Drive thật (stream) → file zip hợp lệ', async () => {
  const chunks = []; const ws = new WritableStream({ write(c) { chunks.push(Buffer.from(c)); } });
  const d = mk();
  // Node không có Worker module cùng dạng trình duyệt → zipToWritable tự rơi về luồng chính (cùng logic ZipStream)
  await zipToWritable(ws, ['p0', 'p1'].map((id) => ({ name: id + '.jpg', open: () => d.stream({ id }) })));
  const buf = Buffer.concat(chunks); assert.equal(buf.readUInt16LE(buf.length - 22 + 10), 2);
});
