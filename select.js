import { S } from './state.js';
import { $, show } from './util.js';
import { t } from './i18n.js';

// ============================ Chế độ chọn ============================
export function enterSelect() { S.selectMode = true; const b = $('#photoBox'); if (b) b.classList.add('select-mode'); updateSelectBar(); }
export function exitSelect() { S.selectMode = false; S.selected.clear(); const b = $('#photoBox'); if (b) { b.classList.remove('select-mode'); b.querySelectorAll('.selected').forEach((n) => n.classList.remove('selected')); } updateSelectBar(); }
export function toggleSelect(id, node) { if (S.selected.has(id)) S.selected.delete(id); else S.selected.add(id); node.classList.toggle('selected', S.selected.has(id)); updateSelectBar(); }
export function updateSelectBar() {
  show($('#selectBar'), S.selectMode);
  $('#selCount').textContent = `${S.selected.size} ${t('selected')}`;
  show($('#selRemove'), S.isAdmin && S.route.type === 'valbum');
  $('#tabSelect').classList.toggle('active', S.selectMode);
}
