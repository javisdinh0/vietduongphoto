import { zipToWritable, zipToBlob } from './zipclient.js';
import { $, show, toast, QS, el } from './util.js';
import { S } from './state.js';
import { t } from './i18n.js';

// ============================ Zip ============================
// Có File System Access API (Chrome/Edge desktop): ghi luồng ra file, RAM không tăng theo dung lượng.
// Không có: gom trong RAM (tải song song 3 luồng, tự thử lại khi lỗi mạng).
async function withRetry(fn, tries = 3) { for (let i = 0; ; i++) { try { return await fn(); } catch (e) { if (i >= tries - 1) throw e; await new Promise((r) => setTimeout(r, 800 * (i + 1))); } } }
export const ZIP = { cancel: false };
window.__zip = { zipToWritable, zipToBlob }; // phục vụ test
function zipProgress(txt) { const b = $('#zipProg'); b.textContent = txt || ''; show(b, !!txt); show($('#zipCancel'), !!txt); }
export async function downloadZip() {
  const picks = [...S.selected].map((i) => S.byId.get(i)).filter(Boolean);
  if (!picks.length) return toast(t('nothing'));
  const withRaw = $('#zipRaw').checked; const jobs = [];
  picks.forEach((p) => { jobs.push({ name: p.name, ref: p }); if (withRaw && p.raw) jobs.push({ name: p.raw.name, ref: p.raw }); });
  const total = jobs.reduce((s, j) => s + (j.ref.size || 0), 0);
  if (total > 400e6 && !window.showSaveFilePicker && !confirm(t('zipBig').replace('{mb}', Math.round(total / 1e6)))) return;
  let handle = null;
  if (window.showSaveFilePicker && QS.get('nopicker') !== '1') {
    try { handle = await window.showSaveFilePicker({ suggestedName: 'vietduong-photo.zip', types: [{ description: 'Zip', accept: { 'application/zip': ['.zip'] } }] }); }
    catch (e) { if (e.name === 'AbortError') return; handle = null; }
  }
  const btn = $('#selZip'); btn.disabled = true; ZIP.cancel = false;
  const used = new Set(); const uniq = (n) => { let x = n; while (used.has(x)) x = '_' + x; used.add(x); return x; };
  try {
    if (handle) {
      const w = await handle.createWritable();
      await zipToWritable(w, jobs.map((j) => ({ name: uniq(j.name), open: () => withRetry(() => S.backend.drive.stream(j.ref)) })),
        { shouldStop: () => ZIP.cancel, onProgress: (i, n) => zipProgress(`${t('zipping')} ${i}/${n}`) });
    } else {
      const entries = new Array(jobs.length); let next = 0; let done = 0;
      const worker = async () => {
        while (next < jobs.length) {
          if (ZIP.cancel) throw new Error('CANCELLED');
          const i = next++;
          const b = await withRetry(() => S.backend.drive.blob(jobs[i].ref));
          entries[i] = { name: jobs[i].name, data: new Uint8Array(await b.arrayBuffer()) };
          zipProgress(`${t('zipping')} ${++done}/${jobs.length}`);
        }
      };
      await Promise.all([worker(), worker(), worker()]);
      entries.forEach((e) => { e.name = uniq(e.name); });
      const url = URL.createObjectURL(await zipToBlob(entries));
      const a = el('a'); a.href = url; a.download = 'vietduong-photo.zip'; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
    }
    toast('OK');
  } catch (e) { toast(e.message === 'CANCELLED' ? t('cancelled') : e.message); }
  finally { btn.disabled = false; zipProgress(''); }
}
