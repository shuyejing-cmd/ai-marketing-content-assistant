# Status Note

Status: Deferred.

This historical plan describes a NestJS MVP backend. NestJS is still a long-term direction, but it is not enabled in the current implementation. The current working product remains in `apps/web` using Next.js App Router, API Routes, Prisma, PostgreSQL, APIMart, Tencent COS, and Ark text provider.

The next P0 task is not NestJS migration. It is the email/password account registration system and multi-user data isolation inside `apps/web`.

For current facts, read the root context files first: `AGENTS.md`, `CURRENT_STATUS.md`, `NEXT_TASKS.md`, `ARCHITECTURE.md`, `PROJECT_BRIEF.md`, and `DECISIONS.md`.

---

# MVP Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the MVP backend for the AI marketing content assistant: a modular NestJS service that supports image marketing generation tasks, optional product assets, structured templates, mock AI generation, result retrieval, regeneration, secondary modification, and feedback events.

**Architecture:** Use a modular monolith. Each business module owns its domain logic and data access; cross-module communication goes through explicit services and ports. AI providers, storage, and queue workers are infrastructure adapters behind stable interfaces so the product workflow is not coupled to a specific model, cloud vendor, or job runner.

**Tech Stack:** Node.js 20, TypeScript, NestJS, Prisma, PostgreSQL, Redis, BullMQ, Jest, Supertest, class-validator, class-transformer, pino, OpenAPI/Swagger.

---

## Target Hybrid Backend Architecture

The backend target architecture is:

```text
NestJS main backend
  owns users, merchants, templates, assets, points, orders, tasks, results, and feedback

AI Provider Adapter
  owns the unified model-call protocol

BullMQ + Redis
  own asynchronous task dispatch, cache, rate limits, and fast task status access

FastAPI AI execution service
  can be added later as a pluggable execution service for AI agents, image processing, multimodal workflows, and video workflows

PostgreSQL
  remains the source of truth for business data
```

FastAPI is intentionally not part of the MVP backend build. It should be introduced after the local H5 flow and NestJS task workflow are validated. When introduced, FastAPI should not own user, order, points, or task state. NestJS should call it through the AI Provider Adapter and keep business state in PostgreSQL.

## Scope Check

This plan covers the backend MVP only. It does not build the H5 frontend, the manual image editor, direct publishing integrations, complete video generation, or real model-provider integrations. The backend will expose stable API contracts that the H5 app can consume.

The first backend release uses `MockAiProvider` to prove the product workflow before real AI providers are connected.

## Backend Architecture Principles

- **High cohesion:** generation, templates, assets, prompts, provider calls, and result events live in their own modules.
- **Low coupling:** application services depend on ports such as `TextGenerationPort`, `ImageGenerationPort`, `StoragePort`, and `JobQueuePort`.
- **Async by default:** image generation, regeneration, and secondary modification are queued jobs.
- **Template assets are structured:** templates are not plain prompt strings; they contain scene, channel, style, required fields, layout guidance, and product consistency rules.
- **Product consistency is a domain rule:** uploaded product images are factual assets. Workflow and prompt generation must preserve this rule for every with-image generation.

## File Structure Map

Create the backend under `apps/api`.

```text
apps/api/
  docker-compose.yml
  package.json
  tsconfig.json
  tsconfig.build.json
  nest-cli.json
  jest.config.ts
  .env.example
  prisma/
    schema.prisma
    seed.ts
  src/
    main.ts
    app.module.ts
    common/
      domain/enums.ts
      domain/ids.ts
      errors/app-error.ts
      filters/http-exception.filter.ts
    health/
      health.controller.ts
      health.module.ts
    prisma/
      prisma.module.ts
      prisma.service.ts
    storage/
      storage.module.ts
      storage.port.ts
      local-storage.adapter.ts
    assets/
      dto/create-asset.dto.ts
      assets.controller.ts
      assets.module.ts
      assets.repository.ts
      assets.service.ts
    templates/
      dto/list-templates.dto.ts
      templates.controller.ts
      templates.module.ts
      templates.repository.ts
      templates.service.ts
    ai-providers/
      ai-provider.module.ts
      ports/text-generation.port.ts
      ports/image-generation.port.ts
      mock/mock-ai.provider.ts
    prompts/
      prompts.module.ts
      prompt-builder.service.ts
      prompt-contracts.ts
    workflow/
      generation-planner.service.ts
      generation-planner.types.ts
    generation/
      dto/create-generation-task.dto.ts
      dto/modify-generation-task.dto.ts
      dto/regenerate-task.dto.ts
      generation.controller.ts
      generation.module.ts
      generation.repository.ts
      generation.service.ts
      generation.worker.ts
      generation.queue.ts
    results/
      dto/create-result-event.dto.ts
      results.controller.ts
      results.module.ts
      results.repository.ts
      results.service.ts
  test/
    health.e2e-spec.ts
    generation.e2e-spec.ts
    fixtures/request-builders.ts
```

## Data Model Summary

Use Prisma with PostgreSQL.

Core tables:

- `User`: anonymous or registered user identity.
- `Merchant`: store profile such as name, phone, address, industry.
- `Asset`: uploaded product image, store image, logo, or generated image.
- `Template`: structured marketing template.
- `GenerationTask`: async task for create, regenerate, or modify.
- `GenerationResult`: image marketing package option.
- `ResultEvent`: user action events such as copy, download, regenerate, and modify.

## API Summary

MVP endpoints:

```text
GET    /health
POST   /assets
GET    /templates
POST   /generation-tasks
GET    /generation-tasks/:id
POST   /generation-tasks/:id/regenerate
POST   /generation-tasks/:id/modify
POST   /results/:id/events
```

## Task 0: Local Development Runtime

**Files:**

- Create: `apps/api/docker-compose.yml`
- Modify: `apps/api/.env.example`

- [ ] **Step 1: Create local Postgres and Redis runtime**

```yaml
# apps/api/docker-compose.yml
services:
  postgres:
    image: postgres:16-alpine
    container_name: ai-marketing-postgres
    ports:
      - "5432:5432"
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: ai_marketing
    volumes:
      - ai_marketing_postgres:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres -d ai_marketing"]
      interval: 5s
      timeout: 5s
      retries: 10

  redis:
    image: redis:7-alpine
    container_name: ai-marketing-redis
    ports:
      - "6379:6379"
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 5s
      retries: 10

volumes:
  ai_marketing_postgres:
```

- [ ] **Step 2: Keep environment defaults aligned with Docker Compose**

```env
# apps/api/.env.example
NODE_ENV=development
PORT=3001
# DATABASE_URL should point to local PostgreSQL. Do not write real credentials in docs.
REDIS_URL=redis://localhost:6379
STORAGE_DRIVER=local
LOCAL_STORAGE_DIR=.local-storage
AI_PROVIDER=mock
```

- [ ] **Step 3: Start local services**

Run:

```bash
cd apps/api
docker compose up -d
```

Expected: Postgres and Redis containers are healthy.

- [ ] **Step 4: Commit**

```bash
git add apps/api/docker-compose.yml apps/api/.env.example
git commit -m "chore: add backend local runtime"
```

## Task 1: Backend Project Foundation

**Files:**

- Create: `apps/api/package.json`
- Create: `apps/api/tsconfig.json`
- Create: `apps/api/tsconfig.build.json`
- Create: `apps/api/nest-cli.json`
- Create: `apps/api/jest.config.ts`
- Create: `apps/api/.env.example`
- Create: `apps/api/src/main.ts`
- Create: `apps/api/src/app.module.ts`
- Create: `apps/api/src/health/health.module.ts`
- Create: `apps/api/src/health/health.controller.ts`
- Create: `apps/api/test/health.e2e-spec.ts`

- [ ] **Step 1: Create the failing health-check e2e test**

```ts
// apps/api/test/health.e2e-spec.ts
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';

describe('HealthController', () => {
  it('returns service health', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    const app = moduleRef.createNestApplication();
    await app.init();

    await request(app.getHttpServer())
      .get('/health')
      .expect(200)
      .expect({
        status: 'ok',
        service: 'ai-marketing-api',
      });

    await app.close();
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run:

```bash
cd apps/api
npm test -- health.e2e-spec.ts
```

Expected: FAIL because `AppModule` and `HealthController` do not exist.

- [ ] **Step 3: Create project configuration**

```json
// apps/api/package.json
{
  "name": "ai-marketing-api",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "start": "nest start",
    "start:dev": "nest start --watch",
    "build": "nest build",
    "db:up": "docker compose up -d",
    "db:down": "docker compose down",
    "test": "jest --config jest.config.ts",
    "test:e2e": "jest --config jest.config.ts --testRegex '.*\\.e2e-spec\\.ts$'",
    "lint": "eslint \"src/**/*.ts\" \"test/**/*.ts\"",
    "prisma:generate": "prisma generate",
    "prisma:migrate": "prisma migrate dev",
    "prisma:seed": "tsx prisma/seed.ts"
  },
  "dependencies": {
    "@nestjs/bullmq": "^10.2.3",
    "@nestjs/common": "^10.4.15",
    "@nestjs/config": "^3.3.0",
    "@nestjs/core": "^10.4.15",
    "@nestjs/platform-express": "^10.4.15",
    "@nestjs/swagger": "^8.1.0",
    "@prisma/client": "^5.22.0",
    "bullmq": "^5.34.2",
    "class-transformer": "^0.5.1",
    "class-validator": "^0.14.1",
    "ioredis": "^5.4.1",
    "pino": "^9.5.0",
    "reflect-metadata": "^0.2.2",
    "rxjs": "^7.8.1"
  },
  "devDependencies": {
    "@nestjs/cli": "^10.4.8",
    "@nestjs/testing": "^10.4.15",
    "@types/jest": "^29.5.14",
    "@types/node": "^22.9.0",
    "@types/supertest": "^6.0.2",
    "jest": "^29.7.0",
    "prisma": "^5.22.0",
    "supertest": "^7.0.0",
    "ts-jest": "^29.2.5",
    "ts-node": "^10.9.2",
    "tsx": "^4.19.2",
    "typescript": "^5.6.3"
  },
  "prisma": {
    "seed": "tsx prisma/seed.ts"
  }
}
```

```json
// apps/api/tsconfig.json
{
  "compilerOptions": {
    "module": "commonjs",
    "declaration": true,
    "removeComments": true,
    "emitDecoratorMetadata": true,
    "experimentalDecorators": true,
    "allowSyntheticDefaultImports": true,
    "target": "ES2022",
    "sourceMap": true,
    "outDir": "./dist",
    "baseUrl": "./",
    "incremental": true,
    "strict": true,
    "skipLibCheck": true
  },
  "include": ["src/**/*.ts", "test/**/*.ts", "prisma/**/*.ts"]
}
```

```json
// apps/api/tsconfig.build.json
{
  "extends": "./tsconfig.json",
  "exclude": ["node_modules", "test", "dist", "**/*.spec.ts", "**/*.e2e-spec.ts"]
}
```

```json
// apps/api/nest-cli.json
{
  "$schema": "https://json.schemastore.org/nest-cli",
  "collection": "@nestjs/schematics",
  "sourceRoot": "src"
}
```

```ts
// apps/api/jest.config.ts
import type { Config } from 'jest';

