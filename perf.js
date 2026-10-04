// Đo hiệu năng NGAY TRÊN ĐIỆN THOẠI (mở trang với ?perf=1; ?perf=0 để tắt). Chỉ được nạp (import động) khi bật nên người dùng thường không tốn gì.
// Thu: độ mượt khung hình (chia theo lúc cuộn / zoom-kéo ảnh / yên), thời gian khởi động, tải ảnh (số lượng, lỗi, thời gian), ước tính bộ nhớ ảnh
// đã giải mã, các bước của lightbox (xem trước → 1000px → bản lớn → ảnh gốc), thời gian dựng danh sách. Bảng nhỏ góc màn hình: [Sao chép] [Gửi] gửi
// báo cáo văn bản + JSON cho người phát triển. Các hàm thống kê/định dạng ở đầu file là hàm thuần (tests/perf.test.mjs).
import { perfHook, lsDel } from './util.js';

// ====================================================== hàm thuần (không đụng DOM)
export const makeHist = (maxMs = 250) => ({ b: new Uint32Array(maxMs + 2), n: 0, sum: 0, max: 0, maxMs });
export function histAdd(h, ms) { const i = Math.min(h.maxMs + 1, Math.max(0, Math.round(ms))); h.b[i]++; h.n++; h.sum += ms; if (ms > h.max) h.max = ms; }
export function histPct(h, p) { if (!h.n) return 0; const target = Math.ceil(h.n * p); let c = 0; for (let i = 0; i < h.b.length; i++) { c += h.b[i]; if (c >= target) return i > h.maxMs ? Math.round(h.max) : i; } return Math.round(h.max); } // ô tràn (> maxMs): trả giá trị lớn nhất đã đo
export function histOver(h, ms) { let c = 0; for (let i = Math.floor(ms) + 1; i < h.b.length; i++) c += h.b[i]; return c; }
export function stat(arr) {
  if (!arr || !arr.length) return { n: 0, p50: 0, p95: 0, max: 0 };
  const s = [...arr].sort((a, b) => a - b); const q = (p) => s[Math.min(s.length - 1, Math.ceil(s.length * p) - 1)];
  return { n: s.length, p50: q(0.5), p95: q(0.95), max: s[s.length - 1] };
}
export const estimateDecodedBytes = (imgs) => [...imgs].reduce((a, i) => a + (i.complete ? (i.naturalWidth || 0) * (i.naturalHeight || 0) * 4 : 0), 0);
const r0 = (x) => Math.round(x); const mb = (b) => Math.round(b / 1048576); const kb = (b) => Math.round(b / 1024);
const pct = (a, n) => (n ? ` (${((a / n) * 100).toFixed(1)}%)` : '');
const ms = (x) => (x == null ? 'n/a' : `${r0(x)} ms`);
const fr = (h) => `${h.n} khung · >25ms: ${histOver(h, 25)}${pct(histOver(h, 25), h.n)} · >50ms: ${histOver(h, 50)}${pct(histOver(h, 50), h.n)} · >100ms: ${histOver(h, 100)} · tệ nhất ${r0(h.max)} ms`;

