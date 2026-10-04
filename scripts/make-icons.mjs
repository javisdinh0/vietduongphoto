// Sinh biểu tượng PNG cho PWA / iPhone từ cùng một hình máy ảnh với favicon.svg (chạy lại khi đổi thiết kế): node scripts/make-icons.mjs
// - icon-192.png, icon-512.png: bo góc, nền trong suốt (purpose "any")
// - icon-maskable-512.png: tràn nền, hình nằm trong vùng an toàn 80% (purpose "maskable")
// - apple-touch-icon.png (180x180): tràn nền, KHÔNG trong suốt (iOS tự bo góc, vùng trong suốt sẽ thành đen)
import fs from 'node:fs';
import { chromium } from '@playwright/test';

const COLOR = '#b4533a';
const GLYPH = '<path d="M24 38h11l5-8h20l5 8h11a3 3 0 0 1 3 3v31a3 3 0 0 1-3 3H24a3 3 0 0 1-3-3V41a3 3 0 0 1 3-3z" fill="none" stroke="#fff" stroke-width="6" stroke-linejoin="round"/><circle cx="50" cy="56" r="12" fill="none" stroke="#fff" stroke-width="6"/>';
const rounded = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="24" fill="${COLOR}"/>${GLYPH}</svg>`;
const bleed = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="${COLOR}"/><g transform="translate(50 50) scale(.75) translate(-50 -52)">${GLYPH}</g></svg>`;

const jobs = [['icon-192.png', rounded, 192, true], ['icon-512.png', rounded, 512, true], ['icon-maskable-512.png', bleed, 512, false], ['apple-touch-icon.png', bleed, 180, false]];
const browser = await chromium.launch();
for (const [file, svg, size, transparent] of jobs) {
  const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
  await page.setContent(`<style>html,body{margin:0;background:${transparent ? 'transparent' : COLOR}}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`);
  fs.writeFileSync(file, await page.screenshot({ omitBackground: transparent, clip: { x: 0, y: 0, width: size, height: size } }));
  await page.close();
  console.log(file, fs.statSync(file).size, 'bytes');
}
await browser.close();
