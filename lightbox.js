import { $, show, el, toast } from './util.js';
import { LB, S } from './state.js';
import { thumbAt } from './lib.js';
import { t, getLang } from './i18n.js';
import { toggleFav } from './router.js';
import { enterSelect, updateSelectBar } from './select.js';

const lbImg = () => $('#lightboxImg');
export function openLightbox(id) { LB.idx = Math.max(0, S.visible.findIndex((p) => p.id === id)); show($('#lightbox')); lbShow(); }
function closeLightbox() {
  lbStop(); lbCancelOriginal(); LB.cache.clear(); show($('#lightbox'), false); lbImg().src = ''; LB.pre.forEach((i) => { i.onload = null; i.src = ''; }); LB.pre = [];
  if (S.route.type === 'photo') location.hash = '#/all';
}
function lbStop() { const was = !!LB.play; clearInterval(LB.play); LB.play = null; const b = $('#lbPlay'); b.classList.remove('on'); b.firstElementChild.className = 'fas fa-play'; const p = S.visible[LB.idx]; if (was && p && lbImg().dataset.quality !== 'original') lbLoadOriginal(p); }
function lbTogglePlay() {
  if (LB.play) return lbStop();
  const b = $('#lbPlay'); b.classList.add('on'); b.firstElementChild.className = 'fas fa-pause';
  LB.play = setInterval(() => { if (LB.idx >= S.visible.length - 1) LB.idx = -1; lbMove(1); }, 4000);
}
// Ảnh gốc: sau khi dừng ở một ảnh ~0,25s thì tải file gốc từ Drive (có tiến độ) thành blob và gán làm nguồn <img>,
// nên nhấn giữ / chuột phải "Lưu ảnh" ra đúng file chất lượng gốc (không phải thumbnail). Lướt nhanh thì huỷ, không tải thừa.
// Chỉ báo `#lbQuality` cho người dùng biết khi nào ảnh gốc sẵn sàng (trước đó ảnh hiển thị là bản xem trước 2000px).
// Định dạng trình duyệt không hiển thị được (HEIC, RAW) hoặc lỗi mạng: giữ bản xem trước và báo rõ.
const ORIG_EXT = new Set(['JPG', 'PNG', 'WEBP', 'GIF', 'BMP']);
const mb = (n) => (n ? ` (${(n / 1e6).toFixed(1)} MB)` : '');
function setQuality(kind, text) {
  const q = $('#lbQuality'); show(q, !!kind); q.className = 'lb-quality ' + (kind || 'hidden'); q.textContent = text || '';
  q.setAttribute('role', kind === 'manual' ? 'button' : 'status'); q.tabIndex = kind === 'manual' ? 0 : -1;
}
// iOS (Safari/Edge): nhấn giữ "Lưu ảnh" tải lại địa chỉ ảnh bằng tiến trình hệ thống, không đọc được blob: trong bộ nhớ trang
// ("Không có kết nối internet"). Trên màn hình cảm ứng dùng data: URL (tự chứa dữ liệu) cho ảnh <= 40 MB; desktop dùng blob:.
const COARSE = () => matchMedia('(pointer: coarse)').matches;
const toDataUrl = (blob) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error); r.readAsDataURL(blob); });
// Nút "Lưu vào Ảnh": Web Share với file gốc (iOS/Android: "Lưu hình ảnh" vào thư viện đúng chất lượng gốc).
function offerShare(p, blob) {
  const btn = $('#shareFileBtn'); const file = new File([blob], p.name, { type: blob.type || 'image/jpeg' });
  let ok = false; try { ok = !!(navigator.canShare && navigator.canShare({ files: [file] })); } catch (e) { ok = false; }
  btn._file = ok ? file : null; show(btn, ok);
}
function lbCancelOriginal() {
  clearTimeout(LB.orig.timer); if (LB.orig.ctrl) LB.orig.ctrl.abort();
  if (LB.orig.url) URL.revokeObjectURL(LB.orig.url);
  LB.orig = { url: null, timer: null, ctrl: null };
  const sb = $('#shareFileBtn'); sb._file = null; show(sb, false);
  setQuality('');
}
// Bộ nhớ đệm nhỏ cho ảnh gốc vừa xem (lùi/tiến một vài ảnh không phải tải lại); xoá khi đóng lightbox.
const CACHE_MAX = 3; const CACHE_BYTES = 60e6;
function cachePut(id, blob) {
  LB.cache.delete(id); LB.cache.set(id, blob);
  let total = 0; LB.cache.forEach((b) => { total += b.size; });
  for (const k of LB.cache.keys()) { if (LB.cache.size <= CACHE_MAX && total <= CACHE_BYTES) break; if (k === id) break; total -= LB.cache.get(k).size; LB.cache.delete(k); }
}
function applyOriginal(p, blob, still) {
  const asData = COARSE() && blob.size <= 40e6;
  return (async () => {
    const url = asData ? await toDataUrl(blob) : URL.createObjectURL(blob);
    if (!still()) { if (!asData) URL.revokeObjectURL(url); return; }
    const free = () => { if (!asData) URL.revokeObjectURL(url); };
    const probe = new Image();
    probe.onload = () => { if (!still()) { free(); return; } if (!asData) LB.orig.url = url; lbImg().src = url; lbImg().dataset.quality = 'original'; setQuality('ready', `${t('origReady')}${mb(p.size)}`); offerShare(p, blob); };
    probe.onerror = () => { free(); if (still()) setQuality('fail', t('origFail')); };
    probe.src = url;
  })();
}
// manual=true: người dùng chạm nhãn để tải. Tự động bỏ qua khi đang trình chiếu (dùng bản xem trước) hoặc bật Tiết kiệm dữ liệu.
function lbLoadOriginal(p, manual = false) {
  if (p.onlyRaw || !ORIG_EXT.has(p.ext)) { setQuality('preview', t('origPreview')); return; }
  const cached = LB.cache.get(p.id);
  if (!cached && !manual) {
    if (LB.play) { setQuality(''); return; }
    if (navigator.connection && navigator.connection.saveData) { setQuality('manual', `${t('origManual')}${mb(p.size)}`); return; }
  }
  const ctrl = new AbortController(); LB.orig.ctrl = ctrl;
  LB.orig.timer = setTimeout(async () => {
    const still = () => !ctrl.signal.aborted && S.visible[LB.idx] && S.visible[LB.idx].id === p.id;
    try {
      let blob = cached;
      if (!blob) {
        setQuality('loading', `${t('origLoading')}${mb(p.size)}`);
        blob = await S.backend.drive.original(p, ctrl.signal, (got) => { if (still() && p.size) setQuality('loading', `${t('origLoading')} ${Math.min(99, Math.round((got / p.size) * 100))}%${mb(p.size)}`); });
        if (!still()) return;
        cachePut(p.id, blob);
      }
      await applyOriginal(p, blob, still);
    } catch (e) { if (still()) { console.warn('[vdphoto] không tải được ảnh gốc:', e); setQuality('fail', t('origFail')); } }
  }, cached ? 0 : 250);
}
function lbShow() {
  const p = S.visible[LB.idx]; if (!p) return closeLightbox();
  lbReset(); lbCancelOriginal();
  const img = lbImg(); img.dataset.quality = 'preview'; img.alt = p.name; img.src = thumbAt(p, 600); // hiện ngay thumbnail đã có, ảnh lớn tải xong thì thay
  const big = new Image(); const cur = p.id; const full = thumbAt(p, 2000);
  big.onload = () => { const q = S.visible[LB.idx]; if (q && q.id === cur && img.dataset.quality !== 'original') img.src = full; }; big.src = full;
  lbLoadOriginal(p);
  $('#lbCount').textContent = `${LB.idx + 1} / ${S.visible.length}  ·  ${p.name}`;
  const dl = $('#downloadBtn'); dl.href = p.dl; dl.download = p.name; dl._item = p; dl.querySelector('span').textContent = `${t('dl')} (${p.onlyRaw ? 'RAW' : p.ext})`;
  const dr = $('#downloadRawBtn'); show(dr, !!p.raw); if (p.raw) { dr.href = p.raw.dl; dr.download = p.raw.name; dr._item = p.raw; }
  $('#lbFav').classList.toggle('on', S.favs.has(p.id)); $('#lbFav').firstElementChild.className = S.favs.has(p.id) ? 'fas fa-heart' : 'far fa-heart';
  renderInfo(p);
  if (!p.metaFull && !S.backend.demo) S.backend.drive.meta(p.id).then((m) => { p.metaFull = true; if (m && m.imageMediaMetadata) { p.meta = { ...p.meta, ...m.imageMediaMetadata }; if (S.visible[LB.idx] === p) renderInfo(p); } }).catch(() => {});
  // preload ±1 ảnh; hủy preload cũ khi lướt nhanh
  LB.pre.forEach((i) => { i.onload = null; i.src = ''; }); LB.pre = [];
  [S.visible[LB.idx + 1], S.visible[LB.idx - 1]].forEach((n) => { if (n) { const i = new Image(); i.src = thumbAt(n, 2000); LB.pre.push(i); } });
}
function lbMove(d) { const n = LB.idx + d; if (n < 0 || n >= S.visible.length) return; LB.idx = n; lbShow(); }
function lbReset() { LB.zoom = false; LB.x = LB.y = 0; lbImg().style.transform = ''; lbImg().classList.remove('zoomed'); }
function lbApply() { lbImg().style.transform = LB.zoom ? `translate(${LB.x}px,${LB.y}px) scale(2.5)` : ''; lbImg().classList.toggle('zoomed', LB.zoom); }
function renderInfo(p) {
  const m = p.meta || {}; const panel = $('#lbPanel'); panel.innerHTML = '';
  const dl = el('dl');
  const row = (k, v) => { if (!v) return; dl.appendChild(el('dt', '', k)); dl.appendChild(el('dd', '', v)); };
  row(t('infoName'), p.name); row(t('infoDate'), p.time ? new Date(p.time).toLocaleString(getLang() === 'vi' ? 'vi-VN' : 'en-GB') : '');
  row(t('infoSize'), p.w && p.h ? `${p.w} × ${p.h}` : ''); row(t('infoFile'), p.size ? (p.size / 1e6).toFixed(1) + ' MB' : '');
  row(t('infoCam'), [m.cameraMake, m.cameraModel].filter(Boolean).join(' ')); row(t('infoLens'), m.lens);
  const exp = [m.aperture && `f/${m.aperture}`, m.exposureTime && (m.exposureTime < 1 ? `1/${Math.round(1 / m.exposureTime)}s` : `${m.exposureTime}s`), m.isoSpeed && `ISO ${m.isoSpeed}`, m.focalLength && `${m.focalLength}mm`].filter(Boolean).join(' · ');
  row(t('infoExp'), exp); panel.appendChild(dl);
}
function lbToggleFav() { const p = S.visible[LB.idx]; if (!p) return; toggleFav(p.id); lbShow(); const c = document.querySelector(`.gallery-item[data-id="${p.id}"] .fav-btn`); if (c) c.classList.toggle('on', S.favs.has(p.id)); }
function lbShare() { const p = S.visible[LB.idx]; if (!p) return; const u = `${location.origin}${location.pathname}#/p/${encodeURIComponent(p.id)}`; (navigator.clipboard ? navigator.clipboard.writeText(u) : Promise.reject()).then(() => toast(t('copied')), () => prompt(t('share'), u)); }
export function initLightbox() {
  const manualLoad = () => { const q = $('#lbQuality'); const p = S.visible[LB.idx]; if (p && q.classList.contains('manual')) lbLoadOriginal(p, true); };
  $('#lbQuality').addEventListener('click', manualLoad);
  $('#lbQuality').addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); manualLoad(); } });
  $('#shareFileBtn').addEventListener('click', async (e) => { const f = e.currentTarget._file; if (!f) return; try { await navigator.share({ files: [f] }); } catch (err) { if (err.name !== 'AbortError') toast(t('origFail')); } });
  $('#lbClose').addEventListener('click', closeLightbox);
  $('#lbPrev').addEventListener('click', () => lbMove(-1)); $('#lbNext').addEventListener('click', () => lbMove(1));
  $('#lbInfo').addEventListener('click', () => $('#lbPanel').classList.toggle('hidden'));
  $('#lbFav').addEventListener('click', lbToggleFav); $('#lbPlay').addEventListener('click', lbTogglePlay); $('#lbShare').addEventListener('click', lbShare);
  document.addEventListener('keydown', (e) => {
    if ($('#lightbox').classList.contains('hidden') || (e.target.matches && e.target.matches('input,textarea,select')) || e.ctrlKey || e.metaKey) return;
    const k = e.key.toLowerCase();
    if (k === 'escape') closeLightbox(); else if (k === 'arrowleft') lbMove(-1); else if (k === 'arrowright') lbMove(1);
    else if (k === 'f') lbToggleFav(); else if (k === 'i') $('#lbPanel').classList.toggle('hidden'); else if (k === ' ') { e.preventDefault(); lbTogglePlay(); }
    else if (k === 's') { const p = S.visible[LB.idx]; if (p) { if (!S.selectMode) enterSelect(); S.selected.add(p.id); const n = document.querySelector(`.gallery-item[data-id="${p.id}"]`); if (n) n.classList.add('selected'); updateSelectBar(); toast(`${S.selected.size} ${t('selected')}`); } }
  });
  const stage = $('#lbStage'); const img = lbImg();
  img.addEventListener('click', (e) => { if (LB.moved) { LB.moved = false; return; } LB.zoom = !LB.zoom; if (LB.zoom) { const r = img.getBoundingClientRect(); LB.x = -(e.clientX - r.left - r.width / 2) * 1.5; LB.y = -(e.clientY - r.top - r.height / 2) * 1.5; } lbApply(); });
  stage.addEventListener('wheel', (e) => { e.preventDefault(); LB.zoom = e.deltaY < 0; if (!LB.zoom) LB.x = LB.y = 0; lbApply(); }, { passive: false });
  stage.addEventListener('pointerdown', (e) => { LB.drag = { x: e.clientX, y: e.clientY, ox: LB.x, oy: LB.y }; LB.moved = false; });
  stage.addEventListener('pointermove', (e) => { if (!LB.drag || !LB.zoom) return; const dx = e.clientX - LB.drag.x; const dy = e.clientY - LB.drag.y; if (Math.abs(dx) + Math.abs(dy) > 4) LB.moved = true; LB.x = LB.drag.ox + dx; LB.y = LB.drag.oy + dy; lbApply(); });
  stage.addEventListener('pointerup', (e) => { const d = LB.drag; LB.drag = null; if (d && !LB.zoom) { const dx = e.clientX - d.x; if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(e.clientY - d.y)) { LB.moved = true; lbMove(dx < 0 ? 1 : -1); } } });
  stage.addEventListener('click', (e) => { if (e.target === stage && !LB.zoom) closeLightbox(); });
}
