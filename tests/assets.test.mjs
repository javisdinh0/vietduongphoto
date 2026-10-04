// Tài nguyên tĩnh & gợi ý tải trang: modulepreload khớp đồ thị import, biểu tượng PWA đúng kích thước, phông chỉ nạp độ đậm thực dùng.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const html = read('index.html');

// các module mà app.js kéo vào (BFS theo `from './x.js'`)
function graph(entry) {
  const seen = [entry];
  for (let i = 0; i < seen.length; i++) for (const m of read(seen[i]).matchAll(/from '\.\/([\w-]+\.js)'/g)) if (!seen.includes(m[1])) seen.push(m[1]);
  return seen;
}

test('modulepreload: danh sách trong index.html khớp đúng đồ thị import của app.js (không thiếu, không thừa)', () => {
  const preload = [...html.matchAll(/<link rel="modulepreload" href="([^"]+)">/g)].map((m) => m[1]).sort();
  const mods = graph('app.js').sort();
  assert.deepEqual(preload, mods, 'thêm/bớt import thì cập nhật các thẻ modulepreload trong index.html');
  for (const f of preload) assert.ok(fs.existsSync(path.join(root, f)), `${f} tồn tại`);
});

const png = (f) => { const b = fs.readFileSync(path.join(root, f)); assert.equal(b.subarray(1, 4).toString(), 'PNG', f + ' là PNG'); return { w: b.readUInt32BE(16), h: b.readUInt32BE(20), colorType: b[25] }; };

test('manifest: mỗi biểu tượng tồn tại, đúng kích thước khai báo, có biểu tượng maskable', () => {
  const m = JSON.parse(read('manifest.webmanifest'));
  const purposes = new Set();
  for (const i of m.icons) {
    assert.ok(fs.existsSync(path.join(root, i.src)), `${i.src} tồn tại`);
    purposes.add(i.purpose);
    if (i.type === 'image/png') { const { w, h } = png(i.src); assert.equal(`${w}x${h}`, i.sizes, i.src); }
  }
  assert.ok(purposes.has('any') && purposes.has('maskable'));
  assert.ok(m.icons.some((i) => i.sizes === '192x192') && m.icons.some((i) => i.sizes === '512x512'), 'có 192 và 512');
  assert.equal(m.theme_color, '#b4533a');
});

test('apple-touch-icon: 180x180, không trong suốt (iOS tô đen vùng trong suốt), có thẻ link trong index.html', () => {
  assert.match(html, /<link rel="apple-touch-icon" href="apple-touch-icon\.png">/);
  const { w, h, colorType } = png('apple-touch-icon.png');
  assert.equal(`${w}x${h}`, '180x180'); assert.notEqual(colorType, 6, 'RGBA có kênh alpha'); assert.notEqual(colorType, 4);
  const mk = png('icon-maskable-512.png'); assert.notEqual(mk.colorType, 6);   // maskable cũng phải tràn nền
});

test('phông chữ: chỉ nạp các độ đậm mà CSS thật sự dùng', () => {
  const url = /fonts\.googleapis\.com\/css2\?([^"]+)"/.exec(html)[1].replace(/&amp;/g, '&');
  const css = read('style.css') + read('index.html');
  const used = new Set([...css.matchAll(/font-weight:\s*(\d{3})/g)].map((m) => +m[1]));
  const bvp = /Be\+Vietnam\+Pro:wght@([\d;]+)/.exec(url)[1].split(';').map(Number);
  for (const w of bvp) assert.ok(used.has(w), `Be Vietnam Pro ${w} có dùng`);
  assert.ok(!bvp.includes(700), 'không còn nạp độ đậm 700 không dùng');
  const nr = /Newsreader:ital,wght@([\d,;]+)/.exec(url)[1].split(';');
  assert.deepEqual(nr, ['0,500', '1,500'], 'Newsreader chỉ dùng độ đậm 500 (thường + nghiêng)');
  assert.match(url, /display=swap/);
});

test('không còn nền mờ 32px (mỗi thẻ ảnh chỉ một yêu cầu ảnh)', () => {
  assert.ok(!/thumbAt\([^)]*,\s*32\)/.test(read('gallery.js')), 'gallery.js không còn xin thumbnail 32px');
});
