// Web Worker: CRC + ghi zip ngoài luồng chính (không làm đơ UI khi nén file lớn).
import { ZipStream, makeZip } from './zip.js';

let zs = null; let writer = null; let stopped = false;

self.onmessage = async (e) => {
  const m = e.data;
  try {
    if (m.type === 'init') {
      writer = m.writable.getWriter(); stopped = false;
      zs = new ZipStream({ write: (u) => writer.write(u) });
      self.postMessage({ type: 'ready' });
    } else if (m.type === 'add') {
      await zs.add(m.name, m.stream || m.blob, () => stopped);
      self.postMessage({ type: 'added', id: m.id });
    } else if (m.type === 'cancel') {
      stopped = true;
    } else if (m.type === 'finish') {
      await zs.finish(); await writer.close(); self.postMessage({ type: 'done' });
    } else if (m.type === 'abort') {
      try { await writer.abort(); } catch (x) { /* bỏ qua */ }
      self.postMessage({ type: 'aborted' });
    } else if (m.type === 'blobzip') {
      const blob = makeZip(m.entries.map((x) => ({ name: x.name, data: new Uint8Array(x.buffer) })));
      self.postMessage({ type: 'blob', blob });
    }
  } catch (err) {
    self.postMessage({ type: 'error', message: err.message === 'CANCELLED' ? 'CANCELLED' : String(err.message || err), id: m.id });
  }
};
