// Tiết kiệm bộ nhớ trên điện thoại (iOS Safari bỏ bớt ảnh khi thiếu RAM → ô trống/mờ khi cuộn).
import { test, expect } from '@playwright/test';

const COUNT = () => ({ imgs: document.querySelectorAll('.gallery-item img').length, cards: document.querySelectorAll('.gallery-item').length });
const scrollAll = async (page) => { for (let i = 0; i < 8; i++) { await page.mouse.wheel(0, 20000); await page.waitForTimeout(120); } };
// Gọi setThumb thật với một ảnh Drive giả để xem các kích thước thumbnail được xin
const srcsetOf = (page) => page.evaluate(async () => {
  const { setThumb } = await import('/gallery.js'); const img = document.createElement('img');
  setThumb(img, { id: 'x', tb: 'https://img.test/abc' }); return img.getAttribute('srcset');
});

test.describe('màn hình cảm ứng', () => {
  test.use({ viewport: { width: 430, height: 932 }, hasTouch: true, isMobile: true });

  test('lưới ảnh chỉ xin thumbnail 400/600px (không 800/1200px)', async ({ page }) => {
    await page.goto('/?demo=1');
    await expect(page.locator('.gallery-item').first()).toBeVisible();
    const s = await srcsetOf(page);
    expect(s).toContain('=s400 400w'); expect(s).toContain('=s600 600w');
    expect(s).not.toContain('800w'); expect(s).not.toContain('1200w');
  });

  test('giữ ít <img> quanh màn hình (phạm vi 1000px) và nhả ảnh khi gỡ thẻ', async ({ page }) => {
    await page.goto('/?demo=1&many=600#/all');
    await expect(page.locator('.gallery-item img').first()).toBeAttached();
    await scrollAll(page);
    const n = await page.evaluate(COUNT);
    expect(n.cards).toBeGreaterThan(300);
    expect(n.imgs).toBeLessThan(40);
    // thẻ đã gỡ không còn <img> nào tham chiếu ảnh
    expect(await page.evaluate(() => [...document.querySelectorAll('.gallery-item')].filter((c) => !c.querySelector('img') && c.querySelector('[src]')).length)).toBe(0);
  });

  test('bộ nhớ đệm ảnh gốc chỉ giữ 1 ảnh', async ({ page }) => {
    await page.goto('/?demo=1');
    await expect(page.locator('.gallery-item').first()).toBeVisible();
    await page.locator('.gallery-item').first().click();
    for (let i = 0; i < 3; i++) {
      await page.locator('#downloadBtn').click();            // điện thoại: tải ảnh gốc khi bấm Tải ảnh
      await expect(page.locator('#lbQuality')).toHaveClass(/ready/);
      expect(await page.evaluate(() => window.__lb.cache.size)).toBeLessThanOrEqual(1);
      if (i < 2) await page.locator('#lbNext').click();
    }
  });
});

test('desktop: thumbnail tới 1200px, phạm vi giữ ảnh rộng hơn, cache nhiều ảnh gốc hơn', async ({ page }) => {
  await page.goto('/?demo=1&many=600#/all');
  await expect(page.locator('.gallery-item img').first()).toBeAttached();
  expect(await srcsetOf(page)).toContain('1200w');
  await scrollAll(page);
  const n = await page.evaluate(COUNT);
  expect(n.cards).toBeGreaterThan(300);
  expect(n.imgs).toBeGreaterThan(40);                      // rộng hơn điện thoại
  expect(n.imgs).toBeLessThan(n.cards / 2);
  await page.goto('/?demo=1');
  await expect(page.locator('.gallery-item').first()).toBeVisible();
  await page.locator('.gallery-item').first().click();
  for (let i = 0; i < 3; i++) { await expect(page.locator('#lbQuality')).toHaveClass(/ready/); if (i < 2) await page.locator('#lbNext').click(); }
  expect(await page.evaluate(() => window.__lb.cache.size)).toBe(3);
});
