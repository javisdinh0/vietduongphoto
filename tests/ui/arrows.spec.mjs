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
  expect(reqs.some((u) => u.endsWith(`${ids[10]}=s600`))).toBe(true);    // lân cận +2 đã tải sẵn
});

test('ảnh lân cận ±2 được tải sẵn bản 600px ngay khi mở ảnh', async ({ page }) => {
  const reqs = [];
  await setup(page, { ok: () => true, onReq: (u) => reqs.push(u) });
  await page.locator('.gallery-item').nth(4).click();
  await loaded(page);
  await page.waitForTimeout(300);
  const ids = await page.evaluate(() => window.__vd.visible.map((p) => p.id));
  for (const d of [1, 2, -1, -2]) expect(reqs.some((u) => u.endsWith(`${ids[4 + d]}=s600`)), `lân cận ${d}`).toBe(true);
});

test('link thumbnail hết hạn: xin link mới một lần rồi hiện ảnh', async ({ page }) => {
  const reqs = [];
  await setup(page, { ok: (u) => !u.includes('/stale/') && !u.includes(`${IMG}/f-dalat`), onReq: (u) => reqs.push(u) });   // link gốc (img.test/f-dalat-*) hỏng
  await page.evaluate((base) => {
    window.__n = 0;
    window.__vd.backend.drive.thumbs = async (ids) => { window.__n++; return Object.fromEntries(ids.map((id) => [id, `${base}/fresh/${id}=s220`])); };
  }, IMG);
  await page.locator('.gallery-item').first().click();
  await expect.poll(() => reqs.some((u) => u.includes('/fresh/') && u.endsWith('=s600'))).toBe(true);   // dùng link mới để tải lại ảnh xem trước (không dựa vào src tạm thời)
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

test('ba bước: 600px → 1000px → bản lớn, đúng thứ tự', async ({ page }) => {
  const reqs = [];
  await setup(page, { ok: () => true, onReq: (u) => reqs.push(u) });
  await page.locator('.gallery-item').first().click();
  await loaded(page);
  await expect.poll(() => reqs.some((u) => /=s2000$/.test(u))).toBe(true);
  const id = await page.evaluate(() => window.__vd.visible[0].id);
  const at = (s) => reqs.findIndex((u) => u.endsWith(`${id}=s${s}`));
  expect(at(600)).toBeGreaterThanOrEqual(0);
  expect(at(1000)).toBeGreaterThan(at(600));
  expect(at(2000)).toBeGreaterThan(at(1000));
  // bước 1000px thật sự hiện ra (ảnh nét hơn bản 600px) trước khi có ảnh gốc
  await expect.poll(() => page.locator('#lightboxImg').getAttribute('src')).toMatch(/s(1000|2000)$|^blob:/);
});

test('đi tới rồi lui: không tải lại ảnh lân cận đã có', async ({ page }) => {
  const reqs = [];
  await setup(page, { ok: () => true, onReq: (u) => reqs.push(u) });
  await page.locator('.gallery-item').nth(3).click();
  await loaded(page);
  await page.waitForTimeout(300);
  const ids = await page.evaluate(() => window.__vd.visible.map((p) => p.id));
  const count = (id) => reqs.filter((u) => u.endsWith(`${id}=s600`)).length;
  await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowLeft'); await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowLeft');
  await page.waitForTimeout(500);
  expect(count(ids[4])).toBeLessThanOrEqual(2);   // ảnh +1: tải sẵn một lần; lần xem trực tiếp có thể thêm một lần, không lặp theo số lần bấm
  expect(count(ids[5])).toBeLessThanOrEqual(1);   // ảnh +2: chỉ tải sẵn một lần dù bấm qua lại
});
