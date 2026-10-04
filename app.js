import { $, DEMO, show, el, toast, lsSet } from './util.js';
import { requestLogin, doLogoutState, initAuth, forgetLogin } from './auth.js';
import { S } from './state.js';
import { cclear } from './cache.js';
import { openSettings, saveSettings } from './settings.js';
import { confirmAlbum, openAlbumModal, removeFromAlbum, setCover } from './albums.js';
import { setLang, getLang, applyI18n, applyTheme, t } from './i18n.js';
import { fillYears, saveFilters } from './gallery.js';
import { route } from './router.js';
import { loadLibrary } from './library.js';
import { exitSelect, enterSelect, updateSelectBar } from './select.js';
import { downloadZip, ZIP } from './zipdl.js';
import { initLightbox } from './lightbox.js';

// ============================ Khởi động ============================
function bind() {
  $('#loginBtn').addEventListener('click', requestLogin); $('#loginScreenBtn').addEventListener('click', requestLogin);
  $('#logoutBtn').addEventListener('click', () => {
    if (S.token && !DEMO && window.google) google.accounts.oauth2.revoke(S.token, () => {});
    S.backend.store.signOut(); cclear(); forgetLogin(); doLogoutState(); $('#view').innerHTML = '';
    if (DEMO) location.href = location.pathname;
  });
  $('#settingsBtn').addEventListener('click', openSettings); $('#closeSettings').addEventListener('click', () => show($('#settingsModal'), false));
  $('#saveSettings').addEventListener('click', saveSettings);
  $('#closeAlbum').addEventListener('click', () => show($('#albumModal'), false)); $('#albumOk').addEventListener('click', confirmAlbum);
  window.addEventListener('click', (e) => { if (e.target === $('#settingsModal')) show($('#settingsModal'), false); if (e.target === $('#albumModal')) show($('#albumModal'), false); });
  $('#langBtn').addEventListener('click', () => { setLang(getLang() === 'vi' ? 'en' : 'vi'); applyI18n(); if (S.loaded) { fillYears(); route(); } });
  $('#themeBtn').addEventListener('click', () => applyTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark'));
  let qt; $('#searchInput').addEventListener('input', (e) => { clearTimeout(qt); qt = setTimeout(() => { S.filters.q = e.target.value; saveFilters(); route(); }, 200); });
  $('#yearSel').addEventListener('change', (e) => { S.filters.year = e.target.value; saveFilters(); route(); });
  $('#rawOnly').addEventListener('change', (e) => { S.filters.raw = e.target.checked; saveFilters(); route(); });
  $('#favOnly').addEventListener('change', (e) => { S.filters.fav = e.target.checked; saveFilters(); route(); });
  $('#refreshBtn').addEventListener('click', () => loadLibrary(true));
  $('#selectBtn').addEventListener('click', () => (S.selectMode ? exitSelect() : enterSelect()));
  $('#selCancel').addEventListener('click', exitSelect);
  $('#selAll').addEventListener('click', () => { S.visible.forEach((p) => S.selected.add(p.id)); document.querySelectorAll('.gallery-item').forEach((n) => n.classList.add('selected')); updateSelectBar(); });
  // Tải thẳng về máy (kể cả điện thoại): attribute `download` bị bỏ qua với link khác origin → tự fetch blob rồi lưu, không mở tab mới.
  ['#downloadBtn', '#downloadRawBtn'].forEach((sel) => {
    const btn = $(sel); let busy = false;
    btn.addEventListener('click', async (e) => {
      const it = btn._item; if (!it) return;
      e.preventDefault(); if (busy) return; busy = true; btn.classList.add('disabled');
      try {
        const url = URL.createObjectURL(await S.backend.drive.blob(it));
        const a = el('a'); a.href = url; a.download = it.name; document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 60000);
      } catch (err) { toast(t('dlFail') || 'Không tải được, thử lại'); }
      busy = false; btn.classList.remove('disabled');
    });
  });
  $('#selZip').addEventListener('click', downloadZip); $('#selAlbum').addEventListener('click', openAlbumModal);
  $('#selRemove').addEventListener('click', removeFromAlbum); $('#selCover').addEventListener('click', setCover);
  $('#requestAccessBtn').addEventListener('click', async () => { try { await S.backend.store.sendRequest(S.email, ''); toast(t('reqSent')); } catch (e) { toast(t('saveErr')); } });
  $('#layoutBtn').addEventListener('click', () => { S.justified = !S.justified; lsSet('vdphoto_layout', S.justified ? 'justified' : 'masonry'); $('#layoutBtn').firstElementChild.className = S.justified ? 'fas fa-table-cells-large' : 'fas fa-table-columns'; route(); });
  $('#layoutBtn').firstElementChild.className = S.justified ? 'fas fa-table-cells-large' : 'fas fa-table-columns';
  $('#zipCancel').addEventListener('click', () => { ZIP.cancel = true; });
  initLightbox();
}

try {
  const f = JSON.parse(sessionStorage.getItem('vdphoto_filters') || 'null');
  if (f) { S.filters = { q: f.q || '', year: f.year || '', raw: !!f.raw, fav: !!f.fav }; $('#searchInput').value = S.filters.q; $('#rawOnly').checked = S.filters.raw; $('#favOnly').checked = S.filters.fav; }
} catch (e) { /* bỏ qua */ }
if ('serviceWorker' in navigator && !DEMO && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
applyI18n(); applyTheme(document.documentElement.getAttribute('data-theme') || 'light'); bind();
initAuth();
window.__vd = S; // phục vụ debug/test
