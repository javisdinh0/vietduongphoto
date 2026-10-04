// Chuyển ảnh bằng mũi tên: ảnh xem trước phải luôn hiện, kể cả lướt nhanh / link thumbnail hết hạn.
import { test, expect } from '@playwright/test';

const IMG = 'https://img.test';
const svg = (t) => `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400"><rect width="100%" height="100%" fill="#69a"/><text x="50%" y="50%" font-size="40" text-anchor="middle">${t}</text></svg>`;

// Biến ảnh demo thành ảnh "Drive thật" (có tb) và bỏ <img> trong lưới để xem trước phải tải theo URL thật.
async function setup(page, { ok = true, onReq } = {}) {
  await page.route((u) => u.origin === IMG, (route) => {
    const url = route.request().url(); onReq && onReq(url);
    return ok(url) ? route.fulfill({ status: 200, contentType: 'image/svg+xml', headers: { 'access-control-allow-origin': '*' }, body: svg(url.split('/').pop()) }) : route.abort();
  });
  await page.goto('/?demo=1#/f/f-dalat');
  await expect(page.locator('.gallery-item').first()).toBeVisible();
  await page.evaluate((base) => {
    window.__vd.photos.forEach((p) => { p.tb = `${base}/${p.id}`; p.thumbRaw = ''; });
    document.querySelectorAll('.gallery-item img').forEach((i) => i.remove());
  }, IMG);
}
const loaded = (page) => expect.poll(() => page.locator('#lightboxImg').evaluate((e) => e.complete && e.naturalWidth > 0)).toBe(true);

test('lướt nhanh bằng mũi tên: chỉ tải bản lớn cho ảnh dừng lại, ảnh hiện tại luôn có xem trước', async ({ page }) => {
  const reqs = [];
  await setup(page, { ok: () => true, onReq: (u) => reqs.push(u) });
  await page.locator('.gallery-item').first().click();
  await loaded(page);
  reqs.length = 0;
  for (let i = 0; i < 8; i++) await page.keyboard.press('ArrowRight');   // lướt nhanh, không dừng
  await expect(page.locator('#lbCount')).toContainText('9 / 14');
  await loaded(page);
  await page.waitForTimeout(700);
  const big = reqs.filter((u) => /=s2000$/.test(u));
  expect(big.length).toBeLessThanOrEqual(2);                             // trước đây mỗi bước một yêu cầu bản lớn
  const ids = await page.evaluate(() => window.__vd.visible.map((p) => p.id));
  expect(reqs.some((u) => u.endsWith(`${ids[8]}=s600`))).toBe(true);     // ảnh hiện tại có bản 600px
  expect(reqs.some((u) => u.endsWith(`${ids[11]}=s600`))).toBe(true);    // lân cận +3 đã tải sẵn
});

test('ảnh lân cận ±3 được tải sẵn bản 600px ngay khi mở ảnh', async ({ page }) => {
  const reqs = [];
  await setup(page, { ok: () => true, onReq: (u) => reqs.push(u) });
  await page.locator('.gallery-item').nth(4).click();
  await loaded(page);
  await page.waitForTimeout(300);
  const ids = await page.evaluate(() => window.__vd.visible.map((p) => p.id));
  for (const d of [1, 2, 3, -1, -2, -3]) expect(reqs.some((u) => u.endsWith(`${ids[4 + d]}=s600`)), `lân cận ${d}`).toBe(true);
});

test('link thumbnail hết hạn: xin link mới một lần rồi hiện ảnh', async ({ page }) => {
  await setup(page, { ok: (u) => !u.includes('/stale/') && !u.includes(`${IMG}/f-dalat`) });   // link gốc (img.test/f-dalat-*) hỏng
  await page.evaluate((base) => {
    window.__n = 0;
    window.__vd.backend.drive.thumbs = async (ids) => { window.__n++; return Object.fromEntries(ids.map((id) => [id, `${base}/fresh/${id}=s220`])); };
  }, IMG);
  await page.locator('.gallery-item').first().click();
  await expect.poll(() => page.locator('#lightboxImg').getAttribute('src')).toContain('/fresh/');
  await loaded(page);
  expect(await page.evaluate(() => window.__n)).toBe(1);                 // đúng một lần xin link mới
});

test('thumbnail lỗi tạm thời (giới hạn tốc độ): thử lại sau và hiện ảnh', async ({ page }) => {
  let fails = 2;
  await setup(page, { ok: (u) => (u.endsWith('=s600') && fails-- > 0 ? false : true) });
  await page.evaluate(() => { window.__vd.backend.drive.thumbs = async () => ({}); });   // không có link mới → chỉ có thử lại
  await page.locator('.gallery-item').first().click();
  await loaded(page);                                                    // sau ~1,5s ảnh 600px (hoặc bản lớn) cũng đã hiện
});
