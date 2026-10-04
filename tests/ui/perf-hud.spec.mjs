// Bảng đo hiệu năng ?perf=1: bật/tắt/nhớ, báo cáo có số thật khi cuộn / mở lightbox / zoom, sao chép, đặt lại, không che thanh dưới.
import { test, expect } from '@playwright/test';

const open = async (page, qs = '?demo=1&perf=1') => { await page.goto('/' + qs); await expect(page.locator('.album-card, .gallery-item').first()).toBeVisible(); };
// bấm "Cập nhật" rồi CHỜ bảng làm mới xong (dataset.ts đổi) mới đọc, tránh đọc số liệu cũ
const report = async (page) => {
  const panel = page.locator('#perfPanel'); if (await panel.evaluate((e) => e.classList.contains('perf-hidden'))) await page.locator('#perfPill').click();
  const ts = await page.locator('#perfText').evaluate((e) => e.dataset.ts || '');
  await page.getByRole('button', { name: 'Cập nhật' }).click();
  await page.waitForFunction((t) => (document.getElementById('perfText').dataset.ts || '') !== t, ts);
  return page.locator('#perfText').textContent();
};
const num = (text, re) => { const m = re.exec(text); return m ? +m[1] : null; };

test('không bật thì không có bảng, không nạp perf.js (không tốn gì với người dùng thường)', async ({ page }) => {
  const reqs = []; page.on('request', (r) => reqs.push(r.url()));
  await open(page, '/?demo=1'.slice(1));
  await page.waitForTimeout(400);
  await expect(page.locator('#perfHud')).toHaveCount(0);
  expect(reqs.some((u) => u.endsWith('/perf.js'))).toBe(false);
  expect(await page.evaluate(() => localStorage.getItem('vd_perf'))).toBeNull();
});

test('?perf=1 bật bảng, nhớ qua lần tải sau; ?perf=0 tắt', async ({ page }) => {
  await open(page);
  await expect(page.locator('#perfPill')).toBeVisible();
  await expect(page.locator('#perfPill')).toContainText(/fps/);
  expect(await page.evaluate(() => localStorage.getItem('vd_perf'))).toBe('1');
  await open(page, '?demo=1');                                       // không cần ?perf=1 nữa
  await expect(page.locator('#perfPill')).toBeVisible();
  await open(page, '?demo=1&perf=0');
  await expect(page.locator('#perfHud')).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('vd_perf'))).toBeNull();
});

test('báo cáo có số thật: khởi động, khung hình, thẻ ảnh; thêm hàng khi cuộn', async ({ page }) => {
  await open(page, '?demo=1&many=200&perf=1#/all');
  for (let i = 0; i < 12; i++) { await page.mouse.wheel(0, 2500); await page.waitForTimeout(60); }
  const t = await report(page);
  expect(t).toContain('báo cáo hiệu năng'); expect(t).toContain('Máy:'); expect(t).toContain('Khởi động:');
  expect(num(t, /trang chủ hiện lúc (\d+) ms/)).toBeGreaterThan(0);                          // first-route đã được đánh dấu
  expect(num(t, /thư viện sẵn lúc (\d+) ms/)).toBeGreaterThan(0);
  expect(num(t, /Khung hình \(trung vị \d+ ms ≈ \d+ Hz\): (\d+) khung/)).toBeGreaterThan(10);
  expect(num(t, /khi cuộn: (\d+) khung/)).toBeGreaterThan(0);                                // khung trong lúc cuộn được tách riêng
  expect(num(t, /dựng thẻ (\d+) lần/)).toBeGreaterThan(0); expect(num(t, /gỡ (\d+) lần/)).toBeGreaterThan(0);
  expect(num(t, /thêm hàng ảnh p50 \d+ ms \(max \d+, (\d+) lần, (\d+) hàng\)/)).toBeGreaterThan(0);
  expect(num(t, /(\d+) module/)).toBeGreaterThanOrEqual(20);
  expect(num(t, /DOM (\d+) nút/)).toBeGreaterThan(100);
  expect(t).not.toMatch(/NaN|undefined|Infinity/);
});

