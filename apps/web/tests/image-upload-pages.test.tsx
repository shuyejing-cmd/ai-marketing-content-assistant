// @vitest-environment jsdom

import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProcessedUploadImage } from '../src/features/image-upload/image-types';

vi.stubGlobal('React', React);
Element.prototype.scrollIntoView = vi.fn();

const mocks = vi.hoisted(() => ({
  createGenerationTask: vi.fn(),
  createTemplateGenerationTask: vi.fn(),
  createRemoteSession: vi.fn(),
  getTemplate: vi.fn(),
  listRemoteSessions: vi.fn(),
  logFrontendRunEvent: vi.fn(),
}));

const processedImage: ProcessedUploadImage = {
  dataUrl: 'data:image/png;base64,cHJvZHVjdA==',
  mimeType: 'image/png',
  bytes: 7,
  width: 640,
  height: 480,
  processing: 'original',
};

const session = {
  id: 'session-1',
  title: '测试会话',
  kind: 'free' as const,
  templateId: null,
  activeTaskId: null,
  tasks: [],
  createdAt: '2026-06-10T00:00:00.000Z',
  updatedAt: '2026-06-10T00:00:00.000Z',
};

const task = {
  id: 'task-1',
  status: 'succeeded' as const,
  request: {
    requestText: '测试提示',
    channels: ['wechat' as const],
    scene: 'new_product' as const,
    style: 'young_trendy' as const,
    campaignInfo: {},
  },
  results: [],
};

