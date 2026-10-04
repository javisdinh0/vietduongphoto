// Zoom trong lightbox: chụm 2 ngón, kéo, chạm đúp, vuốt chuyển ảnh, chuột/trackpad. Cảm ứng được giả lập bằng CDP Input.dispatchTouchEvent.
import { test, expect } from '@playwright/test';

const tf = (page) => page.evaluate(() => { const m = /translate\(([-\d.e]+)px,\s*([-\d.e]+)px\) scale\(([\d.e]+)\)/.exec(document.getElementById('lightboxImg').style.transform); return m ? { x: +m[1], y: +m[2], s: +m[3] } : { x: 0, y: 0, s: 1 }; });
const geo = (page) => page.evaluate(() => { const i = document.getElementById('lightboxImg'); const st = document.getElementById('lbStage'); const sr = st.getBoundingClientRect(); const cs = getComputedStyle(st); return { W: i.offsetWidth, H: i.offsetHeight, vw: st.clientWidth, vh: st.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom), stage: { l: sr.left, t: sr.top, r: sr.right, b: sr.bottom } }; });
const center = (page) => page.evaluate(() => { const r = document.getElementById('lightboxImg').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });

async function openLightbox(page) {
  await page.goto('/?demo=1');
  await expect(page.locator('.gallery-item').first()).toBeVisible();
  await page.locator('.gallery-item').first().click();
  await expect.poll(() => page.locator('#lightboxImg').evaluate((e) => e.complete && e.naturalWidth > 0)).toBe(true);
}
// CDP: touchStart/touchMove với các điểm đang chạm; touchEnd với các điểm CÒN lại (thiếu điểm nào là nhấc điểm đó)
const mkTouch = (cdp) => {
  const pts = (arr) => arr.map((p, i) => ({ x: p.x, y: p.y, id: p.id ?? i }));
  return {
    start: (a) => cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pts(a) }),
    move: (a) => cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pts(a) }),
    end: (released = []) => cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: pts(released) }), // các điểm bị nhấc lên ([] = nhấc tất cả)
  };
};
const lerp = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
async function pinch(T, a0, b0, a1, b1, steps = 8) { await T.start([a0, b0]); for (let i = 1; i <= steps; i++) await T.move([lerp(a0, a1, i / steps), lerp(b0, b1, i / steps)]); await T.end([]); await new Promise((r) => setTimeout(r, 60)); }
async function tap(T, p) { await T.start([p]); await T.end([]); }

