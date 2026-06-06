import type { GenerationTask } from './generation-types';

const globalStore = globalThis as typeof globalThis & {
  __aiMarketingMockTasks?: Map<string, GenerationTask>;
};

export const mockTasks = globalStore.__aiMarketingMockTasks ?? new Map<string, GenerationTask>();

globalStore.__aiMarketingMockTasks = mockTasks;
