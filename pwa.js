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

// Trạng thái SW gần nhất (cho bảng ?perf=1) + yêu cầu SW báo trạng thái / kiểm tra ngay (force bỏ qua giới hạn 10 phút).
export const swInfo = globalThis.vdSwInfo = { status: null, at: 0 }; // perf.js (nạp động, tránh import vòng) đọc qua globalThis
const ask = (type, extra) => { const c = navigator.serviceWorker && navigator.serviceWorker.controller; if (c) c.postMessage({ type, ...extra }); return !!c; };
export const swStatus = () => ask('status');

export async function initPwa() {
  if (!('serviceWorker' in navigator)) return;
  if (QS.get('nosw') === '1') { await killSw(); return; }
  if (!swAllowed()) return;
  const bar = $('#updateBar'); const hadController = !!navigator.serviceWorker.controller;
  const showBar = () => show(bar);
  navigator.serviceWorker.addEventListener('message', (e) => {
    const d = e.data || {};
    if (d.type === 'vdphoto-update') showBar(); // SW đã dựng xong phiên bản mới
    else if (d.type === 'vdphoto-status') { swInfo.status = d; swInfo.at = Date.now(); if (d.stale) showBar(); } // thông báo ở trên có thể bị lỡ (trang chưa sẵn sàng nhận) → tự hỏi lại và vẫn hiện thanh
  });
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadController) showBar(); }); // sw.js đổi và đã thay thế bản cũ (lần cài đầu tiên thì không báo)
  $('#updateReload').addEventListener('click', () => location.reload());
  $('#updateLater').addEventListener('click', () => show(bar, false));
  try {
    const reg = await navigator.serviceWorker.register('sw.js');
    // PWA mở lâu không điều hướng: mỗi lần quay lại màn hình thì nhờ SW kiểm tra (SW tự giới hạn ≤ 1 lần / 10 phút)
    document.addEventListener('visibilitychange', () => { if (!document.hidden && reg.active) reg.active.postMessage({ type: 'check', reply: true }); });
    navigator.serviceWorker.ready.then(() => { setTimeout(swStatus, 4000); }); // sau khi SW kịp kiểm tra nền: trang đang chạy bản cũ hơn bản đã dựng thì hiện thanh
  } catch (e) { /* bỏ qua: trang vẫn chạy bình thường không có SW */ }
}
