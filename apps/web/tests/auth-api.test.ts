import { describe, expect, it, vi, beforeEach } from 'vitest';

import { POST as register } from '../src/app/api/auth/register/route';
import { POST as login } from '../src/app/api/auth/login/route';
import { POST as logout } from '../src/app/api/auth/logout/route';
import { GET as me } from '../src/app/api/auth/me/route';
import { getCurrentUser, getRequestOwner, requireAdmin } from '../src/features/auth/server/request-auth';
import { getAuthService } from '../src/features/auth/server/auth-service';
import { AUTH_COOKIE_NAME } from '../src/features/auth/server/cookies';
import type { PublicUser } from '../src/features/auth/server/auth-types';

vi.mock('server-only', () => ({}));

vi.mock('../src/features/auth/server/auth-service', () => ({
  getAuthService: vi.fn(),
}));

const getService = vi.mocked(getAuthService);

const user: PublicUser = {
  id: 'user_1',
  email: 'person@example.com',
  role: 'user',
};

const admin: PublicUser = {
  id: 'user_admin',
  email: 'admin@example.com',
  role: 'admin',
};

function authCookie(token: string) {
  return `${AUTH_COOKIE_NAME}=${encodeURIComponent(token)}`;
}

function jsonRequest(path: string, body: unknown, headers?: HeadersInit) {
  return new Request(`http://localhost${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

function createServiceMock() {
  return {
    register: vi.fn(async () => ({
      user,
      sessionToken: 'session_register',
      expiresAt: new Date('2030-01-01T00:00:00.000Z'),
    })),
    login: vi.fn(async () => ({
      user,
      sessionToken: 'session_login',
      expiresAt: new Date('2030-01-02T00:00:00.000Z'),
    })),
    logout: vi.fn(async () => undefined),
    getUserBySessionToken: vi.fn(async () => null as PublicUser | null),
  };
}

describe('auth API routes', () => {
  let service: ReturnType<typeof createServiceMock>;

  beforeEach(() => {
    service = createServiceMock();
    getService.mockReturnValue(service);
  });

  it('register sets HttpOnly auth cookie and returns user', async () => {
    const response = await register(
      jsonRequest('/api/auth/register', {
        email: 'person@example.com',
        password: 'password123',
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body).toEqual({ user });
    expect(response.headers.get('set-cookie')).toContain(`${AUTH_COOKIE_NAME}=session_register`);
    expect(response.headers.get('set-cookie')).toContain('HttpOnly');
    expect(service.register).toHaveBeenCalledWith({
      email: 'person@example.com',
      password: 'password123',
      anonymousOwnerId: undefined,
    });
  });

  it('register passes only anonymous browser owner ids to the service', async () => {
    await register(
      jsonRequest('/api/auth/register', {
        email: 'person@example.com',
        password: 'password123',
        anonymousOwnerId: 'owner_browser',
      }),
    );
    await register(
      jsonRequest('/api/auth/register', {
        email: 'person@example.com',
        password: 'password123',
        anonymousOwnerId: 'user:existing',
      }),
    );

    expect(service.register).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ anonymousOwnerId: 'owner_browser' }),
    );
    expect(service.register).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ anonymousOwnerId: undefined }),
    );
  });

  it('duplicate register returns 409 with the service message', async () => {
    service.register.mockRejectedValueOnce(new Error('该邮箱已注册'));

    const response = await register(
      jsonRequest('/api/auth/register', {
        email: 'person@example.com',
        password: 'password123',
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body).toEqual({ message: '该邮箱已注册' });
  });

  it('register safely treats JSON null as an empty body', async () => {
    service.register.mockRejectedValueOnce(new Error('validation failed'));

    const response = await register(jsonRequest('/api/auth/register', null));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({ message: 'validation failed' });
    expect(service.register).toHaveBeenCalledWith({
      email: '',
      password: '',
      anonymousOwnerId: undefined,
    });
  });

  it('login sets cookie and then me returns current user when cookie is present', async () => {
    const loginResponse = await login(
      jsonRequest('/api/auth/login', {
        email: 'person@example.com',
        password: 'password123',
        anonymousOwnerId: 'owner_browser',
      }),
    );
    const loginBody = await loginResponse.json();

    service.getUserBySessionToken.mockResolvedValueOnce(user);
    const meResponse = await me(
      new Request('http://localhost/api/auth/me', {
        headers: { cookie: authCookie('session_login') },
      }),
    );
    const meBody = await meResponse.json();

    expect(loginResponse.status).toBe(200);
    expect(loginBody).toEqual({ user });
    expect(loginResponse.headers.get('set-cookie')).toContain(`${AUTH_COOKIE_NAME}=session_login`);
    expect(service.login).toHaveBeenCalledWith({
      email: 'person@example.com',
      password: 'password123',
      anonymousOwnerId: 'owner_browser',
    });
    expect(service.getUserBySessionToken).toHaveBeenCalledWith('session_login');
    expect(meBody).toEqual({ user });
  });

  it('login ignores account-style anonymous owner ids', async () => {
    await login(
      jsonRequest('/api/auth/login', {
        email: 'person@example.com',
        password: 'password123',
        anonymousOwnerId: 'user:existing',
      }),
    );

    expect(service.login).toHaveBeenCalledWith({
      email: 'person@example.com',
      password: 'password123',
      anonymousOwnerId: undefined,
    });
  });

  it('invalid login returns 401 with the service message', async () => {
    service.login.mockRejectedValueOnce(new Error('邮箱或密码不正确'));

    const response = await login(
      jsonRequest('/api/auth/login', {
        email: 'person@example.com',
        password: 'wrong-password',
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body).toEqual({ message: '邮箱或密码不正确' });
  });

  it('login safely treats JSON null as an empty body', async () => {
    service.login.mockRejectedValueOnce(new Error('validation failed'));

    const response = await login(jsonRequest('/api/auth/login', null));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({ message: 'validation failed' });
    expect(service.login).toHaveBeenCalledWith({
      email: '',
      password: '',
      anonymousOwnerId: undefined,
    });
  });

  it('logout calls service with raw cookie token and clears cookie', async () => {
    const response = await logout(
      new Request('http://localhost/api/auth/logout', {
        method: 'POST',
        headers: { cookie: authCookie('session_raw') },
      }),
    );
    const body = await response.json();

    expect(body).toEqual({ ok: true });
    expect(service.logout).toHaveBeenCalledWith('session_raw');
    expect(response.headers.get('set-cookie')).toContain(`${AUTH_COOKIE_NAME}=`);
    expect(response.headers.get('set-cookie')).toContain('Expires=Thu, 01 Jan 1970 00:00:00 GMT');
  });

  it('me returns null without a valid cookie/current user', async () => {
    const response = await me(new Request('http://localhost/api/auth/me'));
    const body = await response.json();

    expect(body).toEqual({ user: null });
    expect(service.getUserBySessionToken).not.toHaveBeenCalled();
  });
});

describe('request auth helpers', () => {
  let service: ReturnType<typeof createServiceMock>;

  beforeEach(() => {
    service = createServiceMock();
    getService.mockReturnValue(service);
  });

  it('uses the authenticated account owner over x-owner-id', async () => {
    service.getUserBySessionToken.mockResolvedValueOnce(user);

    const owner = await getRequestOwner(
      new Request('http://localhost/api/anything', {
        headers: {
          cookie: authCookie('session_user'),
          'x-owner-id': 'owner_browser',
        },
      }),
    );

    expect(owner).toEqual({ ownerId: 'user:user_1', user });
  });

  it('falls back to x-owner-id for anonymous requests', async () => {
    const owner = await getRequestOwner(
      new Request('http://localhost/api/anything', {
        headers: { 'x-owner-id': 'owner_browser' },
      }),
    );

    expect(owner).toEqual({ ownerId: 'owner_browser', user: null });
  });

  it('falls back to anonymous owner without requiring auth service when no cookie is present', async () => {
    getService.mockClear();
    getService.mockImplementation(() => {
      throw new Error('DATABASE_URL is required');
    });

    const owner = await getRequestOwner(
      new Request('http://localhost/api/anything', {
        headers: { 'x-owner-id': 'owner_browser' },
      }),
    );

    expect(owner).toEqual({ ownerId: 'owner_browser', user: null });
    expect(getService).not.toHaveBeenCalled();
  });

  it('rejects account-style x-owner-id for anonymous requests', async () => {
    const owner = await getRequestOwner(
      new Request('http://localhost/api/anything', {
        headers: { 'x-owner-id': 'user:victim' },
      }),
    );

    expect(owner).toEqual({ ownerId: 'anonymous', user: null });
  });

  it('falls back to anonymous when x-owner-id is missing or invalid', async () => {
    const missing = await getRequestOwner(new Request('http://localhost/api/anything'));
    const invalid = await getRequestOwner(
      new Request('http://localhost/api/anything', {
        headers: { 'x-owner-id': 'not-an-owner' },
      }),
    );

    expect(missing).toEqual({ ownerId: 'anonymous', user: null });
    expect(invalid).toEqual({ ownerId: 'anonymous', user: null });
  });

  it('requireAdmin returns 401, 403, or the admin user', async () => {
    const noUser = await requireAdmin(new Request('http://localhost/api/admin'));
    service.getUserBySessionToken.mockResolvedValueOnce(user);
    const regularUser = await requireAdmin(
      new Request('http://localhost/api/admin', {
        headers: { cookie: authCookie('session_user') },
      }),
    );
    service.getUserBySessionToken.mockResolvedValueOnce(admin);
    const adminUser = await requireAdmin(
      new Request('http://localhost/api/admin', {
        headers: { cookie: authCookie('session_admin') },
      }),
    );

    expect(noUser).toBeInstanceOf(Response);
    expect((noUser as Response).status).toBe(401);
    expect(await (noUser as Response).json()).toEqual({ message: '请先登录' });
    expect(regularUser).toBeInstanceOf(Response);
    expect((regularUser as Response).status).toBe(403);
    expect(await (regularUser as Response).json()).toEqual({ message: '没有权限访问模板管理' });
    expect(adminUser).toEqual(admin);
  });

  it('getCurrentUser reads the auth cookie session token', async () => {
    service.getUserBySessionToken.mockResolvedValueOnce(user);

    const currentUser = await getCurrentUser(
      new Request('http://localhost/api/auth/me', {
        headers: { cookie: authCookie('session_user') },
      }),
    );

    expect(currentUser).toEqual(user);
    expect(service.getUserBySessionToken).toHaveBeenCalledWith('session_user');
  });

  it('getCurrentUser returns null without requiring auth service when no cookie is present', async () => {
    getService.mockClear();
    getService.mockImplementation(() => {
      throw new Error('DATABASE_URL is required');
    });

    const currentUser = await getCurrentUser(new Request('http://localhost/api/auth/me'));

    expect(currentUser).toBeNull();
    expect(getService).not.toHaveBeenCalled();
  });
});
