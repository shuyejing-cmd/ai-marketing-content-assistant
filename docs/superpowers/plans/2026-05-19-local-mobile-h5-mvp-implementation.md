# Local Mobile H5 MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local mobile-first H5 prototype that lets one user open the product on a phone browser, choose the Image entrance, fill quick options, upload an optional product image, generate mock image marketing packages, and try regenerate / secondary modification.

**Architecture:** Use a single Next.js app for the first local prototype. The frontend pages, reusable UI components, mock API routes, and mock generation logic live in clearly separated folders so the mock backend can later be replaced by the NestJS main backend without rewriting the UI. Future FastAPI AI execution services should stay behind the backend AI Provider Adapter and should not change the H5 page contracts.

**Tech Stack:** Next.js App Router, React, TypeScript, Tailwind CSS, local mock API routes, browser localStorage for lightweight history, Vitest for pure logic tests, Playwright for mobile viewport smoke testing.

---

## Simple Explanation

This plan builds the first thing you can actually touch on your phone.

It does not start with a real AI model. It first builds the product shell and interaction flow:

```text
Home page
→ tap Image
→ upload image or skip
→ choose channel / scene / style / activity info
→ type one sentence
→ generate mock marketing results
→ copy copywriting / download mock poster / regenerate / modify with AI
```

The purpose is to verify the user experience before paying for model calls or cloud services.

## Scope

In scope:

- Mobile H5 local website.
- Home page with Copywriting, Image, Video entrances.
- Image generation page as the main working experience.
- Doubao-like bottom text input.
- Quick option buttons above the input.
- Bottom sheets for upload, channel, scene, style, and activity info.
- Optional product image preview.
- Mock generation result cards.
- Regenerate flow.
- Secondary modification flow.
- Copy copywriting.
- Download mock poster as a simple generated image.
- Local phone access through LAN.

Out of scope:

- Real AI model integration.
- Real backend database.
- Login.
- Payment.
- Direct publishing to WeChat, Xiaohongshu, Douyin, Meituan, or Dianping.
- Complex manual poster editor.
- Full video generation.

## File Structure Map

Create the H5 app under `apps/web`.

```text
apps/web/
  package.json
  next.config.ts
  tsconfig.json
  postcss.config.mjs
  tailwind.config.ts
  vitest.config.ts
  playwright.config.ts
  public/
    mock-generated/
      poster-placeholder.svg
  src/
    app/
      globals.css
      layout.tsx
      page.tsx
      image/
        page.tsx
      api/
        generation-tasks/
          route.ts
          [id]/
            route.ts
            regenerate/
              route.ts
            modify/
              route.ts
    components/
      AppShell.tsx
      EntranceCard.tsx
      BottomSheet.tsx
      QuickActionBar.tsx
      ImageUploader.tsx
      OptionPicker.tsx
      ActivityInfoForm.tsx
      ChatComposer.tsx
      ResultCard.tsx
      PosterPreview.tsx
    features/
      generation/
        generation-types.ts
        generation-options.ts
        mock-generation.ts
        generation-client.ts
        local-history.ts
    lib/
      cn.ts
      download.ts
  tests/
    mock-generation.test.ts
    generation-options.test.ts
  e2e/
    mobile-image-flow.spec.ts
```

## Data Contracts

The frontend mock API uses the same concepts as the planned backend.

```ts
type Channel = 'wechat' | 'xiaohongshu' | 'douyin' | 'meituan_dianping';

type MarketingScene =
  | 'new_product'
  | 'today_special'
  | 'group_buying'
  | 'festival'
  | 'opening'
  | 'best_seller'
  | 'custom';

type StyleTemplate =
  | 'street_warmth'
  | 'clean_premium'
  | 'young_trendy'
  | 'real_local_shop'
  | 'strong_promotion'
  | 'festival';

type CampaignInfo = {
  storeName?: string;
  productName?: string;
  price?: string;
  campaignTime?: string;
  address?: string;
  phone?: string;
  extraSellingPoints?: string;
};

type GenerationTaskRequest = {
  requestText: string;
  uploadedImageDataUrl?: string;
  channels: Channel[];
  scene: MarketingScene;
  style: StyleTemplate;
  campaignInfo: CampaignInfo;
};

type GenerationResult = {
  id: string;
  channel: Channel;
  style: StyleTemplate;
  title: string;
  publishingCopy: string;
  imageText: string[];
  imageUrl?: string;
  uploadedImageDataUrl?: string;
};
```

## Task 1: Create Web App Foundation

**Files:**

- Create: `apps/web/package.json`
- Create: `apps/web/next.config.ts`
- Create: `apps/web/tsconfig.json`
- Create: `apps/web/postcss.config.mjs`
- Create: `apps/web/tailwind.config.ts`
- Create: `apps/web/vitest.config.ts`
- Create: `apps/web/src/app/globals.css`
- Create: `apps/web/src/app/layout.tsx`
- Create: `apps/web/src/lib/cn.ts`

- [ ] **Step 1: Create package configuration**

```json
// apps/web/package.json
{
  "name": "ai-marketing-web",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev -H 0.0.0.0 -p 3000",
    "build": "next build",
    "start": "next start -H 0.0.0.0 -p 3000",
    "test": "vitest run",
    "test:watch": "vitest",
    "e2e": "playwright test"
  },
  "dependencies": {
    "@types/node": "^22.9.0",
    "@types/react": "^18.3.12",
    "@types/react-dom": "^18.3.1",
    "clsx": "^2.1.1",
    "html-to-image": "^1.11.11",
    "lucide-react": "^0.468.0",
    "next": "^15.0.3",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "tailwind-merge": "^2.5.4"
  },
  "devDependencies": {
    "@playwright/test": "^1.49.0",
    "@vitejs/plugin-react": "^4.3.3",
    "autoprefixer": "^10.4.20",
    "postcss": "^8.4.49",
    "tailwindcss": "^3.4.15",
    "typescript": "^5.6.3",
    "vitest": "^2.1.5"
  }
}
```

- [ ] **Step 2: Create TypeScript and Next config**

```ts
// apps/web/next.config.ts
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
};

export default nextConfig;
```

```json
// apps/web/tsconfig.json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "es2022"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 3: Create Tailwind config**

```js
// apps/web/postcss.config.mjs
const config = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};

