// Tối ưu tải trang: mỗi thẻ ảnh một yêu cầu (không còn ảnh mờ 32px), ảnh bìa đầu trang tải ngay, module tải song song.
import { test, expect } from '@playwright/test';

const IMG = 'https://img.test';
const svg = (t) => `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400"><rect width="100%" height="100%" fill="#69a"/><text x="50%" y="50%" font-size="40" text-anchor="middle">${t}</text></svg>`;

test('thẻ ảnh trong lưới chỉ xin một ảnh (không có yêu cầu 32px)', async ({ page }) => {
  const reqs = [];
  await page.route((u) => u.origin === IMG, (route) => { reqs.push(route.request().url()); return route.fulfill({ status: 200, contentType: 'image/svg+xml', body: svg('x') }); });
  await page.goto('/?demo=1');
  await expect(page.locator('.gallery-item').first()).toBeVisible();
  await page.evaluate((base) => { window.__vd.photos.forEach((p) => { p.tb = `${base}/${p.id}`; p.thumbRaw = ''; }); location.hash = '#/fav'; }, IMG);
  await page.evaluate(() => { location.hash = '#/f/f-dalat'; });          // dựng lại các thẻ với ảnh "Drive thật"
  await expect.poll(() => reqs.length).toBeGreaterThan(5);
  await page.waitForTimeout(400);
  expect(reqs.filter((u) => u.endsWith('=s32')).length).toBe(0);
  const perPhoto = new Map(); for (const u of reqs) { const id = u.split('/').pop().split('=')[0]; perPhoto.set(id, (perPhoto.get(id) || 0) + 1); }
  expect(Math.max(...perPhoto.values())).toBeLessThanOrEqual(2);          // tối đa xem trước + (có thể) tải lại, không phải gấp đôi theo thiết kế
  expect(await page.evaluate(() => [...document.querySelectorAll('.gallery-item')].filter((c) => c.style.backgroundImage).length)).toBe(0);
});

test('ảnh bìa 4 album đầu tải ngay (eager), 2 ảnh đầu ưu tiên cao', async ({ page }) => {
  await page.goto('/?demo=1');
  await expect(page.locator('.album-card').first()).toBeVisible();
  const a = await page.evaluate(() => [...document.querySelectorAll('.album-cover img')].map((i) => ({ l: i.getAttribute('loading'), p: i.getAttribute('fetchpriority') })));
  expect(a.length).toBeGreaterThanOrEqual(4);
  for (let i = 0; i < 4; i++) expect(a[i].l, `bìa ${i}`).toBe('eager');
  expect(a[0].p).toBe('high'); expect(a[1].p).toBe('high'); expect(a[2].p).toBeNull();
});

test('index.html có modulepreload và trình duyệt lấy module qua preload (không chờ chuỗi import)', async ({ page }) => {
  const order = [];
  page.on('request', (r) => { const u = new URL(r.url()); if (u.pathname.endsWith('.js') && u.origin === new URL(page.url() === 'about:blank' ? 'http://localhost:8123' : page.url()).origin) order.push(u.pathname.split('/').pop()); });
  await page.goto('/?demo=1');
  await expect(page.locator('.album-card').first()).toBeVisible();
  const preloads = await page.evaluate(() => [...document.querySelectorAll('link[rel=modulepreload]')].map((l) => l.getAttribute('href')));
  expect(preloads.length).toBeGreaterThanOrEqual(20);
  expect(new Set(order).size).toBe(order.length);                          // mỗi module chỉ tải một lần (preload dùng chung với import)
});
