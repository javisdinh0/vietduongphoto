// Chia sẻ album công khai (cần Worker + KV, xem proxy/share.js):
//  - Admin: hộp thoại tạo / sao chép / thu hồi link cho album ảo hoặc thư mục đang xem.
//  - Người xem qua link: chế độ công khai `?w=<Worker>#/s/<token>` — không đăng nhập, không đụng tới token/refresh token nào.
import { $, el, show, toast, lsGet, saveFail } from './util.js';
import { S, cfg } from './state.js';
import { t, getLang } from './i18n.js';
import { route } from './router.js';
import { fillYears } from './gallery.js';

const SHARE_HASH = /^#\/s\/([A-Za-z0-9_-]{22})(?:[/?].*)?$/;
const base = () => cfg.proxyUrl.replace(/\/$/, '');
const RT = () => lsGet('vd_photo_rt');

// ============================ Admin ============================
async function api(path, body) {
  const r = await fetch(base() + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rt: RT(), ...body }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j.error || 'HTTP ' + r.status), { code: j.error, status: r.status });
  return j;
}
// Album đang xem: album ảo (danh sách id) hoặc thư mục Drive (gồm cả thư mục con).
function albumCtx() {
  const r = S.route;
  if (r.type === 'valbum') { const a = S.vAlbums.find((x) => x.id === r.id); return a && { id: 'v:' + a.id, name: a.name, photos: (a.fileIds || []).map((i) => S.byId.get(i)).filter(Boolean) }; }
  if (r.type === 'folder') { const f = S.folders.get(r.id); return f && { id: 'f:' + f.id, name: f.name, photos: f.deep }; }
  return null;
}
export const shareUrl = (token) => `${location.origin}${location.pathname}?w=${encodeURIComponent(base())}#/s/${token}`;
const copy = (text) => (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject(new Error('no clipboard'))).then(() => toast(t('shareCopied')), () => prompt(t('shareCopy'), text));
const when = (ms) => (ms ? `${t('shareExpiresOn')} ${new Date(ms).toLocaleDateString(getLang() === 'vi' ? 'vi-VN' : 'en-GB')}` : t('shareNever'));

async function refreshList(ctx) {
  const ul = $('#shareItems'); ul.innerHTML = '';
  try {
    const { shares } = await api('/share/list', { albumId: ctx.id });
    if (!shares.length) { ul.appendChild(el('li', 'share-none', t('shareNone'))); return; }
    shares.sort((a, b) => b.createdAt - a.createdAt).forEach((s) => {
      const li = el('li'); li.appendChild(el('span', '', `${when(s.expires)} · ${t(s.allowDownload ? 'shareDlOk' : 'shareNoDl')}`));
      const box = el('span', 'share-btns');
      const c = el('button', 'btn btn-sm', t('shareCopy')); c.addEventListener('click', () => copy(shareUrl(s.token)));
      const x = el('button', 'btn btn-sm btn-danger', t('shareRevoke'));
      x.addEventListener('click', async () => { try { await api('/share/revoke', { token: s.token }); toast(t('shareRevoked')); refreshList(ctx); } catch (e) { saveFail(e, t('shareErr')); } });
      box.append(c, x); li.appendChild(box); ul.appendChild(li);
    });
  } catch (e) { ul.appendChild(el('li', 'share-none', `${t('shareErr')} [${e.code || e.message}]`)); }
}
export function openShareModal() {
  const ctx = albumCtx(); if (!ctx) return;
  const ok = !!cfg.proxyUrl && !!RT();
  show($('#shareResult'), false); show($('#shareForm'), ok); show($('#shareCreate'), ok); show($('#shareListBox'), ok);
  $('#shareNote').textContent = t(ok ? 'shareHelp' : 'shareNeedWorker');
  const sel = $('#shareTtl'); sel.innerHTML = '';
  [[30, 'shareDays'], [7, 'shareDays'], [90, 'shareDays'], [0, 'shareNever']].forEach(([n]) => { sel.appendChild(new Option(n ? t('shareDays').replace('{n}', n) : t('shareNever'), String(n))); });
  show($('#shareModal'));
  if (ok) refreshList(ctx);
}
async function createShare() {
  const ctx = albumCtx(); if (!ctx) return;
  const files = ctx.photos.filter((p) => !p.onlyRaw).map((p) => ({ id: p.id, name: p.name, ext: p.ext, w: p.w, h: p.h, time: p.time, size: p.size }));
  if (!files.length) return toast(t('nothing'));
  const btn = $('#shareCreate'); btn.disabled = true;
  try {
    const { token } = await api('/share/create', { albumId: ctx.id, name: ctx.name, files, ttlDays: +$('#shareTtl').value, allowDownload: $('#shareDl').checked });
    $('#shareUrl').value = shareUrl(token); show($('#shareResult')); $('#shareUrl').select(); copy(shareUrl(token));
    refreshList(ctx);
  } catch (e) { saveFail(e, t('shareErr')); }
  btn.disabled = false;
}
export function initShare() {
  $('#closeShare').addEventListener('click', () => show($('#shareModal'), false));
  window.addEventListener('click', (e) => { if (e.target === $('#shareModal')) show($('#shareModal'), false); });
  $('#shareCreate').addEventListener('click', createShare);
  $('#shareCopy').addEventListener('click', () => copy($('#shareUrl').value));
}

