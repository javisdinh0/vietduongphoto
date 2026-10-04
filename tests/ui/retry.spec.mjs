// Bản xem trước nét (1000px / bản lớn) bị lỗi hoặc bị giới hạn tốc độ: thử lại có lùi dần, rồi cho người dùng chạm để thử lại.
import { test, expect } from '@playwright/test';

const IMG = 'https://img.test';
const svg = (t) => `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400"><rect width="100%" height="100%" fill="#69a"/><text x="50%" y="50%" font-size="40" text-anchor="middle">${t}</text></svg>`;

// Ảnh demo thành ảnh "Drive thật" (có tb); bỏ <img> trong lưới. rule(url) -> true: trả ảnh, false: lỗi 429.
async function setup(page, rule, log) {
  await page.route((u) => u.origin === IMG, (route) => {
    const url = route.request().url(); log && log.push(url);
    return rule(url) ? route.fulfill({ status: 200, contentType: 'image/svg+xml', body: svg(url.split('/').pop()) }) : route.fulfill({ status: 429, body: 'slow down' });
  });
  await page.goto('/?demo=1#/f/f-dalat');
  await expect(page.locator('.gallery-item').first()).toBeVisible();
  await page.evaluate((base) => {
    window.__vd.photos.forEach((p) => { p.tb = `${base}/${p.id}`; p.thumbRaw = ''; });
    window.__vd.backend.drive.thumbs = async () => ({});            // không có link mới: chỉ còn thử lại
    document.querySelectorAll('.gallery-item img').forEach((i) => i.remove());
  }, IMG);
}

test('bản 1000px lỗi 2 lần (429) rồi thành công: tự thử lại có lùi dần và hiện ảnh nét', async ({ page }) => {
  let fails = 2; const log = [];
  await setup(page, (u) => !(u.endsWith('=s1000') && fails-- > 0), log);
  await page.locator('.gallery-item').first().click();
  await expect.poll(() => log.some((u) => u.endsWith('=s2000')), { timeout: 10000 }).toBe(true);   // bước 1000px xong mới sang bản lớn
  expect(log.filter((u) => u.endsWith('=s1000')).length).toBe(3);   // 2 lần lỗi + 1 lần thành công
  await expect(page.locator('#lbQuality')).toHaveClass(/ready/);     // cuối cùng ảnh gốc về bình thường
  await expect(page.locator('#lbQuality')).not.toHaveClass(/manual/);
});

test('lỗi liên tục: hiện "chạm để thử lại", chạm thì tải lại và hiện ảnh nét', async ({ page }) => {
  let ok = false; const log = [];
  await setup(page, (u) => ok || !/=s(1000|2000)$/.test(u), log);
  await page.locator('.gallery-item').first().click();
  const pill = page.locator('#lbQuality');
  await expect(pill).toHaveClass(/manual/, { timeout: 12000 });
  await expect(pill).toContainText('thử lại');
  expect(log.filter((u) => u.endsWith('=s1000')).length).toBe(4);   // 1 lần đầu + 3 lần thử lại
  ok = true;
  await pill.click();
  // chạm → bước 1000px thành công → chuỗi chạy tiếp sang bản lớn (chỉ xảy ra sau khi 1000px về được); không dựa vào src tạm thời vì ảnh gốc về rất nhanh
  await expect.poll(() => log.some((u) => u.endsWith('=s2000')), { timeout: 8000 }).toBe(true);
  await expect(pill).not.toContainText('thử lại');
});

test('chuyển sang ảnh khác khi đang thử lại thì huỷ lượt thử cũ', async ({ page }) => {
  const log = [];
  await setup(page, (u) => !/=s1000$/.test(u) || u.includes('NOPE'), log);   // mọi bản 1000px đều lỗi
  await page.locator('.gallery-item').first().click();
  await expect.poll(() => log.filter((u) => u.endsWith('=s1000')).length).toBeGreaterThanOrEqual(1);
  await page.locator('#lbNext').click();
  const ids = await page.evaluate(() => window.__vd.visible.map((p) => p.id));
  await page.waitForTimeout(3500);                                           // quá thời gian thử lại của ảnh đầu (0,8s + 1,6s)
  const first = log.filter((u) => u.endsWith(`${ids[0]}=s1000`)).length;
  expect(first).toBeLessThanOrEqual(1);                                      // ảnh đầu không bị thử lại sau khi đã rời đi
});
