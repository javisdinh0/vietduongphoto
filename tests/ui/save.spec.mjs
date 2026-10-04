// Lưu ảnh gốc từ lightbox trên điện thoại: data: URL (iOS không lưu được blob:) + nút "Lưu vào Ảnh" (Web Share với file).
import { test, expect } from '@playwright/test';

test.describe('màn hình cảm ứng', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('ảnh gốc dùng data: URL và có nút chia sẻ file', async ({ page }) => {
    await page.addInitScript(() => {
      navigator.canShare = () => true;
      navigator.share = async (d) => { window.__shared = { n: d.files.length, name: d.files[0].name, size: d.files[0].size }; };
    });
    await page.goto('/?demo=1');
    await expect(page.locator('.gallery-item').first()).toBeVisible();
    await page.locator('.gallery-item').first().click();
    await expect(page.locator('#lbQuality')).toHaveClass(/ready/);
    await expect(page.locator('#lightboxImg')).toHaveAttribute('data-quality', 'original');
    expect(await page.locator('#lightboxImg').getAttribute('src')).toMatch(/^data:/);
    const btn = page.locator('#shareFileBtn');
    await expect(btn).toBeVisible();
    await btn.click();
    expect(await page.evaluate(() => window.__shared)).toMatchObject({ n: 1, name: 'ROOT_003.JPG' });
    // chuyển ảnh: nút chia sẻ ẩn cho tới khi ảnh gốc mới sẵn sàng
    await page.locator('#lbNext').click();
    await expect(page.locator('#lbQuality')).toHaveClass(/ready/);
    await expect(btn).toBeVisible();
  });
});

test('desktop: ảnh gốc dùng blob: và không hiện nút chia sẻ khi trình duyệt không hỗ trợ', async ({ page }) => {
  await page.addInitScript(() => { navigator.canShare = undefined; });
  await page.goto('/?demo=1');
  await expect(page.locator('.gallery-item').first()).toBeVisible();
  await page.locator('.gallery-item').first().click();
  await expect(page.locator('#lbQuality')).toHaveClass(/ready/);
  expect(await page.locator('#lightboxImg').getAttribute('src')).toMatch(/^blob:/);
  await expect(page.locator('#shareFileBtn')).toBeHidden();
});