// ============================ Xem công khai ============================
// Trả { token, worker } nếu địa chỉ là link chia sẻ hợp lệ (Worker phải là https, hoặc localhost khi phát triển).
export function publicShareRequest() {
  const m = SHARE_HASH.exec(location.hash); const w = new URLSearchParams(location.search).get('w');
  if (!m || !w) return null;
  try { const u = new URL(w); if (u.protocol !== 'https:' && !/^(localhost|127\.0\.0\.1)$/.test(u.hostname)) return null; return { token: m[1], worker: u.origin + u.pathname.replace(/\/$/, '') }; } catch (e) { return null; }
}
function gone(msg) {
  show($('#loader'), false); show($('#app'), false); show($('#errorMessage')); $('#errorText').textContent = msg;
  show($('#requestAccessBtn'), false); show($('#requestMailBtn'), false);
}
export async function startPublicShare({ token, worker }) {
  document.body.classList.add('public-share');
  show($('#loginScreen'), false); show($('#loader')); $('#loaderText').textContent = t('loading');
  S.share = { token, base: worker, allowDownload: false, name: '', expires: 0 };
  try {
    const r = await fetch(`${worker}/share/${token}`);
    if (!r.ok) return gone(t('shareGone'));
    const m = await r.json();
    Object.assign(S.share, { allowDownload: !!m.allowDownload, name: m.name, expires: m.expires });
    const url = (id) => `${worker}/share/${token}/img/${encodeURIComponent(id)}?q`;
    S.photos = m.files.map((f) => ({
      id: f.id, name: f.name, parent: 'share', ext: String(f.ext || 'JPG').toUpperCase(), time: f.time || 0, w: f.w || 0, h: f.h || 0, size: f.size || 0, meta: {},
      tb: url(f.id), thumbRaw: '', dl: `${worker}/share/${token}/dl/${encodeURIComponent(f.id)}`, onlyRaw: false, raw: null, _renewed: true,
    })).sort((a, b) => b.time - a.time);
    S.byId = new Map(S.photos.map((p) => [p.id, p])); S.folders = new Map(); S.root = { id: 'share', children: [], photos: [], deep: [] };
    const get = async (p, signal) => { const res = await fetch(p.dl, { signal }); if (!res.ok) throw new Error('HTTP ' + res.status); return res; };
    S.backend = { demo: false, share: true,
      drive: {
        async meta() { return null; }, async thumb() { return null; }, async thumbs() { return {}; },
        async blob(p, signal) { return (await get(p, signal)).blob(); },
        async stream(p, signal) { return (await get(p, signal)).body; },
        async original(p, signal, onProgress) {
          const res = await get(p, signal); const reader = res.body.getReader(); const chunks = []; let got = 0;
          for (;;) { const { done, value } = await reader.read(); if (done) break; chunks.push(value); got += value.length; onProgress(got); }
          return new Blob(chunks, { type: res.headers.get('Content-Type') || '' });
        },
      },
      store: { async signOut() {}, async listAlbums() { return []; } },
    };
    S.vAlbums = []; S.loaded = true; show($('#loader'), false); show($('#app')); fillYears(); route();
  } catch (e) { console.warn('[vdphoto] không mở được link chia sẻ:', e); gone(t('shareGone')); }
}