const config: Config = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testEnvironment: 'node',
  transform: {
    '^.+\\.(t|j)s$': ['ts-jest', { tsconfig: 'tsconfig.json' }],
  },
  testRegex: '.*\\.(spec|e2e-spec)\\.ts$',
};

export default config;
```

- [ ] **Step 4: Create the minimal NestJS app**

```ts
// apps/api/src/main.ts
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidUnknownValues: true,
    }),
  );
  await app.listen(process.env.PORT ? Number(process.env.PORT) : 3001);
}

void bootstrap();
```

```ts
// apps/api/src/app.module.ts
import { Module } from '@nestjs/common';
import { HealthModule } from './health/health.module';

@Module({
  imports: [HealthModule],
})
export class AppModule {}
```

```ts
// apps/api/src/health/health.module.ts
import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';

@Module({
  controllers: [HealthController],
})
export class HealthModule {}
```

```ts
// apps/api/src/health/health.controller.ts
import { Controller, Get } from '@nestjs/common';

@Controller('health')
export class HealthController {
  @Get()
  getHealth() {
    return {
      status: 'ok',
      service: 'ai-marketing-api',
    };
  }
}
```

- [ ] **Step 5: Run the test and verify it passes**

Run:

```bash
cd apps/api
npm install
npm test -- health.e2e-spec.ts
```

Expected: PASS for `HealthController returns service health`.

- [ ] **Step 6: Commit**

```bash
git add apps/api
git commit -m "chore: scaffold backend api"
```

## Task 2: Shared Domain Contracts

**Files:**

- Create: `apps/api/src/common/domain/enums.ts`
- Create: `apps/api/src/common/domain/ids.ts`
- Create: `apps/api/src/workflow/generation-planner.types.ts`
- Create: `apps/api/src/workflow/generation-planner.service.ts`
- Create: `apps/api/src/workflow/generation-planner.service.spec.ts`

- [ ] **Step 1: Write failing tests for generation planning**

```ts
// apps/api/src/workflow/generation-planner.service.spec.ts
import { GenerationPlannerService } from './generation-planner.service';
import { Channel, GenerationMode, MarketingScene, StyleTemplate } from '../common/domain/enums';

describe('GenerationPlannerService', () => {
  const planner = new GenerationPlannerService();

  it('uses with-image mode when product asset ids are present', () => {
    const plan = planner.plan({
      requestText: '给新品奶茶做一张朋友圈宣传图',
      assetIds: ['asset_product_1'],
      channels: [Channel.WECHAT],
      scene: MarketingScene.NEW_PRODUCT,
      style: StyleTemplate.YOUNG_TRENDY,
      campaignInfo: { productName: '柠檬茶', price: '19.9' },
    });

    expect(plan.mode).toBe(GenerationMode.WITH_IMAGE);
    expect(plan.mustPreserveProductConsistency).toBe(true);
    expect(plan.outputs).toHaveLength(3);
  });

  it('uses no-image mode when asset ids are empty', () => {
    const plan = planner.plan({
      requestText: '给烧烤店今晚啤酒买一送一做一张朋友圈图',
      assetIds: [],
      channels: [Channel.WECHAT],
      scene: MarketingScene.TODAY_SPECIAL,
      style: StyleTemplate.STRONG_PROMOTION,
      campaignInfo: {},
    });

    expect(plan.mode).toBe(GenerationMode.NO_IMAGE);
    expect(plan.mustPreserveProductConsistency).toBe(false);
  });

  it('limits outputs to the first three selected channels', () => {
    const plan = planner.plan({
      requestText: '给门店活动做宣传图',
      assetIds: [],
      channels: [Channel.WECHAT, Channel.XIAOHONGSHU, Channel.DOUYIN, Channel.MEITUAN_DIANPING],
      scene: MarketingScene.FESTIVAL,
      style: StyleTemplate.FESTIVAL,
      campaignInfo: {},
    });

    expect(plan.outputs.map((output) => output.channel)).toEqual([
      Channel.WECHAT,
      Channel.XIAOHONGSHU,
      Channel.DOUYIN,
    ]);
  });
});
```

- [ ] **Step 2: Run the tests and verify they fail**

Run:

```bash
cd apps/api
npm test -- generation-planner.service.spec.ts
```

Expected: FAIL because enums and planner service do not exist.

- [ ] **Step 3: Create shared enums**

```ts
// apps/api/src/common/domain/enums.ts
export enum Channel {
  WECHAT = 'wechat',
  XIAOHONGSHU = 'xiaohongshu',
  DOUYIN = 'douyin',
  MEITUAN_DIANPING = 'meituan_dianping',
}

export enum MarketingScene {
  NEW_PRODUCT = 'new_product',
  TODAY_SPECIAL = 'today_special',
  GROUP_BUYING = 'group_buying',
  FESTIVAL = 'festival',
  OPENING = 'opening',
  BEST_SELLER = 'best_seller',
  CUSTOM = 'custom',
}

export enum StyleTemplate {
  STREET_WARMTH = 'street_warmth',
  CLEAN_PREMIUM = 'clean_premium',
  YOUNG_TRENDY = 'young_trendy',
  REAL_LOCAL_SHOP = 'real_local_shop',
  STRONG_PROMOTION = 'strong_promotion',
  FESTIVAL = 'festival',
}

export enum AssetKind {
  PRODUCT_IMAGE = 'product_image',
  STORE_IMAGE = 'store_image',
  LOGO = 'logo',
  GENERATED_IMAGE = 'generated_image',
}

export enum GenerationMode {
  WITH_IMAGE = 'with_image',
  NO_IMAGE = 'no_image',
}

export enum GenerationTaskKind {
  CREATE = 'create',
  REGENERATE = 'regenerate',
  MODIFY = 'modify',
}

export enum GenerationTaskStatus {
  CREATED = 'created',
  QUEUED = 'queued',
  RUNNING = 'running',
  SUCCEEDED = 'succeeded',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

export enum ResultEventType {
  COPIED_COPY = 'copied_copy',
  DOWNLOADED_IMAGE = 'downloaded_image',
  REQUESTED_REGENERATE = 'requested_regenerate',
  REQUESTED_MODIFY = 'requested_modify',
}
```

```ts
// apps/api/src/common/domain/ids.ts
import { randomUUID } from 'node:crypto';

export type UserId = string;
export type MerchantId = string;
export type AssetId = string;
export type TemplateId = string;
export type GenerationTaskId = string;
export type GenerationResultId = string;

export function makeId(prefix: string): string {
  const randomPart = randomUUID().replaceAll('-', '').slice(0, 24);
  return `${prefix}_${randomPart}`;
}
```

- [ ] **Step 4: Create generation planner types and service**

```ts
// apps/api/src/workflow/generation-planner.types.ts
import { Channel, GenerationMode, MarketingScene, StyleTemplate } from '../common/domain/enums';

export type CampaignInfo = {
  storeName?: string;
  productName?: string;
  price?: string;
  campaignTime?: string;
  address?: string;
  phone?: string;
  extraSellingPoints?: string;
};

export type GenerationPlanInput = {
  requestText: string;
  assetIds: string[];
  channels: Channel[];
  scene: MarketingScene;
  style: StyleTemplate;
  campaignInfo: CampaignInfo;
};

export type PlannedOutput = {
  channel: Channel;
  optionIndex: number;
};

export type GenerationPlan = {
  mode: GenerationMode;
  mustPreserveProductConsistency: boolean;
  outputs: PlannedOutput[];
  input: GenerationPlanInput;
};
```

```ts
// apps/api/src/workflow/generation-planner.service.ts
import { Injectable } from '@nestjs/common';
import { Channel, GenerationMode } from '../common/domain/enums';
import { GenerationPlan, GenerationPlanInput, PlannedOutput } from './generation-planner.types';

@Injectable()
export class GenerationPlannerService {
  plan(input: GenerationPlanInput): GenerationPlan {
    const selectedChannels = this.normalizeChannels(input.channels);
    const mode = input.assetIds.length > 0 ? GenerationMode.WITH_IMAGE : GenerationMode.NO_IMAGE;

    return {
      mode,
      mustPreserveProductConsistency: mode === GenerationMode.WITH_IMAGE,
      outputs: this.planOutputs(selectedChannels),
      input: {
        ...input,
        channels: selectedChannels,
      },
    };
  }

  private normalizeChannels(channels: Channel[]): Channel[] {
    return channels.length > 0 ? channels : [Channel.WECHAT];
  }

