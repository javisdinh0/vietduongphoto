// Cuộn mượt ở cuối album (iOS giật khi kéo kịch đáy): không làm mờ nền dưới header, thẻ ảnh không bị dựng/gỡ liên tục ở biên.
import { test, expect } from '@playwright/test';

test.use({ viewport: { width: 430, height: 932 }, hasTouch: true, isMobile: true });

test('header dính đầu trang không dùng backdrop-filter', async ({ page }) => {
  await page.goto('/?demo=1');
  await expect(page.locator('header')).toBeVisible();
  const f = await page.evaluate(() => { const c = getComputedStyle(document.querySelector('header')); return { b: c.backdropFilter || c.webkitBackdropFilter || 'none', p: c.position }; });
  expect(f.b).toBe('none'); expect(f.p).toBe('sticky');
});

test('kéo qua lại ở cuối album: ít thẻ bị dựng/gỡ lại (có độ trễ ở biên)', async ({ page }) => {
  await page.goto('/?demo=1&many=600#/f/f-dalat');
  await page.waitForSelector('.gallery-item');
  let last = 0;
  for (let i = 0; i < 400; i++) {
    await page.mouse.wheel(0, 1500); await page.waitForTimeout(40);
    const h = await page.evaluate(() => (scrollY + innerHeight >= document.documentElement.scrollHeight - 4 ? document.documentElement.scrollHeight : 0));
    if (h && h === last) break; last = h;
  }
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => scrollY + innerHeight >= document.documentElement.scrollHeight - 4)).toBe(true);
  await page.evaluate(() => {
    window.__m = { add: 0, rem: 0 };
    const has = (n) => n.nodeType === 1 && (n.tagName === 'IMG' || !!n.querySelector?.('img'));
    new MutationObserver((ml) => ml.forEach((m) => { m.addedNodes.forEach((n) => { if (has(n)) window.__m.add++; }); m.removedNodes.forEach((n) => { if (has(n)) window.__m.rem++; }); })).observe(document.getElementById('view'), { subtree: true, childList: true });
  });
  for (let i = 0; i < 30; i++) { await page.mouse.wheel(0, i % 2 ? 250 : -250); await page.waitForTimeout(60); }
  const m = await page.evaluate(() => window.__m);
  expect(m.add + m.rem).toBeLessThanOrEqual(10);        // trước đây 60 + 60 cho cùng thao tác
});

test('vẫn gỡ thẻ ở xa để nhẹ bộ nhớ (số <img> không phình)', async ({ page }) => {
  await page.goto('/?demo=1&many=600#/all');
  await page.waitForSelector('.gallery-item');
  for (let i = 0; i < 60; i++) { await page.mouse.wheel(0, 3000); await page.waitForTimeout(50); }
  const n = await page.evaluate(() => ({ imgs: document.querySelectorAll('.gallery-item img').length, cards: document.querySelectorAll('.gallery-item').length }));
  expect(n.cards).toBeGreaterThan(300);
  expect(n.imgs).toBeLessThan(45);
});
