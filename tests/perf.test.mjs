// Bộ đo hiệu năng (?perf=1): hàm thống kê/báo cáo thuần + bảo đảm "không tốn gì khi tắt" (perf.js chỉ nạp động, hook là hàm rỗng).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

globalThis.location = { search: '' };
const root = path.resolve(import.meta.dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const P = await import('../perf.js');
const U = await import('../util.js');

test('biểu đồ tần suất: phân vị, đếm vượt ngưỡng, tệ nhất', () => {
  const h = P.makeHist();
  for (let i = 0; i < 10; i++) P.histAdd(h, 16.7);
  for (let i = 0; i < 5; i++) P.histAdd(h, 40);
  P.histAdd(h, 120); P.histAdd(h, 340);                                  // 340 > maxMs: vào ô tràn nhưng vẫn tính vào max
  assert.equal(h.n, 17); assert.equal(Math.round(h.max), 340);
  assert.equal(P.histPct(h, 0.5), 17); assert.equal(P.histPct(h, 0.8), 40); assert.equal(P.histPct(h, 0.9), 120); assert.equal(P.histPct(h, 0.95), 340, 'p95 của 17 mẫu là mẫu lớn nhất (rơi vào ô tràn → trả giá trị thật, không phải ô 251)');
  assert.equal(P.histOver(h, 25), 7); assert.equal(P.histOver(h, 50), 2); assert.equal(P.histOver(h, 100), 2); assert.equal(P.histOver(h, 500), 0);
  assert.equal(P.histPct(P.makeHist(), 0.5), 0, 'rỗng không lỗi');
});

test('stat(): p50/p95/max của mảng nhỏ; rỗng → 0', () => {
  assert.deepEqual(P.stat([]), { n: 0, p50: 0, p95: 0, max: 0 });
  const s = P.stat([100, 10, 30, 20, 50, 40, 60, 70, 80, 90]);
  assert.equal(s.n, 10); assert.equal(s.p50, 50); assert.equal(s.p95, 100); assert.equal(s.max, 100);
});

test('ước tính bộ nhớ ảnh đã giải mã: 4 byte/điểm ảnh, bỏ qua ảnh chưa tải xong', () => {
  const imgs = [{ complete: true, naturalWidth: 1000, naturalHeight: 500 }, { complete: true, naturalWidth: 200, naturalHeight: 100 }, { complete: false, naturalWidth: 9999, naturalHeight: 9999 }, { complete: true }];
  assert.equal(P.estimateDecodedBytes(imgs), 1000 * 500 * 4 + 200 * 100 * 4);
});

const hist = (arr) => { const h = P.makeHist(); arr.forEach((x) => P.histAdd(h, x)); return h; };
const fixture = (over = {}) => ({
  when: '5/10/2026', secs: 125, version: 'vdphoto-shell-abc123',
  env: { ua: 'iPhone; CPU iPhone OS 17', dpr: 3, vw: 430, vh: 932, cores: 6, touch: true, standalone: false, net: '4g rtt 50ms', browser: { name: 'Safari (iOS)', ios: true, swLikely: true }, sw: { supported: true, controlled: true } },
  start: { fcp: 820, lcp: null, dcl: 410, load: 950, firstRoute: 1100, libraryReady: 1800, modules: 21, jsBytes: 124000 },
  frames: { all: hist([8, 8, 8, 9, 60, 130]), scroll: hist([9, 60, 130]), gesture: hist([]), idle: hist([8, 8, 8]) },
  imgs: { thumbOk: 180, thumbErr: 3 }, res: { img: P.stat([300, 340, 2500]), slow2s: 1 }, mem: { cur: 62 * 1048576, peak: 148 * 1048576 }, dom: 2350, gridImgs: 41, counts: { fill: 380, empty: 340, rowsAdded: 600 },
  lb: { opens: 12, preview: P.stat([180, 900]), s1000: P.stat([450]), sFull: P.stat([900]), orig: P.stat([2000, 5000]), origBytesTotal: 20 * 1048576, fail: 1, origFail: 0 },
  route: P.stat([8, 40]), append: P.stat([6, 14]), ...over,
});

test('báo cáo: có đủ mục, số đúng, JSON đọc lại được, không NaN/undefined', () => {
  const { text, json } = P.buildReport(fixture());
  for (const must of ['báo cáo hiệu năng', 'Bản lưu của service worker: vdphoto-shell-abc123', 'Trình duyệt: Safari (iOS) · service worker: đang điều khiển trang', 'bỏ lỡ ≥2 khung (>15ms): 2 (33.3%)', 'đo 2 phút 5 giây', 'DPR 3', '430×932', 'cảm ứng', 'mạng 4g rtt 50ms',
    'FCP 820 ms', 'LCP n/a', 'trang chủ hiện lúc 1100 ms', '21 module (~121 KB)', 'Khung hình (trung vị 8 ms ≈ 125 Hz)', 'khi cuộn: 3 khung', 'khi zoom/kéo ảnh: 0 khung', 'lúc yên: 3 khung',
    'lưới tải 180, lỗi 3', 'p95 2500 ms, >2 giây: 1', 'hiện 62 MB, đỉnh 148 MB', 'DOM 2350 nút', 'dựng thẻ 380 lần, gỡ 340 lần', 'Lightbox (12 lượt xem)', 'lỗi bước nét 1', 'chuyển trang p50 8 ms']) {
    assert.ok(text.includes(must), `thiếu: ${must}\n${text}`);
  }
  assert.ok(!/NaN|undefined|Infinity/.test(text), text);
  const j = JSON.parse(json); assert.equal(j.frames.all.n, 6); assert.equal(j.frames.all.over50, 2); assert.equal(j.frames.scroll.over100, 1); assert.equal(j.mem.peak, 148 * 1048576); assert.equal(j.start.modules, 21);
});

const UA = {
  safariIos: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  edgeIos: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 EdgiOS/125.0.2535.60 Mobile/15E148 Safari/605.1.15',
  chromeIos: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.6478.35 Mobile/15E148 Safari/604.1',
  firefoxIos: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/127.0 Mobile/15E148 Safari/605.1.15',
  chromeAndroid: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
  edgeWin: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0',
  safariMac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
};
test('nhận diện trình duyệt: iOS chỉ Safari mới có service worker, Edge/Chrome/Firefox iOS thì không', () => {
  assert.deepEqual(P.detectBrowser(UA.safariIos), { name: 'Safari (iOS)', ios: true, swLikely: true });
  assert.deepEqual(P.detectBrowser(UA.edgeIos), { name: 'Edge (iOS)', ios: true, swLikely: false });
  assert.deepEqual(P.detectBrowser(UA.chromeIos), { name: 'Chrome (iOS)', ios: true, swLikely: false });
  assert.deepEqual(P.detectBrowser(UA.firefoxIos), { name: 'Firefox (iOS)', ios: true, swLikely: false });
  assert.equal(P.detectBrowser(UA.chromeAndroid).name, 'Chrome');
  assert.equal(P.detectBrowser(UA.edgeWin).name, 'Edge');
  assert.equal(P.detectBrowser(UA.safariMac).name, 'Safari');
  assert.equal(P.detectBrowser('').name, 'không rõ');
});

test('báo cáo trên Edge iOS: nói rõ service worker KHÔNG hỗ trợ và vì sao (không có thanh "có bản mới" là bình thường)', () => {
  const d = fixture(); d.env.browser = P.detectBrowser(UA.edgeIos); d.env.sw = { supported: false, controlled: false }; d.version = '';
  const { text } = P.buildReport(d);
  assert.ok(text.includes('Trình duyệt: Edge (iOS) · service worker: KHÔNG hỗ trợ (trình duyệt iOS không phải Safari thường không cho dùng service worker)'), text);
  assert.ok(text.includes('Bản lưu của service worker: không có'));
  d.env.browser = P.detectBrowser(UA.safariIos); d.env.sw = { supported: true, controlled: false };
  assert.ok(P.buildReport(d).text.includes('service worker: hỗ trợ, chưa điều khiển trang'));
});

test('tần số quét ~30 Hz (Chế độ nguồn điện thấp): có cảnh báo và hướng dẫn; ở 60/120 Hz thì không', () => {
  const frames = (v, n) => ({ all: hist(Array(n).fill(v)), scroll: hist(Array(Math.floor(n / 2)).fill(v)), gesture: hist([]), idle: hist(Array(Math.floor(n / 2)).fill(v)) });
  const t = P.buildReport(fixture({ frames: frames(33.4, 60) })).text;
  assert.ok(t.includes('Tần số quét chỉ ~30 Hz'), t);
  assert.ok(t.includes('Chế độ nguồn điện thấp')); assert.ok(t.includes('KHÔNG phản ánh giật'));
  assert.ok(t.includes('bỏ lỡ ≥2 khung (>63ms): 0 (0.0%)'), 'ở 30 Hz khung 33 ms là bình thường, chỉ khung >63 ms mới là bỏ lỡ');
  for (const ok of [8, 16.7]) assert.ok(!P.buildReport(fixture({ frames: frames(ok, 60) })).text.includes('Tần số quét chỉ'), `${ok} ms không cảnh báo`);
  assert.ok(!P.buildReport(fixture({ frames: frames(33, 10) })).text.includes('Tần số quét chỉ'), 'quá ít mẫu thì không kết luận');
});

test('báo cáo khi chưa có dữ liệu (máy vừa mở) không chia cho 0, không NaN', () => {
  const empty = fixture({ frames: { all: hist([]), scroll: hist([]), gesture: hist([]), idle: hist([]) }, res: { img: P.stat([]), slow2s: 0 }, lb: { opens: 0, preview: P.stat([]), s1000: P.stat([]), sFull: P.stat([]), orig: P.stat([]), origBytesTotal: 0, fail: 0, origFail: 0 }, route: P.stat([]), append: P.stat([]), start: { fcp: null, lcp: null, dcl: null, load: null, firstRoute: null, libraryReady: null, modules: 0, jsBytes: 0 } });
  const { text } = P.buildReport(empty);
  assert.ok(!/NaN|undefined|Infinity/.test(text), text); assert.ok(text.includes('FCP n/a'));
});

test('điểm gắn đo: tắt thì không làm gì và không xếp hàng; bật mà perf.js chưa nạp thì xếp hàng; có sink thì chuyển tiếp', () => {
  assert.equal(U.perfHook.on, false);
  U.perfMark('x'); U.perfAdd('route', 5); U.perfCount('fill'); U.perfLb('open', 'a');
  assert.equal(U.perfHook.q.length, 0, 'tắt đo: không xếp hàng, không tốn bộ nhớ');
  U.perfHook.on = true; U.perfMark('first-route'); U.perfLb('open', 'a');
  assert.deepEqual(U.perfHook.q.map((e) => e[0]), ['mark', 'lb']); assert.ok(U.perfHook.q.every((e) => typeof e[2] === 'number'));
  const got = []; U.perfHook.sink = (type, a) => got.push([type, a]); U.perfCount('fill', 3);
  assert.deepEqual(got, [['count', ['fill', 3]]]);
  U.perfHook.on = false; U.perfHook.sink = null; U.perfHook.q.length = 0;
});

test('không tốn gì với người dùng thường: perf.js chỉ nạp động khi bật, không nằm trong modulepreload, có trong khung của service worker', () => {
  for (const f of fs.readdirSync(root).filter((x) => x.endsWith('.js') && x !== 'perf.js')) assert.ok(!/from '\.\/perf\.js'/.test(read(f)), `${f} không import tĩnh perf.js`);
  assert.equal([...read('app.js').matchAll(/import\('\.\/perf\.js'\)/g)].length, 1);
  assert.match(read('app.js'), /if \(lsGet\('vd_perf'\) === '1'\)/);
  assert.ok(!read('index.html').includes('perf.js'), 'index.html không preload perf.js');
  assert.match(read('sw.js'), /'perf\.js'/);
});
