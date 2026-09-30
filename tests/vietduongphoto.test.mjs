import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { buildLibrary, mergeDelta, signature, applyFilters, groupMonths, parseHash, parseTaken, thumbAt } from '../public/vietduongphoto/lib.js';
import { crc32, makeZip, ZipStream } from '../public/vietduongphoto/zip.js';

const raw = () => ({
  folders: [{ id: 'r', name: '', parent: null }, { id: 'a', name: 'A', parent: 'r' }, { id: 'b', name: 'B', parent: 'a' }],
  files: [
    { id: '1', name: 'IMG_1.JPG', mimeType: 'image/jpeg', parents: ['a'], createdTime: '2025-01-05T00:00:00Z', thumbnailLink: 'https://x/y=s220' },
    { id: '2', name: 'img_1.ARW', mimeType: 'application/octet-stream', parents: ['a'], size: '100' },
    { id: '3', name: 'ONLYRAW.CR3', mimeType: 'application/octet-stream', parents: ['a'] },
    { id: '4', name: 'IMG_1.JPG', mimeType: 'image/jpeg', parents: ['a'], createdTime: '2025-01-06T00:00:00Z' },
    { id: '5', name: 'deep.png', mimeType: 'image/png', parents: ['b'], imageMediaMetadata: { time: '2024:07:01 10:00:00', width: 10, height: 20 } },
    { id: '6', name: 'notes.txt', mimeType: 'text/plain', parents: ['a'] },
    { id: '7', name: 'orphan.jpg', mimeType: 'image/jpeg', parents: ['zzz'] },
  ],
});

test('buildLibrary: ghÃ©p JPG/RAW, áº£nh trÃ¹ng tÃªn, chá»‰ RAW, bá» file láº¡ vÃ  má»“ cÃ´i', () => {
  const L = buildLibrary(raw(), 'r');
  assert.equal(L.photos.length, 4); // IMG_1 (+raw), IMG_1 trÃ¹ng, ONLYRAW, deep
  const p1 = L.byId.get('1'); assert.equal(p1.raw.id, '2'); assert.equal(p1.tb, 'https://x/y');
  assert.equal(L.byId.get('3').onlyRaw, true);
  assert.equal(L.byId.get('5').w, 10);
  assert.equal(L.root.deep.length, 4); assert.equal(L.folders.get('a').deep.length, 4); assert.equal(L.folders.get('b').deep.length, 1);
  assert.equal(L.root.photos.length, 0);
});

test('thumbAt', () => {
  assert.equal(thumbAt({ tb: 'https://x/y' }, 400), 'https://x/y=s400');
  assert.match(thumbAt({ id: 'q' }, 400), /thumbnail\?id=q&sz=w400/);
  assert.equal(thumbAt({ thumbRaw: 'data:1' }, 400), 'data:1');
});

test('mergeDelta: cáº­p nháº­t, xoÃ¡ (trashed), bá» file ngoÃ i cÃ¢y', () => {
  const files = raw().files; const ids = new Set(['r', 'a', 'b']);
  const out = mergeDelta(files, [{ id: '1', name: 'IMG_1_new.JPG', parents: ['a'] }, { id: '5', trashed: true, parents: ['b'] }, { id: '9', name: 'n.jpg', parents: ['a'] }], ids);
  assert.ok(out.find((f) => f.id === '1').name.includes('new')); assert.ok(!out.find((f) => f.id === '5'));
  assert.ok(out.find((f) => f.id === '9')); assert.ok(!out.find((f) => f.id === '7'));
});

test('signature Ä‘á»•i khi cÃ³ thay Ä‘á»•i', () => {
  const a = raw(); const s1 = signature(a); a.files.push({ id: 'n', modifiedTime: '2026-01-01' });
  assert.notEqual(signature(a), s1);
});

test('applyFilters + groupMonths + parseHash + parseTaken', () => {
  const L = buildLibrary(raw(), 'r');
  assert.equal(applyFilters(L.photos, { q: 'deep' }, new Set()).length, 1);
  assert.equal(applyFilters(L.photos, { year: '2024' }, new Set()).length, 1);
  assert.equal(applyFilters(L.photos, { raw: true }, new Set()).length, 2);
  assert.equal(applyFilters(L.photos, { fav: true }, new Set(['1'])).length, 1);
  const g = groupMonths(L.photos); assert.equal(g.months.length, 3); assert.equal(g.rows.length, 4 + 3);
  assert.deepEqual(parseHash('#/f/abc'), { type: 'folder', id: 'abc' }); assert.deepEqual(parseHash('#/p/x%20y'), { type: 'photo', id: 'x y' });
  assert.equal(parseHash('').type, 'home'); assert.ok(parseTaken('2024:07:01 10:00:00') > 0); assert.equal(parseTaken('bad'), 0);
});

test('crc32 chuáº©n', () => { assert.equal(crc32(new TextEncoder().encode('123456789')), 0xCBF43926); });

async function streamZip() {
  const chunks = []; const zs = new ZipStream({ write: async (u) => { chunks.push(Buffer.from(u)); } });
  await zs.add('a.txt', new Blob(['hello world']));
  await zs.add('ÄÃ  Láº¡t/b.bin', new Blob([new Uint8Array(200000).fill(7)]));
  await zs.finish(); return Buffer.concat(chunks);
}
test('ZipStream: Ä‘á»c láº¡i Ä‘Æ°á»£c cáº¥u trÃºc + crc', async () => {
  const buf = await streamZip(); const n = buf.readUInt16LE(buf.length - 22 + 10); assert.equal(n, 2);
  let off = buf.readUInt32LE(buf.length - 22 + 16); const crcs = [];
  for (let i = 0; i < n; i++) { crcs.push(buf.readUInt32LE(off + 16)); off += 46 + buf.readUInt16LE(off + 28); }
  assert.equal(crcs[0], crc32(new TextEncoder().encode('hello world'))); assert.equal(crcs[1], crc32(new Uint8Array(200000).fill(7)));
  if (process.env.ZIP_OUT) { writeFileSync(process.env.ZIP_OUT, buf); }
});
test('makeZip', async () => {
  const b = Buffer.from(await makeZip([{ name: 'x.txt', data: new TextEncoder().encode('abc') }]).arrayBuffer());
  assert.equal(b.readUInt32LE(0), 0x04034b50); assert.equal(b.readUInt16LE(b.length - 22 + 10), 1);
});

