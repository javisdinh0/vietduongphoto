import { $, el, show, lsSet } from './util.js';
import { cfg, S } from './state.js';
import { cclear } from './cache.js';

// ============================ Cài đặt / yêu cầu truy cập ============================
export async function openSettings() {
  $('#clientId').value = cfg.clientId; $('#apiKey').value = cfg.apiKey; $('#folderId').value = cfg.folderId; $('#proxyUrl').value = cfg.proxyUrl;
  const ul = $('#reqList'); ul.innerHTML = '';
  try {
    (await S.backend.store.listRequests()).forEach((em) => {
      const li = el('li'); li.appendChild(el('span', '', em)); const b = el('button', '', '✕'); b.title = 'Xoá';
      b.addEventListener('click', async () => { await S.backend.store.deleteRequest(em); li.remove(); }); li.appendChild(b); ul.appendChild(li);
    });
  } catch (e) { /* chưa đủ quyền */ }
  show($('#settingsModal'));
}
export function saveSettings() {
  cfg.clientId = $('#clientId').value.trim(); cfg.apiKey = $('#apiKey').value.trim(); cfg.folderId = $('#folderId').value.trim(); cfg.proxyUrl = $('#proxyUrl').value.trim();
  const m = cfg.folderId.match(/folders\/([a-zA-Z0-9-_]+)/); if (m) cfg.folderId = m[1];
  lsSet('vd_photo_client_id', cfg.clientId); lsSet('vd_photo_api_key', cfg.apiKey); lsSet('vd_photo_folder_id', cfg.folderId); lsSet('vd_photo_proxy', cfg.proxyUrl);
  show($('#settingsModal'), false); cclear(); location.reload();
}
