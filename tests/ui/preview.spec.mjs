// Ảnh xem trước phải hiện NGAY (không chờ ảnh gốc), và ảnh gốc chỉ tải sau khi bản xem trước đã xong.
import { test, expect } from '@playwright/test';

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

test('ảnh gốc treo mãi vẫn xem được ảnh xem trước, chuyển ảnh cũng không bị chặn', async ({ page }) => {
  await page.goto('/?demo=1');
  await expect(page.locator('.gallery-item').first()).toBeVisible();
  await page.evaluate(() => { // ảnh gốc không bao giờ về
    window.__vd.backend.drive.original = () => new Promise(() => {});
  });
  await page.locator('.gallery-item').first().click();
  const img = page.locator('#lightboxImg');
  await expect(img).toBeVisible();
  // xem trước hiện ngay: có nguồn và đã giải mã được
  await expect.poll(() => img.evaluate((e) => e.complete && e.naturalWidth > 0)).toBe(true);
  await expect(img).toHaveAttribute('data-quality', 'preview');
  await expect(page.locator('#lbQuality')).toHaveClass(/loading/);
  // sang ảnh khác khi ảnh gốc ảnh trước còn treo: ảnh mới vẫn hiện ngay
  const before = await img.getAttribute('src');
  await page.locator('#lbNext').click();
  await expect(page.locator('#lbCount')).toContainText('2 / 3');
  await expect.poll(() => img.evaluate((e) => e.complete && e.naturalWidth > 0)).toBe(true);
  expect(await img.getAttribute('src')).not.toBe(before);
});

test('ảnh gốc chỉ bắt đầu tải sau khi bản xem trước 2000px xong', async ({ page }) => {
  await page.goto('/?demo=1');
  await expect(page.locator('.gallery-item').first()).toBeVisible();
  await page.evaluate(() => {
    window.__log = [];
    const d = window.__vd.backend.drive; const o = d.original.bind(d);
    d.original = (...a) => { window.__log.push('original'); return o(...a); };
    const OrigImage = window.Image;
    window.Image = function () { const i = new OrigImage(); const set = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src').set;
      Object.defineProperty(i, 'src', { set(v) { if (/width%3D%221600|width%3D%221067|width%3D%22900|width%3D%221200/.test(String(v)) || String(v).startsWith('data:')) window.__log.push('img'); set.call(i, v); }, get() { return i.getAttribute('src'); } }); return i; };
  });
  await page.locator('.gallery-item').first().click();
  await expect(page.locator('#lbQuality')).toHaveClass(/ready/);
  const log = await page.evaluate(() => window.__log);
  expect(log.indexOf('img')).toBeGreaterThanOrEqual(0);
  expect(log.indexOf('original')).toBeGreaterThan(log.indexOf('img')); // xem trước trước, ảnh gốc sau
});
