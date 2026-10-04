// Tiêu đề trang lớn + thanh điều hướng dưới (điện thoại), chế độ demo.
import { test as base, expect } from '@playwright/test';

const test = base.extend({
  page: async ({ page }, use) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|ERR_/.test(m.text())) errors.push('console: ' + m.text()); });
    await use(page);
    expect(errors).toEqual([]);
  },
});

const open = async (page, hash = '') => {
  await page.goto('/?demo=1' + hash);
  await expect(page.locator('#app')).toBeVisible();
  await expect(page.locator('.gallery-item, .album-card').first()).toBeVisible();
};

test('tiêu đề lớn: có ở album/tất cả/yêu thích, không có ở trang chủ', async ({ page }) => {
  await open(page);
  await expect(page.locator('#pageTitles')).toBeHidden();
  await page.locator('.album-card', { hasText: 'Đà Lạt 2025' }).click();
  await expect(page.locator('#pageTitle')).toHaveText('Đà Lạt 2025');
  await expect(page.locator('#pageSub')).toHaveText('14 ảnh');
  await page.goto('/?demo=1#/all');
  await expect(page.locator('#pageTitle')).toHaveText('Tất cả ảnh');
  await page.goto('/?demo=1#/fav');
  await expect(page.locator('#pageTitle')).toHaveText('Yêu thích');
  await expect(page.locator('#pageSub')).toHaveText('0 ảnh');
});

test('thanh điều hướng dưới ẩn trên desktop', async ({ page }) => {
  await open(page);
  await expect(page.locator('#bottomNav')).toBeHidden();
});

test.describe('điện thoại', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('hiện thanh dưới; chuyển tab Thư viện/Yêu thích; Chọn bật thanh chọn; Cài đặt mở modal', async ({ page }) => {
    await open(page);
    const nav = page.locator('#bottomNav');
    await expect(nav).toBeVisible();
    await expect(nav.locator('[data-tab="home"]')).toHaveClass(/active/);
    await nav.locator('[data-tab="fav"]').click();
    await expect(page).toHaveURL(/#\/fav/);
    await expect(nav.locator('[data-tab="fav"]')).toHaveClass(/active/);
    await nav.locator('[data-tab="home"]').click();
    await expect(page.locator('.album-card').first()).toBeVisible();
    await page.locator('#tabSelect').click();
    await expect(page.locator('#selectBar')).toBeVisible();
    await expect(page.locator('#tabSelect')).toHaveClass(/active/);
    // thanh chọn nổi phía trên thanh điều hướng, không đè lên
    const bar = await page.locator('#selectBar').boundingBox();
    const navBox = await nav.boundingBox();
    expect(bar.y + bar.height).toBeLessThanOrEqual(navBox.y + 1);
    await page.locator('#tabSelect').click();
    await expect(page.locator('#selectBar')).toBeHidden();
    await page.locator('#tabMore').click();
    await expect(page.locator('#settingsModal')).toBeVisible();
  });

  test('khách: tab cuối là Đăng xuất', async ({ page }) => {
    await page.goto('/?demo=1&guest=1');
    await expect(page.locator('#tabMoreLabel')).toHaveText('Đăng xuất');
  });

  test('không tràn ngang trên điện thoại', async ({ page }) => {
    await open(page, '#/f/f-dalat');
    const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(over).toBeLessThanOrEqual(1);
  });
});