export default config;
```

```ts
// apps/web/tailwind.config.ts
import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#1f2328',
        muted: '#69717d',
        line: '#d8dee8',
        canvas: '#f7f5f0',
        surface: '#ffffff',
        accent: '#0f7f6c',
        warm: '#d9552f',
      },
      boxShadow: {
        soft: '0 10px 30px rgba(31, 35, 40, 0.08)',
      },
    },
  },
  plugins: [],
};

export default config;
```

- [ ] **Step 4: Create Vitest config and utility**

```ts
// apps/web/vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
```

```ts
// apps/web/src/lib/cn.ts
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

- [ ] **Step 5: Create global layout and styles**

```css
/* apps/web/src/app/globals.css */
@tailwind base;
@tailwind components;
@tailwind utilities;

* {
  box-sizing: border-box;
}

html,
body {
  min-height: 100%;
  margin: 0;
  background: #f7f5f0;
  color: #1f2328;
  font-family:
    Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI",
    sans-serif;
}

button,
input,
textarea {
  font: inherit;
}
```

```tsx
// apps/web/src/app/layout.tsx
import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'AI 营销内容助手',
  description: '给中小商家使用的本地 H5 MVP',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
```

- [ ] **Step 6: Install and verify**

Run:

```bash
cd apps/web
npm install
npm run build
```

Expected: dependencies install and Next.js build succeeds.

- [ ] **Step 7: Commit**

```bash
git add apps/web
git commit -m "chore: scaffold mobile h5 app"
```

## Task 2: Home Page with Three Entrances

**Files:**

- Create: `apps/web/src/components/AppShell.tsx`
- Create: `apps/web/src/components/EntranceCard.tsx`
- Create: `apps/web/src/app/page.tsx`
- Create: `apps/web/e2e/mobile-image-flow.spec.ts`
- Create: `apps/web/playwright.config.ts`

- [ ] **Step 1: Write mobile smoke e2e test**

```ts
// apps/web/playwright.config.ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  webServer: {
    command: 'npm run dev',
    port: 3000,
    reuseExistingServer: true,
  },
  use: {
    baseURL: 'http://127.0.0.1:3000',
    ...devices['iPhone 13'],
  },
});
```

```ts
// apps/web/e2e/mobile-image-flow.spec.ts
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
```

- [ ] **Step 2: Run e2e test and verify it fails**

Run:

```bash
cd apps/web
npm run e2e -- mobile-image-flow.spec.ts
```

Expected: FAIL because the home page and image page do not exist.

- [ ] **Step 3: Create shell and entrance card**

```tsx
// apps/web/src/components/AppShell.tsx
export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto min-h-dvh w-full max-w-[430px] bg-canvas px-4 py-5">
      {children}
    </main>
  );
}
```

```tsx
// apps/web/src/components/EntranceCard.tsx
import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import { ChevronRight } from 'lucide-react';

type EntranceCardProps = {
  href: string;
  title: string;
  description: string;
  icon: LucideIcon;
};

export function EntranceCard({ href, title, description, icon: Icon }: EntranceCardProps) {
  return (
    <Link
      href={href}
      className="flex min-h-[96px] items-center gap-4 rounded-lg border border-line bg-surface p-4 shadow-soft"
    >
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-accent text-white">
        <Icon size={22} aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[18px] font-semibold leading-6 text-ink">{title}</span>
        <span className="mt-1 block text-[13px] leading-5 text-muted">{description}</span>
      </span>
      <ChevronRight className="shrink-0 text-muted" size={20} aria-hidden="true" />
    </Link>
  );
}
```

- [ ] **Step 4: Create home page and temporary image page**

```tsx
// apps/web/src/app/page.tsx
import { FileText, Image, Video } from 'lucide-react';
import { AppShell } from '@/components/AppShell';
import { EntranceCard } from '@/components/EntranceCard';

export default function HomePage() {
  return (
    <AppShell>
      <section className="pt-4">
        <p className="text-sm font-medium text-accent">AI 营销内容助手</p>
        <h1 className="mt-3 text-[28px] font-semibold leading-9 text-ink">
          今天想做什么营销内容？
        </h1>
        <p className="mt-3 text-[15px] leading-6 text-muted">
          先选内容类型，再用一句话和几个快捷选项生成能直接发布的营销内容。
        </p>
      </section>

      <section className="mt-7 grid gap-3">
        <EntranceCard
          href="/copy"
          title="文案"
          description="朋友圈、小红书、抖音标题、活动话术"
          icon={FileText}
        />
        <EntranceCard
          href="/image"
          title="图片"
          description="营销海报、朋友圈图、小红书封面"
          icon={Image}
        />
        <EntranceCard
          href="/video"
          title="视频"
          description="短视频脚本、分镜、字幕、口播"
          icon={Video}
        />
      </section>
    </AppShell>
  );
}
```

```tsx
// apps/web/src/app/image/page.tsx
import { AppShell } from '@/components/AppShell';

export default function ImagePage() {
  return (
    <AppShell>
      <h1 className="text-[24px] font-semibold text-ink">图片营销</h1>
    </AppShell>
  );
}
```

- [ ] **Step 5: Run e2e test and verify it passes**

Run:

```bash
cd apps/web
npm run e2e -- mobile-image-flow.spec.ts
```

Expected: PASS for home page entrance navigation.

- [ ] **Step 6: Commit**

```bash
git add apps/web
git commit -m "feat: add mobile home entrances"
```

## Task 3: Generation Types and Mock Logic

**Files:**

- Create: `apps/web/src/features/generation/generation-types.ts`
- Create: `apps/web/src/features/generation/generation-options.ts`
- Create: `apps/web/src/features/generation/mock-generation.ts`
- Create: `apps/web/tests/generation-options.test.ts`
- Create: `apps/web/tests/mock-generation.test.ts`

- [ ] **Step 1: Write option and mock generation tests**

```ts
// apps/web/tests/generation-options.test.ts
import { getPlannedChannels } from '../src/features/generation/generation-options';

describe('getPlannedChannels', () => {
  it('uses wechat as default channel', () => {
    expect(getPlannedChannels([])).toEqual(['wechat']);
  });

  it('limits selected channels to three', () => {
    expect(getPlannedChannels(['wechat', 'xiaohongshu', 'douyin', 'meituan_dianping'])).toEqual([
      'wechat',
      'xiaohongshu',
      'douyin',
    ]);
  });
});
```