// d: ảnh chụp số liệu (xem snapshot()) → {text, json}. Hàm thuần để test.
export function buildReport(d) {
  const A = d.frames.all; const med = histPct(A, 0.5) || 1; const L = d.lb;
  const lines = [
    `VD Photo — báo cáo hiệu năng · ${d.when}`,
    `Phiên bản: ${d.version || 'không có service worker'} · đo ${Math.floor(d.secs / 60)} phút ${d.secs % 60} giây`,
    `Máy: ${d.env.ua} · DPR ${d.env.dpr} · ${d.env.vw}×${d.env.vh} · ${d.env.cores || '?'} nhân${d.env.touch ? ' · cảm ứng' : ''}${d.env.standalone ? ' · đã thêm vào màn hình chính' : ''}${d.env.net ? ` · mạng ${d.env.net}` : ''}`,
    `Khởi động: FCP ${ms(d.start.fcp)} · LCP ${ms(d.start.lcp)} · DCL ${ms(d.start.dcl)} · load ${ms(d.start.load)} · trang chủ hiện lúc ${ms(d.start.firstRoute)} · thư viện sẵn lúc ${ms(d.start.libraryReady)} · ${d.start.modules} module (~${kb(d.start.jsBytes)} KB)`,
    `Khung hình (trung vị ${r0(med)} ms ≈ ${r0(1000 / med)} Hz): ${fr(A)}`,
    `  khi cuộn: ${fr(d.frames.scroll)}`,
    `  khi zoom/kéo ảnh: ${fr(d.frames.gesture)}`,
    `  lúc yên: ${fr(d.frames.idle)}`,
    `Ảnh: lưới tải ${d.imgs.thumbOk}, lỗi ${d.imgs.thumbErr} · yêu cầu ảnh ${d.res.img.n}, thời gian p50 ${r0(d.res.img.p50)} ms, p95 ${r0(d.res.img.p95)} ms, >2 giây: ${d.res.slow2s}`,
    `Bộ nhớ ảnh (ước tính đã giải mã): hiện ${mb(d.mem.cur)} MB, đỉnh ${mb(d.mem.peak)} MB · DOM ${d.dom} nút · <img> trong lưới ${d.gridImgs} · dựng thẻ ${d.counts.fill} lần, gỡ ${d.counts.empty} lần`,
    `Lightbox (${L.opens} lượt xem): xem trước p50 ${r0(L.preview.p50)} ms (max ${r0(L.preview.max)}) · 1000px p50 ${r0(L.s1000.p50)} (n=${L.s1000.n}) · bản lớn p50 ${r0(L.sFull.p50)} (n=${L.sFull.n}) · ảnh gốc p50 ${r0(L.orig.p50)} ms, max ${r0(L.orig.max)} (n=${L.orig.n}, ~${mb(L.origBytesTotal)} MB) · lỗi bước nét ${L.fail} · lỗi ảnh gốc ${L.origFail}`,
    `Dựng: chuyển trang p50 ${r0(d.route.p50)} ms (max ${r0(d.route.max)}, ${d.route.n} lần) · thêm hàng ảnh p50 ${r0(d.append.p50)} ms (max ${r0(d.append.max)}, ${d.append.n} lần, ${d.counts.rowsAdded} hàng)`,
    `Ghi chú: Safari không có longtask nên không đo được tác vụ dài; "khi cuộn" = khung hình trong 150 ms sau sự kiện cuộn.`,
  ];
  const text = lines.join('\n');
  return { text, json: JSON.stringify({ ...d, frames: Object.fromEntries(Object.entries(d.frames).map(([k, h]) => [k, { n: h.n, p50: histPct(h, 0.5), p95: histPct(h, 0.95), over25: histOver(h, 25), over50: histOver(h, 50), over100: histOver(h, 100), worst: r0(h.max) }])) }) };
}

// ====================================================== bộ thu thập
const st = {
  t0: 0, running: false, hud: null,
  frames: { all: makeHist(), scroll: makeHist(), gesture: makeHist(), idle: makeHist() }, recent: [], lastScroll: -1e9, gesture: 0,
  imgs: { thumbOk: 0, thumbErr: 0 }, resImg: [], slow2s: 0, js: 0, jsBytes: 0,
  marks: {}, series: { route: [], append: [] }, counts: { fill: 0, empty: 0, rowsAdded: 0 }, mem: { cur: 0, peak: 0 }, dom: 0, gridImgs: 0, lcp: null,
  lb: { open: null, previewAt: null, opens: 0, preview: [], s1000: [], sFull: [], orig: [], origBytes: [], fail: 0, origFail: 0 },
};
const reset = () => {
  Object.assign(st, { frames: { all: makeHist(), scroll: makeHist(), gesture: makeHist(), idle: makeHist() }, imgs: { thumbOk: 0, thumbErr: 0 }, resImg: [], slow2s: 0,
    series: { route: [], append: [] }, counts: { fill: 0, empty: 0, rowsAdded: 0 }, mem: { cur: 0, peak: 0 },
    lb: { open: null, previewAt: null, opens: 0, preview: [], s1000: [], sFull: [], orig: [], origBytes: [], fail: 0, origFail: 0 } });
  st.t0 = performance.now();
};
const cap = (arr, v) => { arr.push(v); if (arr.length > 2000) arr.shift(); };

function sink(type, a, t) {
  if (type === 'mark') { if (!(a[0] in st.marks)) st.marks[a[0]] = t; }
  else if (type === 'add') { cap(st.series[a[0]] || (st.series[a[0]] = []), a[1]); }
  else if (type === 'count') { st.counts[a[0]] = (st.counts[a[0]] || 0) + (a[1] == null ? 1 : a[1]); }
  else if (type === 'lb') {
    const L = st.lb; const dt = L.open == null ? 0 : t - L.open;
    if (a[0] === 'open') { L.open = t; L.previewAt = null; L.opens++; sampleMem(); }
    else if (a[0] === 'stage') cap(a[1] >= 1400 ? L.sFull : L.s1000, dt);
    else if (a[0] === 'stageFail') L.fail++;
    else if (a[0] === 'orig') cap(L.orig, dt);
    else if (a[0] === 'origBytes') cap(L.origBytes, a[1]);
    else if (a[0] === 'origFail') L.origFail++;
  }
}

