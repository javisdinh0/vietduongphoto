import { $, show, el, toast, isCoarse as COARSE, perfLb } from './util.js';
import { LB, S } from './state.js';
import { thumbAt } from './lib.js';
import { t, getLang } from './i18n.js';
import { toggleFav } from './router.js';
import { renewOnce } from './gallery.js';
import { createZoom } from './zoom.js';
import { enterSelect, updateSelectBar } from './select.js';

const lbImg = () => $('#lightboxImg');
export function openLightbox(id) { LB.idx = Math.max(0, S.visible.findIndex((p) => p.id === id)); show($('#lightbox')); lbShow(); }
function closeLightbox() {
  lbStop(); lbCancelOriginal(); LB.cache.clear(); show($('#lightbox'), false); lbImg().onerror = null; lbImg().src = ''; lbCancelPreviews(true);
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
  for (const k of LB.cache.keys()) { if (LB.cache.size <= (COARSE() ? 1 : CACHE_MAX) && total <= (COARSE() ? 40e6 : CACHE_BYTES)) break; if (k === id) break; total -= LB.cache.get(k).size; LB.cache.delete(k); }
}
function applyOriginal(p, blob, still) {
  const asData = COARSE() && blob.size <= 40e6; perfLb('origBytes', blob.size);
  return (async () => {
    const t0 = performance.now();
    const url = asData ? await toDataUrl(blob) : URL.createObjectURL(blob);
    perfLb('b64', performance.now() - t0);
    const free = () => { if (!asData) URL.revokeObjectURL(url); };
    if (!still()) { free(); return; }
    // Giải mã ở luồng nền (decode()) trước khi gắn vào ảnh đang hiện: không chặn luồng chính, và ảnh lỗi thì giữ nguyên bản xem trước.
    const probe = new Image(); probe.decoding = 'async'; probe.src = url;
    const t1 = performance.now();
    try { await (probe.decode ? probe.decode() : new Promise((res, rej) => { probe.onload = res; probe.onerror = rej; })); }
    catch (e) { free(); perfLb('origFail'); if (still()) setQuality('fail', t('origFail')); return; }
    perfLb('decode', performance.now() - t1);
    if (!still()) { free(); return; }
    if (!asData) LB.orig.url = url;
    lbImg().src = url; lbImg().dataset.quality = 'original'; perfLb('orig'); setQuality('ready', `${t('origReady')}${mb(p.size)}`); offerShare(p, blob);
  })();
}
// manual=true: người dùng chạm nhãn để tải. Tự động bỏ qua khi đang trình chiếu (dùng bản xem trước) hoặc bật Tiết kiệm dữ liệu.
function lbLoadOriginal(p, manual = false) {
  if (S.share && !S.share.allowDownload) { setQuality(''); return; } // link chỉ cho xem: chỉ dùng bản xem trước
  if (p.onlyRaw || !ORIG_EXT.has(p.ext)) { setQuality('preview', t('origPreview')); return; }
  const cached = LB.cache.get(p.id);
  if (!cached && !manual) {
    if (LB.play) { setQuality(''); return; }
    if (navigator.connection && navigator.connection.saveData) { setQuality('manual', `${t('origManual')}${mb(p.size)}`); return; }
    if (COARSE()) { setQuality('manual', `${t('origLazy')}${mb(p.size)}`); return; } // điện thoại: tiết kiệm dữ liệu, tải khi người dùng cần lưu
  }
  if (LB.orig.ctrl && !LB.orig.ctrl.signal.aborted) return; // đang tải rồi
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
    finally { if (LB.orig.ctrl === ctrl) LB.orig.ctrl = null; } // cho phép thử lại sau khi xong/lỗi
  }, cached ? 0 : 250);
}
// Nút "Tải ảnh" trên điện thoại: nếu ảnh gốc chưa có thì tải nó (có tiến độ) để hiện ra cho giữ-lưu / "Lưu vào Ảnh"
// thay vì tải file ngay. Trả true = đã xử lý (đang tải ảnh gốc); false = cứ tải file như thường (ảnh gốc đã sẵn sàng, máy tính, RAW...).
export function loadOriginalForSave() {
  const p = S.visible[LB.idx];
  if (!COARSE() || !p || p.onlyRaw || !ORIG_EXT.has(p.ext) || lbImg().dataset.quality === 'original') return false;
  lbLoadOriginal(p, true); return true;
}
// Huỷ mọi tải xem trước còn dở (bản lớn + ảnh lân cận) khi chuyển ảnh/đóng: lướt nhanh không để các yêu cầu cũ chặn ảnh hiện tại.
function lbCancelPreviews(all = false) {
  clearTimeout(LB.bigTimer);
  if (LB.big) { LB.big.onload = LB.big.onerror = null; LB.big.src = ''; LB.big = null; }
  const keep = [];
  LB.pre.forEach((e) => { if (all || !e.i.complete) { e.i.onload = null; e.i.src = ''; LB.preSet.delete(e.url); } else keep.push(e); });
  LB.pre = keep; if (all || LB.preSet.size > 60) { LB.pre = []; LB.preSet.clear(); }
}
function lbShow() {
  const p = S.visible[LB.idx]; if (!p) return closeLightbox();
  perfLb('open', p.id);
  lbReset(); lbCancelOriginal(); LB.retry = null;
  lbCancelPreviews();
  const img = lbImg(); img.dataset.quality = 'preview'; img.alt = p.name;
  // Tải TUẦN TỰ, luôn ưu tiên ảnh xem trước của ảnh HIỆN TẠI (quan trọng trên mạng di động):
  // 1) ảnh đã có trong lưới hoặc thumbnail 600px (ảnh lân cận ±3 đã được tải sẵn bản 600px): hiện ngay
  // 2) sau ~150ms (dừng lại, không phải lướt nhanh) mới tải bản lớn 1600/2000px  3) xong mới tải ảnh gốc.
  const cur = p.id; const still = () => { const q = S.visible[LB.idx]; return !!q && q.id === cur; };
  const card = document.querySelector(`.gallery-item[data-id="${CSS.escape(p.id)}"] img`);
  img.onerror = null;
  img.src = card && card.complete && card.currentSrc ? card.currentSrc : thumbAt(p, 600);
  // Lỗi tải (link thumbnail hết hạn / bị Google giới hạn tốc độ): xin link mới 1 lần rồi thử lại, nếu không thì thử lại sau 1,5s
  img.onerror = async () => {
    img.onerror = null;
    if (!still() || img.dataset.quality === 'original') return;
    if (await renewOnce(p)) { if (still()) img.src = thumbAt(p, 600); }
    else setTimeout(() => { if (still() && img.dataset.quality !== 'original') img.src = thumbAt(p, 600); }, 1500);
  };
  preloadNeighbours();
  let started = false;
  const afterPreview = () => { if (started || !still()) return; started = true; clearTimeout(guard); lbLoadOriginal(p); };
  const guard = setTimeout(afterPreview, 6000); // mạng quá chậm cho bản lớn: vẫn bắt đầu tải ảnh gốc
  // Mỗi bước thành công thì thay ảnh đang hiện rồi mới sang bước sau (tuần tự, huỷ được): 1000px nhẹ (~100–200 KB) cho ảnh nét ngay,
  // rồi mới tới bản 1600/2000px và cuối cùng là ảnh gốc.
  const loadStage = (size, next, tries = 0, renewed = false) => {
    const im = new Image(); LB.big = im; const url = thumbAt(p, size);
    im.onload = () => { if (still() && img.dataset.quality !== 'original') img.src = url; if (still()) perfLb('stage', size); next(); };
    im.onerror = async () => {
      if (!still()) return;
      if (!renewed && await renewOnce(p) && still()) return loadStage(size, next, tries, true);   // link hết hạn: xin link mới
      if (tries < 3) { LB.bigTimer = setTimeout(() => { if (still()) loadStage(size, next, tries + 1, true); }, 800 * 2 ** tries); return; } // bị giới hạn tốc độ: chờ rồi thử lại
      perfLb('stageFail', size);
      if (img.dataset.quality !== 'original') { LB.retry = () => lbShow(); setQuality('manual', t('previewRetry')); }   // hết lượt: chờ người dùng chạm
    };
    im.src = url;
  };
  const FULL = COARSE() ? 1600 : 2000; // điện thoại: 1600px đủ nét, giải mã nhẹ hơn
  LB.bigTimer = setTimeout(() => { if (still()) loadStage(1000, () => { if (still()) loadStage(FULL, afterPreview); }); }, 150);
  $('#lbCount').textContent = `${LB.idx + 1} / ${S.visible.length}  ·  ${p.name}`;
  const dl = $('#downloadBtn'); dl.href = p.dl; dl.download = p.name; dl._item = p; dl.querySelector('span').textContent = `${t('dl')} (${p.onlyRaw ? 'RAW' : p.ext})`; show(dl, !S.share || S.share.allowDownload);
  const dr = $('#downloadRawBtn'); show(dr, !!p.raw); if (p.raw) { dr.href = p.raw.dl; dr.download = p.raw.name; dr._item = p.raw; }
  $('#lbFav').classList.toggle('on', S.favs.has(p.id)); $('#lbFav').firstElementChild.className = S.favs.has(p.id) ? 'fas fa-heart' : 'far fa-heart';
  renderInfo(p);
  if (!p.metaFull && !S.backend.demo) S.backend.drive.meta(p.id).then((m) => { p.metaFull = true; if (m && m.imageMediaMetadata) { p.meta = { ...p.meta, ...m.imageMediaMetadata }; if (S.visible[LB.idx] === p) renderInfo(p); } }).catch(() => {});
}
// Ảnh lân cận ±2: chỉ bản 600px (nhẹ, đúng URL dùng cho xem trước tức thì) để bấm mũi tên là hiện ngay.
function preloadNeighbours() {
  for (let d = 1; d <= 2; d++) {
    [S.visible[LB.idx + d], S.visible[LB.idx - d]].forEach((n) => {
      if (!n) return; const url = thumbAt(n, 600);
      if (LB.preSet.has(url)) return; // đã tải (hoặc đang tải) rồi
      const i = new Image(); i.src = url; LB.preSet.add(url); LB.pre.push({ i, url });
    });
  }
}
function lbMove(d) { const n = LB.idx + d; if (n < 0 || n >= S.visible.length) return; LB.idx = n; lbShow(); }
let Z = null; // cử chỉ zoom (zoom.js)
function lbReset() { if (Z) Z.reset(); }
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
  const manualLoad = () => {
    const q = $('#lbQuality'); const p = S.visible[LB.idx]; if (!p || !q.classList.contains('manual')) return;
    if (LB.retry) { const f = LB.retry; LB.retry = null; f(); return; } // thử lại các bản xem trước
    lbLoadOriginal(p, true);
  };
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
    else if (k === 's' && !S.share) { const p = S.visible[LB.idx]; if (p) { if (!S.selectMode) enterSelect(); S.selected.add(p.id); const n = document.querySelector(`.gallery-item[data-id="${p.id}"]`); if (n) n.classList.add('selected'); updateSelectBar(); toast(`${S.selected.size} ${t('selected')}`); } }
  });
  const stage = $('#lbStage'); const img = lbImg();
  Z = createZoom({ stage, img,
    onSwipe: (d) => lbMove(d), onBackdropTap: closeLightbox,
    // phóng quá ~1,5x = muốn xem chi tiết: tải ảnh gốc (có tiến độ) thay vì chỉ phóng bản xem trước 1600/2000px
    onZoomIn: () => { const p = S.visible[LB.idx]; if (p && img.dataset.quality !== 'original') lbLoadOriginal(p, true); },
  });
}
