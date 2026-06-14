// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import AuthPage from '../src/app/auth/page';
import { ComingSoonPage } from '../src/components/ComingSoonPage';
import { HomeMenuDrawer } from '../src/components/HomeMenuDrawer';

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
  register: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mocks.push,
    refresh: mocks.refresh,
  }),
}));

vi.mock('../src/features/auth/auth-client', () => ({
  getCurrentUser: mocks.getCurrentUser,
  login: mocks.login,
  logout: mocks.logout,
  register: mocks.register,
}));

vi.stubGlobal('React', React);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  document.body.style.overflow = '';
});

describe('AuthPage', () => {
  it('uses a controlled segmented control for login and registration', async () => {
    const user = userEvent.setup();
    render(<AuthPage />);

    expect(
      screen.getByRole('tab', { name: '登录' }).getAttribute('aria-selected'),
    ).toBe('true');
    await user.click(screen.getByRole('tab', { name: '注册' }));
    expect(
      screen.getByRole('tab', { name: '注册' }).getAttribute('aria-selected'),
    ).toBe('true');
    expect(screen.getByRole('button', { name: '注册并保留内容' })).toBeTruthy();
  });
});

describe('HomeMenuDrawer', () => {
  it('leaves loading state and shows unified feedback when account reading fails', async () => {
    mocks.getCurrentUser.mockRejectedValueOnce(
      new Error('账号状态读取超时，请检查数据库连接或服务端配置'),
    );
    const user = userEvent.setup();
    render(<HomeMenuDrawer />);

    await user.click(screen.getByRole('button', { name: '打开主页菜单' }));
    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      expect.stringContaining('数据库连接或服务端配置'),
    );
    expect(screen.queryByText('账号状态读取中')).toBeNull();
  });

  it('shows template management to every signed-in user', async () => {
    mocks.getCurrentUser.mockResolvedValueOnce({
      user: {
        id: 'user_1',
        email: 'person@example.com',
        role: 'user',
      },
    });
    const user = userEvent.setup();
    render(<HomeMenuDrawer />);

    await user.click(screen.getByRole('button', { name: '打开主页菜单' }));
    const templateLink = await screen.findByRole('link', {
      name: /模板创建\/管理/,
    });
    expect(templateLink.getAttribute('href')).toBe('/admin/templates');
  });

  it('traps keyboard focus inside the open drawer', async () => {
    mocks.getCurrentUser.mockResolvedValueOnce({ user: null });
    const user = userEvent.setup();
    render(<HomeMenuDrawer />);

    await user.click(screen.getByRole('button', { name: '打开主页菜单' }));
    const dialog = screen.getByRole('dialog');
    const focusable = Array.from(
      dialog.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], input:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    );
    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    last.focus();
    await user.keyboard('{Tab}');
    expect(document.activeElement).toBe(first);

    first.focus();
    await user.keyboard('{Shift>}{Tab}{/Shift}');
    expect(document.activeElement).toBe(last);
  });
});

describe('ComingSoonPage', () => {
  it('keeps unavailable marketing routes inside the product', () => {
    render(
      <ComingSoonPage
        title="文案营销"
        description="文案能力正在准备中"
        icon="copy"
      />,
    );

    expect(screen.getByRole('heading', { name: '文案营销' })).toBeTruthy();
    expect(screen.getByRole('link', { name: '返回首页' }).getAttribute('href')).toBe(
      '/',
    );
    expect(screen.getByText('即将开放')).toBeTruthy();
  });
});