test('lightbox: ghi xem trước, 1000px, bản lớn, ảnh gốc theo từng lượt xem', async ({ page }) => {
  await open(page);
  await page.locator('.album-card').first().click();
  await expect(page.locator('.gallery-item').first()).toBeVisible();
  await page.locator('.gallery-item').first().click();
  await expect(page.locator('#lbQuality')).toHaveClass(/ready/);
  const t = await report(page);
  expect(t).toContain('Lightbox (1 lượt xem)');
  expect(num(t, /1000px p50 \d+ \(n=(\d+)\)/)).toBeGreaterThanOrEqual(0);
  expect(num(t, /ảnh gốc p50 \d+ ms, max \d+ \(n=(\d+),/)).toBe(1);                         // ảnh gốc đã tải một lần
  await page.locator('#lbNext').click();
  await expect(page.locator('#lbQuality')).toHaveClass(/ready/);
  expect(await report(page)).toContain('Lightbox (2 lượt xem)');
});

test('"Sao chép" đưa báo cáo + JSON vào clipboard; "Đặt lại" xoá số liệu; "Tắt đo" gỡ bảng', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await open(page);
  await page.locator('#perfPill').click();
  await page.getByRole('button', { name: 'Sao chép' }).click();
  await expect(page.locator('#perfPill')).toContainText('đã chép');
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  expect(clip).toContain('báo cáo hiệu năng'); expect(clip).toContain('"frames":{"all":{"n":'); expect(() => JSON.parse(clip.slice(clip.indexOf('{"when"')))).not.toThrow();
  // đặt lại
  await page.locator('.album-card').first().click(); await expect(page.locator('.gallery-item').first()).toBeVisible();
  await page.locator('.gallery-item').first().click(); await expect(page.locator('#lbQuality')).toHaveClass(/ready/);
  expect(await report(page)).toContain('Lightbox (1 lượt xem)');
  const ts = await page.locator('#perfText').evaluate((e) => e.dataset.ts);
  await page.getByRole('button', { name: 'Đặt lại' }).click();
  await page.waitForFunction((t) => document.getElementById('perfText').dataset.ts !== t, ts);
  expect(await page.locator('#perfText').textContent()).toContain('Lightbox (0 lượt xem)');
  await page.getByRole('button', { name: 'Tắt đo' }).click();
  await expect(page.locator('#perfHud')).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('vd_perf'))).toBeNull();
});

test.describe('điện thoại', () => {
  test.use({ viewport: { width: 430, height: 800 }, hasTouch: true, isMobile: true });

  test('bảng nằm trong màn hình, không che thanh điều hướng dưới và không chặn chạm vào album', async ({ page }) => {
    await open(page);
    const r = await page.evaluate(() => { const p = document.getElementById('perfPill').getBoundingClientRect(); const n = document.getElementById('bottomNav').getBoundingClientRect(); return { pl: p.left, pr: p.right, pb: p.bottom, nt: n.top, vw: innerWidth }; });
    expect(r.pl).toBeGreaterThanOrEqual(0); expect(r.pr).toBeLessThanOrEqual(r.vw); expect(r.pb).toBeLessThanOrEqual(r.nt + 1);
    await page.locator('#perfPill').click();                                                  // mở bảng rồi vẫn trong màn hình
    const pb = await page.evaluate(() => { const b = document.getElementById('perfPanel').getBoundingClientRect(); return { l: b.left, r: b.right, t: b.top }; });
    expect(pb.l).toBeGreaterThanOrEqual(0); expect(pb.r).toBeLessThanOrEqual(r.vw); expect(pb.t).toBeGreaterThanOrEqual(0);
    await page.getByRole('button', { name: 'Thu gọn' }).click();
    await page.locator('.album-card').first().click();
    await expect(page.locator('#pageTitle')).toBeVisible();                                    // chạm album vẫn hoạt động
  });

  test('zoom/kéo ảnh bằng 2 ngón được tính vào nhóm "khi zoom/kéo ảnh"', async ({ page }) => {
    await open(page);
    await page.locator('.album-card').first().click(); await expect(page.locator('.gallery-item').first()).toBeVisible();
    await page.locator('.gallery-item').first().click();
    await expect.poll(() => page.locator('#lightboxImg').evaluate((e) => e.complete && e.naturalWidth > 0)).toBe(true);
    const cdp = await page.context().newCDPSession(page);
    const c = await page.evaluate(() => { const r = document.getElementById('lightboxImg').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    const send = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((p, i) => ({ x: p.x, y: p.y, id: i })) });
    await send('touchStart', [{ x: c.x - 40, y: c.y }, { x: c.x + 40, y: c.y }]);
    for (let i = 1; i <= 12; i++) { await send('touchMove', [{ x: c.x - 40 - 8 * i, y: c.y }, { x: c.x + 40 + 8 * i, y: c.y }]); await page.waitForTimeout(40); }
    const during = await report(page);                                                         // đang chạm: khung hình tính vào nhóm zoom/kéo
    await send('touchEnd', [{ x: c.x - 136, y: c.y }, { x: c.x + 136, y: c.y }]);
    expect(num(during, /khi zoom\/kéo ảnh: (\d+) khung/)).toBeGreaterThan(0);
  });
});
