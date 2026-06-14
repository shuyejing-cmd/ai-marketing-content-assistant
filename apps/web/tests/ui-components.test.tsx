// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BottomSheet } from '../src/components/ui/BottomSheet';
import { Button } from '../src/components/ui/Button';
import { IconButton } from '../src/components/ui/IconButton';
import {
  ConfigSummary,
  Feedback,
  Field,
  TextArea,
} from '../src/components/ui/Primitives';
import { SegmentedTabs } from '../src/components/ui/SegmentedTabs';
import { SelectChip } from '../src/components/ui/SelectChip';

vi.stubGlobal('React', React);

afterEach(() => {
  cleanup();
  document.body.style.overflow = '';
});

describe('Button', () => {
  it('shows its loading label and prevents repeated actions', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();

    render(
      <Button loading onClick={onClick}>
        生成图片
      </Button>,
    );

    const button = screen.getByRole('button', { name: '正在处理' });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    await user.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe('controlled selection components', () => {
  it('reports chip changes without mutating controlled state', async () => {
    const user = userEvent.setup();
    const onSelectedChange = vi.fn();
    const view = render(
      <SelectChip selected={false} onSelectedChange={onSelectedChange}>
        小红书
      </SelectChip>,
    );

    const chip = screen.getByRole('button', { name: '小红书' });
    await user.click(chip);
    expect(onSelectedChange).toHaveBeenCalledWith(true);
    expect(chip.getAttribute('aria-pressed')).toBe('false');

    view.rerender(
      <SelectChip selected onSelectedChange={onSelectedChange}>
        小红书
      </SelectChip>,
    );
    expect(chip.getAttribute('aria-pressed')).toBe('true');
  });

  it('reports tab changes without mutating controlled state', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    const items = [
      { label: '登录', value: 'login' },
      { label: '注册', value: 'register' },
    ];
    const view = render(
      <SegmentedTabs value="login" items={items} onValueChange={onValueChange} />,
    );

    await user.click(screen.getByRole('tab', { name: '注册' }));
    expect(onValueChange).toHaveBeenCalledWith('register');
    expect(
      screen.getByRole('tab', { name: '登录' }).getAttribute('aria-selected'),
    ).toBe('true');

    view.rerender(
      <SegmentedTabs value="register" items={items} onValueChange={onValueChange} />,
    );
    expect(
      screen.getByRole('tab', { name: '注册' }).getAttribute('aria-selected'),
    ).toBe('true');
  });

  it('exposes selected icon buttons as pressed', () => {
    render(
      <IconButton label="显示会话" selected>
        S
      </IconButton>,
    );

    expect(
      screen.getByRole('button', { name: '显示会话' }).getAttribute('aria-pressed'),
    ).toBe('true');
  });

  it('does not expose command icon buttons as toggles', () => {
    render(<IconButton label="Delete">D</IconButton>);

    expect(
      screen.getByRole('button', { name: 'Delete' }).hasAttribute('aria-pressed'),
    ).toBe(false);
  });

  it('supports roving keyboard navigation between tabs', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(
      <SegmentedTabs
        value="login"
        items={[
          { label: 'Login', value: 'login' },
          { label: 'Register', value: 'register' },
        ]}
        onValueChange={onValueChange}
      />,
    );

    const loginTab = screen.getByRole('tab', { name: 'Login' });
    const registerTab = screen.getByRole('tab', { name: 'Register' });
    expect(loginTab.getAttribute('tabindex')).toBe('0');
    expect(registerTab.getAttribute('tabindex')).toBe('-1');

    loginTab.focus();
    await user.keyboard('{ArrowRight}');
    expect(onValueChange).toHaveBeenCalledWith('register');
    expect(document.activeElement).toBe(registerTab);
  });
});

describe('form and feedback primitives', () => {
  it('connects field errors and textarea hints to their controls', () => {
    render(
      <>
        <Field label="活动名称" error="请输入活动名称" />
        <TextArea label="创作需求" hint="描述产品卖点" />
      </>,
    );

    const activityField = screen.getByRole('textbox', { name: /活动名称/ });
    const briefField = screen.getByRole('textbox', { name: /创作需求/ });
    expect(activityField.getAttribute('aria-invalid')).toBe('true');
    expect(
      document.getElementById(activityField.getAttribute('aria-describedby') ?? '')
        ?.textContent,
    ).toContain('请输入活动名称');
    expect(
      document.getElementById(briefField.getAttribute('aria-describedby') ?? '')
        ?.textContent,
    ).toContain('描述产品卖点');
  });

  it('uses live semantic roles for feedback', () => {
    render(
      <>
        <Feedback tone="error">生成失败</Feedback>
        <Feedback tone="success">保存成功</Feedback>
      </>,
    );

    expect(screen.getByRole('alert').textContent).toContain('生成失败');
    expect(screen.getByRole('status').textContent).toContain('保存成功');
  });

  it('renders configuration items and calls edit', async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();

    render(
      <ConfigSummary
        items={[
          { label: '发布渠道', value: '小红书' },
          { label: '视觉风格', value: '清新自然' },
        ]}
        onEdit={onEdit}
      />,
    );

    expect(screen.getByText('小红书')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: '编辑生成配置' }));
    expect(onEdit).toHaveBeenCalledTimes(1);
  });
});

describe('BottomSheet', () => {
  it('keeps field focus when the callback identity changes', () => {
    const view = render(
      <BottomSheet open title="Settings" onOpenChange={() => undefined}>
        <input aria-label="Campaign name" />
      </BottomSheet>,
    );

    const input = screen.getByRole('textbox', { name: 'Campaign name' });
    input.focus();
    view.rerender(
      <BottomSheet open title="Settings" onOpenChange={() => undefined}>
        <input aria-label="Campaign name" />
      </BottomSheet>,
    );

    expect(document.activeElement).toBe(input);
  });

  it('manages focus, Escape, scroll locking, and focus restoration', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    const trigger = document.createElement('button');
    trigger.textContent = '打开面板';
    document.body.appendChild(trigger);
    trigger.focus();

    const view = render(
      <BottomSheet open title="生成配置" onOpenChange={onOpenChange}>
        <button type="button">面板操作</button>
      </BottomSheet>,
    );

    expect(document.body.style.overflow).toBe('hidden');
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: '关闭面板' }),
    );

    await user.keyboard('{Escape}');
    expect(onOpenChange).toHaveBeenCalledWith(false);

    view.rerender(
      <BottomSheet open={false} title="生成配置" onOpenChange={onOpenChange}>
        <button type="button">面板操作</button>
      </BottomSheet>,
    );
    expect(document.body.style.overflow).toBe('');
    expect(document.activeElement).toBe(trigger);

    trigger.remove();
  });
});
