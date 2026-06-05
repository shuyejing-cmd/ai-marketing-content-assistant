import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

const tinyPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=',
  'base64',
);
const tinyPngDataUrl = `data:image/png;base64,${tinyPng.toString('base64')}`;

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.clear());
});

async function generateMarketingResults(page: Page) {
  await page.goto('/image');
  await page
    .getByPlaceholder('描述你想生成的营销图片...')
    .fill('给新品奶茶做一张朋友圈宣传图，突出第二杯半价');
  await page.getByRole('button', { name: '发送' }).click();
  await expect(page.getByRole('button', { name: /复制文案/ }).first()).toBeVisible();
  await page.waitForURL('/image');
  await page.waitForLoadState('networkidle').catch(() => undefined);
}

async function registerUser(page: Page, email: string) {
  await page.goto('/auth');
  await page.getByRole('button', { name: /^注册$/ }).click();
  await page.getByLabel('邮箱').fill(email);
  await page.getByLabel('密码').fill('password123');
  await page.getByRole('button', { name: '注册并保留内容' }).click();
  await expect(page).toHaveURL('/');
}

async function logoutFromHomeMenu(page: Page, email: string) {
  await page.goto('/');
  await page.getByRole('button', { name: '打开主页菜单' }).click();
  await expect(page.getByRole('dialog', { name: '主页菜单' })).toBeVisible();
  await expect(page.getByText(email)).toBeVisible();
  await page.getByRole('button', { name: '退出登录' }).click();
  await expect(page.getByRole('link', { name: /登录 \/ 注册/ })).toBeVisible();
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

test('home page menu drawer opens template management entry', async ({ page }) => {
  await authenticateAdmin(page.request);
  await page.goto('/');

  await page.getByRole('button', { name: '打开主页菜单' }).click();
  await expect(page.getByRole('dialog', { name: '主页菜单' })).toBeVisible();
  await expect(page.getByText('产品空间')).toBeVisible();
  await expect(page.getByText('个人空间')).toBeVisible();
  await expect(page.getByText('admin@example.test')).toBeVisible();

  const templateLink = page.getByRole('link', { name: /模板创建\/管理/ });
  await expect(templateLink).toHaveAttribute('href', '/admin/templates');
  await templateLink.click();
  await expect(page).toHaveURL('/admin/templates');
});

test('published image template opens a locked upload-only template flow', async ({ page, request }) => {
  const templateTitle = `中秋模板 ${Date.now()}`;
  await authenticateAdmin(request);
  const templateResponse = await request.post('/api/admin/templates', {
    data: {
      type: 'image',
      title: templateTitle,
      description: '上传商品图，生成中秋活动海报。',
      coverImageDataUrl: tinyPngDataUrl,
      prompt: '生成一张中秋营销海报，保留用户上传商品主体，画面温暖明亮。',
      published: true,
      sortOrder: -100,
    },
  });
  expect(templateResponse.ok()).toBeTruthy();
  const template = (await templateResponse.json()) as { id: string };

  await page.goto('/');
  await expect(page.getByRole('heading', { name: '模板应用' })).toBeVisible();
  await page.getByRole('link', { name: new RegExp(templateTitle) }).click();
  await expect(page).toHaveURL(`/templates/image/${template.id}`);
  await expect(page.getByPlaceholder('描述你想生成的营销图片...')).toHaveCount(0);

  await page.getByRole('button', { name: /上传图片/ }).click();
  await page.locator('input[type="file"]').setInputFiles({
    name: 'product.png',
    mimeType: 'image/png',
    buffer: tinyPng,
  });
  await page.getByRole('button', { name: '完成' }).click();
  await expect(page.getByText('已上传图片')).toBeVisible();

  await page.getByRole('button', { name: /生成模板图片/ }).click();
  await expect(page.getByRole('button', { name: /复制文案/ }).first()).toBeVisible();
  await expect(page.getByText(`使用模板：${templateTitle}`).first()).toBeVisible();
  await expect(page.getByText('已上传图片')).toBeHidden();
});

test('video templates are listed as placeholders', async ({ page, request }) => {
  const templateTitle = `视频模板 ${Date.now()}`;
  await authenticateAdmin(request);
  const templateResponse = await request.post('/api/admin/templates', {
    data: {
      type: 'video',
      title: templateTitle,
      description: '视频模板占位。',
      coverImageDataUrl: tinyPngDataUrl,
      prompt: '视频模板第一版只做展示。',
      published: true,
      sortOrder: -100,
    },
  });
  expect(templateResponse.ok()).toBeTruthy();

  await page.goto('/');
  await page.getByRole('button', { name: '视频' }).click();
  await expect(page.locator('article').filter({ hasText: templateTitle }).first()).toBeVisible();
  await expect(page.getByText('即将开放').first()).toBeVisible();
});

test('template chats are isolated from free image chats and reused per template', async ({ page, request }) => {
  const firstTemplateTitle = `隔离模板A ${Date.now()}`;
  const secondTemplateTitle = `隔离模板B ${Date.now()}`;
  const ownerId = `owner_${Date.now()}`;
  const firstTemplate = await createPublishedImageTemplate(request, firstTemplateTitle);
  const secondTemplate = await createPublishedImageTemplate(request, secondTemplateTitle);
  const freeSession = await createFreeGenerationViaApi(request, ownerId);
  const templateSession = await createTemplateGenerationViaApi(request, ownerId, firstTemplate.id);

  await page.addInitScript(({ nextOwnerId, nextFreeSessionId, firstTemplateId, nextTemplateSessionId }) => {
    localStorage.setItem('ai-marketing-owner-id', nextOwnerId);
    localStorage.setItem('ai-marketing-current-free-remote-session-id', nextFreeSessionId);
    localStorage.setItem('ai-marketing-current-remote-session-id', nextFreeSessionId);
    localStorage.setItem(
      `ai-marketing-current-template-remote-session-id:${firstTemplateId}`,
      nextTemplateSessionId,
    );
  }, {
    nextOwnerId: ownerId,
    nextFreeSessionId: freeSession.id,
    firstTemplateId: firstTemplate.id,
    nextTemplateSessionId: templateSession.id,
  });

  await navigateWithReloadRetry(page, `/templates/image/${firstTemplate.id}`);
  await expect(page.getByText(`使用模板：${firstTemplateTitle}`).first()).toBeVisible();

  await navigateWithReloadRetry(page, '/image');
  await expect(page.getByText(`使用模板：${firstTemplateTitle}`).first()).toBeHidden();
  await expect(page.getByRole('button', { name: /复制文案/ })).toHaveCount(1);
  await expect(page.getByText('给新品奶茶做一张朋友圈宣传图').first()).toBeVisible();

  await navigateWithReloadRetry(page, `/templates/image/${firstTemplate.id}`);
  await expect(page.getByText(`使用模板：${firstTemplateTitle}`).first()).toBeVisible();

  await navigateWithReloadRetry(page, `/templates/image/${secondTemplate.id}`);
  await expect(page.getByText(`使用模板：${firstTemplateTitle}`).first()).toBeHidden();
  await expect(page.getByRole('button', { name: /复制文案/ }).first()).toBeHidden();
});

test('image page generates mock marketing result cards', async ({ page }) => {
  await generateMarketingResults(page);

  await expect(page.getByRole('button', { name: /复制文案/ }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: /二次修改/ }).first()).toBeVisible();
});