test.describe('cảm ứng', () => {
  test.use({ viewport: { width: 430, height: 932 }, hasTouch: true, isMobile: true });
  let T;
  test.beforeEach(async ({ page }) => { T = null; await openLightbox(page); T = mkTouch(await page.context().newCDPSession(page)); });

  test('chụm 2 ngón phóng đúng tỉ lệ khoảng cách hai ngón và giữ điểm giữa cố định', async ({ page }) => {
    const c = await center(page); const F = { x: c.x + 50, y: c.y + 30 };   // điểm giữa lệch tâm ảnh
    await pinch(T, { x: F.x - 40, y: F.y }, { x: F.x + 40, y: F.y }, { x: F.x - 80, y: F.y }, { x: F.x + 80, y: F.y }); // 80px → 160px = 2x
    const t = await tf(page);
    expect(t.s).toBeGreaterThan(1.9); expect(t.s).toBeLessThan(2.1);
    // điểm ảnh dưới điểm giữa vẫn ở yên: t = (1 - s) * (F - C)
    const g = await geo(page); const lim = (v, m) => Math.max(-m, Math.min(m, v));
    const mx = Math.max(0, (g.W * t.s - g.vw) / 2); const my = Math.max(0, (g.H * t.s - g.vh) / 2);   // ảnh nhỏ hơn khung nhìn thì được giữ ở giữa (không kéo ra ngoài mép)
    expect(Math.abs(t.x - lim((1 - t.s) * 50, mx))).toBeLessThan(3); expect(Math.abs(t.y - lim((1 - t.s) * 30, my))).toBeLessThan(3);
    await expect(page.locator('#lightboxImg')).toHaveClass(/zoomed/);
  });

  test('kéo 2 ngón làm ảnh dịch theo; giới hạn không kéo lố mép', async ({ page }) => {
    const c = await center(page); const g = await geo(page);
    const a = { x: c.x - 40, y: c.y }; const b = { x: c.x + 40, y: c.y };
    await T.start([a, b]);
    for (let i = 1; i <= 6; i++) await T.move([{ x: a.x - 20 * i, y: a.y }, { x: b.x + 20 * i, y: b.y }]);   // phóng
    for (let i = 1; i <= 10; i++) await T.move([{ x: a.x - 120 + 60 * i, y: a.y }, { x: b.x + 120 + 60 * i, y: b.y }]);   // rồi kéo sang phải thật xa
    await T.end([]);
    const t = await tf(page); const mx = Math.max(0, (g.W * t.s - g.vw) / 2);
    expect(t.s).toBeGreaterThan(2); expect(t.x).toBeGreaterThan(0);          // dịch theo hướng kéo
    expect(t.x).toBeLessThanOrEqual(mx + 0.5);                               // không vượt mép ảnh
  });

  test('chụm vào dưới 1x tự bật về 1x', async ({ page }) => {
    const c = await center(page);
    await pinch(T, { x: c.x - 100, y: c.y }, { x: c.x + 100, y: c.y }, { x: c.x - 30, y: c.y }, { x: c.x + 30, y: c.y });
    expect((await tf(page)).s).toBe(1);
    await expect(page.locator('#lightboxImg')).not.toHaveClass(/zoomed/);
  });

  test('không phóng quá 6x', async ({ page }) => {
    const c = await center(page);
    await pinch(T, { x: c.x - 10, y: c.y }, { x: c.x + 10, y: c.y }, { x: c.x - 200, y: c.y }, { x: c.x + 200, y: c.y }, 12);
    expect((await tf(page)).s).toBeLessThanOrEqual(6);
  });

  test('chạm đúp phóng 2,5x tại điểm chạm, chạm đúp lần nữa thì về 1x', async ({ page }) => {
    const c = await center(page); const P = { x: c.x + 40, y: c.y + 20 };
    await tap(T, P); await tap(T, P);
    await expect.poll(async () => (await tf(page)).s).toBeCloseTo(2.5, 1);
    const t = await tf(page); expect(Math.abs(t.x - (1 - 2.5) * 40)).toBeLessThan(3);
    await page.waitForTimeout(400);
    await tap(T, P); await tap(T, P);
    await expect.poll(async () => (await tf(page)).s).toBe(1);
  });

  test('một lần chạm không phóng (tránh phóng nhầm khi chỉ muốn chạm)', async ({ page }) => {
    const c = await center(page); await tap(T, c); await page.waitForTimeout(450);
    expect((await tf(page)).s).toBe(1);
  });

  test('đang phóng: kéo 1 ngón để xem, không chuyển ảnh', async ({ page }) => {
    const c = await center(page);
    await pinch(T, { x: c.x - 40, y: c.y }, { x: c.x + 40, y: c.y }, { x: c.x - 120, y: c.y }, { x: c.x + 120, y: c.y });
    const before = await tf(page); const count = await page.locator('#lbCount').textContent();
    await T.start([{ x: c.x + 100, y: c.y }]);
    for (let i = 1; i <= 6; i++) await T.move([{ x: c.x + 100 - 40 * i, y: c.y }]);
    await T.end([]);
    const after = await tf(page);
    expect(after.x).toBeLessThan(before.x);                                    // đã kéo
    expect(await page.locator('#lbCount').textContent()).toBe(count);         // không chuyển ảnh
  });

  test('chưa phóng: vuốt ngang chuyển ảnh', async ({ page }) => {
    const c = await center(page);
    await T.start([{ x: c.x + 100, y: c.y }]);
    for (let i = 1; i <= 6; i++) await T.move([{ x: c.x + 100 - 40 * i, y: c.y }]);
    await T.end([]);
    await expect(page.locator('#lbCount')).toContainText('2 / 3');
  });

  test('nhấc một ngón sau khi chụm không làm ảnh nhảy và không bị hiểu là vuốt chuyển ảnh', async ({ page }) => {
    const c = await center(page);
    const a = { x: c.x - 40, y: c.y, id: 0 }; const b = { x: c.x + 40, y: c.y, id: 1 };
    await T.start([a, b]);
    for (let i = 1; i <= 6; i++) await T.move([{ x: a.x - 20 * i, y: a.y, id: 0 }, { x: b.x + 20 * i, y: b.y, id: 1 }]);
    await page.waitForTimeout(80);
    const t0 = await tf(page);
    await T.end([{ x: b.x + 120, y: b.y, id: 1 }]);                            // nhấc ngón 1, còn ngón 0
    await page.waitForTimeout(80);
    const t1 = await tf(page);
    expect(Math.abs(t1.x - t0.x)).toBeLessThan(2); expect(Math.abs(t1.s - t0.s)).toBeLessThan(0.01);
    for (let i = 1; i <= 6; i++) await T.move([{ x: a.x - 120 - 30 * i, y: a.y, id: 0 }]);   // ngón còn lại kéo ngang > 60px
    await T.end([{ x: a.x - 300, y: a.y, id: 0 }]);
    await page.waitForTimeout(100);
    await expect(page.locator('#lbCount')).toContainText('1 / 3');             // vẫn ở ảnh đầu: không bị tính là vuốt chuyển ảnh
  });

  test('phóng quá ~1,5x yêu cầu tải ảnh gốc (xem chi tiết)', async ({ page }) => {
    await expect(page.locator('#lbQuality')).toHaveClass(/manual/);            // điện thoại: mặc định chỉ xem trước
    const c = await center(page);
    await pinch(T, { x: c.x - 40, y: c.y }, { x: c.x + 40, y: c.y }, { x: c.x - 100, y: c.y }, { x: c.x + 100, y: c.y });
    await expect(page.locator('#lbQuality')).toHaveClass(/ready/);
    await expect(page.locator('#lightboxImg')).toHaveAttribute('data-quality', 'original');
  });

  test('chuyển ảnh thì zoom được đặt lại', async ({ page }) => {
    const c = await center(page);
    await pinch(T, { x: c.x - 40, y: c.y }, { x: c.x + 40, y: c.y }, { x: c.x - 100, y: c.y }, { x: c.x + 100, y: c.y });
    expect((await tf(page)).s).toBeGreaterThan(2);
    await page.locator('#lbNext').click();
    await expect.poll(async () => (await tf(page)).s).toBe(1);
  });

  test('chạm vùng nền (ngoài ảnh) khi chưa phóng thì đóng lightbox', async ({ page }) => {
    const g = await geo(page);
    await tap(T, { x: g.stage.l + 3, y: g.stage.b - 6 });
    await expect(page.locator('#lightbox')).toBeHidden();
  });

  test('chặn thu phóng cả trang của Safari (gesturestart)', async ({ page }) => {
    const prevented = await page.evaluate(() => { const e = new Event('gesturestart', { cancelable: true, bubbles: true }); document.getElementById('lbStage').dispatchEvent(e); return e.defaultPrevented; });
    expect(prevented).toBe(true);
  });
});