  private planOutputs(channels: Channel[]): PlannedOutput[] {
    if (channels.length === 1) {
      return [0, 1, 2].map((optionIndex) => ({
        channel: channels[0],
        optionIndex,
      }));
    }

    return channels.slice(0, 3).map((channel, optionIndex) => ({
      channel,
      optionIndex,
    }));
  }
}
```

- [ ] **Step 5: Run the tests and verify they pass**

Run:

```bash
cd apps/api
npm test -- generation-planner.service.spec.ts
```

Expected: PASS for all generation planner tests.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/common apps/api/src/workflow
git commit -m "feat: add generation planning domain contracts"
```

## Task 3: Database Schema and Prisma Service

**Files:**

- Create: `apps/api/prisma/schema.prisma`
- Create: `apps/api/src/prisma/prisma.module.ts`
- Create: `apps/api/src/prisma/prisma.service.ts`
- Modify: `apps/api/src/app.module.ts`

- [ ] **Step 1: Write Prisma schema**

```prisma
// apps/api/prisma/schema.prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id        String   @id
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  merchants Merchant[]
  assets    Asset[]
  tasks     GenerationTask[]
}

model Merchant {
  id        String   @id
  userId    String
  name      String
  industry  String
  address   String?
  phone     String?
  logoId    String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  user User @relation(fields: [userId], references: [id])
}

model Asset {
  id          String   @id
  userId      String
  kind        String
  originalName String
  mimeType    String
  byteSize    Int
  storageKey  String
  publicUrl   String
  createdAt   DateTime @default(now())

  user User @relation(fields: [userId], references: [id])
  taskAssets GenerationTaskAsset[]
}

model Template {
  id              String   @id
  industry        String
  scene           String
  style           String?
  channel         String?
  name            String
  description     String
  recommendedFields Json
  copyStructure   Json
  visualDirection Json
  sellingPointPriority Json
  productConsistencyRules Json
  isActive        Boolean  @default(true)
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
}

model GenerationTask {
  id              String   @id
  userId          String
  kind            String
  status          String
  requestText     String
  channels        Json
  scene           String
  style           String
  campaignInfo    Json
  mode            String
  errorMessage    String?
  parentTaskId    String?
  selectedResultId String?
  modificationText String?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  user    User @relation(fields: [userId], references: [id])
  assets  GenerationTaskAsset[]
  results GenerationResult[]
}

model GenerationTaskAsset {
  taskId  String
  assetId String

  task  GenerationTask @relation(fields: [taskId], references: [id])
  asset Asset          @relation(fields: [assetId], references: [id])

  @@id([taskId, assetId])
}

model GenerationResult {
  id              String   @id
  taskId          String
  channel         String
  style           String
  title           String
  publishingCopy  String
  imageText       Json
  imageAssetId    String?
  imageUrl        String
  promptSnapshot  Json
  optionIndex     Int
  createdAt       DateTime @default(now())

  task   GenerationTask @relation(fields: [taskId], references: [id])
  events ResultEvent[]
}

model ResultEvent {
  id        String   @id
  resultId  String
  eventType String
  metadata  Json
  createdAt DateTime @default(now())

  result GenerationResult @relation(fields: [resultId], references: [id])
}
```

- [ ] **Step 2: Start database and create initial migration**

Run:

```bash
cd apps/api
npm run db:up
npm run prisma:generate
npx prisma migrate dev --name init
```

Expected: Prisma client is generated and the initial migration applies to the local Postgres database.

- [ ] **Step 3: Create Prisma service**

```ts
// apps/api/src/prisma/prisma.service.ts
import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
```

```ts
// apps/api/src/prisma/prisma.module.ts
import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
```

```ts
// apps/api/src/app.module.ts
import { Module } from '@nestjs/common';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [PrismaModule, HealthModule],
})
export class AppModule {}
```

- [ ] **Step 4: Run build**

Run:

```bash
cd apps/api
npm run build
```

Expected: Build succeeds with no TypeScript errors.

- [ ] **Step 5: Commit**

```bash
git add apps/api/prisma apps/api/src/prisma apps/api/src/app.module.ts
git commit -m "feat: add prisma schema and service"
```

## Task 4: Template Module and Seed Data

**Files:**

- Create: `apps/api/prisma/seed.ts`
- Create: `apps/api/src/templates/dto/list-templates.dto.ts`
- Create: `apps/api/src/templates/templates.repository.ts`
- Create: `apps/api/src/templates/templates.service.ts`
- Create: `apps/api/src/templates/templates.controller.ts`
- Create: `apps/api/src/templates/templates.module.ts`
- Create: `apps/api/src/templates/templates.service.spec.ts`
- Modify: `apps/api/src/app.module.ts`

- [ ] **Step 1: Write failing template service test**

```ts
// apps/api/src/templates/templates.service.spec.ts
import { TemplatesService } from './templates.service';
import { MarketingScene } from '../common/domain/enums';

describe('TemplatesService', () => {
  it('filters active templates by industry and scene', async () => {
    const repository = {
      list: jest.fn().mockResolvedValue([
        {
          id: 'template_food_new_product',
          industry: 'food_beverage',
          scene: MarketingScene.NEW_PRODUCT,
          name: '餐饮新品推广',
          isActive: true,
        },
      ]),
    };
    const service = new TemplatesService(repository as never);

    const templates = await service.list({
      industry: 'food_beverage',
      scene: MarketingScene.NEW_PRODUCT,
    });

    expect(repository.list).toHaveBeenCalledWith({
      industry: 'food_beverage',
      scene: MarketingScene.NEW_PRODUCT,
      channel: undefined,
      style: undefined,
    });
    expect(templates).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run:

```bash
cd apps/api
npm test -- templates.service.spec.ts
```

Expected: FAIL because `TemplatesService` does not exist.

- [ ] **Step 3: Create template DTO, repository, service, and controller**

```ts
// apps/api/src/templates/dto/list-templates.dto.ts
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { Channel, MarketingScene, StyleTemplate } from '../../common/domain/enums';

export class ListTemplatesDto {
  @IsOptional()
  @IsString()
  industry?: string;

  @IsOptional()
  @IsEnum(MarketingScene)
  scene?: MarketingScene;

  @IsOptional()
  @IsEnum(Channel)
  channel?: Channel;

  @IsOptional()
  @IsEnum(StyleTemplate)
  style?: StyleTemplate;
}
```

```ts
// apps/api/src/templates/templates.repository.ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ListTemplatesDto } from './dto/list-templates.dto';

@Injectable()
export class TemplatesRepository {
  constructor(private readonly prisma: PrismaService) {}

  list(filter: ListTemplatesDto) {
    return this.prisma.template.findMany({
      where: {
        isActive: true,
        industry: filter.industry,
        scene: filter.scene,
        channel: filter.channel,
        style: filter.style,
      },
      orderBy: [{ industry: 'asc' }, { scene: 'asc' }, { name: 'asc' }],
    });
  }
}
```

```ts
// apps/api/src/templates/templates.service.ts
import { Injectable } from '@nestjs/common';
import { ListTemplatesDto } from './dto/list-templates.dto';
import { TemplatesRepository } from './templates.repository';

@Injectable()
export class TemplatesService {
  constructor(private readonly templatesRepository: TemplatesRepository) {}

  list(filter: ListTemplatesDto) {
    return this.templatesRepository.list(filter);
  }
}
```

```ts
// apps/api/src/templates/templates.controller.ts
import { Controller, Get, Query } from '@nestjs/common';
import { ListTemplatesDto } from './dto/list-templates.dto';
import { TemplatesService } from './templates.service';

@Controller('templates')
export class TemplatesController {
  constructor(private readonly templatesService: TemplatesService) {}

  @Get()
  list(@Query() query: ListTemplatesDto) {
    return this.templatesService.list(query);
  }
}
```

```ts
// apps/api/src/templates/templates.module.ts
import { Module } from '@nestjs/common';
import { TemplatesController } from './templates.controller';
import { TemplatesRepository } from './templates.repository';
import { TemplatesService } from './templates.service';

@Module({
  controllers: [TemplatesController],
  providers: [TemplatesRepository, TemplatesService],
  exports: [TemplatesService],
})
export class TemplatesModule {}
```

- [ ] **Step 4: Create seed data for food and beverage templates**

```ts
// apps/api/prisma/seed.ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const templates = [
  {
    id: 'template_food_new_product',
    industry: 'food_beverage',
    scene: 'new_product',
    style: null,
    channel: null,
    name: '餐饮新品推广',
    description: '适合新品菜品、饮品、套餐上市宣传。',
    recommendedFields: ['storeName', 'productName', 'price', 'extraSellingPoints'],
    copyStructure: ['新品钩子', '核心卖点', '价格或活动', '行动引导'],
    visualDirection: ['突出商品主体', '保留真实商品', '使用清晰主标题', '添加新品标签'],
    sellingPointPriority: ['新品', '口味', '价格', '门店'],
    productConsistencyRules: ['preserve_product_body', 'preserve_logo', 'do_not_add_fake_ingredients'],
  },
  {
    id: 'template_food_today_special',
    industry: 'food_beverage',
    scene: 'today_special',
    style: null,
    channel: null,
    name: '今日特价',
    description: '适合当天限时优惠、晚市活动和社群转化。',
    recommendedFields: ['storeName', 'productName', 'price', 'campaignTime'],
    copyStructure: ['限时钩子', '优惠信息', '适用时间', '行动引导'],
    visualDirection: ['大字优惠', '价格醒目', '氛围真实', '适合朋友圈传播'],
    sellingPointPriority: ['价格', '限时', '口味', '距离'],
    productConsistencyRules: ['preserve_product_body', 'do_not_change_packaging'],
  },
  {
    id: 'template_food_group_buying',
    industry: 'food_beverage',
    scene: 'group_buying',
    style: null,
    channel: null,
    name: '团购套餐',
    description: '适合套餐权益、多人餐、平台团购宣传。',
    recommendedFields: ['storeName', 'productName', 'price', 'extraSellingPoints', 'address'],
    copyStructure: ['套餐名称', '包含内容', '优惠价格', '购买提示'],
    visualDirection: ['套餐内容分区', '权益清晰', '价格强突出', '平台风格规范'],
    sellingPointPriority: ['套餐内容', '价格', '门店', '有效期'],
    productConsistencyRules: ['preserve_product_body', 'do_not_add_items_not_in_package'],
  },
];

async function main() {
  await prisma.user.upsert({
    where: { id: 'user_demo' },
    create: { id: 'user_demo' },
    update: {},
  });

  for (const template of templates) {
    await prisma.template.upsert({
      where: { id: template.id },
      create: template,
      update: template,
    });
  }
}