```ts
// apps/web/tests/mock-generation.test.ts
import { createMockGenerationTask } from '../src/features/generation/mock-generation';

describe('createMockGenerationTask', () => {
  it('creates three options for one channel', () => {
    const task = createMockGenerationTask({
      requestText: '给新品奶茶做一张朋友圈宣传图',
      channels: ['wechat'],
      scene: 'new_product',
      style: 'young_trendy',
      campaignInfo: { productName: '柠檬茶', price: '19.9' },
    });

    expect(task.results).toHaveLength(3);
    expect(task.results[0].title).toContain('柠檬茶');
  });

  it('creates one option per channel when multiple channels are selected', () => {
    const task = createMockGenerationTask({
      requestText: '给新品奶茶做宣传图',
      channels: ['wechat', 'xiaohongshu'],
      scene: 'new_product',
      style: 'clean_premium',
      campaignInfo: { productName: '柠檬茶' },
    });

    expect(task.results).toHaveLength(2);
    expect(task.results.map((result) => result.channel)).toEqual(['wechat', 'xiaohongshu']);
  });
});
```

- [ ] **Step 2: Run tests and verify they fail**

Run:

```bash
cd apps/web
npm test
```

Expected: FAIL because generation files do not exist.

- [ ] **Step 3: Create generation types**

```ts
// apps/web/src/features/generation/generation-types.ts
export type Channel = 'wechat' | 'xiaohongshu' | 'douyin' | 'meituan_dianping';

export type MarketingScene =
  | 'new_product'
  | 'today_special'
  | 'group_buying'
  | 'festival'
  | 'opening'
  | 'best_seller'
  | 'custom';

export type StyleTemplate =
  | 'street_warmth'
  | 'clean_premium'
  | 'young_trendy'
  | 'real_local_shop'
  | 'strong_promotion'
  | 'festival';

export type CampaignInfo = {
  storeName?: string;
  productName?: string;
  price?: string;
  campaignTime?: string;
  address?: string;
  phone?: string;
  extraSellingPoints?: string;
};

export type GenerationTaskRequest = {
  requestText: string;
  uploadedImageDataUrl?: string;
  channels: Channel[];
  scene: MarketingScene;
  style: StyleTemplate;
  campaignInfo: CampaignInfo;
};

export type GenerationResult = {
  id: string;
  channel: Channel;
  style: StyleTemplate;
  title: string;
  publishingCopy: string;
  imageText: string[];
  imageUrl?: string;
  uploadedImageDataUrl?: string;
};

export type GenerationTask = {
  id: string;
  status: 'succeeded';
  request: GenerationTaskRequest;
  results: GenerationResult[];
};
```

- [ ] **Step 4: Create option labels and channel planning**

```ts
// apps/web/src/features/generation/generation-options.ts
import type { Channel, MarketingScene, StyleTemplate } from './generation-types';

export const channelOptions: Array<{ value: Channel; label: string }> = [
  { value: 'wechat', label: '朋友圈/微信群' },
  { value: 'xiaohongshu', label: '小红书' },
  { value: 'douyin', label: '抖音图文/封面' },
  { value: 'meituan_dianping', label: '美团/大众点评' },
];

export const sceneOptions: Array<{ value: MarketingScene; label: string }> = [
  { value: 'new_product', label: '新品推广' },
  { value: 'today_special', label: '今日特价' },
  { value: 'group_buying', label: '团购套餐' },
  { value: 'festival', label: '节日活动' },
  { value: 'opening', label: '开业宣传' },
  { value: 'best_seller', label: '爆款推荐' },
  { value: 'custom', label: '自定义' },
];

export const styleOptions: Array<{ value: StyleTemplate; label: string }> = [
  { value: 'street_warmth', label: '烟火气' },
  { value: 'clean_premium', label: '高级干净' },
  { value: 'young_trendy', label: '年轻潮流' },
  { value: 'real_local_shop', label: '真实小店' },
  { value: 'strong_promotion', label: '促销感强' },
  { value: 'festival', label: '节日氛围' },
];

export function getPlannedChannels(channels: Channel[]): Channel[] {
  const normalized = channels.length > 0 ? channels : ['wechat'];
  return normalized.slice(0, 3);
}
```

- [ ] **Step 5: Create mock generation logic**

```ts
// apps/web/src/features/generation/mock-generation.ts
import { getPlannedChannels } from './generation-options';
import type { GenerationResult, GenerationTask, GenerationTaskRequest } from './generation-types';

const channelCopy: Record<string, string> = {
  wechat: '适合发朋友圈和微信群，语气自然，熟客看了马上懂。',
  xiaohongshu: '适合小红书种草，标题更抓人，画面更精致。',
  douyin: '适合抖音图文封面，短句大字，点击感更强。',
  meituan_dianping: '适合门店平台展示，信息清楚，价格权益明确。',
};

export function createMockGenerationTask(request: GenerationTaskRequest): GenerationTask {
  const plannedChannels = getPlannedChannels(request.channels);
  const optionCount = plannedChannels.length === 1 ? 3 : plannedChannels.length;
  const productName = request.campaignInfo.productName || extractProductName(request.requestText);

  const results: GenerationResult[] = Array.from({ length: optionCount }, (_, index) => {
    const channel = plannedChannels.length === 1 ? plannedChannels[0] : plannedChannels[index];
    const title = buildTitle(productName, request.campaignInfo.price, index);

    return {
      id: `result_${Date.now()}_${index}`,
      channel,
      style: request.style,
      title,
      publishingCopy: buildPublishingCopy(title, request, channel),
      imageText: buildImageText(title, request),
      imageUrl: '/mock-generated/poster-placeholder.svg',
      uploadedImageDataUrl: request.uploadedImageDataUrl,
    };
  });

  return {
    id: `task_${Date.now()}`,
    status: 'succeeded',
    request,
    results,
  };
}

export function modifyMockGenerationTask(
  previous: GenerationTask,
  selectedResultId: string,
  modificationText: string,
): GenerationTask {
  const results = previous.results.map((result) =>
    result.id === selectedResultId
      ? {
          ...result,
          id: `result_${Date.now()}_modified`,
          title: `${result.title}｜已调整`,
          publishingCopy: `${result.publishingCopy}\n\n修改要求：${modificationText}`,
          imageText: [...result.imageText.slice(0, 2), '已按要求调整'],
        }
      : result,
  );

  return {
    ...previous,
    id: `task_${Date.now()}_modify`,
    results,
  };
}

function extractProductName(requestText: string) {
  return requestText.slice(0, 8) || '门店活动';
}

function buildTitle(productName: string, price: string | undefined, index: number) {
  const suffixes = ['今日推荐', '限时上新', '到店必点'];
  return price ? `${productName} ${price} 元起` : `${productName} ${suffixes[index]}`;
}

function buildPublishingCopy(title: string, request: GenerationTaskRequest, channel: string) {
  const store = request.campaignInfo.storeName ? `${request.campaignInfo.storeName}：` : '';
  const extra = request.campaignInfo.extraSellingPoints ? ` ${request.campaignInfo.extraSellingPoints}` : '';
  return `${store}${title}。${channelCopy[channel]}${extra}`;
}

function buildImageText(title: string, request: GenerationTaskRequest) {
  return [
    title,
    request.campaignInfo.extraSellingPoints || '限时活动',
    request.campaignInfo.campaignTime || '今日可用',
  ];
}
```

