// Chia sẻ album công khai: người xem qua link (không đăng nhập) + hộp thoại tạo/thu hồi link của admin. Worker được giả bằng page.route.
import { test as base, expect } from '@playwright/test';

const test = base.extend({
  page: async ({ page }, use) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|ERR_/.test(m.text())) errors.push('console: ' + m.text()); });
    page.on('dialog', (d) => d.dismiss());
    await use(page);
    expect(errors).toEqual([]);
  },
});

const W = 'https://worker.test';
const TOKEN = 'ABCDEFGHIJKLMNOPQRSTUV';
const svg = (label) => `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800"><rect width="100%" height="100%" fill="#8a6"/><text x="50%" y="50%" font-size="80" text-anchor="middle">${label}</text></svg>`;
const FILES = [1, 2, 3].map((n) => ({ id: `SHAREFILE${n}0000`, name: `SHARED_00${n}.JPG`, ext: 'JPG', w: 1200, h: 800, time: Date.UTC(2025, 2, 20 + n), size: 1000 }));
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' };

// Worker giả cho người xem. opts.allowDownload / opts.gone. Ghi lại các request đã nhận.
async function mockViewerWorker(page, opts = {}) {
  const calls = [];
  await page.route((u) => u.origin === W, async (route) => {
    const req = route.request(); const u = new URL(req.url()); calls.push({ method: req.method(), path: u.pathname, auth: req.headers().authorization || null, body: req.postData() });
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    if (opts.gone) return route.fulfill({ status: 404, headers: CORS, contentType: 'application/json', body: '{"error":"gone"}' });
    if (u.pathname === `/share/${TOKEN}`) return route.fulfill({ status: 200, headers: CORS, contentType: 'application/json', body: JSON.stringify({ name: 'Chuyến đi thử', files: FILES, allowDownload: opts.allowDownload !== false, expires: Date.UTC(2030, 0, 15) }) });
    const m = /\/img\/(\w+)/.exec(u.pathname) || /\/dl\/(\w+)/.exec(u.pathname);
    if (m) return route.fulfill({ status: 200, headers: CORS, contentType: 'image/svg+xml', body: svg(m[1]) });
    return route.fulfill({ status: 404, headers: CORS, body: '' });
  });
  return calls;
}
const viewerUrl = (w = W) => `/?w=${encodeURIComponent(w)}#/s/${TOKEN}`;

test('người xem công khai: không đăng nhập, thấy tiêu đề + ảnh, không có nút quản trị', async ({ page }) => {
  await page.addInitScript(() => { localStorage.setItem('vd_photo_rt', 'SECRET-RT'); localStorage.setItem('vd_photo_access_token', 'SECRET-AT'); localStorage.setItem('vd_photo_token_expiry', String(Date.now() + 1e7)); });
  const calls = await mockViewerWorker(page);
  await page.goto(viewerUrl());
  await expect(page.locator('#pageTitle')).toHaveText('Chuyến đi thử');
  await expect(page.locator('#pageSub')).toContainText('3 ảnh');
  await expect(page.locator('#pageSub')).toContainText('hết hạn');
  await expect(page.locator('.gallery-item')).toHaveCount(3);
  await expect(page.locator('#loginScreen')).toBeHidden();
  for (const id of ['#loginBtn', '#logoutBtn', '#settingsBtn', '#selectBtn', '#bottomNav', '#selectBar']) await expect(page.locator(id)).toBeHidden();
  await expect(page.locator('.share-note')).toContainText('worker.test');
  // không gửi bất kỳ thông tin đăng nhập nào tới Worker
  expect(calls.length).toBeGreaterThan(1);
  for (const c of calls) { expect(c.auth).toBeNull(); expect(c.body || '').not.toContain('SECRET'); }
});

test('người xem: lightbox, ảnh gốc từ /dl khi link cho tải', async ({ page }) => {
  const calls = await mockViewerWorker(page, { allowDownload: true });
  await page.goto(viewerUrl());
  await expect(page.locator('.gallery-item').first()).toBeVisible();
  await page.locator('.gallery-item').first().click();
  await expect(page.locator('#lbQuality')).toHaveClass(/ready/);
  await expect(page.locator('#downloadBtn')).toBeVisible();
  expect(calls.some((c) => c.path.includes('/dl/'))).toBe(true);
  await page.keyboard.press('s'); // phím chọn ảnh bị vô hiệu ở chế độ công khai
  expect(await page.evaluate(() => window.__vd.selectMode)).toBe(false);
});

test('link chỉ xem: không có nút tải và không bao giờ gọi /dl', async ({ page }) => {
  const calls = await mockViewerWorker(page, { allowDownload: false });
  await page.goto(viewerUrl());
  await expect(page.locator('.gallery-item').first()).toBeVisible();
  await page.locator('.gallery-item').first().click();
  await expect(page.locator('#lightbox')).toBeVisible();
  await expect(page.locator('#downloadBtn')).toBeHidden();
  await expect(page.locator('#lbQuality')).toBeHidden();
  await page.waitForTimeout(600);
  expect(calls.some((c) => c.path.includes('/dl/'))).toBe(false);
});

test('link hết hạn / bị thu hồi: báo rõ, không lộ gì', async ({ page }) => {
  await mockViewerWorker(page, { gone: true });
  await page.goto(viewerUrl());
  await expect(page.locator('#errorMessage')).toBeVisible();
  await expect(page.locator('#errorText')).toContainText('không tồn tại hoặc đã hết hạn');
  await expect(page.locator('.gallery-item')).toHaveCount(0);
});

