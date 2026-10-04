// Đăng ký service worker + thanh "Có bản mới — Tải lại" + công tắc tắt khẩn cấp (?nosw=1).
// Service worker (sw.js) chỉ chạy trên https (hoặc localhost khi thêm ?sw=1 để thử), không chạy ở chế độ demo.
import { $, show, toast, QS, DEMO } from './util.js';
import { t } from './i18n.js';

const LOCAL = /^(localhost|127\.0\.0\.1)$/;
export const swAllowed = () => 'serviceWorker' in navigator && ((location.protocol === 'https:' && !DEMO) || (QS.get('sw') === '1' && LOCAL.test(location.hostname)));

// Gỡ service worker + xoá mọi cache của app (khi có sự cố: mở trang với ?nosw=1).
export async function killSw() {
  try {
    const regs = await navigator.serviceWorker.getRegistrations(); await Promise.all(regs.map((r) => r.unregister()));
    for (const k of await caches.keys()) if (k.startsWith('vdphoto-')) await caches.delete(k);
    toast(t('swOff'));
  } catch (e) { /* bỏ qua */ }
}

export async function initPwa() {
  if (!('serviceWorker' in navigator)) return;
  if (QS.get('nosw') === '1') { await killSw(); return; }
  if (!swAllowed()) return;
  const bar = $('#updateBar'); const hadController = !!navigator.serviceWorker.controller;
  const showBar = () => show(bar);
  navigator.serviceWorker.addEventListener('message', (e) => { if (e.data && e.data.type === 'vdphoto-update') showBar(); }); // SW đã dựng xong phiên bản mới
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadController) showBar(); }); // sw.js đổi và đã thay thế bản cũ (lần cài đầu tiên thì không báo)
  $('#updateReload').addEventListener('click', () => location.reload());
  $('#updateLater').addEventListener('click', () => show(bar, false));
  try {
    const reg = await navigator.serviceWorker.register('sw.js');
    // PWA mở lâu không điều hướng: mỗi lần quay lại màn hình thì nhờ SW kiểm tra (SW tự giới hạn ≤ 1 lần / 10 phút)
    document.addEventListener('visibilitychange', () => { if (!document.hidden && reg.active) reg.active.postMessage({ type: 'check' }); });
  } catch (e) { /* bỏ qua: trang vẫn chạy bình thường không có SW */ }
}
