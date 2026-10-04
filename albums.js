import { S } from './state.js';
import { toast, $, show } from './util.js';
import { t } from './i18n.js';
import { exitSelect } from './select.js';
import { route } from './router.js';

// ============================ Album ảo (admin) ============================
export function openAlbumModal() {
  if (!S.selected.size) return toast(t('nothing'));
  const sel = $('#albumSel'); sel.innerHTML = ''; sel.appendChild(new Option('—', ''));
  S.vAlbums.forEach((a) => sel.appendChild(new Option(a.name, a.id)));
  $('#albumName').value = ''; show($('#albumModal'));
}
export async function confirmAlbum() {
  const ids = [...S.selected]; const name = $('#albumName').value.trim(); const sel = $('#albumSel').value;
  try {
    if (name) { const id = await S.backend.store.createAlbum(name, ids); S.vAlbums.push({ id, name, fileIds: ids, cover: ids[0] }); }
    else if (sel) { const a = S.vAlbums.find((x) => x.id === sel); const merged = [...new Set([...(a.fileIds || []), ...ids])]; await S.backend.store.updateAlbum(sel, { fileIds: merged }); a.fileIds = merged; if (!a.cover) a.cover = merged[0]; }
    else return;
    show($('#albumModal'), false); toast(t('added')); exitSelect(); route();
  } catch (e) { toast(t('saveErr')); }
}
export async function removeFromAlbum() {
  const a = S.vAlbums.find((x) => x.id === S.route.id); if (!a || !S.selected.size) return toast(t('nothing'));
  const ids = (a.fileIds || []).filter((i) => !S.selected.has(i));
  try { await S.backend.store.updateAlbum(a.id, { fileIds: ids }); a.fileIds = ids; toast(t('removed')); exitSelect(); route(); } catch (e) { toast(t('saveErr')); }
}
export async function setCover() {
  if (S.selected.size !== 1) return toast(t('pickOne'));
  const id = [...S.selected][0];
  let a = S.route.type === 'valbum' ? S.vAlbums.find((x) => x.id === S.route.id) : null;
  if (!a) return toast(t('addAlbum'));
  try { await S.backend.store.updateAlbum(a.id, { cover: id }); a.cover = id; toast(t('coverSet')); exitSelect(); route(); } catch (e) { toast(t('saveErr')); }
}
