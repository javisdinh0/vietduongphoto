// Test giao diện trên trình duyệt thật (Chromium) ở chế độ demo: không cần đăng nhập Google/Firebase.
import { test as base, expect } from '@playwright/test';

// Mọi test đều fail nếu trang ném lỗi JS hoặc console.error (trừ lỗi tải tài nguyên ngoài như Font Awesome/GSI khi offline).
const test = base.extend({
  page: async ({ page }, use) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|ERR_/.test(m.text())) errors.push('console: ' + m.text()); });
    await use(page);
    expect(errors).toEqual([]);
  },
});

const open = async (page, qs = '?demo=1', hash = '') => {
  await page.goto('/' + qs + hash);
  await expect(page.locator('#app')).toBeVisible();
  await expect(page.locator('.gallery-item, .album-card').first()).toBeVisible();
};

test('trang chủ: album + ảnh ở thư mục gốc, admin thấy Riêng tư', async ({ page }) => {
  await open(page);
  const names = await page.locator('.album-name').allTextContents();
  expect(names).toEqual(expect.arrayContaining(['Tất cả ảnh', 'Đà Lạt 2025', 'Hội An 2024', 'Riêng tư']));
  await expect(page.locator('.gallery-item')).toHaveCount(3);
});

test('khách (guest=1): không thấy thư mục bị cấm và nút admin', async ({ page }) => {
  await open(page, '?demo=1&guest=1');
  expect(await page.locator('.album-name').allTextContents()).not.toContain('Riêng tư');
  await expect(page.locator('#settingsBtn')).toBeHidden();
  await expect(page.locator('#viewActions button')).toHaveCount(0);
});

test('vào album con: breadcrumb + số ảnh + thư mục lồng nhau', async ({ page }) => {
  await open(page);
  await page.locator('.album-card', { hasText: 'Hội An 2024' }).click();
  await expect(page).toHaveURL(/#\/f\/f-hoian/);
  await expect(page.locator('#crumbs .cur')).toHaveText('Hội An 2024');
  await expect(page.locator('.gallery-item')).toHaveCount(6);
  await page.locator('.album-card', { hasText: 'Phố cổ' }).click();
  await expect(page.locator('#crumbs a')).toHaveCount(2); // Thư viện / Hội An
  await expect(page.locator('.gallery-item')).toHaveCount(5);
});

test('lightbox: mở, ←/→, yêu thích (F) lưu localStorage, Esc đóng', async ({ page }) => {
  await open(page);
  await page.locator('.gallery-item').first().click();
  await expect(page.locator('#lightbox')).toBeVisible();
  await expect(page.locator('#lbCount')).toContainText('1 / 3');
  // ảnh gốc được tải thành blob (nhấn giữ "Lưu ảnh" ra file gốc)
  await expect(page.locator('#lightboxImg')).toHaveAttribute('src', /^blob:/);
  await expect(page.locator('#lightboxImg')).toHaveAttribute('data-quality', 'original');
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#lbCount')).toContainText('2 / 3');
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('#lbCount')).toContainText('1 / 3');
  await page.keyboard.press('f');
  await expect(page.locator('#lbFav')).toHaveClass(/on/);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('vdphoto_fav')).length)).toBe(1);
  await page.locator('#lbInfo').click();
  await expect(page.locator('#lbPanel')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#lightbox')).toBeHidden();
});

test('link ảnh #/p/<id> mở thẳng lightbox', async ({ page }) => {
  await open(page, '?demo=1', '#/p/root-1');
  await expect(page.locator('#lightbox')).toBeVisible();
  await expect(page.locator('#lbCount')).toContainText('ROOT_002');
});

test('link ảnh sai báo không tìm thấy', async ({ page }) => {
  await open(page, '?demo=1', '#/p/khong-co');
  await expect(page.locator('#toast')).toContainText('Không tìm thấy');
  await expect(page.locator('#lightbox')).toBeHidden();
});

test('tìm theo tên (có kết quả và không có kết quả)', async ({ page }) => {
  await open(page);
  await page.locator('#searchInput').fill('DALAT_00');
  await expect(page.locator('.gallery-item')).toHaveCount(9); // DALAT_001..009
  await page.locator('#searchInput').fill('ZZZ_không_có');
  await expect(page.locator('#view .empty-state')).toBeVisible();
});

test('chọn nhiều → tạo album ảo → mở → đổi tên → xoá', async ({ page }) => {
  await open(page);
  await page.locator('#selectBtn').click();
  await expect(page.locator('#selectBar')).toBeVisible();
  const items = page.locator('.gallery-item');
  await items.nth(0).click(); await items.nth(1).click();
  await expect(page.locator('#selCount')).toContainText('2');
  await page.locator('#selAlbum').click();
  await page.locator('#albumName').fill('Album thử');
  await page.locator('#albumOk').click();
  await expect(page.locator('#toast')).toContainText('Đã thêm vào album');
  const card = page.locator('.album-card.album-virtual', { hasText: 'Album thử' });
  await expect(card).toContainText('2 ảnh');
  await card.click();
  await expect(page).toHaveURL(/#\/v\//);
  await expect(page.locator('.gallery-item')).toHaveCount(2);
  page.once('dialog', (d) => d.accept('Đã đổi tên'));
  await page.getByRole('button', { name: 'Đổi tên' }).click();
  await expect(page.locator('#crumbs .cur')).toHaveText('Đã đổi tên');
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Xoá album' }).click();
  await expect(page).toHaveURL(/#\/$/);
  await expect(page.locator('.album-card.album-virtual')).toHaveCount(0);
});

test('tải zip (đường RAM): ra file zip hợp lệ chứa ảnh đã chọn', async ({ page }) => {
  await open(page, '?demo=1&nopicker=1');
  await page.locator('#selectBtn').click();
  await page.locator('.gallery-item').nth(0).click(); await page.locator('.gallery-item').nth(1).click();
  const [dl] = await Promise.all([page.waitForEvent('download'), page.locator('#selZip').click()]);
  expect(dl.suggestedFilename()).toBe('vietduong-photo.zip');
  const fs = await import('node:fs');
  const buf = fs.readFileSync(await dl.path());
  expect(buf.subarray(0, 2).toString()).toBe('PK');
  expect(buf.includes(Buffer.from('ROOT_003.JPG'))).toBe(true);
});

test('đổi ngôn ngữ và theme', async ({ page }) => {
  await open(page);
  await page.locator('#langBtn').click();
  await expect(page.locator('#langBtn')).toHaveText('EN');
  await expect(page.locator('.album-name').first()).toHaveText('All photos');
  expect(await page.evaluate(() => localStorage.getItem('vdphoto_lang'))).toBe('en');
  const before = await page.evaluate(() => document.documentElement.dataset.theme);
  await page.locator('#themeBtn').click();
  expect(await page.evaluate(() => document.documentElement.dataset.theme)).not.toBe(before);
});

test('nhiều ảnh (600): virtual recycling giữ số <img> thấp', async ({ page }) => {
  await open(page, '?demo=1&many=600', '#/all');
  for (let i = 0; i < 6; i++) { await page.mouse.wheel(0, 20000); await page.waitForTimeout(150); }
  const { cards, imgs } = await page.evaluate(() => ({ cards: document.querySelectorAll('.gallery-item').length, imgs: document.querySelectorAll('.gallery-item img').length }));
  expect(cards).toBeGreaterThan(300);
  expect(imgs).toBeLessThan(cards / 2);
});