- [ ] **Step 6: Run tests and verify they pass**

Run:

```bash
cd apps/web
npm test
```

Expected: PASS for option planning and mock generation tests.

- [ ] **Step 7: Commit**

```bash
git add apps/web
git commit -m "feat: add mock generation logic"
```

## Task 4: Mock API Routes

**Files:**

- Create: `apps/web/src/features/generation/generation-client.ts`
- Create: `apps/web/src/app/api/generation-tasks/route.ts`
- Create: `apps/web/src/app/api/generation-tasks/[id]/route.ts`
- Create: `apps/web/src/app/api/generation-tasks/[id]/regenerate/route.ts`
- Create: `apps/web/src/app/api/generation-tasks/[id]/modify/route.ts`

- [ ] **Step 1: Create browser client**

```ts
// apps/web/src/features/generation/generation-client.ts
import type { GenerationTask, GenerationTaskRequest } from './generation-types';

export async function createGenerationTask(request: GenerationTaskRequest): Promise<GenerationTask> {
  const response = await fetch('/api/generation-tasks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    throw new Error('生成失败，请稍后再试');
  }

  return response.json() as Promise<GenerationTask>;
}

export async function regenerateTask(taskId: string): Promise<GenerationTask> {
  const response = await fetch(`/api/generation-tasks/${taskId}/regenerate`, {
    method: 'POST',
  });

  if (!response.ok) {
    throw new Error('重新生成失败，请稍后再试');
  }

  return response.json() as Promise<GenerationTask>;
}

export async function modifyTask(
  taskId: string,
  selectedResultId: string,
  modificationText: string,
): Promise<GenerationTask> {
  const response = await fetch(`/api/generation-tasks/${taskId}/modify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ selectedResultId, modificationText }),
  });

  if (!response.ok) {
    throw new Error('二次修改失败，请稍后再试');
  }

  return response.json() as Promise<GenerationTask>;
}
```

- [ ] **Step 2: Create in-memory mock API store and routes**

```ts
// apps/web/src/app/api/generation-tasks/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createMockGenerationTask } from '@/features/generation/mock-generation';
import type { GenerationTask, GenerationTaskRequest } from '@/features/generation/generation-types';

export const mockTasks = new Map<string, GenerationTask>();

export async function POST(request: NextRequest) {
  const body = (await request.json()) as GenerationTaskRequest;
  const task = createMockGenerationTask(body);
  mockTasks.set(task.id, task);
  return NextResponse.json(task, { status: 201 });
}
```

```ts
// apps/web/src/app/api/generation-tasks/[id]/route.ts
import { NextResponse } from 'next/server';
import { mockTasks } from '../route';

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const task = mockTasks.get(params.id);
  if (!task) {
    return NextResponse.json({ message: 'Task not found' }, { status: 404 });
  }
  return NextResponse.json(task);
}
```

```ts
// apps/web/src/app/api/generation-tasks/[id]/regenerate/route.ts
import { NextResponse } from 'next/server';
import { createMockGenerationTask } from '@/features/generation/mock-generation';
import { mockTasks } from '../../route';

export async function POST(_: Request, { params }: { params: { id: string } }) {
  const previous = mockTasks.get(params.id);
  if (!previous) {
    return NextResponse.json({ message: 'Task not found' }, { status: 404 });
  }

  const task = createMockGenerationTask(previous.request);
  mockTasks.set(task.id, task);
  return NextResponse.json(task, { status: 201 });
}
```

```ts
// apps/web/src/app/api/generation-tasks/[id]/modify/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { modifyMockGenerationTask } from '@/features/generation/mock-generation';
import { mockTasks } from '../../route';

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const previous = mockTasks.get(params.id);
  if (!previous) {
    return NextResponse.json({ message: 'Task not found' }, { status: 404 });
  }

  const body = (await request.json()) as {
    selectedResultId: string;
    modificationText: string;
  };
  const task = modifyMockGenerationTask(previous, body.selectedResultId, body.modificationText);
  mockTasks.set(task.id, task);
  return NextResponse.json(task, { status: 201 });
}
```

- [ ] **Step 3: Build to verify route types**

Run:

```bash
cd apps/web
npm run build
```

Expected: Next.js build succeeds.

- [ ] **Step 4: Commit**

```bash
git add apps/web
git commit -m "feat: add mock generation api routes"
```

## Task 5: Image Page Input and Bottom Sheets

**Files:**

- Create: `apps/web/src/components/BottomSheet.tsx`
- Create: `apps/web/src/components/QuickActionBar.tsx`
- Create: `apps/web/src/components/ImageUploader.tsx`
- Create: `apps/web/src/components/OptionPicker.tsx`
- Create: `apps/web/src/components/ActivityInfoForm.tsx`
- Create: `apps/web/src/components/ChatComposer.tsx`
- Modify: `apps/web/src/app/image/page.tsx`

- [ ] **Step 1: Create reusable bottom sheet**

```tsx
// apps/web/src/components/BottomSheet.tsx
'use client';

