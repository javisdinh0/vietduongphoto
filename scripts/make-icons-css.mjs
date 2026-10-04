// Sinh icons.css: thay Font Awesome (CSS + webfont nạp từ CDN, chặn hiển thị) bằng các biểu tượng SVG tự chứa dưới dạng CSS mask.
// Markup KHÔNG đổi: vẫn <i class="fas fa-play"> / className = 'far fa-heart' …; mỗi lớp .fa-xxx đặt biến --fa (ảnh mask) và --fa-w (tỉ lệ rộng/cao).
// Quét index.html + *.js + style.css để biết biểu tượng nào đang dùng nên không thừa/thiếu. Chạy lại khi thêm biểu tượng mới: npm run icons:css
// Dữ liệu hình lấy từ gói @fortawesome/free-*-svg-icons@6.4.0 (cùng bộ với bản CDN trước đây).
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const root = path.resolve(import.meta.dirname, '..');
const require = createRequire(import.meta.url);
const solid = require('@fortawesome/free-solid-svg-icons'); const regular = require('@fortawesome/free-regular-svg-icons'); const brands = require('@fortawesome/free-brands-svg-icons');
const GENERIC = new Set(['fa-solid', 'fa-regular', 'fa-brands', 'fa-spin', 'fa-fw', 'fa-pulse']);

const files = ['index.html', 'style.css', ...fs.readdirSync(root).filter((f) => f.endsWith('.js') && f !== 'sw.js')];
const src = files.map((f) => fs.readFileSync(path.join(root, f), 'utf8')).join('\n');
const names = new Set([...src.matchAll(/(?<![\w-])fa-([a-z0-9-]+)\b/g)].map((m) => m[1]).filter((n) => !GENERIC.has('fa-' + n)));
names.add('folder-open'); // dùng trong style.css qua --fa-img-folder-open
const withPrefix = (p) => new Set([...src.matchAll(new RegExp(`\\b${p}\\s+fa-([a-z0-9-]+)`, 'g'))].map((m) => m[1]));
const usedFar = withPrefix('far'); const usedFab = withPrefix('fab');

const lookup = (mod) => { const m = new Map(); for (const v of Object.values(mod)) if (v && v.iconName && Array.isArray(v.icon)) { m.set(v.iconName, v); for (const a of v.icon[2]) if (typeof a === 'string') m.set(a, v); } return m; };
const S = lookup(solid); const R = lookup(regular); const B = lookup(brands);

const uri = (def) => { const [w, h, , , d] = def.icon; return `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${w} ${h}'%3E%3Cpath d='${d.replace(/#/g, '%23')}'/%3E%3C/svg%3E")`; };
const ratio = (def) => +(def.icon[0] / def.icon[1]).toFixed(3);
const rule = (sel, def) => `${sel}{--fa:${uri(def)};--fa-w:${ratio(def)}}`;

const out = [];
for (const n of [...names].sort()) {
  if (usedFab.has(n)) { const d = B.get(n); if (!d) throw new Error('thiếu biểu tượng thương hiệu: ' + n); out.push(rule(`.fab.fa-${n}`, d)); continue; }
  const d = S.get(n); if (!d) throw new Error('thiếu biểu tượng solid: ' + n);
  out.push(rule(`.fa-${n}`, d));
  if (usedFar.has(n)) { const r = R.get(n); if (!r) throw new Error('thiếu biểu tượng regular: ' + n); out.push(rule(`.far.fa-${n}`, r)); }
}
const folderOpen = S.get('folder-open');

const css = `/* Biểu tượng SVG tự chứa (CSS mask) thay Font Awesome; sinh bởi scripts/make-icons-css.mjs — ĐỪNG sửa tay, chạy: npm run icons:css
 * Hình biểu tượng: Font Awesome Free 6.4.0 by @fontawesome — https://fontawesome.com — Icons: CC BY 4.0 License (https://fontawesome.com/license/free)
 * Cách dùng giữ nguyên như Font Awesome: <i class="fas fa-play"></i>, <i class="far fa-heart"></i>; kích thước và màu theo font-size / color của phần tử cha. */
.fas,.far,.fab,.fa-solid,.fa-regular,.fa-brands{display:inline-block;flex:none;width:calc(var(--fa-w,1) * 1em);height:1em;vertical-align:-.125em;font-style:normal;line-height:1;background:currentColor;-webkit-mask:var(--fa,linear-gradient(transparent,transparent)) center/100% 100% no-repeat;mask:var(--fa,linear-gradient(transparent,transparent)) center/100% 100% no-repeat}
:root{--fa-img-folder-open:${uri(folderOpen)};--fa-folder-open-w:${ratio(folderOpen)}}
${out.join('\n')}
`;
fs.writeFileSync(path.join(root, 'icons.css'), css);
console.log(`icons.css: ${names.size} biểu tượng, ${css.length} byte (far: ${[...usedFar].join(',') || '-'}; fab: ${[...usedFab].join(',') || '-'})`);
