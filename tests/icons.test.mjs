// Biểu tượng SVG tự chứa (icons.css) thay Font Awesome: đủ biểu tượng cho mọi chỗ dùng, không còn phụ thuộc CDN, file sinh ra khớp trình sinh.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const icons = read('icons.css');
const html = read('index.html');
const jsFiles = fs.readdirSync(root).filter((f) => f.endsWith('.js') && f !== 'sw.js');
const GENERIC = new Set(['fa-solid', 'fa-regular', 'fa-brands', 'fa-spin', 'fa-fw', 'fa-pulse']);

test('mọi lớp fa-* đang dùng trong index.html / *.js / style.css đều có quy tắc trong icons.css', () => {
  const src = [html, read('style.css'), ...jsFiles.map(read)].join('\n');
  const used = [...new Set([...src.matchAll(/(?<![\w-])fa-([a-z0-9-]+)\b/g)].map((m) => m[0]).filter((n) => !GENERIC.has(n)))];
  assert.ok(used.length >= 35, 'tìm thấy các biểu tượng đang dùng');
  const missing = used.filter((n) => !new RegExp(`\\.(?:fab\\.|far\\.)?${n}\\{--fa:url\\("data:image/svg\\+xml,`).test(icons));
  assert.deepEqual(missing, [], 'thiếu biểu tượng trong icons.css — chạy: npm run icons:css');
});

test('index.html không còn nạp Font Awesome từ CDN, có nạp icons.css; style.css không còn font Font Awesome', () => {
  assert.ok(!/font-?awesome|cdnjs\.cloudflare\.com/i.test(html), 'không còn link Font Awesome/cdnjs');
  assert.match(html, /<link rel="stylesheet" href="icons\.css">/);
  assert.ok(!/font-family:\s*["']?Font Awesome/i.test(read('style.css')));
  assert.ok(!/\\f[0-9a-f]{3}/i.test(read('style.css')), 'không còn mã glyph \\fxxx của Font Awesome trong style.css');
});

test('icons.css: có giấy phép CC BY 4.0, quy tắc nền dùng mask, trái tim đặc khác trái tim viền, kích thước gọn', () => {
  assert.match(icons, /CC BY 4\.0/); assert.match(icons, /fontawesome\.com\/license\/free/);
  assert.match(icons, /\.fas,\.far,\.fab[^{]*\{[^}]*mask:var\(--fa/);
  const heart = /\.fa-heart\{--fa:(url\("[^"]+"\))/.exec(icons)[1]; const heartReg = /\.far\.fa-heart\{--fa:(url\("[^"]+"\))/.exec(icons)[1];
  assert.notEqual(heart, heartReg, 'solid ≠ regular');
  assert.match(icons, /\.fab\.fa-google\{/);
  assert.ok(icons.length < 40000, `icons.css ${icons.length} byte (FA từ CDN: hàng trăm KB)`);
  for (const m of icons.matchAll(/--fa:url\("data:image\/svg\+xml,([^"]+)"\)/g)) { assert.match(m[1], /viewBox='0 0 \d+ \d+'/); assert.match(m[1], /%3Cpath d='[^']+'\/%3E/); }
});

test('style.css dùng biến --fa-img-folder-open do icons.css định nghĩa (biểu tượng thư mục của album tuyển chọn)', () => {
  assert.match(read('style.css'), /var\(--fa-img-folder-open\)/);
  assert.match(icons, /--fa-img-folder-open:url\("data:image\/svg\+xml,/);
});

test('icons.css khớp với trình sinh (không sửa tay, không lệch với mã nguồn)', () => {
  const before = icons;
  execFileSync(process.execPath, [path.join(root, 'scripts/make-icons-css.mjs')], { cwd: root, stdio: 'pipe' });
  const after = read('icons.css');
  if (after !== before) fs.writeFileSync(path.join(root, 'icons.css'), before);   // trả lại để test không làm bẩn cây làm việc
  assert.equal(after, before, 'chạy npm run icons:css rồi commit icons.css');
});
