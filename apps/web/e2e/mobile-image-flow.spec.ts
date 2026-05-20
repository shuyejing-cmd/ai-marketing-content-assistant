import { expect, test } from '@playwright/test';

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
  await page.goto('/image');

  await page
    .getByPlaceholder('描述你想生成的营销图片...')
    .fill('给新品奶茶做一张朋友圈宣传图，突出第二杯半价');
  await page.getByRole('button', { name: '发送' }).click();

  await expect(page.getByRole('button', { name: /复制文案/ }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: /二次修改/ }).first()).toBeVisible();
});
