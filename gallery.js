import { S, PAGE } from './state.js';
import { $, el, show, lsGet, lsSet } from './util.js';
import { t, getLang } from './i18n.js';
import { applyFilters as filterList, groupDays, thumbAt } from './lib.js';
import { route, toggleFav } from './router.js';
import { toggleSelect } from './select.js';
import { openLightbox } from './lightbox.js';

// ============================ Lọc + render ảnh ============================
export function fillYears() {
  const years = [...new Set(S.photos.map((p) => new Date(p.time).getFullYear()))].sort((a, b) => b - a);
  const sel = $('#yearSel'); sel.innerHTML = '';
  sel.appendChild(new Option(t('allYears'), ''));
  years.forEach((y) => sel.appendChild(new Option(String(y), String(y))));
  sel.value = S.filters.year;
}
const applyFilters = (list) => filterList(list, S.filters, S.favs);
export const saveFilters = () => { try { sessionStorage.setItem('vdphoto_filters', JSON.stringify(S.filters)); } catch (e) { /* bỏ qua */ } };

let spy = null;
const TL_MODES = ['day', 'month', 'year'];
export function renderPhotos(container, list) {
  const items = applyFilters(list);
  S.visible = items;
  const tl = $('#timeline'); tl.innerHTML = '';
  if (spy) { spy.disconnect(); spy = null; }
  newRecycler();
  if (!items.length) { container.appendChild(el('p', 'empty-state', t('empty'))); show(tl, false); return; }
  const { rows, days } = groupDays(items, getLang());
  const box = el('div', S.selectMode ? 'select-mode' : ''); box.id = 'photoBox'; container.appendChild(box);
  let pos = 0; let grid = null;
  const sentinel = el('div', 'more-sentinel');
  // Scroll-spy: tô mục timeline tương ứng ngày đang xem (theo ngày / tháng / năm tuỳ chế độ).
  spy = new IntersectionObserver((es) => {
    es.forEach((e) => {
      if (!e.isIntersecting) return;
      const [y, mo, da] = e.target.id.slice(2).split('-'); const mode = tl.dataset.mode;
      let active = null;
      tl.querySelectorAll('a').forEach((a) => { const on = mode === 'day' ? a.dataset.key === `${y}-${mo}-${da}` : mode === 'month' ? a.dataset.mkey === `${y}-${mo}` : a.dataset.year === y; a.classList.toggle('active', on); if (on) active = a; });
      if (active) active.scrollIntoView({ block: 'nearest' });
    });
  }, { rootMargin: '-80px 0px -80% 0px' });
  const more = (n) => {
    const end = Math.min(rows.length, pos + n);
    for (; pos < end; pos++) {
      const r = rows[pos];
      if (r.h) {
        const h = el('h2', 'date-header', r.h.title); h.id = 'g-' + r.h.key;
        h.appendChild(el('span', 'day-count', ` · ${r.h.count} ${t('photos')}`));
        box.appendChild(h); spy.observe(h);
        grid = el('div', 'gallery' + (S.justified ? ' justified' : '')); box.appendChild(grid);
      } else grid.appendChild(photoCard(r.p));
    }
    if (pos >= rows.length) { io.disconnect(); sentinel.remove(); }
  };
  const io = new IntersectionObserver((es) => { if (es[0].isIntersecting) more(PAGE); }, { rootMargin: '800px' });
  container.appendChild(sentinel); io.observe(sentinel); more(PAGE);
  S.loadMore = () => { if (pos >= rows.length) return false; more(PAGE); return true; };
  const jump = (idx, key) => { while (pos <= idx) more(PAGE); document.getElementById('g-' + key).scrollIntoView({ behavior: 'smooth' }); };
  if (days.length > 1) {
    // Mặc định theo ngày; thư viện quá dài (>150 ngày) mà người dùng chưa chọn thì gom theo tháng cho gọn.
    let mode = lsGet('vdphoto_tl'); if (!TL_MODES.includes(mode)) mode = days.length > 150 ? 'month' : 'day';
    tl.dataset.mode = mode;
    const nextMode = TL_MODES[(TL_MODES.indexOf(mode) + 1) % TL_MODES.length];
    const tog = el('button', 'tl-toggle', t('by_' + nextMode));
    tog.addEventListener('click', () => { lsSet('vdphoto_tl', nextMode); route(); });
    tl.appendChild(tog);
    const seen = new Set(); let first = true; let lastMonth = '';
    days.forEach((d) => {
      const k = mode === 'day' ? d.key : mode === 'month' ? d.mkey : String(d.year);
      if (seen.has(k)) return; seen.add(k);
      if (mode === 'day' && d.mkey !== lastMonth) { lastMonth = d.mkey; tl.appendChild(el('span', 'tl-month', d.mlabel)); } // nhãn tháng chia nhóm các ngày
      const a = el('a', first ? 'active' : '', mode === 'day' ? d.label : mode === 'month' ? d.mlabel : String(d.year));
      first = false; a.href = '#g-' + d.key; a.dataset.key = d.key; a.dataset.mkey = d.mkey; a.dataset.year = String(d.year);
      a.addEventListener('click', (e) => { e.preventDefault(); jump(d.idx, d.key); });
      tl.appendChild(a);
    });
    show(tl);
  } else show(tl, false);
}

