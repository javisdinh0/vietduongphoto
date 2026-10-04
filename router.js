import { lsSet, $, el, show, toast, saveFail } from './util.js';
import { S } from './state.js';
import { exitSelect, enterSelect, updateSelectBar } from './select.js';
import { parseHash, thumbAt } from './lib.js';
import { t } from './i18n.js';
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

export function route() {
  S.route = parseHash(location.hash);
  S.loadMore = null;
  const view = $('#view'); view.innerHTML = ''; view.className = '';
  const crumbs = $('#crumbs'); crumbs.innerHTML = ''; $('#viewActions').innerHTML = '';
  const addCrumb = (label, href) => { if (crumbs.children.length) crumbs.appendChild(el('span', 'sep', '/')); if (href) { const a = el('a', '', label); a.href = href; crumbs.appendChild(a); } else crumbs.appendChild(el('span', 'cur', label)); };
  const r = S.route;
  const searching = !!S.filters.q.trim();
  if (r.type === 'home') {
    addCrumb(t('home'));
    if (searching) return renderPhotos(view, S.photos);
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
    addCrumb(t('home'), '#/'); addCrumb(t('all')); renderPhotos(view, S.photos); updateSelectBar();
    if (S.byId.has(r.id)) openLightbox(r.id); else toast(t('notFound'));
    return;
  } else if (r.type === 'all') { addCrumb(t('home'), '#/'); addCrumb(t('all')); renderPhotos(view, S.photos); }
  else if (r.type === 'fav') { addCrumb(t('home'), '#/'); addCrumb(t('fav')); renderPhotos(view, S.photos.filter((p) => S.favs.has(p.id))); }
  else if (r.type === 'folder') {
    const f = S.folders.get(r.id);
    if (!f) { view.appendChild(el('p', 'empty-state', t('notFound'))); return; }
    addCrumb(t('home'), '#/');
    const chain = []; for (let c = f; c && c.id !== S.root.id; c = S.folders.get(c.parent)) chain.unshift(c);
    chain.forEach((c, i) => addCrumb(c.name, i === chain.length - 1 ? null : '#/f/' + encodeURIComponent(c.id)));
    if (f.children.length) renderAlbumGrid(view, f.children.map(folderCard), t('subAlbums'));
    if (f.photos.length) { if (f.children.length) view.appendChild(el('h3', 'section-title', t('photosHere'))); renderPhotos(view, f.photos); }
    else if (!f.children.length) { view.appendChild(el('p', 'empty-state', t('empty'))); }
    viewActionBtn('fa-link', t('share'), copyLink);
  } else if (r.type === 'valbum') {
    const a = S.vAlbums.find((x) => x.id === r.id);
    if (!a) { addCrumb(t('home'), '#/'); view.appendChild(el('p', 'empty-state', t('notFound'))); return; }
    addCrumb(t('home'), '#/'); addCrumb(a.name);
    viewActionBtn('fa-link', t('share'), copyLink);
    if (S.isAdmin) {
      viewActionBtn('fa-pen', t('rename'), async () => { const n = prompt(t('renamePrompt'), a.name); if (n && n.trim()) { try { await S.backend.store.updateAlbum(a.id, { name: n.trim() }); a.name = n.trim(); route(); } catch (e) { saveFail(e, t('saveErr')); } } });
      viewActionBtn('fa-trash', t('del'), async () => { if (confirm(t('confirmDel'))) { try { await S.backend.store.deleteAlbum(a.id); S.vAlbums = S.vAlbums.filter((x) => x.id !== a.id); location.hash = '#/'; } catch (e) { saveFail(e, t('saveErr')); } } }, 'btn-danger');
    }
    renderPhotos(view, (a.fileIds || []).map((i) => S.byId.get(i)).filter(Boolean));
  }
  updateSelectBar();
}
function viewActionBtn(icon, label, fn, cls = '') { const b = el('button', 'btn btn-sm ' + cls); b.innerHTML = `<i class="fas ${icon}"></i> `; b.appendChild(document.createTextNode(label)); b.addEventListener('click', fn); $('#viewActions').appendChild(b); }
function copyLink() { const u = location.href; (navigator.clipboard ? navigator.clipboard.writeText(u) : Promise.reject()).then(() => toast(t('copied')), () => prompt(t('share'), u)); }

const folderCard = (f) => ({ name: f.name, count: f.deep.length, cover: f.deep[0], href: '#/f/' + encodeURIComponent(f.id) });
const vCard = (a) => ({ name: a.name, count: (a.fileIds || []).filter((i) => S.byId.has(i)).length, cover: S.byId.get(a.cover) || S.byId.get((a.fileIds || []).find((i) => S.byId.has(i))), href: '#/v/' + encodeURIComponent(a.id), virtual: true });

function renderAlbumGrid(container, cards, title) {
  container.appendChild(el('h3', 'section-title', title));
  const grid = el('div', 'album-grid');
  cards.forEach((c) => {
    const card = el('div', 'album-card' + (c.virtual ? ' album-virtual' : ''));
    const cover = el('div', 'album-cover');
    if (c.cover) { const img = el('img'); img.loading = 'lazy'; img.src = thumbAt(c.cover, 400); img.alt = c.name; cover.appendChild(img); } else cover.innerHTML = '<i class="fas fa-images"></i>';
    const info = el('div', 'album-info'); info.appendChild(el('div', 'album-name', c.name)); info.appendChild(el('div', 'album-count', S.partial ? '…' : `${c.count} ${t('photos')}`));
    card.append(cover, info); card.addEventListener('click', () => { location.hash = c.href; });
    grid.appendChild(card);
  });
  container.appendChild(grid);
}
