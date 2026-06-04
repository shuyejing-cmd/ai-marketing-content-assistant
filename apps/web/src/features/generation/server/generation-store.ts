import type { GenerationResult, GenerationTask } from '../generation-types';
import { getPrismaClient } from './prisma';
import type { GenerationStore, ImageAssetRecord, PromptLogRecord } from './generation-service';
import { createSessionRepository } from './session-repository';

const globalForGenerationStore = globalThis as unknown as {
  generationMemoryTasks?: Map<string, GenerationTask>;
  generationMemoryTaskMeta?: Map<string, { ownerId: string; sessionId: string | null; createdAt: Date }>;
  generationMemoryPromptLogs?: PromptLogRecord[];
  generationMemoryImageAssets?: ImageAssetRecord[];
};

const memoryTasks = (globalForGenerationStore.generationMemoryTasks ??= new Map<string, GenerationTask>());
const memoryTaskMeta = (globalForGenerationStore.generationMemoryTaskMeta ??= new Map<string, { ownerId: string; sessionId: string | null; createdAt: Date }>());
const memoryPromptLogs = (globalForGenerationStore.generationMemoryPromptLogs ??= []);
const memoryImageAssets = (globalForGenerationStore.generationMemoryImageAssets ??= []);

export function createGenerationStore(): GenerationStore {
  const prisma = getPrismaClient();
  if (!prisma) {
    return createMemoryStore();
  }

  return {
    async saveTask(task, meta) {
      const ownerId = meta?.ownerId ?? 'anonymous';
      const session = meta?.sessionId
        ? await prisma.session.findFirst({ where: { id: meta.sessionId, ownerId } })
        : null;
      const sessionId = session?.id ?? null;

      await prisma.generationTask.create({
        data: {
          id: task.id,
          ownerId,
          sessionId,
          status: task.status,
          requestJson: task.request,
          errorMessage: meta?.errorMessage ?? task.errorMessage ?? null,
          results: {
            create: task.results.map((result) => ({
              id: result.id,
              channel: result.channel,
              style: result.style,
              title: result.title,
              publishingCopy: result.publishingCopy,
              imageText: result.imageText,
              imageUrl: result.imageUrl ?? null,
              generatedImageDataUrl: result.generatedImageDataUrl ?? null,
              uploadedImageDataUrl: result.uploadedImageDataUrl ?? null,
            })),
          },
        },
      });

      if (sessionId) {
        await prisma.session.updateMany({
          where: { id: sessionId, ownerId },
          data: {
            currentTaskId: task.id,
            title: createSessionTitle(task.request.requestText),
          },
        });
      }
    },
    async savePromptLog(log) {
      await prisma.promptLog.create({
        data: {
          id: log.id,
          taskId: log.taskId,
          promptVersion: log.promptVersion,
          imagePrompt: log.imagePrompt,
          copyPrompt: log.copyPrompt,
          providerRequestJson: log.providerRequestJson ?? undefined,
          providerResponseJson: log.providerResponseJson ?? undefined,
          errorMessage: log.errorMessage ?? null,
        },
      });
    },
    async saveImageAsset(asset) {
      await prisma.imageAsset.create({
        data: {
          id: asset.id,
          ownerId: asset.ownerId,
          kind: asset.kind,
          mimeType: asset.mimeType,
          base64: asset.base64,
        },
      });
    },
    async getImageAsset(id) {
      const asset = await prisma.imageAsset.findUnique({ where: { id } });
      return asset
        ? {
            id: asset.id,
            ownerId: asset.ownerId,
            kind: asset.kind as ImageAssetRecord['kind'],
            mimeType: asset.mimeType,
            base64: asset.base64,
          }
        : null;
    },
    async getTask(taskId) {
      const task = await prisma.generationTask.findUnique({
        where: { id: taskId },
        include: { results: true },
      });
      if (!task) return null;
      return mapTask(task);
    },
    async getTaskForOwner(ownerId, taskId) {
      const task = await prisma.generationTask.findFirst({
        where: { id: taskId, ownerId },
        include: { results: true },
      });
      if (!task) return null;
      return mapTask(task);
    },
    async listTasksForSession(ownerId, sessionId) {
      const tasks = await prisma.generationTask.findMany({
        where: { ownerId, sessionId },
        include: { results: true },
        orderBy: { createdAt: 'asc' },
      });
      return tasks.map(mapTask);
    },
  };
}

function createMemoryStore(): GenerationStore {
  return {
    async saveTask(task, meta) {
      const ownerId = meta?.ownerId ?? 'anonymous';
      const sessions = createSessionRepository(null);
      const session = meta?.sessionId ? await sessions.getSession(ownerId, meta.sessionId) : null;
      const sessionId = session?.id ?? null;

      memoryTasks.set(task.id, task);
      memoryTaskMeta.set(task.id, {
        ownerId,
        sessionId,
        createdAt: new Date(),
      });
      if (sessionId) {
        await sessions.setCurrentTask(
          ownerId,
          sessionId,
          task.id,
          createSessionTitle(task.request.requestText),
        );
      }
    },
    async savePromptLog(log) {
      memoryPromptLogs.push(log);
    },
    async saveImageAsset(asset) {
      memoryImageAssets.push(asset);
    },
    async getImageAsset(id) {
      return memoryImageAssets.find((asset) => asset.id === id) ?? null;
    },
    async getTask(taskId) {
      return memoryTasks.get(taskId) ?? null;
    },
    async getTaskForOwner(ownerId, taskId) {
      const meta = memoryTaskMeta.get(taskId);
      if (meta?.ownerId !== ownerId) return null;
      return memoryTasks.get(taskId) ?? null;
    },
    async listTasksForSession(ownerId, sessionId) {
      return Array.from(memoryTasks.entries())
        .filter(([taskId]) => {
          const meta = memoryTaskMeta.get(taskId);
          return meta?.ownerId === ownerId && meta.sessionId === sessionId;
        })
        .sort(([leftId], [rightId]) => {
          const left = memoryTaskMeta.get(leftId)?.createdAt.getTime() ?? 0;
          const right = memoryTaskMeta.get(rightId)?.createdAt.getTime() ?? 0;
          return left - right;
        })
        .map(([, task]) => task);
    },
  };
}

function mapTask(task: {
  id: string;
  status: string;
  errorMessage: string | null;
  requestJson: unknown;
  results: Array<{
    id: string;
    channel: string;
    style: string;
    title: string;
    publishingCopy: string;
    imageText: unknown;
    imageUrl: string | null;
    generatedImageDataUrl: string | null;
    uploadedImageDataUrl: string | null;
  }>;
}): GenerationTask {
  return {
    id: task.id,
    status: task.status as GenerationTask['status'],
    errorMessage: task.errorMessage ?? undefined,
    request: task.requestJson as GenerationTask['request'],
    results: task.results.map((result) => ({
      id: result.id,
      channel: result.channel as GenerationResult['channel'],
      style: result.style as GenerationResult['style'],
      title: result.title,
      publishingCopy: result.publishingCopy,
      imageText: result.imageText as string[],
      imageUrl: result.imageUrl ?? undefined,
      generatedImageDataUrl: result.generatedImageDataUrl ?? undefined,
      uploadedImageDataUrl: result.uploadedImageDataUrl ?? undefined,
    })),
  };
}

function createSessionTitle(requestText: string) {
  const normalized = requestText.trim();
  return normalized ? normalized.slice(0, 18) : '新的图片会话';
}