const SIZES = '(max-width:420px) 100vw,(max-width:768px) 50vw,(max-width:1024px) 33vw,25vw';
function setThumb(img, p) {
  if (p.tb) { img.srcset = [400, 800, 1200].map((w) => `${thumbAt(p, w)} ${w}w`).join(', '); img.sizes = SIZES; img.src = thumbAt(p, 600); }
  else img.src = thumbAt(p, 600);
}
// Xin link thumbnail mới cho ảnh lỗi: gom các yêu cầu trong 60ms thành 1 request batch.
const renewQ = new Map(); let renewTimer = null;
function renewThumb(p) {
  return new Promise((res) => {
    renewQ.set(p.id, [...(renewQ.get(p.id) || []), res]);
    clearTimeout(renewTimer);
    renewTimer = setTimeout(async () => {
      const q = new Map(renewQ); renewQ.clear();
      let links = {}; try { links = await S.backend.drive.thumbs([...q.keys()]); } catch (e) { /* bỏ qua */ }
      q.forEach((cbs, id) => cbs.forEach((cb) => cb(links[id] || null)));
    }, 60);
  });
}
// Nội dung thẻ chỉ tồn tại khi thẻ ở gần màn hình; cuộn xa thì gỡ <img> & nút (giữ khung theo tỉ lệ) → DOM nhẹ dù hàng nghìn ảnh.
function fillCard(item, p) {
  if (item._filled) return; item._filled = true;
  if (p.tb) item.style.backgroundImage = `url("${thumbAt(p, 32)}")`; // blur-up: ảnh 32px phóng lớn làm nền trong lúc ảnh chính tải
  const img = el('img'); img.loading = 'lazy'; img.alt = p.name; img.decoding = 'async';
  img.addEventListener('load', () => {
    img.classList.add('ok');
    // Thiếu metadata kích thước: lấy tỉ lệ thật từ thumbnail vừa tải để khung không cắt ảnh
    if (!(p.w && p.h) && img.naturalWidth && img.naturalHeight) { p.w = img.naturalWidth; p.h = img.naturalHeight; setCardRatio(item, p); }
  });
  img.addEventListener('error', async () => {
    if (!p._renewed) {
      p._renewed = true;
      const link = await renewThumb(p);
      if (link && /=s\d+/.test(link)) { p.tb = link.replace(/=s\d+.*/, ''); img.removeAttribute('srcset'); setThumb(img, p); return; }
    }
    const d = `https://drive.google.com/uc?id=${p.id}`;
    if (img.src !== d) { img.removeAttribute('srcset'); img.src = d; } else img.classList.add('ok');
  });
  setThumb(img, p);
  item.appendChild(img);
  item.appendChild(el('span', 'badge', p.onlyRaw ? 'RAW' : (p.raw ? p.ext + '+RAW' : p.ext)));
  const box = el('span', 'sel-box'); box.innerHTML = '<i class="fas fa-check"></i>'; item.appendChild(box);
  const fav = el('button', 'fav-btn' + (S.favs.has(p.id) ? ' on' : '')); fav.innerHTML = '<i class="fas fa-heart"></i>'; fav.title = t('fav');
  fav.addEventListener('click', (e) => { e.stopPropagation(); toggleFav(p.id); fav.classList.toggle('on', S.favs.has(p.id)); });
  item.appendChild(fav); item.appendChild(el('div', 'gallery-item-overlay', p.name));
}
function setCardRatio(item, p) {
  const ar = p.w && p.h ? p.w / p.h : 1.5;
  item.style.aspectRatio = `${ar}`; item.style.flex = `${Math.round(ar * 100)} 1 ${Math.round(ar * 200)}px`; // flex dùng cho chế độ lưới đều
}
function emptyCard(item) { item._filled = false; item.textContent = ''; item.style.backgroundImage = ''; }
let recycler = null;
function photoCard(p) {
  const item = el('div', 'gallery-item' + (S.selected.has(p.id) ? ' selected' : '')); item.dataset.id = p.id;
  setCardRatio(item, p);
  item._p = p;
  item.addEventListener('click', () => { if (S.selectMode) { toggleSelect(p.id, item); } else openLightbox(p.id); });
  fillCard(item, p);
  if (recycler) recycler.observe(item);
  return item;
}
function newRecycler() {
  if (recycler) recycler.disconnect();
  recycler = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) fillCard(e.target, e.target._p); else emptyCard(e.target); }), { rootMargin: '2500px 0px' });
}
