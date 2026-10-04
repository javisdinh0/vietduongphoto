import { buildLibrary, signature } from './lib.js';
import { cfg, S, CACHE_TTL, FULL_REFRESH } from './state.js';
import { show, $, QS, toast } from './util.js';
import { cget, cset } from './cache.js';
import { fillYears } from './gallery.js';
import { route } from './router.js';
import { t } from './i18n.js';
import { doLogoutState } from './auth.js';
import { ADMIN_FALLBACK } from './backend.js';

// ============================ Xây thư viện (logic ở lib.js) ============================
function applyRaw(raw) {
  const L = buildLibrary(raw, cfg.folderId);
  S.folders = L.folders; S.photos = L.photos; S.byId = L.byId; S.root = L.root;
}

// ============================ Tải dữ liệu ============================
export async function loadLibrary(force) {
  show($('#errorMessage'), false);
  const key = 'lib:' + cfg.folderId;
  const useCache = !S.backend.demo || QS.get('cache') === '1'; // demo mặc định không cache; ?cache=1 để test SWR
  const cached = !force && useCache ? await cget(key) : null;
  const usable = cached && cached.email === S.email;
  let shown = false;
  const render = async (raw, first) => {
    const y = window.scrollY;
    applyRaw(raw);
    if (first) { try { S.vAlbums = await S.backend.store.listAlbums(); } catch (e) { S.vAlbums = []; } }
    S.loaded = true; show($('#app')); fillYears(); route();
    if (!first) window.scrollTo(0, y);
  };
  if (usable) { await render(cached.raw, true); shown = true; show($('#loader'), false); } else { show($('#loader')); $('#loaderText').textContent = t('openDrive'); show($('#app'), false); }
  try {
    if (usable && Date.now() - cached.t < CACHE_TTL) return; // cache còn mới
    // Lần đầu (chưa có cache): hiện danh sách album ngay khi có cây thư mục, số ảnh/ảnh bìa điền sau khi tải xong file.
    const onTree = (folders) => { if (shown) return; S.partial = true; applyRaw({ folders, files: [] }); S.loaded = true; show($('#loader'), false); show($('#app')); route(); };
    const progress = (nf, nfile) => { if (!shown) $('#loaderText').textContent = `${t('loading')} ${nf} / ${nfile}`; };
    const canDelta = usable && cached.raw.syncedAt && Date.now() - (cached.full || 0) < FULL_REFRESH;
    const raw = canDelta ? await S.backend.drive.refresh(cfg.folderId, cached.raw, progress) : await S.backend.drive.loadAll(cfg.folderId, progress, onTree);
    if (useCache) cset(key, { t: Date.now(), full: canDelta ? cached.full : Date.now(), email: S.email, raw });
    if (!shown) { S.partial = false; await render(raw, true); }
    else if (signature(raw) !== signature(cached.raw)) { await render(raw, false); toast(t('updated')); }
  } catch (err) { if (!shown || err.message === 'UNAUTH') showError(err); }
  finally { show($('#loader'), false); }
}

export function showError(err) {
  show($('#errorMessage')); show($('#app'), false); show($('#timeline'), false);
  const denied = err.message === 'PERMISSION_DENIED';
  if (err.message === 'UNAUTH') { doLogoutState(); $('#errorText').textContent = ''; show($('#errorMessage'), false); toast(t('sessionExpired')); return; }
  $('#errorText').textContent = denied ? t('noPerm') : err.message;
  show($('#requestAccessBtn'), denied); show($('#requestMailBtn'), denied);
  if (denied) $('#requestMailBtn').href = 'mailto:' + ADMIN_FALLBACK + '?subject=' + encodeURIComponent('Yêu cầu truy cập VietDuong Photo') +
    '&body=' + encodeURIComponent('Chào Dũng,\n\nVui lòng cấp quyền truy cập thư viện ảnh cho email Google của tôi: ' + S.email + '\n\nCảm ơn bạn!');
}
