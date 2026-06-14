// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createAdminTemplate: vi.fn(),
  listAdminTemplates: vi.fn(),
  updateAdminTemplate: vi.fn(),
}));

vi.mock('../src/features/templates/template-client', () => ({
  createAdminTemplate: mocks.createAdminTemplate,
  listAdminTemplates: mocks.listAdminTemplates,
  updateAdminTemplate: mocks.updateAdminTemplate,
}));

vi.stubGlobal('React', React);
vi.stubGlobal('scrollTo', vi.fn());

import TemplateAdminPage from '../src/app/admin/templates/page';

describe('TemplateAdminPage', () => {
  beforeEach(() => {
    mocks.listAdminTemplates.mockResolvedValue([
      {
        id: 'template-1',
        type: 'image',
        title: '新品海报',
        description: '新品上市模板',
        coverImageDataUrl: 'data:image/png;base64,Y292ZXI=',
        prompt: '生成新品海报',
        published: true,
        sortOrder: 1,
        createdAt: '2026-06-10T00:00:00.000Z',
        updatedAt: '2026-06-10T00:00:00.000Z',
      },
    ]);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders form and template list as desktop workspaces', async () => {
    render(<TemplateAdminPage />);

    expect(screen.getByRole('region', { name: '模板编辑表单' })).toBeTruthy();
    expect(await screen.findByRole('region', { name: '模板列表' })).toBeTruthy();
    expect(await screen.findByText('已发布')).toBeTruthy();
    expect(screen.getByRole('button', { name: '下架新品海报' })).toBeTruthy();
  });
});
