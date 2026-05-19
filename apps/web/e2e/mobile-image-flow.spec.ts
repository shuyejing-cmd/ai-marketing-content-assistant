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
