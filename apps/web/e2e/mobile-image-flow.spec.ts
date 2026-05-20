import { expect, test } from '@playwright/test';

const tinyPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=',
  'base64',
);

async function generateMarketingResults(page: import('@playwright/test').Page) {
  await page.goto('/image');
  await page
    .getByPlaceholder('描述你想生成的营销图片...')
    .fill('给新品奶茶做一张朋友圈宣传图，突出第二杯半价');
  await page.getByRole('button', { name: '发送' }).click();
  await expect(page.getByRole('button', { name: /复制文案/ }).first()).toBeVisible();
}

test('home page shows three marketing entrances and opens image page', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: '今天想做什么营销内容？' })).toBeVisible();
  await expect(page.getByRole('link', { name: /文案/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /图片/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /视频/ })).toBeVisible();

  await page.getByRole('link', { name: /图片/ }).click();
  await expect(page).toHaveURL('/image');
});

test('image page generates mock marketing result cards', async ({ page }) => {
  await generateMarketingResults(page);

  await expect(page.getByRole('button', { name: /复制文案/ }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: /二次修改/ }).first()).toBeVisible();
});

test('quick option sheets have done buttons and uploaded image status', async ({ page }) => {
  await page.goto('/image');

  await page.getByRole('button', { name: /上传图片/ }).click();
  await expect(page.getByRole('button', { name: '完成' })).toBeVisible();
  await page.locator('input[type="file"]').setInputFiles({
    name: 'product.png',
    mimeType: 'image/png',
    buffer: tinyPng,
  });
  await expect(page.getByText('上传成功')).toBeVisible();
  await page.getByRole('button', { name: '完成' }).click();
  await expect(page.getByText('已上传商品图')).toBeVisible();
  await expect(page.getByAltText('已上传商品图缩略图')).toBeVisible();

  for (const actionName of ['发布渠道', '营销场景', '风格模板', '活动信息']) {
    await page.getByRole('button', { name: new RegExp(actionName) }).click();
    await expect(page.getByRole('button', { name: '完成' })).toBeVisible();
    await page.getByRole('button', { name: '完成' }).click();
  }
});

test('secondary modification can be cancelled and copy gives feedback', async ({ page }) => {
  await generateMarketingResults(page);

  await page.getByRole('button', { name: /二次修改/ }).first().click();
  await expect(page.getByText('正在二次修改当前方案')).toBeVisible();
  await expect(page.getByRole('button', { name: '取消二次修改' })).toBeVisible();
  await page.getByRole('button', { name: '取消二次修改' }).click();
  await expect(page.getByRole('button', { name: '取消二次修改' })).toBeHidden();

  await page.getByRole('button', { name: /复制文案/ }).first().click();
  await expect(page.getByText(/已复制|复制失败，请长按文案手动复制/)).toBeVisible();
});
