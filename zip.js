// Ghi zip kiểu "store" (không nén): makeZip (trong RAM) và ZipStream (ghi luồng, RAM không tăng theo dung lượng).
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
export const crcUpdate = (c, u8) => { for (let i = 0; i < u8.length; i++) c = CRC[(c ^ u8[i]) & 255] ^ (c >>> 8); return c; };
export const crc32 = (u8) => (crcUpdate(0xFFFFFFFF, u8) ^ 0xFFFFFFFF) >>> 0;
const enc = new TextEncoder();

function localHeader(name, crc, size, flags) {
  const lh = new DataView(new ArrayBuffer(30));
  lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, flags, true);
  lh.setUint32(14, crc, true); lh.setUint32(18, size, true); lh.setUint32(22, size, true); lh.setUint16(26, name.length, true);
  return new Uint8Array(lh.buffer);
}
function centralEntry(name, crc, size, flags, off) {
  const ch = new DataView(new ArrayBuffer(46));
  ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, flags, true);
  ch.setUint32(16, crc, true); ch.setUint32(20, size, true); ch.setUint32(24, size, true); ch.setUint16(28, name.length, true); ch.setUint32(42, off, true);
  return [new Uint8Array(ch.buffer), name];
}
function endRecord(count, cdSize, cdOff) {
  const e = new DataView(new ArrayBuffer(22));
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, count, true); e.setUint16(10, count, true); e.setUint32(12, cdSize, true); e.setUint32(16, cdOff, true);
  return new Uint8Array(e.buffer);
}

export function makeZip(entries) {
  const parts = []; const cd = []; let off = 0;
  entries.forEach((e) => {
    const name = enc.encode(e.name); const crc = crc32(e.data); const sz = e.data.length;
    parts.push(localHeader(name, crc, sz, 0x0800), name, e.data);
    cd.push(...centralEntry(name, crc, sz, 0x0800, off)); off += 30 + name.length + sz;
  });
  const cdSize = cd.reduce((s, b) => s + b.byteLength, 0);
  return new Blob([...parts, ...cd, endRecord(entries.length, cdSize, off)], { type: 'application/zip' });
}

// sink: { write(Uint8Array) } — vd. FileSystemWritableFileStream. Dùng data descriptor (bit 3) nên không cần biết crc/size trước.
export class ZipStream {
  constructor(sink) { this.sink = sink; this.off = 0; this.cd = []; this.count = 0; }
  async _w(u8) { await this.sink.write(u8); this.off += u8.length; }
  // source: ReadableStream<Uint8Array> hoặc Blob
  async add(name, source, shouldStop = () => false) {
    const nm = enc.encode(name); const start = this.off; const flags = 0x0808;
    await this._w(localHeader(nm, 0, 0, flags)); await this._w(nm);
    const reader = (source.stream ? source.stream() : source).getReader();
    let c = 0xFFFFFFFF; let size = 0;
    for (;;) {
      if (shouldStop()) { try { await reader.cancel(); } catch (e) { /* bỏ qua */ } throw new Error('CANCELLED'); }
      const { done, value } = await reader.read(); if (done) break;
      c = crcUpdate(c, value); size += value.length;
      if (size > 0xFFFFFFFE) throw new Error('File > 4GB không hỗ trợ zip');
      await this._w(value);
    }
    const crc = (c ^ 0xFFFFFFFF) >>> 0;
    const dd = new DataView(new ArrayBuffer(16));
    dd.setUint32(0, 0x08074b50, true); dd.setUint32(4, crc, true); dd.setUint32(8, size, true); dd.setUint32(12, size, true);
    await this._w(new Uint8Array(dd.buffer));
    this.cd.push(...centralEntry(nm, crc, size, flags, start)); this.count++;
  }
  async finish() {
    const cdOff = this.off; let cdSize = 0;
    for (const b of this.cd) { await this._w(b); cdSize += b.length; }
    await this._w(endRecord(this.count, cdSize, cdOff));
  }
}