test('registered users do not share sessions', async ({ page }) => {
  const suffix = Date.now();
  const userA = `owner-a-${suffix}@example.test`;
  const userB = `owner-b-${suffix}@example.test`;

  await registerUser(page, userA);
  await generateMarketingResults(page);
  await expect(page.getByText('给新品奶茶做一张朋友圈宣传图').first()).toBeVisible();

  await logoutFromHomeMenu(page, userA);

  await registerUser(page, userB);
  await page.goto('/image');
  await page.waitForLoadState('networkidle').catch(() => undefined);

  await expect(page.getByText('给新品奶茶做一张朋友圈宣传图').first()).toBeHidden();
  await expect(page.getByRole('button', { name: /复制文案/ }).first()).toBeHidden();

  await page.getByRole('button', { name: '打开会话菜单' }).click();
  await expect(page.getByRole('button', { name: /给新品奶茶做/ }).first()).toBeHidden();
});

async function authenticateAdmin(request: APIRequestContext) {
  const credentials = {
    email: 'admin@example.test',
    password: 'password123',
  };
  const registerResponse = await request.post('/api/auth/register', {
    data: credentials,
  });

  if (registerResponse.ok()) {
    return;
  }

  const loginResponse = await request.post('/api/auth/login', {
    data: credentials,
  });
  expect(loginResponse.ok()).toBeTruthy();
}

async function createPublishedImageTemplate(request: APIRequestContext, title: string) {
  await authenticateAdmin(request);
  const templateResponse = await request.post('/api/admin/templates', {
    data: {
      type: 'image',
      title,
      description: '上传商品图，生成活动海报。',
      coverImageDataUrl: tinyPngDataUrl,
      prompt: '生成一张营销海报，保留用户上传商品主体，画面干净明亮。',
      published: true,
      sortOrder: -100,
    },
  });
  expect(templateResponse.ok()).toBeTruthy();
  return (await templateResponse.json()) as { id: string };
}

async function createFreeGenerationViaApi(request: APIRequestContext, ownerId: string) {
  const sessionResponse = await request.post('/api/generation-sessions', {
    headers: { 'x-owner-id': ownerId },
    data: { kind: 'free' },
  });
  expect(sessionResponse.ok()).toBeTruthy();
  const session = (await sessionResponse.json()) as { id: string };

  const taskResponse = await request.post('/api/generation-tasks', {
    headers: { 'x-owner-id': ownerId },
    data: {
      ownerId,
      sessionId: session.id,
      request: {
        requestText: '给新品奶茶做一张朋友圈宣传图，突出第二杯半价',
        channels: ['wechat'],
        scene: 'new_product',
        style: 'young_trendy',
        campaignInfo: {},
      },
    },
  });
  expect(taskResponse.ok()).toBeTruthy();
  return session;
}