import { X } from 'lucide-react';

type BottomSheetProps = {
  title: string;
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
};

export function BottomSheet({ title, open, onClose, children }: BottomSheetProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 px-3">
      <section className="max-h-[82dvh] w-full max-w-[430px] overflow-auto rounded-t-xl bg-surface p-4 shadow-soft">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-[17px] font-semibold text-ink">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="grid h-9 w-9 place-items-center rounded-full border border-line"
            aria-label="关闭"
          >
            <X size={18} />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}
```

- [ ] **Step 2: Create quick action bar**

```tsx
// apps/web/src/components/QuickActionBar.tsx
'use client';

import { CalendarDays, ImagePlus, Megaphone, Palette, SendToBack } from 'lucide-react';

type QuickActionBarProps = {
  onOpen: (key: 'upload' | 'channel' | 'scene' | 'style' | 'info') => void;
};

const actions = [
  { key: 'upload', label: '上传图片', icon: ImagePlus },
  { key: 'channel', label: '发布渠道', icon: SendToBack },
  { key: 'scene', label: '营销场景', icon: Megaphone },
  { key: 'style', label: '风格模板', icon: Palette },
  { key: 'info', label: '活动信息', icon: CalendarDays },
] as const;

export function QuickActionBar({ onOpen }: QuickActionBarProps) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-2">
      {actions.map((action) => {
        const Icon = action.icon;
        return (
          <button
            key={action.key}
            type="button"
            onClick={() => onOpen(action.key)}
            className="flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-line bg-surface px-3 text-[13px] text-ink"
          >
            <Icon size={15} aria-hidden="true" />
            {action.label}
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 3: Create uploader, picker, activity form, and composer**

```tsx
// apps/web/src/components/ImageUploader.tsx
'use client';

type ImageUploaderProps = {
  imageDataUrl?: string;
  onChange: (dataUrl?: string) => void;
};

export function ImageUploader({ imageDataUrl, onChange }: ImageUploaderProps) {
  return (
    <div className="grid gap-3">
      {imageDataUrl ? (
        <img src={imageDataUrl} alt="已上传图片预览" className="aspect-[4/3] w-full rounded-lg object-cover" />
      ) : (
        <div className="grid aspect-[4/3] place-items-center rounded-lg border border-dashed border-line bg-canvas text-sm text-muted">
          商品图可选，上传后会优先保持商品一致性
        </div>
      )}
      <input
        type="file"
        accept="image/*"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (!file) return;
          const reader = new FileReader();
          reader.onload = () => onChange(String(reader.result));
          reader.readAsDataURL(file);
        }}
      />
      {imageDataUrl ? (
        <button type="button" onClick={() => onChange(undefined)} className="rounded-lg border border-line py-2 text-sm">
          移除图片
        </button>
      ) : null}
    </div>
  );
}
```

```tsx
// apps/web/src/components/OptionPicker.tsx
'use client';

type OptionPickerProps<T extends string> = {
  multiple?: boolean;
  value: T | T[];
  options: Array<{ value: T; label: string }>;
  onChange: (value: T | T[]) => void;
};

export function OptionPicker<T extends string>({ multiple, value, options, onChange }: OptionPickerProps<T>) {
  const selectedValues = Array.isArray(value) ? value : [value];

  return (
    <div className="grid grid-cols-2 gap-2">
      {options.map((option) => {
        const selected = selectedValues.includes(option.value);
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => {
              if (!multiple) {
                onChange(option.value);
                return;
              }
              const next = selected
                ? selectedValues.filter((item) => item !== option.value)
                : [...selectedValues, option.value];
              onChange(next);
            }}
            className={selected ? 'rounded-lg bg-accent px-3 py-3 text-sm text-white' : 'rounded-lg border border-line px-3 py-3 text-sm text-ink'}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
```

```tsx
// apps/web/src/components/ActivityInfoForm.tsx
'use client';

import type { CampaignInfo } from '@/features/generation/generation-types';

type ActivityInfoFormProps = {
  value: CampaignInfo;
  onChange: (value: CampaignInfo) => void;
};

const fields: Array<{ key: keyof CampaignInfo; label: string; placeholder: string }> = [
  { key: 'storeName', label: '店名', placeholder: '小巷奶茶' },
  { key: 'productName', label: '产品名', placeholder: '柠檬茶' },
  { key: 'price', label: '价格', placeholder: '19.9' },
  { key: 'campaignTime', label: '活动时间', placeholder: '今日 / 本周末 / 5月20日' },
  { key: 'address', label: '地址', placeholder: '门店地址' },
  { key: 'phone', label: '电话', placeholder: '联系电话' },
  { key: 'extraSellingPoints', label: '补充卖点', placeholder: '第二杯半价、现做现喝' },
];

export function ActivityInfoForm({ value, onChange }: ActivityInfoFormProps) {
  return (
    <div className="grid gap-3">
      {fields.map((field) => (
        <label key={field.key} className="grid gap-1.5 text-sm text-ink">
          {field.label}
          <input
            value={value[field.key] ?? ''}
            placeholder={field.placeholder}
            onChange={(event) => onChange({ ...value, [field.key]: event.target.value })}
            className="h-11 rounded-lg border border-line bg-white px-3 outline-none focus:border-accent"
          />
        </label>
      ))}
    </div>
  );
}
```

```tsx
// apps/web/src/components/ChatComposer.tsx
'use client';

import { Send } from 'lucide-react';

type ChatComposerProps = {
  value: string;
  loading: boolean;
  onChange: (value: string) => void;
  onSubmit: () => void;
};

export function ChatComposer({ value, loading, onChange, onSubmit }: ChatComposerProps) {
  return (
    <div className="flex items-end gap-2 rounded-2xl border border-line bg-surface p-2 shadow-soft">
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={1}
        placeholder="描述你想生成的营销图片..."
        className="max-h-28 min-h-10 flex-1 resize-none bg-transparent px-2 py-2 text-[15px] outline-none"
      />
      <button
        type="button"
        disabled={loading || value.trim().length === 0}
        onClick={onSubmit}
        className="grid h-10 w-10 place-items-center rounded-full bg-accent text-white disabled:bg-line"
        aria-label="发送"
      >
        <Send size={18} />
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Wire image page state and sheets**

```tsx
// apps/web/src/app/image/page.tsx
'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { ActivityInfoForm } from '@/components/ActivityInfoForm';
import { AppShell } from '@/components/AppShell';
import { BottomSheet } from '@/components/BottomSheet';
import { ChatComposer } from '@/components/ChatComposer';
import { ImageUploader } from '@/components/ImageUploader';
import { OptionPicker } from '@/components/OptionPicker';
import { QuickActionBar } from '@/components/QuickActionBar';
import {
  channelOptions,
  sceneOptions,
  styleOptions,
} from '@/features/generation/generation-options';
import { createGenerationTask } from '@/features/generation/generation-client';
import type {
  CampaignInfo,
  Channel,
  GenerationTask,
  MarketingScene,
  StyleTemplate,
} from '@/features/generation/generation-types';

type SheetKey = 'upload' | 'channel' | 'scene' | 'style' | 'info' | null;

export default function ImagePage() {
  const [activeSheet, setActiveSheet] = useState<SheetKey>(null);
  const [requestText, setRequestText] = useState('');
  const [uploadedImageDataUrl, setUploadedImageDataUrl] = useState<string | undefined>();
  const [channels, setChannels] = useState<Channel[]>(['wechat']);
  const [scene, setScene] = useState<MarketingScene>('new_product');
  const [style, setStyle] = useState<StyleTemplate>('young_trendy');
  const [campaignInfo, setCampaignInfo] = useState<CampaignInfo>({});
  const [task, setTask] = useState<GenerationTask | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    setLoading(true);
    setError(null);
    try {
      const nextTask = await createGenerationTask({
        requestText,
        uploadedImageDataUrl,
        channels,
        scene,
        style,
        campaignInfo,
      });
      setTask(nextTask);
      setRequestText('');
    } catch (generationError) {
      setError(generationError instanceof Error ? generationError.message : '生成失败');
    } finally {
      setLoading(false);
    }
  }

  return (
    <AppShell>
      <div className="flex min-h-dvh flex-col pb-4">
        <header className="flex items-center gap-3 pt-1">
          <Link href="/" className="grid h-9 w-9 place-items-center rounded-full border border-line bg-surface">
            <ArrowLeft size={18} aria-hidden="true" />
          </Link>
          <div>
            <h1 className="text-[22px] font-semibold text-ink">图片营销</h1>
            <p className="text-[13px] text-muted">一句话生成图文营销包</p>
          </div>
        </header>

        <section className="mt-5 flex-1 space-y-3">
          <div className="rounded-lg border border-line bg-surface p-3 text-[14px] leading-6 text-muted">
            你可以先上传商品图，也可以直接输入需求。商品图可选，上传后默认保持商品一致性。
          </div>

          {loading ? (
            <div className="rounded-lg border border-line bg-surface p-4 text-[15px] text-ink">
              正在生成 3 套图片营销方案...
            </div>
          ) : null}

          {error ? (
            <div className="rounded-lg border border-warm bg-white p-3 text-[14px] text-warm">{error}</div>
          ) : null}

          {task ? (
            <div className="rounded-lg border border-line bg-surface p-3">
              <p className="text-[15px] font-semibold text-ink">已生成 {task.results.length} 套方案</p>
              <div className="mt-2 grid gap-2">
                {task.results.map((result) => (
                  <div key={result.id} className="rounded-lg bg-canvas p-3 text-[14px] text-ink">
                    {result.title}
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </section>

        <footer className="sticky bottom-0 -mx-4 bg-canvas px-4 pb-2 pt-3">
          <QuickActionBar onOpen={setActiveSheet} />
          <ChatComposer
            value={requestText}
            loading={loading}
            onChange={setRequestText}
            onSubmit={handleSubmit}
          />
        </footer>
      </div>

      <BottomSheet title="上传图片" open={activeSheet === 'upload'} onClose={() => setActiveSheet(null)}>
        <ImageUploader imageDataUrl={uploadedImageDataUrl} onChange={setUploadedImageDataUrl} />
      </BottomSheet>

      <BottomSheet title="发布渠道" open={activeSheet === 'channel'} onClose={() => setActiveSheet(null)}>
        <OptionPicker multiple value={channels} options={channelOptions} onChange={(value) => setChannels(value as Channel[])} />
      </BottomSheet>

      <BottomSheet title="营销场景" open={activeSheet === 'scene'} onClose={() => setActiveSheet(null)}>
        <OptionPicker value={scene} options={sceneOptions} onChange={(value) => setScene(value as MarketingScene)} />
      </BottomSheet>

      <BottomSheet title="风格模板" open={activeSheet === 'style'} onClose={() => setActiveSheet(null)}>
        <OptionPicker value={style} options={styleOptions} onChange={(value) => setStyle(value as StyleTemplate)} />
      </BottomSheet>

      <BottomSheet title="活动信息" open={activeSheet === 'info'} onClose={() => setActiveSheet(null)}>
        <ActivityInfoForm value={campaignInfo} onChange={setCampaignInfo} />
      </BottomSheet>
    </AppShell>
  );
}
```

- [ ] **Step 5: Build to verify**

Run:

```bash
cd apps/web
npm run build
```

Expected: build succeeds and `/image` renders input controls.

- [ ] **Step 6: Commit**

```bash
git add apps/web
git commit -m "feat: add image generation inputs"
```

## Task 6: Result Cards, Poster Preview, and Actions

**Files:**

- Create: `apps/web/src/components/PosterPreview.tsx`
- Create: `apps/web/src/components/ResultCard.tsx`
- Create: `apps/web/src/lib/download.ts`
- Modify: `apps/web/src/app/image/page.tsx`

- [ ] **Step 1: Create poster preview**

```tsx
// apps/web/src/components/PosterPreview.tsx
import type { GenerationResult } from '@/features/generation/generation-types';

export function PosterPreview({ result }: { result: GenerationResult }) {
  return (
    <div className="relative aspect-[4/5] overflow-hidden rounded-lg bg-[#f1e5d0] p-4">
      {result.uploadedImageDataUrl ? (
        <img
          src={result.uploadedImageDataUrl}
          alt=""
          className="absolute inset-x-4 top-4 h-[46%] w-[calc(100%-2rem)] rounded-lg object-cover"
        />
      ) : (
        <div className="absolute inset-x-4 top-4 grid h-[46%] place-items-center rounded-lg bg-[#243b36] text-sm text-white">
          氛围宣传图
        </div>
      )}
      <div className="absolute inset-x-4 bottom-4 rounded-lg bg-white/92 p-3">
        <p className="text-[22px] font-bold leading-7 text-ink">{result.imageText[0]}</p>
        <p className="mt-2 text-[15px] font-semibold text-warm">{result.imageText[1]}</p>
        <p className="mt-1 text-[12px] text-muted">{result.imageText[2]}</p>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create download helper**

```ts
// apps/web/src/lib/download.ts
import { toPng } from 'html-to-image';

export async function downloadNodeAsPng(node: HTMLElement, filename: string) {
  const dataUrl = await toPng(node, { cacheBust: true, pixelRatio: 2 });
  const link = document.createElement('a');
  link.download = filename;
  link.href = dataUrl;
  link.click();
}
```

- [ ] **Step 3: Create result card**

```tsx
// apps/web/src/components/ResultCard.tsx
'use client';

import { Copy, Download, RotateCcw, Wand2 } from 'lucide-react';
import { useRef } from 'react';
import type { GenerationResult } from '@/features/generation/generation-types';
import { downloadNodeAsPng } from '@/lib/download';
import { PosterPreview } from './PosterPreview';

type ResultCardProps = {
  result: GenerationResult;
  onRegenerate: () => void;
  onModify: (resultId: string) => void;
};

export function ResultCard({ result, onRegenerate, onModify }: ResultCardProps) {
  const posterRef = useRef<HTMLDivElement>(null);

  return (
    <article className="rounded-lg border border-line bg-surface p-3 shadow-soft">
      <div ref={posterRef}>
        <PosterPreview result={result} />
      </div>
      <div className="mt-3">
        <p className="text-[17px] font-semibold text-ink">{result.title}</p>
        <p className="mt-2 whitespace-pre-line text-[14px] leading-6 text-muted">{result.publishingCopy}</p>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => navigator.clipboard.writeText(result.publishingCopy)}
          className="flex h-10 items-center justify-center gap-1 rounded-lg border border-line text-sm"
        >
          <Copy size={15} /> 复制文案
        </button>
        <button
          type="button"
          onClick={() => posterRef.current && downloadNodeAsPng(posterRef.current, `${result.id}.png`)}
          className="flex h-10 items-center justify-center gap-1 rounded-lg border border-line text-sm"
        >
          <Download size={15} /> 下载图片
        </button>
        <button
          type="button"
          onClick={onRegenerate}
          className="flex h-10 items-center justify-center gap-1 rounded-lg border border-line text-sm"
        >
          <RotateCcw size={15} /> 重新生成
        </button>
        <button
          type="button"
          onClick={() => onModify(result.id)}
          className="flex h-10 items-center justify-center gap-1 rounded-lg bg-accent text-sm text-white"
        >
          <Wand2 size={15} /> 二次修改
        </button>
      </div>
    </article>
  );
}
```

- [ ] **Step 4: Wire result rendering into image page**

Update `apps/web/src/app/image/page.tsx` so result cards replace the simple title list from Task 5.

Add these imports:

```tsx
import { ResultCard } from '@/components/ResultCard';
import { modifyTask, regenerateTask } from '@/features/generation/generation-client';
```

Add this state:

```tsx
const [modifyingResultId, setModifyingResultId] = useState<string | null>(null);
```

Replace `handleSubmit` with:

```tsx
async function handleSubmit() {
  setLoading(true);
  setError(null);
  try {
    if (task && modifyingResultId) {
      const modifiedTask = await modifyTask(task.id, modifyingResultId, requestText);
      setTask(modifiedTask);
      setModifyingResultId(null);
      setRequestText('');
      return;
    }

    const nextTask = await createGenerationTask({
      requestText,
      uploadedImageDataUrl,
      channels,
      scene,
      style,
      campaignInfo,
    });
    setTask(nextTask);
    setRequestText('');
  } catch (generationError) {
    setError(generationError instanceof Error ? generationError.message : '生成失败');
  } finally {
    setLoading(false);
  }
}
```

Add this handler:

```tsx
async function handleRegenerate() {
  if (!task) return;
  setLoading(true);
  setError(null);
  try {
    const nextTask = await regenerateTask(task.id);
    setTask(nextTask);
  } catch (generationError) {
    setError(generationError instanceof Error ? generationError.message : '重新生成失败');
  } finally {
    setLoading(false);
  }
}
```

Replace the generated result title list with:

```tsx
{task ? (
  <div className="grid gap-3">
    {task.results.map((result) => (
      <ResultCard
        key={result.id}
        result={result}
        onRegenerate={handleRegenerate}
        onModify={(resultId) => {
          setModifyingResultId(resultId);
          setRequestText('');
        }}
      />
    ))}
  </div>
) : null}
```

Update `ChatComposer` placeholder behavior by passing this value as `value` and showing modification context above the footer:

```tsx
{modifyingResultId ? (
  <p className="pb-2 text-[13px] text-accent">正在二次修改当前方案，输入你想改的地方。</p>
) : null}
```

- [ ] **Step 5: Run build**

Run:

```bash
cd apps/web
npm run build
```

Expected: build succeeds and result cards compile.

- [ ] **Step 6: Commit**

```bash
git add apps/web
git commit -m "feat: add mock result cards and actions"
```

## Task 7: Local History

**Files:**

- Create: `apps/web/src/features/generation/local-history.ts`
- Modify: `apps/web/src/app/image/page.tsx`

- [ ] **Step 1: Create local history helper**

```ts
// apps/web/src/features/generation/local-history.ts
import type { GenerationTask } from './generation-types';

const KEY = 'ai-marketing-local-history';

export function saveTaskToHistory(task: GenerationTask) {
  const existing = loadTaskHistory();
  const next = [task, ...existing.filter((item) => item.id !== task.id)].slice(0, 10);
  localStorage.setItem(KEY, JSON.stringify(next));
}

export function loadTaskHistory(): GenerationTask[] {
  if (typeof window === 'undefined') return [];
  const raw = localStorage.getItem(KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as GenerationTask[];
  } catch {
    return [];
  }
}
```

- [ ] **Step 2: Add history display**

Update `apps/web/src/app/image/page.tsx`.

Add imports:

```tsx
import { useEffect } from 'react';
import { loadTaskHistory, saveTaskToHistory } from '@/features/generation/local-history';
```

Add state:

```tsx
const [history, setHistory] = useState<GenerationTask[]>([]);
```

Load history on mount:

```tsx
useEffect(() => {
  setHistory(loadTaskHistory());
}, []);
```

Whenever a new task is created, regenerated, or modified, call:

```tsx
saveTaskToHistory(nextTask);
setHistory(loadTaskHistory());
```

For the modify handler, call the same two lines with `modifiedTask`.

For the regenerate handler, call the same two lines with `nextTask`.

Render history before results:

```tsx
{history.length > 0 && !task ? (
  <section className="rounded-lg border border-line bg-surface p-3">
    <p className="text-[15px] font-semibold text-ink">最近生成</p>
    <div className="mt-2 grid gap-2">
      {history.slice(0, 3).map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => setTask(item)}
          className="rounded-lg bg-canvas p-3 text-left text-[14px] text-ink"
        >
          {item.request.requestText}
        </button>
      ))}
    </div>
  </section>
) : null}
```

- [ ] **Step 3: Build**

Run:

```bash
cd apps/web
npm run build
```

Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add apps/web
git commit -m "feat: add local generation history"
```

## Task 8: Mobile Flow E2E Test

**Files:**

- Modify: `apps/web/e2e/mobile-image-flow.spec.ts`

- [ ] **Step 1: Extend e2e test for image flow**

```ts
// apps/web/e2e/mobile-image-flow.spec.ts
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

test('image page generates mock marketing results', async ({ page }) => {
  await page.goto('/image');

  await page.getByPlaceholder('描述你想生成的营销图片...').fill('给新品奶茶做一张朋友圈宣传图，突出第二杯半价');
  await page.getByRole('button', { name: '发送' }).click();

  await expect(page.getByText('正在生成')).toBeVisible();
  await expect(page.getByText(/今日推荐|元起|限时上新/).first()).toBeVisible();
  await expect(page.getByRole('button', { name: /复制文案/ }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: /二次修改/ }).first()).toBeVisible();
});
```

- [ ] **Step 2: Run e2e test**

Run:

```bash
cd apps/web
npm run e2e
```

Expected: PASS for home entrance and mock generation flow.

- [ ] **Step 3: Commit**

```bash
git add apps/web/e2e/mobile-image-flow.spec.ts
git commit -m "test: cover mobile image generation flow"
```

## Task 9: LAN Access Instructions

**Files:**

- Create: `apps/web/README.md`
- Modify: `docs/superpowers/plans/2026-05-19-local-mobile-h5-mvp-implementation.md` if needed after verification.

- [ ] **Step 1: Create local usage README**

```md
# AI Marketing Mobile H5

## 本地启动

```bash
npm install
npm run dev
```

电脑浏览器打开：

```text
http://localhost:3000
```

## 手机访问

电脑和手机连接同一个 Wi-Fi。

在 Windows PowerShell 查看电脑局域网 IP：

```powershell
ipconfig
```

找到无线网卡里的 IPv4 地址，例如：

```text
192.168.1.23
```

手机浏览器打开：

```text
http://192.168.1.23:3000
```

如果手机打不开，检查 Windows 防火墙是否允许 Node.js 访问专用网络。

## 当前能力

- 首页三入口：文案、图片、视频。
- 图片页快捷按钮：上传图片、发布渠道、营销场景、风格模板、活动信息。
- Mock 图文营销包生成。
- 复制文案。
- 下载 mock 海报。
- 重新生成。
- 二次修改。
```

- [ ] **Step 2: Verify on desktop**

Run:

```bash
cd apps/web
npm run dev
```

Open:

```text
http://localhost:3000
```

Expected: home page loads.

- [ ] **Step 3: Verify on phone**

Run:

```powershell
ipconfig
```

Open on phone:

```text
http://<computer-ip>:3000
```

Expected: phone can open the H5 page on the same Wi-Fi.

- [ ] **Step 4: Commit**

```bash
git add apps/web/README.md docs/superpowers/plans/2026-05-19-local-mobile-h5-mvp-implementation.md
git commit -m "docs: add local mobile h5 usage guide"
```

## Task 10: Final Verification

**Files:**

- No new files expected unless verification reveals a specific defect.

- [ ] **Step 1: Run unit tests**

Run:

```bash
cd apps/web
npm test
```

Expected: all Vitest tests pass.

- [ ] **Step 2: Run production build**

Run:

```bash
cd apps/web
npm run build
```

Expected: Next.js production build succeeds.

- [ ] **Step 3: Run mobile e2e**

Run:

```bash
cd apps/web
npm run e2e
```

Expected: Playwright mobile smoke tests pass.

- [ ] **Step 4: Push branch**

Run:

```bash
git status --short
git push -u origin feature/local-mobile-mvp
```

Expected: branch is backed up to GitHub.

## Definition of Done

The local mobile H5 MVP is done when:

- The user can open the app on desktop at `http://localhost:3000`.
- The user can open the app on phone at `http://<computer-ip>:3000`.
- Home page shows 文案、图片、视频 three entrances.
- Image page has the bottom input and quick option buttons.
- User can upload or skip product image.
- User can choose channel, scene, style, and activity info.
- User can send one sentence and receive mock marketing result cards.
- User can copy generated copywriting.
- User can download a mock poster image.
- User can regenerate.
- User can use secondary modification.
- Local history shows recent generations.
- Unit tests, build, and mobile e2e pass.

## Plan Self-Review

- Spec coverage: This plan covers the product's H5-first direction, home three entrances, image generation page, quick buttons, optional product image, channel/scene/style/activity inputs, direct generation, result cards, regenerate, secondary modification, and local phone access.
- Scope control: It intentionally uses mock API routes and mock generation so the first version can be used locally without model costs, server costs, login, or deployment.
- Type consistency: Channel, scene, style, campaign info, task request, task, and result types are defined once in `generation-types.ts` and reused by mock generation, API routes, and UI components.