test('Worker không phải https (và không phải localhost) bị từ chối, không gọi ra ngoài', async ({ page }) => {
  const hits = [];
  await page.route((u) => u.hostname === 'evil.test', (route) => { hits.push(route.request().url()); return route.abort(); });
  await page.goto(viewerUrl('http://evil.test'));
  await page.waitForTimeout(500);
  expect(hits).toEqual([]);
  expect(await page.evaluate(() => document.body.classList.contains('public-share'))).toBe(false);
});

// ---------------------------------------------------------------- admin
async function mockAdminWorker(page) {
  const calls = []; const shares = [];
  await page.route((u) => u.origin === W, async (route) => {
    const req = route.request(); const u = new URL(req.url());
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    const body = JSON.parse(req.postData() || '{}'); calls.push({ path: u.pathname, body });
    const ok = (o) => route.fulfill({ status: 200, headers: CORS, contentType: 'application/json', body: JSON.stringify(o) });
    if (u.pathname === '/share/list') return ok({ shares });
    if (u.pathname === '/share/create') { shares.push({ token: TOKEN, expires: Date.now() + body.ttlDays * 864e5, allowDownload: body.allowDownload, createdAt: Date.now() }); return ok({ token: TOKEN, expires: shares[0].expires }); }
    if (u.pathname === '/share/revoke') { shares.length = 0; return ok({ ok: true }); }
    return route.fulfill({ status: 404, headers: CORS, body: '' });
  });
  return calls;
}
const withWorker = (page) => page.addInitScript(() => { localStorage.setItem('vd_photo_proxy', 'https://worker.test'); localStorage.setItem('vd_photo_rt', 'RTBLOB'); });

test('admin: tạo link cho thư mục (mặc định 30 ngày, cho tải), thấy trong danh sách, thu hồi', async ({ page }) => {
  await withWorker(page);
  const calls = await mockAdminWorker(page);
  await page.goto('/?demo=1#/f/f-dalat');
  await expect(page.locator('#pageTitle')).toHaveText('Đà Lạt 2025');
  await page.getByRole('button', { name: 'Chia sẻ công khai' }).click();
  await expect(page.locator('#shareModal')).toBeVisible();
  await expect(page.locator('#shareTtl')).toHaveValue('30');
  await expect(page.locator('#shareDl')).toBeChecked();
  await expect(page.locator('.share-none')).toBeVisible();                      // chưa có link nào
  await page.locator('#shareCreate').click();
  await expect(page.locator('#shareUrl')).toHaveValue(new RegExp(`\\?w=${encodeURIComponent(W).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}#/s/${TOKEN}$`));
  const create = calls.find((c) => c.path === '/share/create').body;
  expect(create).toMatchObject({ rt: 'RTBLOB', albumId: 'f:f-dalat', name: 'Đà Lạt 2025', ttlDays: 30, allowDownload: true });
  expect(create.files.length).toBe(14);
  expect(create.files[0]).toHaveProperty('id'); expect(create.files[0]).not.toHaveProperty('dl');
  await expect(page.locator('#shareItems li')).toHaveCount(1);
  await expect(page.locator('#shareItems li').first()).toContainText('cho tải');
  await page.getByRole('button', { name: 'Thu hồi' }).click();
  await expect(page.locator('.share-none')).toBeVisible();
  expect(calls.some((c) => c.path === '/share/revoke' && c.body.token === TOKEN)).toBe(true);
});

test('admin: tạo link chỉ xem, hạn 7 ngày, cho album ảo', async ({ page }) => {
  await withWorker(page);
  const calls = await mockAdminWorker(page);
  await page.goto('/?demo=1');
  await expect(page.locator('.gallery-item').first()).toBeVisible();
  await page.locator('#selectBtn').click();
  await page.locator('.gallery-item').nth(0).click(); await page.locator('.gallery-item').nth(1).click();
  await page.locator('#selAlbum').click(); await page.locator('#albumName').fill('Album chia sẻ'); await page.locator('#albumOk').click();
  await page.locator('.album-card.album-virtual', { hasText: 'Album chia sẻ' }).click();
  await page.getByRole('button', { name: 'Chia sẻ công khai' }).click();
  await page.locator('#shareTtl').selectOption('7');
  await page.locator('#shareDl').uncheck();
  await page.locator('#shareCreate').click();
  await expect(page.locator('#shareResult')).toBeVisible();
  const create = calls.find((c) => c.path === '/share/create').body;
  expect(create).toMatchObject({ ttlDays: 7, allowDownload: false, name: 'Album chia sẻ' });
  expect(create.albumId).toMatch(/^v:va/); expect(create.files.length).toBe(2);
  await expect(page.locator('#shareItems li').first()).toContainText('chỉ xem');
});

test('admin chưa bật Worker: hộp thoại hướng dẫn, không có nút tạo', async ({ page }) => {
  await page.goto('/?demo=1#/f/f-dalat');
  await page.getByRole('button', { name: 'Chia sẻ công khai' }).click();
  await expect(page.locator('#shareNote')).toContainText('Cần bật Worker');
  await expect(page.locator('#shareCreate')).toBeHidden();
});

test('khách (không phải admin) không thấy nút chia sẻ', async ({ page }) => {
  await page.goto('/?demo=1&guest=1#/f/f-dalat');
  await expect(page.locator('#pageTitle')).toHaveText('Đà Lạt 2025');
  await expect(page.getByRole('button', { name: 'Chia sẻ công khai' })).toHaveCount(0);
});
