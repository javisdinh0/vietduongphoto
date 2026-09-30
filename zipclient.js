// Điều phối zip: ưu tiên Web Worker, tự rơi về luồng chính nếu trình duyệt không hỗ trợ (module worker / transfer stream).
import { makeZip, ZipStream } from './zip.js';

const newWorker = () => { try { return new Worker(new URL('./zipworker.js', import.meta.url), { type: 'module' }); } catch (e) { return null; } };

// Zip trong RAM: entries = [{name, data:Uint8Array}] → Blob
export function zipToBlob(entries) {
  const w = newWorker();
  if (!w) return Promise.resolve(makeZip(entries));
  return new Promise((resolve) => {
    const fallback = () => { w.terminate(); resolve(makeZip(entries)); };
    w.onmessage = (e) => { if (e.data.type === 'blob') { w.terminate(); resolve(e.data.blob); } else if (e.data.type === 'error') fallback(); };
    w.onerror = fallback;
    try {
      const payload = entries.map((x) => ({ name: x.name, buffer: x.data.buffer.slice(x.data.byteOffset, x.data.byteOffset + x.data.byteLength) }));
      w.postMessage({ type: 'blobzip', entries: payload }, payload.map((p) => p.buffer));
    } catch (e) { fallback(); }
  });
}

// Zip ghi luồng ra WritableStream. jobs = [{name, open: () => Promise<ReadableStream>}]
export async function zipToWritable(writable, jobs, { shouldStop = () => false, onProgress = () => {} } = {}) {
  const w = newWorker();
  if (w) {
    let ok = false;
    const msgs = []; let wake = null;
    w.onmessage = (e) => { msgs.push(e.data); if (wake) { wake(); wake = null; } };
    w.onerror = (e) => { msgs.push({ type: 'error', message: e.message || 'worker' }); if (wake) { wake(); wake = null; } };
    const next = async () => { while (!msgs.length) await new Promise((r) => { wake = r; }); return msgs.shift(); };
    try { w.postMessage({ type: 'init', writable }, [writable]); ok = true; } catch (e) { w.terminate(); }
    if (ok) {
      const stopTimer = setInterval(() => { if (shouldStop()) w.postMessage({ type: 'cancel' }); }, 150);
      try {
        const r = await next(); if (r.type !== 'ready') throw new Error(r.message || 'worker');
        for (let i = 0; i < jobs.length; i++) {
          if (shouldStop()) throw new Error('CANCELLED');
          onProgress(i + 1, jobs.length);
          const stream = await jobs[i].open();
          try { w.postMessage({ type: 'add', id: i, name: jobs[i].name, stream }, [stream]); }
          catch (e) { w.postMessage({ type: 'add', id: i, name: jobs[i].name, blob: await new Response(stream).blob() }); } // stream không transfer được → gửi blob
          const a = await next(); if (a.type === 'error') throw new Error(a.message);
        }
        w.postMessage({ type: 'finish' });
        const d = await next(); if (d.type === 'error') throw new Error(d.message);
      } catch (err) {
        w.postMessage({ type: 'abort' }); await Promise.race([next(), new Promise((r) => setTimeout(r, 1500))]);
        throw err;
      } finally { clearInterval(stopTimer); w.terminate(); }
      return;
    }
  }
  // Không có worker: chạy ngay trên luồng chính
  const writer = writable.getWriter(); const zs = new ZipStream({ write: (u) => writer.write(u) });
  try {
    for (let i = 0; i < jobs.length; i++) { onProgress(i + 1, jobs.length); await zs.add(jobs[i].name, await jobs[i].open(), shouldStop); }
    await zs.finish(); await writer.close();
  } catch (err) { try { await writer.abort(); } catch (x) { /* bỏ qua */ } throw err; }
}
