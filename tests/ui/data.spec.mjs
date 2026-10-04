// Tiết kiệm dữ liệu khi lấy ảnh gốc ở lightbox: bộ nhớ đệm, bỏ qua khi trình chiếu, chế độ Tiết kiệm dữ liệu.
import { test, expect } from '@playwright/test';

const openFirst = async (page) => {
  await page.goto('/?demo=1');
  await expect(page.locator('.gallery-item').first()).toBeVisible();
  await page.evaluate(() => { // đếm số lần thật sự tải ảnh gốc
    const d = window.__vd.backend.drive; const o = d.original.bind(d); window.__n = 0;
    d.original = (...a) => { window.__n++; return o(...a); };
  });
  await page.locator('.gallery-item').first().click();
};
const ready = (page) => expect(page.locator('#lbQuality')).toHaveClass(/ready/);

test('lùi/tiến không tải lại ảnh gốc đã xem (bộ nhớ đệm)', async ({ page }) => {
  await openFirst(page);
  await ready(page);
  await page.locator('#lbNext').click(); await ready(page);
  await page.locator('#lbPrev').click(); await ready(page);
  await page.locator('#lbNext').click(); await ready(page);
  expect(await page.evaluate(() => window.__n)).toBe(2); // chỉ 2 ảnh khác nhau
});

test('đóng lightbox xoá bộ nhớ đệm', async ({ page }) => {
  await openFirst(page);
  await ready(page);
  await page.keyboard.press('Escape');
  await page.locator('.gallery-item').first().click();
  await ready(page);
  expect(await page.evaluate(() => window.__n)).toBe(2);
});

test('trình chiếu dùng bản xem trước, dừng thì tải ảnh gốc', async ({ page }) => {
  await openFirst(page);
  await ready(page);
  await page.locator('#lbNext').click(); await ready(page);
  await page.locator('#lbPlay').click();               // bắt đầu trình chiếu
  await page.locator('#lbNext').click();                // sang ảnh 3 khi đang chiếu
  await page.waitForTimeout(700);
  await expect(page.locator('#lightboxImg')).toHaveAttribute('data-quality', 'preview');
  expect(await page.evaluate(() => window.__n)).toBe(2); // chưa tải ảnh 3
  await page.locator('#lbPlay').click();               // dừng
  await ready(page);
  expect(await page.evaluate(() => window.__n)).toBe(3);
});

test('Tiết kiệm dữ liệu: chỉ tải ảnh gốc khi chạm nhãn', async ({ page }) => {
  await page.addInitScript(() => { Object.defineProperty(navigator, 'connection', { value: { saveData: true }, configurable: true }); });
  await openFirst(page);
  const q = page.locator('#lbQuality');
  await expect(q).toHaveClass(/manual/);
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => window.__n)).toBe(0);
  await expect(page.locator('#lightboxImg')).toHaveAttribute('data-quality', 'preview');
  await q.click();
  await ready(page);
  expect(await page.evaluate(() => window.__n)).toBe(1);
});