function sampleMem() {
  st.mem.cur = estimateDecodedBytes(document.images); if (st.mem.cur > st.mem.peak) st.mem.peak = st.mem.cur;
  st.dom = document.getElementsByTagName('*').length; st.gridImgs = document.querySelectorAll('.gallery-item img').length;
}

function onImg(e) {
  const t = e.target; if (!t || t.tagName !== 'IMG') return;
  if (t.id === 'lightboxImg') { if (e.type === 'load' && st.lb.open != null && st.lb.previewAt == null) { st.lb.previewAt = performance.now() - st.lb.open; cap(st.lb.preview, st.lb.previewAt); } }
  else if (t.closest && t.closest('.gallery-item, .album-cover')) st.imgs[e.type === 'load' ? 'thumbOk' : 'thumbErr']++;
}
function onRes(e) {
  if (e.initiatorType === 'img') { cap(st.resImg, e.duration); if (e.duration > 2000) st.slow2s++; }
  else if (/\.js(\?|$)/.test(e.name) && e.name.startsWith(location.origin)) { st.js++; st.jsBytes += e.transferSize || e.encodedBodySize || 0; }
}

async function snapshot() {
  sampleMem();
  const nav = performance.getEntriesByType('navigation')[0] || {};
  const paint = Object.fromEntries(performance.getEntriesByType('paint').map((p) => [p.name, p.startTime]));
  let version = ''; try { version = (await caches.keys()).filter((k) => k.startsWith('vdphoto-shell-')).join(', '); } catch (e) { /* bỏ qua */ }
  const c = navigator.connection || {};
  const L = st.lb;
  return {
    when: new Date().toLocaleString('vi-VN'), secs: Math.round((performance.now() - st.t0) / 1000), version,
    env: { ua: navigator.userAgent.replace(/^Mozilla\/5\.0 /, '').slice(0, 90), dpr: window.devicePixelRatio, vw: innerWidth, vh: innerHeight, cores: navigator.hardwareConcurrency, touch: matchMedia('(pointer: coarse)').matches,
      standalone: !!(navigator.standalone || matchMedia('(display-mode: standalone)').matches), net: c.effectiveType ? `${c.effectiveType}${c.rtt ? ` rtt ${c.rtt}ms` : ''}${c.saveData ? ' tiết kiệm dữ liệu' : ''}` : '' },
    start: { fcp: paint['first-contentful-paint'] ?? null, lcp: st.lcp, dcl: nav.domContentLoadedEventEnd ?? null, load: nav.loadEventEnd || null, firstRoute: st.marks['first-route'] ?? null, libraryReady: st.marks['library-ready'] ?? null, modules: st.js, jsBytes: st.jsBytes },
    frames: st.frames, imgs: st.imgs, res: { img: stat(st.resImg), slow2s: st.slow2s }, mem: st.mem, dom: st.dom, gridImgs: st.gridImgs, counts: st.counts,
    lb: { opens: L.opens, preview: stat(L.preview), s1000: stat(L.s1000), sFull: stat(L.sFull), orig: stat(L.orig), origBytesTotal: L.origBytes.reduce((a, b) => a + b, 0), fail: L.fail, origFail: L.origFail },
    route: stat(st.series.route), append: stat(st.series.append),
  };
}
export async function report() { return buildReport(await snapshot()); }

// ====================================================== bảng hiển thị
const CSS = `.perf-hud{position:fixed;left:.5rem;bottom:calc(5.2rem + env(safe-area-inset-bottom));z-index:500;font:11px/1.4 ui-monospace,Menlo,Consolas,monospace;color:#fff}
@media (min-width:769px){.perf-hud{bottom:.5rem}}
.perf-pill{background:rgba(20,17,15,.88);color:#fff;border:1px solid rgba(255,255,255,.3);border-radius:999px;padding:.35rem .75rem;font:inherit;min-height:34px}
.perf-panel{margin-top:.4rem;width:min(92vw,30rem);max-height:55vh;overflow:auto;background:rgba(20,17,15,.95);border:1px solid rgba(255,255,255,.22);border-radius:12px;padding:.6rem}
.perf-panel pre{white-space:pre-wrap;word-break:break-word;margin:0 0 .6rem;-webkit-user-select:text;user-select:text}
.perf-btns{display:flex;gap:.4rem;flex-wrap:wrap}.perf-btns button{background:rgba(255,255,255,.12);color:#fff;border:1px solid rgba(255,255,255,.28);border-radius:8px;padding:.4rem .7rem;font:inherit;min-height:34px}
.perf-hidden{display:none!important}`;

function mkBtn(label, fn) { const b = document.createElement('button'); b.type = 'button'; b.textContent = label; b.addEventListener('click', fn); return b; }

