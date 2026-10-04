export const QS = new URLSearchParams(location.search);
export const DEMO = QS.get('demo') === '1';

export const $ = (s) => document.querySelector(s);
export const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
export const lsGet = (k, d = null) => { try { const v = localStorage.getItem(k); return v == null ? d : v; } catch (e) { return d; } };
export const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* bỏ qua */ } };
export const lsDel = (k) => { try { localStorage.removeItem(k); } catch (e) { /* bỏ qua */ } };
export const show = (e, on = true) => e.classList.toggle('hidden', !on);
export function toast(msg) { const n = $('#toast'); n.textContent = msg; show(n); clearTimeout(toast.t); toast.t = setTimeout(() => show(n, false), 2600); }
// Lỗi ghi Firestore: log chi tiết ra console và kèm mã lỗi trong toast để dễ chẩn đoán (rules từ chối, chưa đăng nhập Firebase...).
export function saveFail(e, msg) { console.error('[vdphoto] lưu lỗi:', e); toast(`${msg} [${(e && (e.code || e.message)) || 'unknown'}]`); }
// Màn hình cảm ứng (điện thoại/máy tính bảng): bộ nhớ hạn chế, dùng cấu hình tiết kiệm.
export const isCoarse = () => matchMedia('(pointer: coarse)').matches;
// Điểm gắn bộ đo hiệu năng (?perf=1, xem perf.js): khi TẮT mỗi lệnh gọi chỉ là một phép kiểm tra boolean. Khi bật mà perf.js chưa nạp xong thì xếp hàng.
export const perfHook = { on: false, sink: null, q: [] };
const ph = (type) => (...a) => { if (!perfHook.on) return; const t = performance.now(); if (perfHook.sink) perfHook.sink(type, a, t); else perfHook.q.push([type, a, t]); };
export const perfMark = ph('mark'); export const perfAdd = ph('add'); export const perfCount = ph('count'); export const perfLb = ph('lb');