async function createTemplateGenerationViaApi(
  request: APIRequestContext,
  ownerId: string,
  templateId: string,
) {
  const sessionResponse = await request.post('/api/generation-sessions', {
    headers: { 'x-owner-id': ownerId },
    data: { kind: 'template', templateId },
  });
  expect(sessionResponse.ok()).toBeTruthy();
  const session = (await sessionResponse.json()) as { id: string };

  const taskResponse = await request.post(`/api/templates/${templateId}/generation-tasks`, {
    headers: { 'x-owner-id': ownerId },
    data: {
      ownerId,
      sessionId: session.id,
      uploadedImageDataUrl: tinyPngDataUrl,
      campaignInfo: {},
    },
  });
  expect(taskResponse.ok()).toBeTruthy();
  return session;
}

async function navigateWithReloadRetry(page: Page, url: string) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      return;
    } catch (error) {
      if (!String(error).includes('is interrupted by another navigation') || attempt === 2) {
        throw error;
      }
      await page.waitForTimeout(1000);
    }
  }
}

test('current session keeps generated records and clears uploaded quick state after send', async ({ page }) => {
  await page.goto('/image');

  await page.getByRole('button', { name: /上传图片/ }).click();
  await page.locator('input[type="file"]').setInputFiles({
    name: 'product.png',
    mimeType: 'image/png',
    buffer: tinyPng,
  });
  await page.getByRole('button', { name: '完成' }).click();
  await expect(page.getByText('已上传商品图')).toBeVisible();

  await page
    .getByPlaceholder('描述你想生成的营销图片...')
    .fill('给新品奶茶做一张朋友圈宣传图，突出第二杯半价');
  await page.getByRole('button', { name: '发送' }).click();
  await expect(page.getByRole('button', { name: /复制文案/ }).first()).toBeVisible();
  await expect(page.getByText('已上传商品图')).toBeHidden();

  await page
    .getByPlaceholder('描述你想生成的营销图片...')
    .fill('再做一张周末团购宣传图');
  await page.getByRole('button', { name: '发送' }).click();

  await expect(page.getByRole('button', { name: /复制文案/ })).toHaveCount(2);
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

test('image page restores the latest session after leaving and entering again', async ({ page }) => {
  await generateMarketingResults(page);

  await page.getByRole('link').first().click();
  await page.getByRole('link', { name: /图片/ }).click();

  await expect(page.getByRole('button', { name: /复制文案/ }).first()).toBeVisible();
});

test('session menu can create a new session and restore an old one', async ({ page }) => {
  await generateMarketingResults(page);

  await page.getByRole('button', { name: '打开会话菜单' }).click();
  await expect(page.getByText('历史会话记录')).toBeVisible();
  await page.getByRole('button', { name: '新建聊天会话' }).click();
  await expect(page.getByRole('button', { name: /复制文案/ }).first()).toBeHidden();

  await page.getByRole('button', { name: '打开会话菜单' }).click();
  await page.getByRole('button', { name: /给新品奶茶做/ }).click();

  await expect(page.getByRole('button', { name: /复制文案/ }).first()).toBeVisible();
});

test('renaming a session preserves all generated records', async ({ page }) => {
  await page.goto('/image');

  await page
    .getByPlaceholder('描述你想生成的营销图片...')
    .fill('给新品奶茶做一张朋友圈宣传图');
  await page.getByRole('button', { name: '发送' }).click();
  await expect(page.getByRole('button', { name: /复制文案/ })).toHaveCount(1);

  await page
    .getByPlaceholder('描述你想生成的营销图片...')
    .fill('再做一张周末团购宣传图');
  await page.getByRole('button', { name: '发送' }).click();
  await expect(page.getByRole('button', { name: /复制文案/ })).toHaveCount(2);

  page.once('dialog', async (dialog) => {
    expect(dialog.type()).toBe('prompt');
    await dialog.accept('重命名后的会话');
  });
  await page.getByRole('button', { name: '打开会话菜单' }).click();
  await page.getByText('重命名').first().click();
  await expect(page.getByText('重命名后的会话').first()).toBeVisible();
  await page.getByRole('button', { name: /重命名后的会话/ }).click();

  await expect(page.getByRole('button', { name: /复制文案/ })).toHaveCount(2);
});

test('poster download uses a stable browser download instead of showing the error overlay', async ({ page }) => {
  await generateMarketingResults(page);

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: /下载图片/ }).first().click();
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toMatch(/\.png$/);
  await expect(page.getByText(/Failed to read|Failed to fetch/)).toBeHidden();
});