vi.mock('../src/components/AppShell', () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('../src/components/BottomSheet', () => ({
  BottomSheet: ({
    children,
    open,
  }: {
    children: React.ReactNode;
    open: boolean;
  }) => (open ? <div>{children}</div> : null),
}));

vi.mock('../src/components/ActivityInfoForm', () => ({
  ActivityInfoForm: () => null,
}));

vi.mock('../src/components/OptionPicker', () => ({
  OptionPicker: () => null,
}));

vi.mock('../src/components/QuickActionBar', () => ({
  QuickActionBar: () => null,
}));

vi.mock('../src/components/ResultCard', () => ({
  ResultCard: () => null,
}));

vi.mock('../src/components/ImageUploader', () => ({
  ImageUploader: ({
    image,
    onChange,
    onProcessingChange,
  }: {
    image?: ProcessedUploadImage;
    onChange: (image?: ProcessedUploadImage) => void;
    onProcessingChange?: (processing: boolean) => void;
  }) => (
    <div>
      <button
        type="button"
        data-testid="start-image-processing"
        onClick={() => onProcessingChange?.(true)}
      >
        start
      </button>
      <button
        type="button"
        data-testid="finish-image-processing"
        onClick={() => {
          onChange(processedImage);
          onProcessingChange?.(false);
        }}
      >
        finish
      </button>
      <span data-testid="current-upload-image">{image?.dataUrl ?? 'none'}</span>
    </div>
  ),
}));

vi.mock('../src/components/ChatComposer', () => ({
  ChatComposer: ({
    loading,
    onSubmit,
  }: {
    loading: boolean;
    onSubmit: () => void;
  }) => (
    <button
      type="button"
      data-testid="free-submit"
      data-loading={String(loading)}
      onClick={onSubmit}
    >
      submit
    </button>
  ),
}));

vi.mock('../src/features/generation/dev-run-log-client', () => ({
  logFrontendRunEvent: mocks.logFrontendRunEvent,
}));

vi.mock('../src/features/generation/generation-client', () => ({
  createGenerationTask: mocks.createGenerationTask,
  modifyTask: vi.fn(),
  regenerateTask: vi.fn(),
}));

vi.mock('../src/features/generation/owner-id', () => ({
  getCurrentFreeRemoteSessionId: vi.fn(),
  getCurrentTemplateRemoteSessionId: vi.fn(),
  getOwnerId: vi.fn(() => 'owner-1'),
  setCurrentFreeRemoteSessionId: vi.fn(),
  setCurrentTemplateRemoteSessionId: vi.fn(),
}));

vi.mock('../src/features/generation/session-client', () => ({
  createSession: mocks.createRemoteSession,
  deleteSession: vi.fn(),
  listSessions: mocks.listRemoteSessions,
  renameSession: vi.fn(),
}));

vi.mock('../src/features/templates/template-client', () => ({
  createTemplateGenerationTask: mocks.createTemplateGenerationTask,
  getTemplate: mocks.getTemplate,
}));

vi.mock('next/link', () => ({
  default: ({ children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a {...props}>{children}</a>
  ),
}));

import ImagePage from '../src/app/image/page';
import { TemplateImageClient } from '../src/app/templates/image/[id]/TemplateImageClient';

describe('image upload page integration', () => {
  beforeEach(() => {
    mocks.createGenerationTask.mockReset().mockResolvedValue(task);
    mocks.createTemplateGenerationTask.mockReset().mockResolvedValue(task);
    mocks.createRemoteSession.mockReset().mockResolvedValue(session);
    mocks.getTemplate.mockReset().mockResolvedValue({
      id: 'template-1',
      type: 'image',
      title: '模板',
      description: '描述',
      coverImageDataUrl: 'data:image/png;base64,Y292ZXI=',
      published: true,
      sortOrder: 1,
      createdAt: '2026-06-10T00:00:00.000Z',
      updatedAt: '2026-06-10T00:00:00.000Z',
    });
    mocks.listRemoteSessions.mockReset().mockResolvedValue([]);
    mocks.logFrontendRunEvent.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it('blocks free generation while processing and clears a successful upload after generation', async () => {
    render(<ImagePage />);

    const submit = await screen.findByTestId('free-submit');
    fireEvent.click(screen.getByTestId('start-image-processing'));
    expect(submit.getAttribute('data-loading')).toBe('true');

    fireEvent.click(submit);

    expect(await screen.findByText('图片仍在处理中，请稍候')).toBeTruthy();
    expect(mocks.createGenerationTask).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId('finish-image-processing'));
    expect(screen.getByTestId('current-upload-image').textContent).toBe(processedImage.dataUrl);
    fireEvent.click(submit);

    await waitFor(() => {
      expect(mocks.createGenerationTask).toHaveBeenCalledWith(
        expect.objectContaining({ uploadedImageDataUrl: processedImage.dataUrl }),
        expect.any(Object),
      );
      expect(screen.getByTestId('current-upload-image').textContent).toBe('none');
    });

    assertSafeUploadLog('free');
  });

  it('renders the free image workflow as a three-zone workbench', async () => {
    render(<ImagePage />);

    await screen.findByTestId('free-submit');
    expect(screen.getByRole('navigation', { name: '会话列表' })).toBeTruthy();
    expect(screen.getByRole('region', { name: '生成结果' })).toBeTruthy();
    expect(screen.getByRole('complementary', { name: '生成配置' })).toBeTruthy();
  });

  it('blocks template generation while processing and clears a successful upload after generation', async () => {
    render(<TemplateImageClient templateId="template-1" />);

    await screen.findByRole('button', { name: '生成模板图片' });
    fireEvent.click(screen.getByTestId('start-image-processing'));

    expect(
      (await screen.findByRole('button', { name: '正在处理图片...' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(mocks.createTemplateGenerationTask).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId('finish-image-processing'));
    fireEvent.click(screen.getByRole('button', { name: '生成模板图片' }));

    await waitFor(() => {
      expect(mocks.createTemplateGenerationTask).toHaveBeenCalledWith(
        'template-1',
        expect.objectContaining({ uploadedImageDataUrl: processedImage.dataUrl }),
        expect.any(Object),
      );
      expect(screen.getByTestId('current-upload-image').textContent).toBe('none');
    });

    assertSafeUploadLog('template');
  });

  it('renders template generation as input and result workspaces', async () => {
    render(<TemplateImageClient templateId="template-1" />);

    await screen.findByRole('button', { name: '生成模板图片' });
    expect(
      screen.getByRole('complementary', { name: '模板输入配置' }),
    ).toBeTruthy();
    expect(screen.getByRole('region', { name: '模板生成结果' })).toBeTruthy();
  });
});

function assertSafeUploadLog(source: 'free' | 'template') {
  const uploadLog = mocks.logFrontendRunEvent.mock.calls.find(
    ([event]) => event === 'frontend.image.uploaded',
  );
  expect(uploadLog?.[1]).toEqual(
    expect.objectContaining({
      image: expect.objectContaining({ mimeType: 'image/png' }),
      width: 640,
      height: 480,
      processing: 'original',
      source,
    }),
  );
  expect(JSON.stringify(uploadLog)).not.toContain(processedImage.dataUrl);
}
