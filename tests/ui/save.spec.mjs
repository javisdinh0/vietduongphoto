// Lưu ảnh gốc trên điện thoại: chỉ tải khi bấm "Tải ảnh" (tiết kiệm dữ liệu), dùng data: URL (iOS không lưu được blob:)
// và nút "Lưu vào Ảnh" (Web Share với file). Máy tính: tự tải ảnh gốc thành blob:.
import { test, expect } from '@playwright/test';

test.describe('màn hình cảm ứng', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('mặc định chỉ xem trước; bấm Tải ảnh mới tải ảnh gốc (data: URL) + nút chia sẻ file', async ({ page }) => {
    await page.addInitScript(() => {
      navigator.canShare = () => true;
      navigator.share = async (d) => { window.__shared = { n: d.files.length, name: d.files[0].name, size: d.files[0].size }; };
    });
    await page.goto('/?demo=1');
    await expect(page.locator('.gallery-item').first()).toBeVisible();
    await page.evaluate(() => { const d = window.__vd.backend.drive; const o = d.original.bind(d); window.__n = 0; d.original = (...a) => { window.__n++; return o(...a); }; });
    await page.locator('.gallery-item').first().click();
    const q = page.locator('#lbQuality');
    await expect(q).toHaveClass(/manual/);
    await expect(q).toContainText('Bấm Tải ảnh');
    await page.waitForTimeout(500);
    expect(await page.evaluate(() => window.__n)).toBe(0);              // chưa tải gì thêm
    await expect(page.locator('#lightboxImg')).toHaveAttribute('data-quality', 'preview');
    await expect(page.locator('#shareFileBtn')).toBeHidden();
    await page.locator('#downloadBtn').click();                          // người dùng cần lưu → mới tải ảnh gốc
    await expect(q).toHaveClass(/ready/);
    expect(await page.evaluate(() => window.__n)).toBe(1);
    expect(await page.locator('#lightboxImg').getAttribute('src')).toMatch(/^data:/);
    const btn = page.locator('#shareFileBtn');
    await expect(btn).toBeVisible();
    await btn.click();
    expect(await page.evaluate(() => window.__shared)).toMatchObject({ n: 1, name: 'ROOT_003.JPG' });
    // bấm Tải ảnh lần nữa (ảnh gốc đã có) thì tải file như thường, không tải lại
    await page.locator('#downloadBtn').click().catch(() => {});
    expect(await page.evaluate(() => window.__n)).toBe(1);
    // sang ảnh khác: lại về xem trước, nút chia sẻ ẩn
    await page.locator('#lbNext').click();
    await expect(q).toHaveClass(/manual/);
    await expect(btn).toBeHidden();
  });

  test('bấm Tải ảnh hai lần khi đang tải chỉ gửi một yêu cầu', async ({ page }) => {
    await page.goto('/?demo=1');
    await expect(page.locator('.gallery-item').first()).toBeVisible();
    await page.evaluate(() => { window.__n = 0; window.__vd.backend.drive.original = () => { window.__n++; return new Promise(() => {}); }; });
    await page.locator('.gallery-item').first().click();
    await page.locator('#downloadBtn').click();
    await expect(page.locator('#lbQuality')).toHaveClass(/loading/);
    await page.locator('#downloadBtn').click();
    await page.waitForTimeout(500);
    expect(await page.evaluate(() => window.__n)).toBe(1);
  });
});

test('desktop: tự tải ảnh gốc thành blob: và không hiện nút chia sẻ khi trình duyệt không hỗ trợ', async ({ page }) => {
  await page.addInitScript(() => { navigator.canShare = undefined; });
  await page.goto('/?demo=1');
  await expect(page.locator('.gallery-item').first()).toBeVisible();
  await page.locator('.gallery-item').first().click();
  await expect(page.locator('#lbQuality')).toHaveClass(/ready/);
  expect(await page.locator('#lightboxImg').getAttribute('src')).toMatch(/^blob:/);
  await expect(page.locator('#shareFileBtn')).toBeHidden();
});
