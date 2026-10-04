// ============================ Cache IndexedDB ============================
const idb = () => new Promise((res, rej) => { const r = indexedDB.open('vdphoto', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
export async function cget(k) { try { const db = await idb(); return await new Promise((res) => { const q = db.transaction('kv').objectStore('kv').get(k); q.onsuccess = () => res(q.result); q.onerror = () => res(null); }); } catch (e) { return null; } }
export async function cset(k, v) { try { const db = await idb(); db.transaction('kv', 'readwrite').objectStore('kv').put(v, k); } catch (e) { /* bỏ qua */ } }
export async function cclear() { try { const db = await idb(); db.transaction('kv', 'readwrite').objectStore('kv').clear(); } catch (e) { /* bỏ qua */ } }
