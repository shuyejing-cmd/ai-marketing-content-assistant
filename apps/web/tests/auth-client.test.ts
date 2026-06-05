import { describe, expect, it, vi, afterEach } from 'vitest';

import { getCurrentUser, login, logout, register } from '../src/features/auth/auth-client';

const user = {
  id: 'user_1',
  email: 'person@example.com',
  role: 'user' as const,
};

describe('auth client', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('register posts email, password, and anonymous owner id', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ user }), { status: 201 }));
    vi.stubGlobal('fetch', fetcher);

    const response = await register({
      email: 'person@example.com',
      password: 'password123',
      anonymousOwnerId: 'owner_browser',
    });

    expect(response).toEqual({ user });
    expect(fetcher).toHaveBeenCalledWith('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'person@example.com',
        password: 'password123',
        anonymousOwnerId: 'owner_browser',
      }),
    });
  });

  it('login posts credentials and anonymous owner id', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ user }), { status: 200 }));
    vi.stubGlobal('fetch', fetcher);

    const response = await login({
      email: 'person@example.com',
      password: 'password123',
      anonymousOwnerId: 'owner_browser',
    });

    expect(response).toEqual({ user });
    expect(fetcher).toHaveBeenCalledWith('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'person@example.com',
        password: 'password123',
        anonymousOwnerId: 'owner_browser',
      }),
    });
  });

  it('rejects malformed login success responses', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal('fetch', fetcher);

    await expect(login({ email: 'person@example.com', password: 'password123' })).rejects.toThrow('登录失败');
  });

  it('rejects malformed register success responses', async () => {
    const fetcher = vi.fn(async () => new Response('', { status: 201 }));
    vi.stubGlobal('fetch', fetcher);

    await expect(register({ email: 'person@example.com', password: 'password123' })).rejects.toThrow('注册失败');
  });

  it('gets the current user without cached data', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ user }), { status: 200 }));
    vi.stubGlobal('fetch', fetcher);

    const response = await getCurrentUser();

    expect(response).toEqual({ user });
    expect(fetcher).toHaveBeenCalledWith('/api/auth/me', expect.objectContaining({
      cache: 'no-store',
      signal: expect.any(AbortSignal),
    }));
  });

  it('times out when the current user request hangs', async () => {
    const fetcher = vi.fn(() => new Promise<Response>(() => undefined));
    vi.stubGlobal('fetch', fetcher);

    await expect(getCurrentUser({ timeoutMs: 1 })).rejects.toThrow('账号状态读取超时，请检查数据库连接或服务端配置');
  });

  it('accepts a signed-out current user response', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ user: null }), { status: 200 }));
    vi.stubGlobal('fetch', fetcher);

    const response = await getCurrentUser();

    expect(response).toEqual({ user: null });
  });

  it('rejects malformed current user responses', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ user: { id: 123, email: null, role: 'admin' } }), { status: 200 }));
    vi.stubGlobal('fetch', fetcher);

    await expect(getCurrentUser()).rejects.toThrow('读取账号失败');
  });

  it('logs out through the logout endpoint', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal('fetch', fetcher);

    const response = await logout();

    expect(response).toEqual({ ok: true });
    expect(fetcher).toHaveBeenCalledWith('/api/auth/logout', { method: 'POST' });
  });

  it('rejects malformed logout success responses', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ ok: false }), { status: 200 }));
    vi.stubGlobal('fetch', fetcher);

    await expect(logout()).rejects.toThrow('退出登录失败');
  });

  it('throws the API message for failed responses', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ message: '邮箱或密码不正确' }), { status: 401 }));
    vi.stubGlobal('fetch', fetcher);

    await expect(login({ email: 'person@example.com', password: 'wrong', anonymousOwnerId: 'owner_browser' }))
      .rejects.toThrow('邮箱或密码不正确');
  });
});
