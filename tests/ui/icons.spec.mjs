// Biểu tượng SVG tự chứa: mỗi biểu tượng vẽ ra hình thật (không rỗng, không đặc kín), đúng màu, đổi trạng thái (trái tim, thanh dưới) đúng.
import { test, expect } from '@playwright/test';

test('không còn yêu cầu Font Awesome / cdnjs', async ({ page }) => {
  const reqs = []; page.on('request', (r) => reqs.push(r.url()));
  await page.goto('/?demo=1');
  await expect(page.locator('.album-card').first()).toBeVisible();
  expect(reqs.filter((u) => /font-?awesome|cdnjs|webfonts\/fa-/i.test(u))).toEqual([]);
  expect(reqs.some((u) => u.endsWith('/icons.css'))).toBe(true);
});

test('mọi biểu tượng trong icons.css đều vẽ ra hình thật (có nét, không rỗng, không đặc kín)', async ({ page }) => {
  await page.goto('/?demo=1');
  await expect(page.locator('.album-card').first()).toBeVisible();
  const bad = await page.evaluate(async () => {
    const urls = []; const grab = (rules) => { for (const r of rules) { if (r.cssRules && !r.selectorText) grab(r.cssRules); const v = r.style && r.style.getPropertyValue('--fa'); if (v) urls.push([r.selectorText, v.trim().replace(/^url\(["']?|["']?\)$/g, '')]); } };
    for (const sh of document.styleSheets) { try { if ((sh.href || '').endsWith('icons.css')) grab(sh.cssRules); } catch (e) { /* bỏ qua */ } }
    const out = [];
    for (const [sel, u] of urls) {
      const img = new Image(); img.src = u; await img.decode().catch(() => null);
      if (!img.naturalWidth) { out.push(`${sel}: không giải mã được`); continue; }
      const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'); x.drawImage(img, 0, 0, 64, 64);
      const d = x.getImageData(0, 0, 64, 64).data; let on = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 128) on++;
      const ratio = on / 4096; if (ratio < 0.04 || ratio > 0.97) out.push(`${sel}: tỉ lệ nét ${ratio.toFixed(2)}`);
    }
    return { count: urls.length, out };
  });
  expect(bad.count).toBeGreaterThanOrEqual(38);
  expect(bad.out).toEqual([]);
});

test('biểu tượng ở tiêu đề: có mask, có kích thước, màu theo chữ của phần tử cha', async ({ page }) => {
  await page.goto('/?demo=1');
  await expect(page.locator('#themeBtn')).toBeVisible();
  const r = await page.evaluate(() => { const i = document.querySelector('#themeBtn i'); const cs = getComputedStyle(i); const p = getComputedStyle(i.parentElement); return { mask: cs.maskImage || cs.webkitMaskImage, w: i.getBoundingClientRect().width, h: i.getBoundingClientRect().height, bg: cs.backgroundColor, color: p.color }; });
  expect(r.mask).toContain('data:image/svg+xml'); expect(r.w).toBeGreaterThan(8); expect(r.h).toBeGreaterThan(8);
  expect(r.bg).toBe(r.color);                                     // nền = currentColor của cha → biểu tượng đúng màu chữ, cả sáng lẫn tối
  await page.locator('#themeBtn').click();
  const r2 = await page.evaluate(() => { const i = document.querySelector('#themeBtn i'); return { mask: getComputedStyle(i).maskImage, bg: getComputedStyle(i).backgroundColor, color: getComputedStyle(i.parentElement).color }; });
  expect(r2.bg).toBe(r2.color); expect(r2.mask).not.toBe(r.mask);   // đổi sáng/tối → mặt trăng ↔ mặt trời
});

test('trái tim trong lightbox: viền → đặc khi thích (đổi lớp far→fas đổi hình)', async ({ page }) => {
  await page.goto('/?demo=1');
  await page.locator('.gallery-item').first().click();
  const mask = () => page.evaluate(() => getComputedStyle(document.querySelector('#lbFav i')).maskImage);
  await expect(page.locator('#lbFav i')).toHaveClass(/far/);
  const outline = await mask();
  await page.keyboard.press('f');
  await expect(page.locator('#lbFav i')).toHaveClass(/fas/);
  const solid = await mask();
  expect(outline).toContain('data:image'); expect(solid).toContain('data:image'); expect(solid).not.toBe(outline);
});

test.describe('điện thoại', () => {
  test.use({ viewport: { width: 430, height: 900 }, hasTouch: true, isMobile: true });
  test('thanh dưới: tab đang chọn có nền viên thuốc ở phần tử bao ngoài, biểu tượng giữ màu nhấn (không bị nhạt)', async ({ page }) => {
    await page.goto('/?demo=1');
    await expect(page.locator('#bottomNav')).toBeVisible();
    const r = await page.evaluate(() => { const a = document.querySelector('#bottomNav > .active'); const ti = a.querySelector('.ti'); const i = ti.querySelector('i'); return { pill: getComputedStyle(ti).backgroundColor, icon: getComputedStyle(i).backgroundColor, color: getComputedStyle(a).color, iw: i.getBoundingClientRect().width, tabMoreIcon: document.querySelector('#tabMore i').className }; });
    expect(r.pill).not.toBe('rgba(0, 0, 0, 0)');
    expect(r.icon).toBe(r.color); expect(r.iw).toBeGreaterThan(10);   // biểu tượng đặc màu nhấn, không phải màu nền nhạt của viên thuốc
    expect(r.tabMoreIcon).toContain('fa-gear');
  });
});

test('album tuyển chọn có biểu tượng thư mục (pseudo-element dùng mask)', async ({ page }) => {
  await page.goto('/?demo=1');
  await expect(page.locator('.gallery-item').first()).toBeVisible();
  await page.locator('#selectBtn').click(); await page.locator('.gallery-item').nth(0).click();
  await page.locator('#selAlbum').click(); await page.locator('#albumName').fill('Biểu tượng'); await page.locator('#albumOk').click();
  await expect(page.locator('.album-card.album-virtual .album-name')).toBeVisible();
  const r = await page.evaluate(() => { const el = document.querySelector('.album-card.album-virtual .album-name'); const cs = getComputedStyle(el, '::before'); return { mask: cs.maskImage || cs.webkitMaskImage, w: parseFloat(cs.width), content: cs.content }; });
  expect(r.mask).toContain('data:image/svg+xml'); expect(r.w).toBeGreaterThan(6);
});
