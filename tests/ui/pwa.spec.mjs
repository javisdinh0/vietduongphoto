// Service worker THẬT trong Chromium: mở lại khi mất mạng, thanh "Có bản mới", luồng cập nhật đầy đủ, công tắc tắt khẩn cấp (?nosw=1).
// Dùng một máy chủ tĩnh riêng (cổng ngẫu nhiên) để có thể đổi nội dung file giữa chừng và mô phỏng một lần deploy.
import { test, expect } from '@playwright/test';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

test.use({ serviceWorkers: 'allow' });
const ROOT = path.resolve(import.meta.dirname, '..', '..');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.json': 'application/json' };
let server; let base; const overrides = new Map(); let hits = [];

test.beforeAll(async () => {
  server = http.createServer((req, res) => {
    const p = decodeURIComponent(new URL(req.url, 'http://x').pathname); const rel = p === '/' ? 'index.html' : p.replace(/^\//, '');
    hits.push(rel);
    const file = path.join(ROOT, rel); if (!file.startsWith(ROOT)) { res.writeHead(403).end(); return; }
    const body = overrides.has(rel) ? Buffer.from(overrides.get(rel)) : (fs.existsSync(file) && fs.statSync(file).isFile() ? fs.readFileSync(file) : null);
    if (!body) { res.writeHead(404).end('nf'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(rel)] || 'application/octet-stream', 'Cache-Control': 'no-cache' }).end(body);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r)); base = `http://localhost:${server.address().port}`;
});
test.afterAll(() => new Promise((r) => server.close(r)));
test.beforeEach(() => { overrides.clear(); hits = []; });

const controlled = (page) => page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 15000 });
const shellCaches = (page) => page.evaluate(async () => { const out = {}; for (const k of await caches.keys()) if (k.startsWith('vdphoto-shell-')) out[k] = (await (await caches.open(k)).keys()).length; return out; });

test('lần đầu: SW lưu sẵn đủ khung ứng dụng; mất mạng vẫn mở lại được trang', async ({ page, context }) => {
  await page.goto(`${base}/?demo=1&sw=1`);
  await expect(page.locator('.album-card').first()).toBeVisible();
  await controlled(page);
  const sc = await shellCaches(page); const names = Object.keys(sc);
  expect(names.length).toBe(1); expect(sc[names[0]]).toBeGreaterThanOrEqual(27);          // index, css, icons, 20+ module, worker...
  await expect(page.locator('#updateBar')).toBeHidden();                                   // lần cài đầu tiên không được báo "có bản mới"
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('.album-card').first()).toBeVisible();                         // phục vụ hoàn toàn từ cache của SW
  await expect(page.locator('#loginScreen, #app').first()).toBeAttached();
  await context.setOffline(false);
});

test('lần mở sau phục vụ từ cache của SW (server không phải gửi lại các module)', async ({ page }) => {
  await page.goto(`${base}/?demo=1&sw=1`); await controlled(page); await expect(page.locator('.album-card').first()).toBeVisible();
  await page.waitForTimeout(300); hits = [];
  await page.reload(); await expect(page.locator('.album-card').first()).toBeVisible();
  expect(hits.filter((h) => h.endsWith('.js') && h !== 'sw.js')).toEqual([]);              // module không đi qua mạng
});

test('luồng cập nhật đầy đủ: deploy giả → SW phát hiện → thanh "Có bản mới" → Tải lại → dùng bản mới nguyên khối', async ({ page }) => {
  await page.goto(`${base}/?demo=1&sw=1`); await controlled(page); await expect(page.locator('.album-card').first()).toBeVisible();
  const before = Object.keys(await shellCaches(page))[0];
  // mô phỏng một lần deploy: đổi style.css trên "server"
  const css = fs.readFileSync(path.join(ROOT, 'style.css'), 'utf8'); overrides.set('style.css', css + '\n/* BAN-MOI-TEST */');
  // bỏ giới hạn tần suất (xoá mốc kiểm tra gần nhất) rồi nhờ SW kiểm tra, giống khi quay lại ứng dụng sau > 10 phút
  await page.evaluate(async () => { await (await caches.open('vdphoto-meta')).delete('https://meta.invalid/checked'); (await navigator.serviceWorker.ready).active.postMessage({ type: 'check' }); });
  await expect(page.locator('#updateBar')).toBeVisible({ timeout: 15000 });
  await expect(page.locator('#updateBar')).toContainText('Có bản mới');
  // trang đang mở KHÔNG bị đổi giữa chừng; cache mới đã dựng nguyên khối, bản trước giữ lại
  const sc = await shellCaches(page); expect(Object.keys(sc).length).toBe(2); expect(Object.keys(sc)).toContain(before);
  expect(Object.values(sc).every((n) => n >= 27)).toBe(true);
  await page.evaluate(() => { window.__marker = 1; });
  await page.locator('#updateReload').click();
  await expect.poll(() => page.evaluate(() => window.__marker)).toBeUndefined();            // đã tải lại trang
  await expect(page.locator('.album-card').first()).toBeVisible();
  const served = await page.evaluate(async () => (await (await fetch('style.css')).text()));
  expect(served).toContain('BAN-MOI-TEST');                                                 // sau khi tải lại dùng bản mới
  await expect(page.locator('#updateBar')).toBeHidden();
});

test('"Để sau" ẩn thanh; controllerchange chỉ báo khi trang đã từng được SW điều khiển', async ({ page }) => {
  await page.goto(`${base}/?demo=1&sw=1`); await controlled(page); await expect(page.locator('.album-card').first()).toBeVisible();
  await expect(page.locator('#updateBar')).toBeHidden();                                    // controllerchange tự nhiên của lần cài đầu: không báo
  await page.reload(); await expect(page.locator('.album-card').first()).toBeVisible(); await controlled(page);
  await page.evaluate(() => navigator.serviceWorker.dispatchEvent(new Event('controllerchange')));
  await expect(page.locator('#updateBar')).toBeVisible();
  await page.locator('#updateLater').click();
  await expect(page.locator('#updateBar')).toBeHidden();
});

test('công tắc khẩn cấp ?nosw=1: gỡ service worker và xoá mọi cache của app', async ({ page }) => {
  await page.goto(`${base}/?demo=1&sw=1`); await controlled(page); await expect(page.locator('.album-card').first()).toBeVisible();
  expect(Object.keys(await shellCaches(page)).length).toBe(1);
  await page.goto(`${base}/?demo=1&nosw=1`);
  await expect(page.locator('#toast')).toContainText('Đã tắt');
  await expect.poll(() => page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length)).toBe(0);
  expect(await page.evaluate(async () => (await caches.keys()).filter((k) => k.startsWith('vdphoto-'))).valueOf()).toEqual([]);
});

test('không đăng ký SW ở chế độ demo thường (không có ?sw=1) hoặc khác localhost/https', async ({ page }) => {
  await page.goto(`${base}/?demo=1`); await expect(page.locator('.album-card').first()).toBeVisible(); await page.waitForTimeout(400);
  expect(await page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length)).toBe(0);
});
