// Ảnh xem trước phải hiện NGAY (không chờ ảnh gốc), và ảnh gốc chỉ tải sau khi bản xem trước đã xong.
import { test, expect } from '@playwright/test';

test('ảnh gốc treo mãi vẫn xem được ảnh xem trước, chuyển ảnh cũng không bị chặn (desktop)', async ({ page }) => {
  await page.goto('/?demo=1');
  await expect(page.locator('.gallery-item').first()).toBeVisible();
  await page.evaluate(() => { window.__vd.backend.drive.original = () => new Promise(() => {}); }); // ảnh gốc không bao giờ về
  await page.locator('.gallery-item').first().click();
  const img = page.locator('#lightboxImg');
  await expect(img).toBeVisible();
  await expect.poll(() => img.evaluate((e) => e.complete && e.naturalWidth > 0)).toBe(true); // xem trước hiện ngay
  await expect(img).toHaveAttribute('data-quality', 'preview');
  await expect(page.locator('#lbQuality')).toHaveClass(/loading/);
  const before = await img.getAttribute('src');
  await page.locator('#lbNext').click();
  await expect(page.locator('#lbCount')).toContainText('2 / 3');
  await expect.poll(() => img.evaluate((e) => e.complete && e.naturalWidth > 0)).toBe(true);
  expect(await img.getAttribute('src')).not.toBe(before);
});

test('ảnh gốc chỉ bắt đầu tải sau khi bản xem trước 2000px xong (desktop)', async ({ page }) => {
  await page.goto('/?demo=1');
  await expect(page.locator('.gallery-item').first()).toBeVisible();
  await page.evaluate(() => {
    window.__log = [];
    const d = window.__vd.backend.drive; const o = d.original.bind(d);
    d.original = (...a) => { window.__log.push('original'); return o(...a); };
    const OrigImage = window.Image; const set = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src').set;
    window.Image = function () { const i = new OrigImage(); Object.defineProperty(i, 'src', { set(v) { window.__log.push('img'); set.call(i, v); }, get() { return i.getAttribute('src'); } }); return i; };
  });
  await page.locator('.gallery-item').first().click();
  await expect(page.locator('#lbQuality')).toHaveClass(/ready/);
  const log = await page.evaluate(() => window.__log);
  expect(log.indexOf('img')).toBeGreaterThanOrEqual(0);
  expect(log.indexOf('original')).toBeGreaterThan(log.indexOf('img')); // xem trước trước, ảnh gốc sau
});
