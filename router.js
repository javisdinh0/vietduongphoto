import { lsSet, $, el, show, toast, saveFail } from './util.js';
import { S } from './state.js';
import { exitSelect, enterSelect, updateSelectBar } from './select.js';
import { parseHash, thumbAt } from './lib.js';
import { t, photoCount, getLang } from './i18n.js';
import { openShareModal } from './share.js';
import { renderPhotos } from './gallery.js';
import { openLightbox } from './lightbox.js';

// ============================ Yêu thích ============================
const saveFavs = () => lsSet('vdphoto_fav', JSON.stringify([...S.favs]));
export function toggleFav(id) { if (S.favs.has(id)) S.favs.delete(id); else S.favs.add(id); saveFavs(); }

// ============================ Router ============================
// Ghi nhớ vị trí cuộn theo từng trang để quay lại (Back) không mất chỗ.
const scrollMap = new Map(); let lastHash = location.hash;
window.addEventListener('hashchange', () => {
  scrollMap.set(lastHash, window.scrollY); lastHash = location.hash;
  if (!S.loaded) return;
  if (!S.selectMode || S.route.type === 'home') exitSelect();
  route(); restoreScroll(scrollMap.get(location.hash) || 0);
});
function restoreScroll(y) {
  requestAnimationFrame(() => {
    let guard = 0;
    while (S.loadMore && document.documentElement.scrollHeight < y + window.innerHeight && guard++ < 200) { if (!S.loadMore()) break; }
    window.scrollTo(0, y);
  });
}