test.describe('chuột / trackpad', () => {
  test.beforeEach(async ({ page }) => { await openLightbox(page); });

  test('lăn chuột phóng liên tục quanh con trỏ rồi thu về 1x', async ({ page }) => {
    const c = await center(page);
    await page.mouse.move(c.x + 40, c.y + 20);
    await page.mouse.wheel(0, -200); await page.waitForTimeout(50);
    const a = (await tf(page)).s; expect(a).toBeGreaterThan(1.2);
    await page.mouse.wheel(0, -200); await page.waitForTimeout(50);
    expect((await tf(page)).s).toBeGreaterThan(a);                              // liên tục, không chỉ bật/tắt
    for (let i = 0; i < 12; i++) { await page.mouse.wheel(0, 300); await page.waitForTimeout(30); }
    expect((await tf(page)).s).toBe(1);
  });

  test('click phóng 2,5x và click lần nữa thu về; kéo bằng chuột không bật/tắt zoom', async ({ page }) => {
    const c = await center(page);
    await page.mouse.click(c.x, c.y);
    await expect.poll(async () => (await tf(page)).s).toBeCloseTo(2.5, 1);
    await page.waitForTimeout(300);
    const before = await tf(page);
    await page.mouse.move(c.x, c.y); await page.mouse.down(); await page.mouse.move(c.x - 60, c.y - 30, { steps: 5 }); await page.mouse.up();
    const after = await tf(page);
    expect(after.s).toBeCloseTo(2.5, 1);                                       // vẫn đang phóng
    expect(after.x).toBeLessThan(before.x);                                    // và đã kéo
    await page.waitForTimeout(300);
    await page.mouse.click(c.x, c.y);
    await expect.poll(async () => (await tf(page)).s).toBe(1);
  });

  test('click vào ảnh không đóng lightbox, click nền (khi chưa phóng) thì đóng', async ({ page }) => {
    const c = await center(page); const g = await geo(page);
    await page.mouse.click(c.x, c.y); await page.waitForTimeout(300);
    await page.mouse.click(c.x, c.y); await page.waitForTimeout(300);          // về 1x
    await expect(page.locator('#lightbox')).toBeVisible();
    await page.mouse.click(g.stage.l + 3, g.stage.b - 6);
    await expect(page.locator('#lightbox')).toBeHidden();
  });
});