main()
  .finally(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
```

- [ ] **Step 5: Register module**

```ts
// apps/api/src/app.module.ts
import { Module } from '@nestjs/common';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './prisma/prisma.module';
import { TemplatesModule } from './templates/templates.module';

@Module({
  imports: [PrismaModule, HealthModule, TemplatesModule],
})
export class AppModule {}
```

- [ ] **Step 6: Run tests and seed**

Run:

```bash
cd apps/api
npm test -- templates.service.spec.ts
npm run prisma:seed
```

Expected: test passes and seed script upserts one demo user and three food and beverage templates.

- [ ] **Step 7: Commit**

```bash
git add apps/api/prisma apps/api/src/templates apps/api/src/app.module.ts
git commit -m "feat: add structured template module"
```

## Task 5: Asset Module and Storage Port

**Files:**

- Create: `apps/api/src/storage/storage.port.ts`
- Create: `apps/api/src/storage/local-storage.adapter.ts`
- Create: `apps/api/src/storage/storage.module.ts`
- Create: `apps/api/src/assets/dto/create-asset.dto.ts`
- Create: `apps/api/src/assets/assets.repository.ts`
- Create: `apps/api/src/assets/assets.service.ts`
- Create: `apps/api/src/assets/assets.controller.ts`
- Create: `apps/api/src/assets/assets.module.ts`
- Create: `apps/api/src/assets/assets.service.spec.ts`
- Modify: `apps/api/src/app.module.ts`

- [ ] **Step 1: Write failing asset service test**

```ts
// apps/api/src/assets/assets.service.spec.ts
import { AssetKind } from '../common/domain/enums';
import { AssetsService } from './assets.service';

describe('AssetsService', () => {
  it('stores asset metadata after storage adapter returns a URL', async () => {
    const storage = {
      putObject: jest.fn().mockResolvedValue({
        storageKey: 'uploads/user_1/product.png',
        publicUrl: 'http://localhost/storage/uploads/user_1/product.png',
      }),
    };
    const repository = {
      create: jest.fn().mockImplementation((input) => Promise.resolve({ id: 'asset_1', ...input })),
    };
    const service = new AssetsService(storage as never, repository as never);

    const asset = await service.create({
      userId: 'user_1',
      kind: AssetKind.PRODUCT_IMAGE,
      originalName: 'product.png',
      mimeType: 'image/png',
      byteSize: 120,
      buffer: Buffer.from('image'),
    });

    expect(storage.putObject).toHaveBeenCalled();
    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user_1',
        kind: AssetKind.PRODUCT_IMAGE,
        originalName: 'product.png',
        mimeType: 'image/png',
        byteSize: 120,
      }),
    );
    expect(asset.id).toBe('asset_1');
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run:

```bash
cd apps/api
npm test -- assets.service.spec.ts
```

Expected: FAIL because asset module files do not exist.

- [ ] **Step 3: Create storage port and local adapter**

```ts
// apps/api/src/storage/storage.port.ts
export const STORAGE_PORT = Symbol('STORAGE_PORT');

export type PutObjectInput = {
  userId: string;
  fileName: string;
  mimeType: string;
  buffer: Buffer;
};

export type PutObjectOutput = {
  storageKey: string;
  publicUrl: string;
};

export interface StoragePort {
  putObject(input: PutObjectInput): Promise<PutObjectOutput>;
}
```

```ts
// apps/api/src/storage/local-storage.adapter.ts
import { Injectable } from '@nestjs/common';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { PutObjectInput, PutObjectOutput, StoragePort } from './storage.port';

@Injectable()
export class LocalStorageAdapter implements StoragePort {
  private readonly rootDir = process.env.LOCAL_STORAGE_DIR ?? '.local-storage';

  async putObject(input: PutObjectInput): Promise<PutObjectOutput> {
    const safeName = input.fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const storageKey = `uploads/${input.userId}/${Date.now()}-${safeName}`;
    const absolutePath = join(this.rootDir, storageKey);
    await mkdir(join(this.rootDir, 'uploads', input.userId), { recursive: true });
    await writeFile(absolutePath, input.buffer);

    return {
      storageKey,
      publicUrl: `/storage/${storageKey}`,
    };
  }
}
```

```ts
// apps/api/src/storage/storage.module.ts
import { Module } from '@nestjs/common';
import { LocalStorageAdapter } from './local-storage.adapter';
import { STORAGE_PORT } from './storage.port';

@Module({
  providers: [
    LocalStorageAdapter,
    {
      provide: STORAGE_PORT,
      useExisting: LocalStorageAdapter,
    },
  ],
  exports: [STORAGE_PORT],
})
export class StorageModule {}
```

- [ ] **Step 4: Create asset DTO, repository, service, controller, and module**

```ts
// apps/api/src/assets/dto/create-asset.dto.ts
import { IsEnum, IsInt, IsMimeType, IsString, Min } from 'class-validator';
import { AssetKind } from '../../common/domain/enums';

export class CreateAssetDto {
  @IsString()
  userId!: string;

  @IsEnum(AssetKind)
  kind!: AssetKind;

  @IsString()
  originalName!: string;

  @IsMimeType()
  mimeType!: string;

  @IsInt()
  @Min(1)
  byteSize!: number;

  @IsString()
  base64Content!: string;
}
```

```ts
// apps/api/src/assets/assets.repository.ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export type CreateAssetRecordInput = {
  id: string;
  userId: string;
  kind: string;
  originalName: string;
  mimeType: string;
  byteSize: number;
  storageKey: string;
  publicUrl: string;
};

@Injectable()
export class AssetsRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(input: CreateAssetRecordInput) {
    return this.prisma.asset.create({ data: input });
  }
}
```

```ts
// apps/api/src/assets/assets.service.ts
import { Inject, Injectable } from '@nestjs/common';
import { AssetKind } from '../common/domain/enums';
import { makeId } from '../common/domain/ids';
import { STORAGE_PORT, StoragePort } from '../storage/storage.port';
import { AssetsRepository } from './assets.repository';

export type CreateAssetInput = {
  userId: string;
  kind: AssetKind;
  originalName: string;
  mimeType: string;
  byteSize: number;
  buffer: Buffer;
};

@Injectable()
export class AssetsService {
  constructor(
    @Inject(STORAGE_PORT) private readonly storage: StoragePort,
    private readonly assetsRepository: AssetsRepository,
  ) {}

  async create(input: CreateAssetInput) {
    const stored = await this.storage.putObject({
      userId: input.userId,
      fileName: input.originalName,
      mimeType: input.mimeType,
      buffer: input.buffer,
    });

    return this.assetsRepository.create({
      id: makeId('asset'),
      userId: input.userId,
      kind: input.kind,
      originalName: input.originalName,
      mimeType: input.mimeType,
      byteSize: input.byteSize,
      storageKey: stored.storageKey,
      publicUrl: stored.publicUrl,
    });
  }
}
```

```ts
// apps/api/src/assets/assets.controller.ts
import { Body, Controller, Post } from '@nestjs/common';
import { CreateAssetDto } from './dto/create-asset.dto';
import { AssetsService } from './assets.service';

@Controller('assets')
export class AssetsController {
  constructor(private readonly assetsService: AssetsService) {}

  @Post()
  create(@Body() body: CreateAssetDto) {
    return this.assetsService.create({
      userId: body.userId,
      kind: body.kind,
      originalName: body.originalName,
      mimeType: body.mimeType,
      byteSize: body.byteSize,
      buffer: Buffer.from(body.base64Content, 'base64'),
    });
  }
}
```

```ts
// apps/api/src/assets/assets.module.ts
import { Module } from '@nestjs/common';
import { StorageModule } from '../storage/storage.module';
import { AssetsController } from './assets.controller';
import { AssetsRepository } from './assets.repository';
import { AssetsService } from './assets.service';

@Module({
  imports: [StorageModule],
  controllers: [AssetsController],
  providers: [AssetsRepository, AssetsService],
  exports: [AssetsService],
})
export class AssetsModule {}
```

- [ ] **Step 5: Register module and run tests**

```ts
// apps/api/src/app.module.ts
import { Module } from '@nestjs/common';
import { AssetsModule } from './assets/assets.module';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './prisma/prisma.module';
import { TemplatesModule } from './templates/templates.module';

@Module({
  imports: [PrismaModule, HealthModule, TemplatesModule, AssetsModule],
})
export class AppModule {}
```

Run:

```bash
cd apps/api
npm test -- assets.service.spec.ts
```

Expected: PASS for asset service test.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/storage apps/api/src/assets apps/api/src/app.module.ts
git commit -m "feat: add asset storage module"
```

## Task 6: AI Provider Ports and Mock Provider

**Files:**

- Create: `apps/api/src/ai-providers/ports/text-generation.port.ts`
- Create: `apps/api/src/ai-providers/ports/image-generation.port.ts`
- Create: `apps/api/src/ai-providers/mock/mock-ai.provider.ts`
- Create: `apps/api/src/ai-providers/ai-provider.module.ts`
- Create: `apps/api/src/ai-providers/mock/mock-ai.provider.spec.ts`

- [ ] **Step 1: Write failing mock provider test**

```ts
// apps/api/src/ai-providers/mock/mock-ai.provider.spec.ts
import { Channel, GenerationMode, StyleTemplate } from '../../common/domain/enums';
import { MockAiProvider } from './mock-ai.provider';

describe('MockAiProvider', () => {
  it('returns deterministic image marketing package content', async () => {
    const provider = new MockAiProvider();

    const output = await provider.generateImageMarketingOption({
      requestText: '给新品奶茶做宣传图',
      channel: Channel.WECHAT,
      style: StyleTemplate.YOUNG_TRENDY,
      mode: GenerationMode.NO_IMAGE,
      optionIndex: 0,
      prompt: 'mock prompt',
    });

    expect(output.title).toContain('新品奶茶');
    expect(output.imageUrl).toContain('/mock-generated/');
    expect(output.imageText).toEqual(expect.arrayContaining([expect.any(String)]));
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run:

```bash
cd apps/api
npm test -- mock-ai.provider.spec.ts
```

Expected: FAIL because AI provider files do not exist.

- [ ] **Step 3: Create provider ports and mock provider**

```ts
// apps/api/src/ai-providers/ports/text-generation.port.ts
export const TEXT_GENERATION_PORT = Symbol('TEXT_GENERATION_PORT');

export type GenerateTextInput = {
  prompt: string;
};

export type GenerateTextOutput = {
  text: string;
};

export interface TextGenerationPort {
  generateText(input: GenerateTextInput): Promise<GenerateTextOutput>;
}
```

```ts
// apps/api/src/ai-providers/ports/image-generation.port.ts
import { Channel, GenerationMode, StyleTemplate } from '../../common/domain/enums';

export const IMAGE_GENERATION_PORT = Symbol('IMAGE_GENERATION_PORT');

export type GenerateImageMarketingOptionInput = {
  requestText: string;
  channel: Channel;
  style: StyleTemplate;
  mode: GenerationMode;
  optionIndex: number;
  prompt: string;
};

export type GenerateImageMarketingOptionOutput = {
  title: string;
  publishingCopy: string;
  imageText: string[];
  imageUrl: string;
};

export interface ImageGenerationPort {
  generateImageMarketingOption(
    input: GenerateImageMarketingOptionInput,
  ): Promise<GenerateImageMarketingOptionOutput>;
}
```

```ts
// apps/api/src/ai-providers/mock/mock-ai.provider.ts
import { Injectable } from '@nestjs/common';
import {
  GenerateImageMarketingOptionInput,
  GenerateImageMarketingOptionOutput,
  ImageGenerationPort,
} from '../ports/image-generation.port';
import { GenerateTextInput, GenerateTextOutput, TextGenerationPort } from '../ports/text-generation.port';

@Injectable()
export class MockAiProvider implements TextGenerationPort, ImageGenerationPort {
  async generateText(input: GenerateTextInput): Promise<GenerateTextOutput> {
    return {
      text: `模拟文案：${input.prompt.slice(0, 60)}`,
    };
  }

  async generateImageMarketingOption(
    input: GenerateImageMarketingOptionInput,
  ): Promise<GenerateImageMarketingOptionOutput> {
    const productHint = this.extractProductHint(input.requestText);
    const title = `${productHint} 今日推荐`;

    return {
      title,
      publishingCopy: `${title}，适合${input.channel}发布。现在到店即可了解活动详情。`,
      imageText: [title, '限时活动', '到店咨询'],
      imageUrl: `/mock-generated/${input.channel}-${input.optionIndex}.png`,
    };
  }

  private extractProductHint(requestText: string): string {
    const normalized = requestText.trim();
    return normalized.length > 12 ? normalized.slice(0, 12) : normalized;
  }
}
```

```ts
// apps/api/src/ai-providers/ai-provider.module.ts
import { Module } from '@nestjs/common';
import { MockAiProvider } from './mock/mock-ai.provider';
import { IMAGE_GENERATION_PORT } from './ports/image-generation.port';
import { TEXT_GENERATION_PORT } from './ports/text-generation.port';

@Module({
  providers: [
    MockAiProvider,
    {
      provide: TEXT_GENERATION_PORT,
      useExisting: MockAiProvider,
    },
    {
      provide: IMAGE_GENERATION_PORT,
      useExisting: MockAiProvider,
    },
  ],
  exports: [TEXT_GENERATION_PORT, IMAGE_GENERATION_PORT],
})
export class AiProviderModule {}
```

- [ ] **Step 4: Run test and verify it passes**

Run:

```bash
cd apps/api
npm test -- mock-ai.provider.spec.ts
```

Expected: PASS for deterministic provider output.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/ai-providers
git commit -m "feat: add ai provider ports and mock adapter"
```

## Task 7: Prompt Builder Module

**Files:**

- Create: `apps/api/src/prompts/prompt-contracts.ts`
- Create: `apps/api/src/prompts/prompt-builder.service.ts`
- Create: `apps/api/src/prompts/prompts.module.ts`
- Create: `apps/api/src/prompts/prompt-builder.service.spec.ts`

- [ ] **Step 1: Write failing prompt builder tests**

```ts
// apps/api/src/prompts/prompt-builder.service.spec.ts
import { Channel, GenerationMode, MarketingScene, StyleTemplate } from '../common/domain/enums';
import { PromptBuilderService } from './prompt-builder.service';

describe('PromptBuilderService', () => {
  const builder = new PromptBuilderService();

  it('includes product consistency rules when mode is with-image', () => {
    const prompt = builder.buildImagePrompt({
      requestText: '给这款奶茶做新品宣传图',
      channel: Channel.WECHAT,
      scene: MarketingScene.NEW_PRODUCT,
      style: StyleTemplate.YOUNG_TRENDY,
      mode: GenerationMode.WITH_IMAGE,
      campaignInfo: { productName: '柠檬茶', price: '19.9' },
    });

    expect(prompt).toContain('商品一致性优先于画面惊艳度');
    expect(prompt).toContain('不得改变商品主体');
  });

  it('marks no-image output as atmosphere marketing content', () => {
    const prompt = builder.buildImagePrompt({
      requestText: '给烧烤店做啤酒活动图',
      channel: Channel.WECHAT,
      scene: MarketingScene.TODAY_SPECIAL,
      style: StyleTemplate.STRONG_PROMOTION,
      mode: GenerationMode.NO_IMAGE,
      campaignInfo: {},
    });

    expect(prompt).toContain('通用营销图或氛围宣传图');
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run:

```bash
cd apps/api
npm test -- prompt-builder.service.spec.ts
```

Expected: FAIL because prompt builder files do not exist.

- [ ] **Step 3: Create prompt contracts and service**

```ts
// apps/api/src/prompts/prompt-contracts.ts
import { Channel, GenerationMode, MarketingScene, StyleTemplate } from '../common/domain/enums';
import { CampaignInfo } from '../workflow/generation-planner.types';

export type BuildImagePromptInput = {
  requestText: string;
  channel: Channel;
  scene: MarketingScene;
  style: StyleTemplate;
  mode: GenerationMode;
  campaignInfo: CampaignInfo;
};
```

```ts
// apps/api/src/prompts/prompt-builder.service.ts
import { Injectable } from '@nestjs/common';
import { GenerationMode } from '../common/domain/enums';
import { BuildImagePromptInput } from './prompt-contracts';

@Injectable()
export class PromptBuilderService {
  buildImagePrompt(input: BuildImagePromptInput): string {
    const campaignLines = Object.entries(input.campaignInfo)
      .filter(([, value]) => value !== undefined && value !== '')
      .map(([key, value]) => `${key}: ${value}`)
      .join('\n');

    const modeRules =
      input.mode === GenerationMode.WITH_IMAGE
        ? [
            '生成模式：真实商品海报。',
            '商品一致性优先于画面惊艳度。',
            '不得改变商品主体、包装颜色、Logo、核心外观。',
            '不得增加不存在的食材、配料或商品细节。',
          ].join('\n')
        : [
            '生成模式：通用营销图或氛围宣传图。',
            '画面可表达行业氛围和活动信息，但不得暗示这是用户真实商品照片。',
          ].join('\n');

    return [
      '你是中小商家的营销图片导演。',
      `用户需求：${input.requestText}`,
      `发布渠道：${input.channel}`,
      `营销场景：${input.scene}`,
      `风格模板：${input.style}`,
      campaignLines ? `活动信息：\n${campaignLines}` : '活动信息：用户未填写。',
      modeRules,
      '输出必须包含：营销标题、发布文案、图片中文字、图片视觉方向。',
    ].join('\n\n');
  }
}
```

```ts
// apps/api/src/prompts/prompts.module.ts
import { Module } from '@nestjs/common';
import { PromptBuilderService } from './prompt-builder.service';

@Module({
  providers: [PromptBuilderService],
  exports: [PromptBuilderService],
})
export class PromptsModule {}
```

- [ ] **Step 4: Run tests and verify they pass**

Run:

```bash
cd apps/api
npm test -- prompt-builder.service.spec.ts
```

Expected: PASS for both prompt builder tests.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/prompts
git commit -m "feat: add prompt builder with consistency rules"
```

## Task 8: Generation Module with Synchronous Service Contract

**Files:**

- Create: `apps/api/src/generation/dto/create-generation-task.dto.ts`
- Create: `apps/api/src/generation/dto/regenerate-task.dto.ts`
- Create: `apps/api/src/generation/dto/modify-generation-task.dto.ts`
- Create: `apps/api/src/generation/generation.repository.ts`
- Create: `apps/api/src/generation/generation.service.ts`
- Create: `apps/api/src/generation/generation.controller.ts`
- Create: `apps/api/src/generation/generation.module.ts`
- Create: `apps/api/src/generation/generation.service.spec.ts`
- Modify: `apps/api/src/app.module.ts`

- [ ] **Step 1: Write failing generation service test**

```ts
// apps/api/src/generation/generation.service.spec.ts
import { Channel, GenerationTaskKind, GenerationTaskStatus, MarketingScene, StyleTemplate } from '../common/domain/enums';
import { GenerationService } from './generation.service';

describe('GenerationService', () => {
  it('creates a queued generation task from user input', async () => {
    const repository = {
      createTask: jest.fn().mockResolvedValue({
        id: 'task_1',
        status: GenerationTaskStatus.QUEUED,
      }),
      attachAssets: jest.fn().mockResolvedValue(undefined),
    };
    const queue = {
      enqueueGeneration: jest.fn().mockResolvedValue(undefined),
    };
    const service = new GenerationService(repository as never, queue as never);

    const task = await service.create({
      userId: 'user_1',
      requestText: '给新品奶茶做宣传图',
      assetIds: ['asset_1'],
      channels: [Channel.WECHAT],
      scene: MarketingScene.NEW_PRODUCT,
      style: StyleTemplate.YOUNG_TRENDY,
      campaignInfo: { productName: '柠檬茶', price: '19.9' },
    });

    expect(repository.createTask).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: GenerationTaskKind.CREATE,
        status: GenerationTaskStatus.QUEUED,
      }),
    );
    expect(repository.attachAssets).toHaveBeenCalledWith(task.id, ['asset_1']);
    expect(queue.enqueueGeneration).toHaveBeenCalledWith(task.id);
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run:

```bash
cd apps/api
npm test -- generation.service.spec.ts
```

Expected: FAIL because generation module files do not exist.

- [ ] **Step 3: Create DTOs**

```ts
// apps/api/src/generation/dto/create-generation-task.dto.ts
import { IsArray, IsEnum, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';
import { Channel, MarketingScene, StyleTemplate } from '../../common/domain/enums';
import { CampaignInfo } from '../../workflow/generation-planner.types';

export class CreateGenerationTaskDto {
  @IsString()
  userId!: string;

  @IsString()
  @MaxLength(1000)
  requestText!: string;

  @IsArray()
  @IsString({ each: true })
  assetIds!: string[];

  @IsArray()
  @IsEnum(Channel, { each: true })
  channels!: Channel[];

  @IsEnum(MarketingScene)
  scene!: MarketingScene;

  @IsEnum(StyleTemplate)
  style!: StyleTemplate;

  @IsObject()
  campaignInfo!: CampaignInfo;
}
```

```ts
// apps/api/src/generation/dto/regenerate-task.dto.ts
import { IsString } from 'class-validator';

export class RegenerateTaskDto {
  @IsString()
  userId!: string;
}
```

```ts
// apps/api/src/generation/dto/modify-generation-task.dto.ts
import { IsString, MaxLength } from 'class-validator';

export class ModifyGenerationTaskDto {
  @IsString()
  userId!: string;

  @IsString()
  selectedResultId!: string;

  @IsString()
  @MaxLength(1000)
  modificationText!: string;
}
```

- [ ] **Step 4: Create repository, service, controller, and module**

```ts
// apps/api/src/generation/generation.repository.ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class GenerationRepository {
  constructor(private readonly prisma: PrismaService) {}

  createTask(data: Parameters<PrismaService['generationTask']['create']>[0]['data']) {
    return this.prisma.generationTask.create({ data });
  }

  attachAssets(taskId: string, assetIds: string[]) {
    return this.prisma.generationTaskAsset.createMany({
      data: assetIds.map((assetId) => ({ taskId, assetId })),
      skipDuplicates: true,
    });
  }

  findTask(id: string) {
    return this.prisma.generationTask.findUnique({
      where: { id },
      include: { results: true, assets: { include: { asset: true } } },
    });
  }
}
```

```ts
// apps/api/src/generation/generation.queue.ts
export const GENERATION_QUEUE_PORT = Symbol('GENERATION_QUEUE_PORT');

export interface GenerationQueuePort {
  enqueueGeneration(taskId: string): Promise<void>;
}

export class ImmediateGenerationQueue implements GenerationQueuePort {
  async enqueueGeneration(): Promise<void> {
    return undefined;
  }
}
```

```ts
// apps/api/src/generation/generation.service.ts
import { Inject, Injectable } from '@nestjs/common';
import { GenerationMode, GenerationTaskKind, GenerationTaskStatus } from '../common/domain/enums';
import { makeId } from '../common/domain/ids';
import { GenerationPlanInput } from '../workflow/generation-planner.types';
import { CreateGenerationTaskDto } from './dto/create-generation-task.dto';
import { GENERATION_QUEUE_PORT, GenerationQueuePort } from './generation.queue';
import { GenerationRepository } from './generation.repository';

@Injectable()
export class GenerationService {
  constructor(
    private readonly generationRepository: GenerationRepository,
    @Inject(GENERATION_QUEUE_PORT) private readonly queue: GenerationQueuePort,
  ) {}

  async create(input: CreateGenerationTaskDto) {
    const task = await this.generationRepository.createTask({
      id: makeId('task'),
      userId: input.userId,
      kind: GenerationTaskKind.CREATE,
      status: GenerationTaskStatus.QUEUED,
      requestText: input.requestText,
      channels: input.channels,
      scene: input.scene,
      style: input.style,
      campaignInfo: input.campaignInfo,
      mode: input.assetIds.length > 0 ? GenerationMode.WITH_IMAGE : GenerationMode.NO_IMAGE,
    });

    await this.generationRepository.attachAssets(task.id, input.assetIds);
    await this.queue.enqueueGeneration(task.id);
    return task;
  }

  getTask(id: string) {
    return this.generationRepository.findTask(id);
  }
}
```

```ts
// apps/api/src/generation/generation.controller.ts
import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { CreateGenerationTaskDto } from './dto/create-generation-task.dto';
import { GenerationService } from './generation.service';

@Controller('generation-tasks')
export class GenerationController {
  constructor(private readonly generationService: GenerationService) {}

  @Post()
  create(@Body() body: CreateGenerationTaskDto) {
    return this.generationService.create(body);
  }

  @Get(':id')
  getTask(@Param('id') id: string) {
    return this.generationService.getTask(id);
  }
}
```

```ts
// apps/api/src/generation/generation.module.ts
import { Module } from '@nestjs/common';
import { GenerationController } from './generation.controller';
import { GENERATION_QUEUE_PORT, ImmediateGenerationQueue } from './generation.queue';
import { GenerationRepository } from './generation.repository';
import { GenerationService } from './generation.service';

@Module({
  controllers: [GenerationController],
  providers: [
    GenerationRepository,
    GenerationService,
    {
      provide: GENERATION_QUEUE_PORT,
      useClass: ImmediateGenerationQueue,
    },
  ],
  exports: [GenerationService, GenerationRepository],
})
export class GenerationModule {}
```

- [ ] **Step 5: Register module and run tests**

```ts
// apps/api/src/app.module.ts
import { Module } from '@nestjs/common';
import { AssetsModule } from './assets/assets.module';
import { GenerationModule } from './generation/generation.module';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './prisma/prisma.module';
import { TemplatesModule } from './templates/templates.module';

@Module({
  imports: [PrismaModule, HealthModule, TemplatesModule, AssetsModule, GenerationModule],
})
export class AppModule {}
```

Run:

```bash
cd apps/api
npm test -- generation.service.spec.ts
```

Expected: PASS for generation task creation.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/generation apps/api/src/app.module.ts
git commit -m "feat: add generation task module"
```

## Task 9: Generation Worker Pipeline

**Files:**

- Create: `apps/api/src/generation/generation.worker.ts`
- Modify: `apps/api/src/generation/generation.repository.ts`
- Modify: `apps/api/src/generation/generation.module.ts`
- Create: `apps/api/src/generation/generation.worker.spec.ts`

- [ ] **Step 1: Write failing worker test**

```ts
// apps/api/src/generation/generation.worker.spec.ts
import { Channel, GenerationMode, GenerationTaskStatus, MarketingScene, StyleTemplate } from '../common/domain/enums';
import { GenerationWorker } from './generation.worker';

describe('GenerationWorker', () => {
  it('creates result options and marks task succeeded', async () => {
    const repository = {
      findTask: jest.fn().mockResolvedValue({
        id: 'task_1',
        requestText: '给新品奶茶做宣传图',
        channels: [Channel.WECHAT],
        scene: MarketingScene.NEW_PRODUCT,
        style: StyleTemplate.YOUNG_TRENDY,
        campaignInfo: { productName: '柠檬茶' },
        assets: [],
      }),
      markRunning: jest.fn().mockResolvedValue(undefined),
      createResults: jest.fn().mockResolvedValue(undefined),
      markSucceeded: jest.fn().mockResolvedValue(undefined),
      markFailed: jest.fn().mockResolvedValue(undefined),
    };
    const planner = {
      plan: jest.fn().mockReturnValue({
        mode: GenerationMode.NO_IMAGE,
        mustPreserveProductConsistency: false,
        outputs: [{ channel: Channel.WECHAT, optionIndex: 0 }],
        input: {
          requestText: '给新品奶茶做宣传图',
          assetIds: [],
          channels: [Channel.WECHAT],
          scene: MarketingScene.NEW_PRODUCT,
          style: StyleTemplate.YOUNG_TRENDY,
          campaignInfo: { productName: '柠檬茶' },
        },
      }),
    };
    const prompts = { buildImagePrompt: jest.fn().mockReturnValue('prompt') };
    const imageProvider = {
      generateImageMarketingOption: jest.fn().mockResolvedValue({
        title: '新品奶茶 今日推荐',
        publishingCopy: '新品奶茶，欢迎到店。',
        imageText: ['新品奶茶', '限时活动'],
        imageUrl: '/mock-generated/wechat-0.png',
      }),
    };
    const worker = new GenerationWorker(
      repository as never,
      planner as never,
      prompts as never,
      imageProvider as never,
    );

    await worker.process('task_1');

    expect(repository.markRunning).toHaveBeenCalledWith('task_1');
    expect(repository.createResults).toHaveBeenCalledWith(
      'task_1',
      expect.arrayContaining([
        expect.objectContaining({
          title: '新品奶茶 今日推荐',
          channel: Channel.WECHAT,
        }),
      ]),
    );
    expect(repository.markSucceeded).toHaveBeenCalledWith('task_1');
    expect(repository.markFailed).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run:

```bash
cd apps/api
npm test -- generation.worker.spec.ts
```

Expected: FAIL because worker does not exist.

- [ ] **Step 3: Extend repository**

```ts
// apps/api/src/generation/generation.repository.ts
import { Injectable } from '@nestjs/common';
import { GenerationTaskStatus } from '../common/domain/enums';
import { makeId } from '../common/domain/ids';
import { PrismaService } from '../prisma/prisma.service';

export type CreateGenerationResultInput = {
  channel: string;
  style: string;
  title: string;
  publishingCopy: string;
  imageText: string[];
  imageUrl: string;
  promptSnapshot: Record<string, unknown>;
  optionIndex: number;
};

@Injectable()
export class GenerationRepository {
  constructor(private readonly prisma: PrismaService) {}

  createTask(data: Parameters<PrismaService['generationTask']['create']>[0]['data']) {
    return this.prisma.generationTask.create({ data });
  }

  attachAssets(taskId: string, assetIds: string[]) {
    return this.prisma.generationTaskAsset.createMany({
      data: assetIds.map((assetId) => ({ taskId, assetId })),
      skipDuplicates: true,
    });
  }

  findTask(id: string) {
    return this.prisma.generationTask.findUnique({
      where: { id },
      include: { results: true, assets: { include: { asset: true } } },
    });
  }

  markRunning(id: string) {
    return this.prisma.generationTask.update({
      where: { id },
      data: { status: GenerationTaskStatus.RUNNING },
    });
  }

  markSucceeded(id: string) {
    return this.prisma.generationTask.update({
      where: { id },
      data: { status: GenerationTaskStatus.SUCCEEDED },
    });
  }

  markFailed(id: string, errorMessage: string) {
    return this.prisma.generationTask.update({
      where: { id },
      data: { status: GenerationTaskStatus.FAILED, errorMessage },
    });
  }

  createResults(taskId: string, results: CreateGenerationResultInput[]) {
    return this.prisma.generationResult.createMany({
      data: results.map((result) => ({
        id: makeId('result'),
        taskId,
        channel: result.channel,
        style: result.style,
        title: result.title,
        publishingCopy: result.publishingCopy,
        imageText: result.imageText,
        imageUrl: result.imageUrl,
        promptSnapshot: result.promptSnapshot,
        optionIndex: result.optionIndex,
      })),
    });
  }
}
```

- [ ] **Step 4: Create worker**

```ts
// apps/api/src/generation/generation.worker.ts
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { IMAGE_GENERATION_PORT, ImageGenerationPort } from '../ai-providers/ports/image-generation.port';
import { PromptBuilderService } from '../prompts/prompt-builder.service';
import { GenerationPlannerService } from '../workflow/generation-planner.service';
import { GenerationRepository } from './generation.repository';

@Injectable()
export class GenerationWorker {
  constructor(
    private readonly generationRepository: GenerationRepository,
    private readonly planner: GenerationPlannerService,
    private readonly promptBuilder: PromptBuilderService,
    @Inject(IMAGE_GENERATION_PORT) private readonly imageProvider: ImageGenerationPort,
  ) {}

  async process(taskId: string) {
    await this.generationRepository.markRunning(taskId);

    try {
      const task = await this.generationRepository.findTask(taskId);
      if (!task) {
        throw new NotFoundException(`Generation task not found: ${taskId}`);
      }

      const assetIds = task.assets.map((taskAsset) => taskAsset.assetId);
      const plan = this.planner.plan({
        requestText: task.requestText,
        assetIds,
        channels: task.channels as never,
        scene: task.scene as never,
        style: task.style as never,
        campaignInfo: task.campaignInfo as never,
      });

      const results = [];
      for (const output of plan.outputs) {
        const prompt = this.promptBuilder.buildImagePrompt({
          requestText: task.requestText,
          channel: output.channel,
          scene: task.scene as never,
          style: task.style as never,
          mode: plan.mode,
          campaignInfo: task.campaignInfo as never,
        });
        const generated = await this.imageProvider.generateImageMarketingOption({
          requestText: task.requestText,
          channel: output.channel,
          style: task.style as never,
          mode: plan.mode,
          optionIndex: output.optionIndex,
          prompt,
        });
        results.push({
          channel: output.channel,
          style: task.style,
          title: generated.title,
          publishingCopy: generated.publishingCopy,
          imageText: generated.imageText,
          imageUrl: generated.imageUrl,
          promptSnapshot: { prompt, plan },
          optionIndex: output.optionIndex,
        });
      }

      await this.generationRepository.createResults(taskId, results);
      await this.generationRepository.markSucceeded(taskId);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown generation error';
      await this.generationRepository.markFailed(taskId, message);
      throw error;
    }
  }
}
```

- [ ] **Step 5: Register dependencies in module**

```ts
// apps/api/src/generation/generation.module.ts
import { Module } from '@nestjs/common';
import { AiProviderModule } from '../ai-providers/ai-provider.module';
import { PromptsModule } from '../prompts/prompts.module';
import { GenerationPlannerService } from '../workflow/generation-planner.service';
import { GenerationController } from './generation.controller';
import { GENERATION_QUEUE_PORT, ImmediateGenerationQueue } from './generation.queue';
import { GenerationRepository } from './generation.repository';
import { GenerationService } from './generation.service';
import { GenerationWorker } from './generation.worker';

@Module({
  imports: [AiProviderModule, PromptsModule],
  controllers: [GenerationController],
  providers: [
    GenerationPlannerService,
    GenerationRepository,
    GenerationService,
    GenerationWorker,
    {
      provide: GENERATION_QUEUE_PORT,
      useClass: ImmediateGenerationQueue,
    },
  ],
  exports: [GenerationService, GenerationRepository, GenerationWorker],
})
export class GenerationModule {}
```

- [ ] **Step 6: Run test and verify it passes**

Run:

```bash
cd apps/api
npm test -- generation.worker.spec.ts
```

Expected: PASS for worker pipeline.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/generation
git commit -m "feat: add generation worker pipeline"
```

## Task 10: Regenerate and Modify Endpoints

**Files:**

- Modify: `apps/api/src/generation/generation.repository.ts`
- Modify: `apps/api/src/generation/generation.service.ts`
- Modify: `apps/api/src/generation/generation.controller.ts`
- Create: `apps/api/src/generation/generation-modification.service.spec.ts`

- [ ] **Step 1: Write failing tests for regeneration and modification**

```ts
// apps/api/src/generation/generation-modification.service.spec.ts
import { GenerationTaskKind, GenerationTaskStatus } from '../common/domain/enums';
import { GenerationService } from './generation.service';

describe('GenerationService regeneration and modification', () => {
  it('creates a regenerate child task from a parent task', async () => {
    const repository = {
      findTask: jest.fn().mockResolvedValue({
        id: 'task_parent',
        userId: 'user_1',
        requestText: '给新品奶茶做宣传图',
        channels: ['wechat'],
        scene: 'new_product',
        style: 'young_trendy',
        campaignInfo: { productName: '柠檬茶' },
        mode: 'with_image',
        assets: [{ assetId: 'asset_1' }],
      }),
      createTask: jest.fn().mockResolvedValue({ id: 'task_child', status: GenerationTaskStatus.QUEUED }),
      attachAssets: jest.fn().mockResolvedValue(undefined),
    };
    const queue = { enqueueGeneration: jest.fn().mockResolvedValue(undefined) };
    const service = new GenerationService(repository as never, queue as never);

    const task = await service.regenerate('task_parent', { userId: 'user_1' });

    expect(repository.createTask).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: GenerationTaskKind.REGENERATE,
        parentTaskId: 'task_parent',
      }),
    );
    expect(repository.attachAssets).toHaveBeenCalledWith(task.id, ['asset_1']);
  });

  it('creates a modify child task with selected result and modification text', async () => {
    const repository = {
      findTaskByResultId: jest.fn().mockResolvedValue({
        id: 'task_parent',
        userId: 'user_1',
        requestText: '给新品奶茶做宣传图',
        channels: ['wechat'],
        scene: 'new_product',
        style: 'young_trendy',
        campaignInfo: { productName: '柠檬茶' },
        mode: 'with_image',
        assets: [{ assetId: 'asset_1' }],
      }),
      createTask: jest.fn().mockResolvedValue({ id: 'task_modify', status: GenerationTaskStatus.QUEUED }),
      attachAssets: jest.fn().mockResolvedValue(undefined),
    };
    const queue = { enqueueGeneration: jest.fn().mockResolvedValue(undefined) };
    const service = new GenerationService(repository as never, queue as never);

    await service.modify('task_parent', {
      userId: 'user_1',
      selectedResultId: 'result_1',
      modificationText: '价格改成 19.9',
    });

    expect(repository.createTask).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: GenerationTaskKind.MODIFY,
        selectedResultId: 'result_1',
        modificationText: '价格改成 19.9',
      }),
    );
  });
});
```

- [ ] **Step 2: Run tests and verify they fail**

Run:

```bash
cd apps/api
npm test -- generation-modification.service.spec.ts
```

Expected: FAIL because methods do not exist.

- [ ] **Step 3: Extend repository**

Add this method to `apps/api/src/generation/generation.repository.ts`:

```ts
findTaskByResultId(resultId: string) {
  return this.prisma.generationTask.findFirst({
    where: { results: { some: { id: resultId } } },
    include: { results: true, assets: { include: { asset: true } } },
  });
}
```

- [ ] **Step 4: Extend service**

Add these methods to `apps/api/src/generation/generation.service.ts`:

```ts
async regenerate(parentTaskId: string, input: { userId: string }) {
  const parent = await this.generationRepository.findTask(parentTaskId);
  if (!parent || parent.userId !== input.userId) {
    throw new Error('Generation task not found');
  }

  const task = await this.generationRepository.createTask({
    id: makeId('task'),
    userId: parent.userId,
    kind: GenerationTaskKind.REGENERATE,
    status: GenerationTaskStatus.QUEUED,
    requestText: parent.requestText,
    channels: parent.channels,
    scene: parent.scene,
    style: parent.style,
    campaignInfo: parent.campaignInfo,
    mode: parent.mode,
    parentTaskId: parent.id,
  });

  await this.generationRepository.attachAssets(
    task.id,
    parent.assets.map((taskAsset) => taskAsset.assetId),
  );
  await this.queue.enqueueGeneration(task.id);
  return task;
}

async modify(parentTaskId: string, input: { userId: string; selectedResultId: string; modificationText: string }) {
  const parent = await this.generationRepository.findTaskByResultId(input.selectedResultId);
  if (!parent || parent.id !== parentTaskId || parent.userId !== input.userId) {
    throw new Error('Generation result not found');
  }

  const task = await this.generationRepository.createTask({
    id: makeId('task'),
    userId: parent.userId,
    kind: GenerationTaskKind.MODIFY,
    status: GenerationTaskStatus.QUEUED,
    requestText: parent.requestText,
    channels: parent.channels,
    scene: parent.scene,
    style: parent.style,
    campaignInfo: parent.campaignInfo,
    mode: parent.mode,
    parentTaskId: parent.id,
    selectedResultId: input.selectedResultId,
    modificationText: input.modificationText,
  });

  await this.generationRepository.attachAssets(
    task.id,
    parent.assets.map((taskAsset) => taskAsset.assetId),
  );
  await this.queue.enqueueGeneration(task.id);
  return task;
}
```

- [ ] **Step 5: Extend controller**

Add these routes to `apps/api/src/generation/generation.controller.ts`:

```ts
@Post(':id/regenerate')
regenerate(@Param('id') id: string, @Body() body: RegenerateTaskDto) {
  return this.generationService.regenerate(id, body);
}

@Post(':id/modify')
modify(@Param('id') id: string, @Body() body: ModifyGenerationTaskDto) {
  return this.generationService.modify(id, body);
}
```

Also add imports:

```ts
import { ModifyGenerationTaskDto } from './dto/modify-generation-task.dto';
import { RegenerateTaskDto } from './dto/regenerate-task.dto';
```

- [ ] **Step 6: Run tests and verify they pass**

Run:

```bash
cd apps/api
npm test -- generation-modification.service.spec.ts
```

Expected: PASS for regeneration and modification service tests.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/generation
git commit -m "feat: add regenerate and modify task flows"
```

## Task 11: Result Events and Feedback Signals

**Files:**

- Create: `apps/api/src/results/dto/create-result-event.dto.ts`
- Create: `apps/api/src/results/results.repository.ts`
- Create: `apps/api/src/results/results.service.ts`
- Create: `apps/api/src/results/results.controller.ts`
- Create: `apps/api/src/results/results.module.ts`
- Create: `apps/api/src/results/results.service.spec.ts`
- Modify: `apps/api/src/app.module.ts`

- [ ] **Step 1: Write failing result event test**

```ts
// apps/api/src/results/results.service.spec.ts
import { ResultEventType } from '../common/domain/enums';
import { ResultsService } from './results.service';

describe('ResultsService', () => {
  it('records a result event', async () => {
    const repository = {
      createEvent: jest.fn().mockResolvedValue({
        id: 'event_1',
        resultId: 'result_1',
        eventType: ResultEventType.COPIED_COPY,
      }),
    };
    const service = new ResultsService(repository as never);

    const event = await service.createEvent('result_1', {
      eventType: ResultEventType.COPIED_COPY,
      metadata: { source: 'result_card' },
    });

    expect(repository.createEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        resultId: 'result_1',
        eventType: ResultEventType.COPIED_COPY,
      }),
    );
    expect(event.id).toBe('event_1');
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run:

```bash
cd apps/api
npm test -- results.service.spec.ts
```

Expected: FAIL because results module files do not exist.

- [ ] **Step 3: Create DTO, repository, service, controller, and module**

```ts
// apps/api/src/results/dto/create-result-event.dto.ts
import { IsEnum, IsObject } from 'class-validator';
import { ResultEventType } from '../../common/domain/enums';

export class CreateResultEventDto {
  @IsEnum(ResultEventType)
  eventType!: ResultEventType;

  @IsObject()
  metadata!: Record<string, unknown>;
}
```

```ts
// apps/api/src/results/results.repository.ts
import { Injectable } from '@nestjs/common';
import { makeId } from '../common/domain/ids';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ResultsRepository {
  constructor(private readonly prisma: PrismaService) {}

  createEvent(input: { resultId: string; eventType: string; metadata: Record<string, unknown> }) {
    return this.prisma.resultEvent.create({
      data: {
        id: makeId('event'),
        resultId: input.resultId,
        eventType: input.eventType,
        metadata: input.metadata,
      },
    });
  }
}
```

```ts
// apps/api/src/results/results.service.ts
import { Injectable } from '@nestjs/common';
import { CreateResultEventDto } from './dto/create-result-event.dto';
import { ResultsRepository } from './results.repository';

@Injectable()
export class ResultsService {
  constructor(private readonly resultsRepository: ResultsRepository) {}

  createEvent(resultId: string, input: CreateResultEventDto) {
    return this.resultsRepository.createEvent({
      resultId,
      eventType: input.eventType,
      metadata: input.metadata,
    });
  }
}
```

```ts
// apps/api/src/results/results.controller.ts
import { Body, Controller, Param, Post } from '@nestjs/common';
import { CreateResultEventDto } from './dto/create-result-event.dto';
import { ResultsService } from './results.service';

@Controller('results')
export class ResultsController {
  constructor(private readonly resultsService: ResultsService) {}

  @Post(':id/events')
  createEvent(@Param('id') id: string, @Body() body: CreateResultEventDto) {
    return this.resultsService.createEvent(id, body);
  }
}
```

```ts
// apps/api/src/results/results.module.ts
import { Module } from '@nestjs/common';
import { ResultsController } from './results.controller';
import { ResultsRepository } from './results.repository';
import { ResultsService } from './results.service';

@Module({
  controllers: [ResultsController],
  providers: [ResultsRepository, ResultsService],
  exports: [ResultsService],
})
export class ResultsModule {}
```

- [ ] **Step 4: Register module and run tests**

```ts
// apps/api/src/app.module.ts
import { Module } from '@nestjs/common';
import { AssetsModule } from './assets/assets.module';
import { GenerationModule } from './generation/generation.module';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './prisma/prisma.module';
import { ResultsModule } from './results/results.module';
import { TemplatesModule } from './templates/templates.module';

@Module({
  imports: [PrismaModule, HealthModule, TemplatesModule, AssetsModule, GenerationModule, ResultsModule],
})
export class AppModule {}
```

Run:

```bash
cd apps/api
npm test -- results.service.spec.ts
```

Expected: PASS for result event recording.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/results apps/api/src/app.module.ts
git commit -m "feat: add result feedback events"
```

## Task 12: End-to-End Generation API Contract

**Files:**

- Create: `apps/api/test/fixtures/request-builders.ts`
- Create: `apps/api/test/generation.e2e-spec.ts`
- Modify: `apps/api/src/generation/generation.queue.ts`
- Modify: `apps/api/src/generation/generation.module.ts`

- [ ] **Step 1: Write failing e2e test**

```ts
// apps/api/test/fixtures/request-builders.ts
import { Channel, MarketingScene, StyleTemplate } from '../../src/common/domain/enums';

export function createGenerationRequest(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    userId: 'user_demo',
    requestText: '给新品奶茶做一张朋友圈宣传图，突出第二杯半价',
    assetIds: [],
    channels: [Channel.WECHAT],
    scene: MarketingScene.NEW_PRODUCT,
    style: StyleTemplate.YOUNG_TRENDY,
    campaignInfo: {
      storeName: '小巷奶茶',
      productName: '柠檬茶',
      price: '19.9',
      extraSellingPoints: '第二杯半价',
    },
    ...overrides,
  };
}
```

```ts
// apps/api/test/generation.e2e-spec.ts
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { createGenerationRequest } from './fixtures/request-builders';

describe('Generation API', () => {
  it('creates a task and returns generated results after worker processing', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    const app = moduleRef.createNestApplication();
    await app.init();
    const prisma = app.get(PrismaService);
    await prisma.user.upsert({
      where: { id: 'user_demo' },
      create: { id: 'user_demo' },
      update: {},
    });

    const createResponse = await request(app.getHttpServer())
      .post('/generation-tasks')
      .send(createGenerationRequest())
      .expect(201);

    const taskId = createResponse.body.id;
    expect(taskId).toContain('task_');

    const getResponse = await request(app.getHttpServer())
      .get(`/generation-tasks/${taskId}`)
      .expect(200);

    expect(getResponse.body.results.length).toBeGreaterThan(0);
    expect(getResponse.body.results[0].title).toBeTruthy();
    expect(getResponse.body.results[0].publishingCopy).toBeTruthy();
    expect(getResponse.body.results[0].imageUrl).toBeTruthy();

    await app.close();
  });
});
```

- [ ] **Step 2: Run the e2e test and verify it fails**

Run:

```bash
cd apps/api
npm test -- generation.e2e-spec.ts
```

Expected: FAIL because the immediate queue does not process jobs through `GenerationWorker`.

- [ ] **Step 3: Make immediate queue call the worker in test-friendly mode**

Replace `apps/api/src/generation/generation.queue.ts` with:

```ts
// apps/api/src/generation/generation.queue.ts
export const GENERATION_QUEUE_PORT = Symbol('GENERATION_QUEUE_PORT');

export interface GenerationQueuePort {
  enqueueGeneration(taskId: string): Promise<void>;
}

export class ImmediateGenerationQueue implements GenerationQueuePort {
  private processor?: (taskId: string) => Promise<void>;

  setProcessor(processor: (taskId: string) => Promise<void>) {
    this.processor = processor;
  }

  async enqueueGeneration(taskId: string): Promise<void> {
    if (this.processor) {
      await this.processor(taskId);
    }
  }
}
```

Update `apps/api/src/generation/generation.module.ts` to wire the worker:

```ts
// apps/api/src/generation/generation.module.ts
import { Module, OnModuleInit } from '@nestjs/common';
import { AiProviderModule } from '../ai-providers/ai-provider.module';
import { PromptsModule } from '../prompts/prompts.module';
import { GenerationPlannerService } from '../workflow/generation-planner.service';
import { GenerationController } from './generation.controller';
import { GENERATION_QUEUE_PORT, ImmediateGenerationQueue } from './generation.queue';
import { GenerationRepository } from './generation.repository';
import { GenerationService } from './generation.service';
import { GenerationWorker } from './generation.worker';

@Module({
  imports: [AiProviderModule, PromptsModule],
  controllers: [GenerationController],
  providers: [
    GenerationPlannerService,
    GenerationRepository,
    GenerationService,
    GenerationWorker,
    ImmediateGenerationQueue,
    {
      provide: GENERATION_QUEUE_PORT,
      useExisting: ImmediateGenerationQueue,
    },
  ],
  exports: [GenerationService, GenerationRepository, GenerationWorker],
})
export class GenerationModule implements OnModuleInit {
  constructor(
    private readonly queue: ImmediateGenerationQueue,
    private readonly worker: GenerationWorker,
  ) {}

  onModuleInit() {
    this.queue.setProcessor((taskId) => this.worker.process(taskId));
  }
}
```

- [ ] **Step 4: Run e2e test and verify it passes**

Run:

```bash
cd apps/api
npm test -- generation.e2e-spec.ts
```

Expected: PASS and response contains generated image marketing package fields.

- [ ] **Step 5: Commit**

```bash
git add apps/api/test apps/api/src/generation
git commit -m "test: add generation api contract"
```

## Task 13: Production Queue Boundary with BullMQ

**Files:**

- Create: `apps/api/src/generation/bullmq-generation.queue.ts`
- Modify: `apps/api/src/generation/generation.module.ts`
- Create: `apps/api/src/generation/bullmq-generation.queue.spec.ts`

- [ ] **Step 1: Write failing queue adapter test**

```ts
// apps/api/src/generation/bullmq-generation.queue.spec.ts
import { BullMqGenerationQueue } from './bullmq-generation.queue';

describe('BullMqGenerationQueue', () => {
  it('adds generation task ids to the queue', async () => {
    const queue = {
      add: jest.fn().mockResolvedValue({ id: 'job_1' }),
    };
    const adapter = new BullMqGenerationQueue(queue as never);

    await adapter.enqueueGeneration('task_1');

    expect(queue.add).toHaveBeenCalledWith('process-generation-task', { taskId: 'task_1' });
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run:

```bash
cd apps/api
npm test -- bullmq-generation.queue.spec.ts
```

Expected: FAIL because BullMQ adapter does not exist.

- [ ] **Step 3: Create BullMQ adapter**

```ts
// apps/api/src/generation/bullmq-generation.queue.ts
import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';
import { GenerationQueuePort } from './generation.queue';

export const GENERATION_QUEUE_NAME = 'generation';

@Injectable()
export class BullMqGenerationQueue implements GenerationQueuePort {
  constructor(@InjectQueue(GENERATION_QUEUE_NAME) private readonly queue: Queue) {}

  async enqueueGeneration(taskId: string): Promise<void> {
    await this.queue.add('process-generation-task', { taskId });
  }
}
```

- [ ] **Step 4: Keep immediate queue as default for MVP local execution**

Do not replace `ImmediateGenerationQueue` in `GenerationModule` until Redis is provisioned in the deployment environment. The BullMQ adapter is ready behind the same `GenerationQueuePort` and can be selected through configuration in a deployment-focused change.

- [ ] **Step 5: Run queue adapter test**

Run:

```bash
cd apps/api
npm test -- bullmq-generation.queue.spec.ts
```

Expected: PASS for BullMQ adapter.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/generation/bullmq-generation.queue.ts apps/api/src/generation/bullmq-generation.queue.spec.ts
git commit -m "feat: add bullmq generation queue adapter"
```

## Task 14: Validation, Error Shape, and API Hardening

**Files:**

- Create: `apps/api/src/common/errors/app-error.ts`
- Create: `apps/api/src/common/filters/http-exception.filter.ts`
- Modify: `apps/api/src/main.ts`
- Create: `apps/api/test/validation.e2e-spec.ts`

- [ ] **Step 1: Write failing validation e2e test**

```ts
// apps/api/test/validation.e2e-spec.ts
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Validation', () => {
  it('rejects invalid generation request with consistent error shape', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    const app = moduleRef.createNestApplication();
    await app.init();

    const response = await request(app.getHttpServer())
      .post('/generation-tasks')
      .send({
        userId: 'user_1',
        requestText: '',
        assetIds: [],
        channels: ['invalid_channel'],
        scene: 'new_product',
        style: 'young_trendy',
        campaignInfo: {},
      })
      .expect(400);

    expect(response.body).toEqual(
      expect.objectContaining({
        error: expect.any(String),
        statusCode: 400,
        path: '/generation-tasks',
      }),
    );

    await app.close();
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run:

```bash
cd apps/api
npm test -- validation.e2e-spec.ts
```

Expected: FAIL if the error response does not include the consistent shape.

- [ ] **Step 3: Create exception filter**

```ts
// apps/api/src/common/errors/app-error.ts
export type AppErrorResponse = {
  statusCode: number;
  error: string;
  message: string | string[];
  path: string;
  timestamp: string;
};
```

```ts
// apps/api/src/common/filters/http-exception.filter.ts
import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import { Request, Response } from 'express';
import { AppErrorResponse } from '../errors/app-error';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const statusCode =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;
    const rawMessage =
      exception instanceof HttpException
        ? exception.getResponse()
        : 'Internal server error';

    const message =
      typeof rawMessage === 'object' && rawMessage !== null && 'message' in rawMessage
        ? (rawMessage as { message: string | string[] }).message
        : String(rawMessage);

    const body: AppErrorResponse = {
      statusCode,
      error: exception instanceof Error ? exception.name : 'Error',
      message,
      path: request.url,
      timestamp: new Date().toISOString(),
    };

    response.status(statusCode).json(body);
  }
}
```

- [ ] **Step 4: Register global filter**

```ts
// apps/api/src/main.ts
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidUnknownValues: true,
    }),
  );
  await app.listen(process.env.PORT ? Number(process.env.PORT) : 3001);
}

void bootstrap();
```

- [ ] **Step 5: Run validation test**

Run:

```bash
cd apps/api
npm test -- validation.e2e-spec.ts
```

Expected: PASS with consistent error response.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/common apps/api/src/main.ts apps/api/test/validation.e2e-spec.ts
git commit -m "feat: add consistent api validation errors"
```

## Task 15: Backend MVP Verification

**Files:**

- Modify: `docs/superpowers/plans/2026-05-19-mvp-backend-implementation.md` if verification reveals plan drift.

- [ ] **Step 1: Run unit and e2e tests**

Run:

```bash
cd apps/api
npm run db:up
npx prisma migrate dev
npm run prisma:seed
npm test
```

Expected: all unit and e2e tests pass.

- [ ] **Step 2: Build backend**

Run:

```bash
cd apps/api
npm run build
```

Expected: TypeScript build succeeds.

- [ ] **Step 3: Verify API surface manually**

Run:

```bash
cd apps/api
npm run start:dev
```

In a second terminal, run:

```bash
curl http://localhost:3001/health
```

Expected response:

```json
{"status":"ok","service":"ai-marketing-api"}
```

- [ ] **Step 4: Verify generation endpoint manually**

Run:

```bash
curl -X POST http://localhost:3001/generation-tasks \
  -H "Content-Type: application/json" \
  -d "{\"userId\":\"user_demo\",\"requestText\":\"给新品奶茶做一张朋友圈宣传图，突出第二杯半价\",\"assetIds\":[],\"channels\":[\"wechat\"],\"scene\":\"new_product\",\"style\":\"young_trendy\",\"campaignInfo\":{\"storeName\":\"小巷奶茶\",\"productName\":\"柠檬茶\",\"price\":\"19.9\",\"extraSellingPoints\":\"第二杯半价\"}}"
```

Expected response includes:

```json
{
  "id": "task_",
  "status": "queued"
}
```

Then fetch the task:

```bash
TASK_ID=task_id_from_previous_response
curl "http://localhost:3001/generation-tasks/$TASK_ID"
```

Expected response includes at least one result with `title`, `publishingCopy`, `imageText`, and `imageUrl`.

- [ ] **Step 5: Commit verification fixes**

```bash
git status --short
git add apps/api docs/superpowers/plans/2026-05-19-mvp-backend-implementation.md
git commit -m "chore: verify backend mvp"
```

## Definition of Done

Backend MVP is done when:

- `GET /health` works.
- `GET /templates` returns structured food and beverage templates.
- `POST /assets` stores asset metadata and returns an asset id.
- `POST /generation-tasks` creates a queued task.
- The worker produces up to 3 image marketing package results.
- `GET /generation-tasks/:id` returns task status and results.
- `POST /generation-tasks/:id/regenerate` creates a child regenerate task.
- `POST /generation-tasks/:id/modify` creates a child modify task with selected result and modification text.
- `POST /results/:id/events` records copy/download/modify signals.
- Unit tests and e2e tests pass.
- The system uses mock AI through provider ports, so real providers can be added without changing generation business logic.

## Plan Self-Review

- Spec coverage: The plan covers image generation entry, optional assets, channels, scenes, styles, campaign info, with-image and no-image modes, product consistency prompts, up to 3 results, regenerate, secondary modification, and feedback events.
- Scope: The plan is backend-only and keeps frontend, manual editing, direct publishing, full video generation, and real model integration outside the MVP backend build.
- Type consistency: Shared enums are defined before DTOs, planner, prompts, generation, and result events use them. The generation service uses the same `GenerationTaskStatus`, `GenerationTaskKind`, and `GenerationMode` values defined in Task 2.