function buildHud() {
  const style = document.createElement('style'); style.id = 'perfStyle'; style.textContent = CSS; document.head.appendChild(style);
  const hud = document.createElement('div'); hud.className = 'perf-hud'; hud.id = 'perfHud';
  const pill = document.createElement('button'); pill.type = 'button'; pill.className = 'perf-pill'; pill.id = 'perfPill'; pill.textContent = 'perf …';
  const panel = document.createElement('div'); panel.className = 'perf-panel perf-hidden'; panel.id = 'perfPanel';
  const pre = document.createElement('pre'); pre.id = 'perfText'; const btns = document.createElement('div'); btns.className = 'perf-btns';
  let last = null;
  const refresh = async () => { last = await report(); pre.textContent = last.text; pre.dataset.ts = String(performance.now()); }; // dataset.ts: dấu làm mới xong (test chờ theo đó)
  pill.addEventListener('click', async () => { const open = panel.classList.toggle('perf-hidden') === false; if (open) await refresh(); });
  btns.append(
    mkBtn('Sao chép', async () => { await refresh(); const txt = `${last.text}\n\n${last.json}`; try { await navigator.clipboard.writeText(txt); pill.textContent = 'đã chép ✓'; } catch (e) { const ta = document.createElement('textarea'); ta.value = txt; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); pill.textContent = 'đã chép ✓'; } catch (e2) { prompt('Sao chép báo cáo:', txt); } ta.remove(); } }),
    mkBtn('Gửi', async () => { await refresh(); const txt = `${last.text}\n\n${last.json}`; if (navigator.share) { try { await navigator.share({ title: 'VD Photo perf', text: txt }); } catch (e) { /* người dùng huỷ */ } } else prompt('Sao chép báo cáo:', txt); }),
    mkBtn('Cập nhật', refresh), mkBtn('Đặt lại', () => { reset(); refresh(); }),
    mkBtn('Thu gọn', () => panel.classList.add('perf-hidden')),
    mkBtn('Tắt đo', () => { lsDel('vd_perf'); perfHook.on = false; st.running = false; hud.remove(); style.remove(); }),
  );
  panel.append(pre, btns); hud.append(pill, panel); document.body.appendChild(hud);
  st.hud = { pill, panel, pre };
}

export function initPerf() {
  if (st.running) return;
  st.running = true; st.t0 = 0; // tính từ lúc tải trang
  document.addEventListener('load', onImg, true); document.addEventListener('error', onImg, true);
  window.addEventListener('scroll', () => { st.lastScroll = performance.now(); }, { passive: true, capture: true });
  document.addEventListener('pointerdown', (e) => { if (e.target.closest && e.target.closest('#lbStage')) st.gesture++; }, true);
  const up = () => { if (st.gesture > 0) st.gesture--; }; window.addEventListener('pointerup', up, true); window.addEventListener('pointercancel', up, true);
  if (window.PerformanceObserver) {
    const types = PerformanceObserver.supportedEntryTypes || [];
    if (types.includes('resource')) new PerformanceObserver((l) => l.getEntries().forEach(onRes)).observe({ type: 'resource', buffered: true });
    if (types.includes('largest-contentful-paint')) new PerformanceObserver((l) => { const e = l.getEntries().pop(); if (e) st.lcp = e.startTime; }).observe({ type: 'largest-contentful-paint', buffered: true });
  }
  // nhận các sự kiện đã xếp hàng trước khi module này nạp xong
  perfHook.sink = sink; perfHook.q.splice(0).forEach(([type, a, t]) => sink(type, a, t));
  // vòng đo khung hình
  let last = performance.now();
  const tick = (t) => {
    if (!st.running) return;
    const d = t - last; last = t;
    if (d < 1000) { // bỏ khoảng dừng khi tab ẩn
      const cls = st.gesture > 0 ? 'gesture' : (t - st.lastScroll < 150 ? 'scroll' : 'idle');
      histAdd(st.frames.all, d); histAdd(st.frames[cls], d); st.recent.push(d); if (st.recent.length > 60) st.recent.shift();
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  const mount = () => { buildHud(); setInterval(() => { if (!st.running) return; sampleMem(); const avg = st.recent.length ? st.recent.reduce((a, b) => a + b, 0) / st.recent.length : 0;
    if (st.hud && !/chép/.test(st.hud.pill.textContent)) st.hud.pill.textContent = `${avg ? r0(1000 / avg) : '–'}fps · ${mb(st.mem.cur)}MB`; }, 1000); };
  if (document.body) mount(); else document.addEventListener('DOMContentLoaded', mount);
}

// cho test / gỡ lỗi
export const _state = st;
