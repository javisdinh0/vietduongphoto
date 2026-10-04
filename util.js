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