// Tiêu đề lớn của trang (album/thư mục/tất cả/yêu thích) + số ảnh; trang chủ không dùng.
function setTitle(title, n) {
  $('#pageTitle').textContent = title; $('#pageSub').textContent = photoCount(n); show($('#pageTitles'));
}
// Thanh điều hướng dưới (điện thoại): tab đang xem + nhãn tab cuối (admin: Cài đặt, người khác: Đăng xuất).
function updateTabs() {
  show($('#bottomNav'), S.loaded && !S.share);
  const home = S.route.type === 'fav' ? 'fav' : 'home';
  document.querySelectorAll('#bottomNav [data-tab]').forEach((a) => a.classList.toggle('active', a.dataset.tab === home));
  $('#tabSelect').classList.toggle('active', S.selectMode);
  $('#tabMoreLabel').textContent = t(S.isAdmin ? 'tabSettings' : 'logout');
  $('#tabMore').firstElementChild.className = S.isAdmin ? 'fas fa-gear' : 'fas fa-right-from-bracket';
}
export function route() {
  S.route = S.share ? { type: 'share' } : parseHash(location.hash);
  S.loadMore = null;
  $('#hero').innerHTML = ''; show($('#pageTitles'), false); const view = $('#view'); view.innerHTML = ''; view.className = '';
  const crumbs = $('#crumbs'); crumbs.innerHTML = ''; $('#viewActions').innerHTML = '';
  const addCrumb = (label, href) => { if (crumbs.children.length) crumbs.appendChild(el('span', 'sep', '/')); if (href) { const a = el('a', '', label); a.href = href; crumbs.appendChild(a); } else crumbs.appendChild(el('span', 'cur', label)); };
  const r = S.route;
  const searching = !!S.filters.q.trim();
  if (r.type === 'share') { // chế độ xem công khai qua link chia sẻ
    setTitle(S.share.name, S.photos.length);
    if (S.share.expires) $('#pageSub').textContent += ` · ${t('shareExpiresOn')} ${new Date(S.share.expires).toLocaleDateString(getLang() === 'vi' ? 'vi-VN' : 'en-GB')}`;
    renderPhotos(view, S.photos);
    view.appendChild(el('p', 'share-note', `${t('shareVia')} ${new URL(S.share.base).host}`));
  } else if (r.type === 'home') {
    addCrumb(t('home'));
    if (searching) { renderPhotos(view, S.photos); return updateTabs(); }
    renderHero($('#hero'));
    renderAlbumGrid(view, [
      { name: t('all'), count: S.photos.length, cover: S.photos[0], href: '#/all' },
      ...(S.favs.size ? [{ name: t('fav'), count: [...S.favs].filter((i) => S.byId.has(i)).length, cover: S.byId.get([...S.favs].find((i) => S.byId.has(i))), href: '#/fav' }] : []),
      ...S.root.children.map(folderCard),
    ], t('albums'));
    if (S.vAlbums.length) renderAlbumGrid(view, S.vAlbums.map(vCard), t('virtualAlbums'));
    if (S.root.photos.length) { view.appendChild(el('h3', 'section-title', t('unsorted'))); renderPhotos(view, S.root.photos); }
    else { show($('#timeline'), false); S.visible = []; }
    if (S.isAdmin) viewActionBtn('fa-folder-plus', t('addAlbum'), () => toast(t('select')) || enterSelect());
  } else if (r.type === 'photo') {
    addCrumb(t('home'), '#/'); addCrumb(t('all')); setTitle(t('all'), S.photos.length); renderPhotos(view, S.photos); updateSelectBar(); updateTabs();
    if (S.byId.has(r.id)) openLightbox(r.id); else toast(t('notFound'));
    return;
  } else if (r.type === 'all') { addCrumb(t('home'), '#/'); addCrumb(t('all')); setTitle(t('all'), S.photos.length); renderPhotos(view, S.photos); }
  else if (r.type === 'fav') { const fl = S.photos.filter((p) => S.favs.has(p.id)); addCrumb(t('home'), '#/'); addCrumb(t('fav')); setTitle(t('fav'), fl.length); renderPhotos(view, fl); }
  else if (r.type === 'folder') {
    const f = S.folders.get(r.id);
    if (!f) { view.appendChild(el('p', 'empty-state', t('notFound'))); return; }
    addCrumb(t('home'), '#/'); setTitle(f.name, f.deep.length);
    const chain = []; for (let c = f; c && c.id !== S.root.id; c = S.folders.get(c.parent)) chain.unshift(c);
    chain.forEach((c, i) => addCrumb(c.name, i === chain.length - 1 ? null : '#/f/' + encodeURIComponent(c.id)));
    if (f.children.length) renderAlbumGrid(view, f.children.map(folderCard), t('subAlbums'));
    if (f.photos.length) { if (f.children.length) view.appendChild(el('h3', 'section-title', t('photosHere'))); renderPhotos(view, f.photos); }
    else if (!f.children.length) { view.appendChild(el('p', 'empty-state', t('empty'))); }
    viewActionBtn('fa-link', t('share'), copyLink);
    if (S.isAdmin) viewActionBtn('fa-share-nodes', t('shareBtn'), openShareModal);
  } else if (r.type === 'valbum') {
    const a = S.vAlbums.find((x) => x.id === r.id);
    if (!a) { addCrumb(t('home'), '#/'); view.appendChild(el('p', 'empty-state', t('notFound'))); return; }
    addCrumb(t('home'), '#/'); addCrumb(a.name); setTitle(a.name, (a.fileIds || []).filter((i) => S.byId.has(i)).length);
    viewActionBtn('fa-link', t('share'), copyLink);
    if (S.isAdmin) {
      viewActionBtn('fa-share-nodes', t('shareBtn'), openShareModal);
      viewActionBtn('fa-pen', t('rename'), async () => { const n = prompt(t('renamePrompt'), a.name); if (n && n.trim()) { try { await S.backend.store.updateAlbum(a.id, { name: n.trim() }); a.name = n.trim(); route(); } catch (e) { saveFail(e, t('saveErr')); } } });
      viewActionBtn('fa-trash', t('del'), async () => { if (confirm(t('confirmDel'))) { try { await S.backend.store.deleteAlbum(a.id); S.vAlbums = S.vAlbums.filter((x) => x.id !== a.id); location.hash = '#/'; } catch (e) { saveFail(e, t('saveErr')); } } }, 'btn-danger');
    }
    renderPhotos(view, (a.fileIds || []).map((i) => S.byId.get(i)).filter(Boolean));
  }
  updateSelectBar(); updateTabs();
}
// Phần giới thiệu ở trang chủ: tiêu đề + mosaic 3 ảnh mới nhất (ẩn mosaic khi chưa đủ ảnh).
function renderHero(container) {
  const hero = el('div', 'hero'); const text = el('div', 'hero-text');
  text.appendChild(el('div', 'eyebrow', `${t('heroEyebrow')} · ${photoCount(S.photos.length)}`));
  const h = el('h2', 'hero-title'); h.append(t('heroA'), el('i', '', t('heroB')), t('heroC')); text.appendChild(h);
  text.appendChild(el('p', 'hero-desc', t('heroDesc')));
  hero.appendChild(text);
  if (S.photos.length >= 3) {
    const m = el('div', 'hero-mosaic');
    S.photos.slice(0, 3).forEach((p) => { const d = el('div', 'hero-img'); d.style.backgroundImage = `url("${thumbAt(p, 800)}")`; m.appendChild(d); });
    hero.appendChild(m);
  }
  container.appendChild(hero);
}
function viewActionBtn(icon, label, fn, cls = '') { const b = el('button', 'btn btn-sm ' + cls); b.innerHTML = `<i class="fas ${icon}"></i> `; b.appendChild(document.createTextNode(label)); b.addEventListener('click', fn); $('#viewActions').appendChild(b); }
function copyLink() { const u = location.href; (navigator.clipboard ? navigator.clipboard.writeText(u) : Promise.reject()).then(() => toast(t('copied')), () => prompt(t('share'), u)); }

const folderCard = (f) => ({ name: f.name, count: f.deep.length, cover: f.deep[0], href: '#/f/' + encodeURIComponent(f.id) });
const vCard = (a) => ({ name: a.name, count: (a.fileIds || []).filter((i) => S.byId.has(i)).length, cover: S.byId.get(a.cover) || S.byId.get((a.fileIds || []).find((i) => S.byId.has(i))), href: '#/v/' + encodeURIComponent(a.id), virtual: true });

function renderAlbumGrid(container, cards, title) {
  container.appendChild(el('h3', 'section-title', title));
  const grid = el('div', 'album-grid');
  cards.forEach((c, i) => {
    const card = el('div', 'album-card' + (c.virtual ? ' album-virtual' : ''));
    const cover = el('div', 'album-cover');
    if (c.cover) { const img = el('img'); img.loading = i < 4 ? 'eager' : 'lazy'; if (i < 2) img.fetchPriority = 'high'; img.src = thumbAt(c.cover, 400); img.alt = c.name; cover.appendChild(img); } else cover.innerHTML = '<i class="fas fa-images"></i>';
    const info = el('div', 'album-info'); info.appendChild(el('div', 'album-name', c.name)); info.appendChild(el('div', 'album-count', S.partial ? '…' : photoCount(c.count)));
    card.append(cover, info); card.addEventListener('click', () => { location.hash = c.href; });
    grid.appendChild(card);
  });
  container.appendChild(grid);
}
