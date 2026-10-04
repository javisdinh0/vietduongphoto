// Bố cục masonry bằng JS (thay CSS column-count): số cột theo cỡ màn hình, thứ tự trái→phải, cân bằng, dựng lại khi đổi số cột.
import { test, expect } from '@playwright/test';

const url = '/?demo=1&many=30&bulkday=1#/f/f-dalat'; // 30 ảnh BULK cùng một ngày = nhóm lớn

// thông tin nhóm lớn nhất: số cột, ảnh mỗi cột, chỉ số cột của n ảnh đầu (theo thứ tự thời gian của S.visible), độ chênh chiều cao cột
const biggest = (page) => page.evaluate(() => {
  const groups = [...document.querySelectorAll('.gallery.masonry')]; const g = groups.sort((a, b) => b.querySelectorAll('.gallery-item').length - a.querySelectorAll('.gallery-item').length)[0];
  const cols = [...g.querySelectorAll(':scope > .gcol')];
  const ids = window.__vd.visible.map((p) => p.id);
  const members = ids.filter((id) => g.querySelector(`.gallery-item[data-id="${CSS.escape(id)}"]`));
  const colOf = (id) => cols.findIndex((c) => c.querySelector(`.gallery-item[data-id="${CSS.escape(id)}"]`));
  const heights = cols.map((c) => c.getBoundingClientRect().height);
  const maxCard = Math.max(...[...g.querySelectorAll('.gallery-item')].map((c) => c.getBoundingClientRect().height));
  return { n: cols.length, perCol: cols.map((c) => c.children.length), firstCols: members.slice(0, cols.length).map(colOf), spread: Math.max(...heights) - Math.min(...heights), maxCard, total: members.length };
});

for (const [w, expected] of [[1280, 4], [900, 3], [600, 2], [430, 2], [390, 1]]) {
  test(`${w}px: ${expected} cột`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: 900 });
    await page.goto(url);
    await expect(page.locator('.gallery.masonry').first()).toBeVisible();
    const b = await biggest(page);
    expect(b.n).toBe(expected);
    expect(b.total).toBe(30);
  });
}

test('ảnh xếp từ trái sang phải theo thời gian và các cột cân bằng', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(url);
  await expect(page.locator('.gallery.masonry').first()).toBeVisible();
  const b = await biggest(page);
  expect(b.firstCols).toEqual([0, 1, 2, 3]);                 // 4 ảnh mới nhất nằm ở 4 cột khác nhau theo thứ tự
  expect(b.spread).toBeLessThanOrEqual(b.maxCard * 1.2);     // cột cao nhất và thấp nhất chênh không quá ~1 thẻ
  expect(Math.max(...b.perCol) - Math.min(...b.perCol)).toBeLessThanOrEqual(6);
});

test('bấm thẻ ở bất kỳ cột nào mở đúng ảnh trong lightbox', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(url);
  await expect(page.locator('.gallery.masonry').first()).toBeVisible();
  const pick = await page.evaluate(() => { const g = [...document.querySelectorAll('.gallery.masonry')].sort((a, b) => b.querySelectorAll('.gallery-item').length - a.querySelectorAll('.gallery-item').length)[0]; const c = g.querySelectorAll(':scope > .gcol')[2].children[3]; return { id: c.dataset.id, name: window.__vd.byId.get(c.dataset.id).name }; });
  await page.locator(`.gallery-item[data-id="${pick.id}"]`).scrollIntoViewIfNeeded();
  await page.locator(`.gallery-item[data-id="${pick.id}"]`).click();
  await expect(page.locator('#lbCount')).toContainText(pick.name);
});

test('đổi số cột (xoay màn hình / đổi cỡ cửa sổ) thì dựng lại, không mất ảnh', async ({ page }) => {
  await page.setViewportSize({ width: 430, height: 900 });
  await page.goto(url);
  await expect(page.locator('.gallery.masonry').first()).toBeVisible();
  const before = await page.locator('.gallery-item').count();
  expect((await biggest(page)).n).toBe(2);
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect.poll(async () => (await biggest(page)).n).toBe(4);
  expect((await biggest(page)).total).toBe(30);
  expect(await page.locator('.gallery-item').count()).toBe(before);
});

test('chế độ lưới đều (justified) không dùng cột masonry', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(url);
  await expect(page.locator('.gallery.masonry').first()).toBeVisible();
  await page.locator('#layoutBtn').click();
  await expect(page.locator('.gallery.justified').first()).toBeVisible();
  expect(await page.locator('.gcol').count()).toBe(0);
  expect(await page.locator('.gallery.masonry').count()).toBe(0);
});

test('không còn dùng CSS multi-column hay content-visibility cho thẻ ảnh', async ({ page }) => {
  await page.goto(url);
  await expect(page.locator('.gallery-item').first()).toBeVisible();
  const s = await page.evaluate(() => { const g = getComputedStyle(document.querySelector('.gallery')); const i = getComputedStyle(document.querySelector('.gallery-item')); return { cc: g.columnCount, cv: i.contentVisibility }; });
  expect(s.cc).toBe('auto'); expect(s.cv).toBe('visible');
});
