import type { PublicUser } from './server/auth-types';

export type AuthUserResponse = {
  user: PublicUser | null;
};

type GetCurrentUserOptions = {
  timeoutMs?: number;
};

type AuthSuccessResponse = {
  user: PublicUser;
};

type AuthCredentials = {
  email: string;
  password: string;
  anonymousOwnerId?: string | null;
};

const DEFAULT_CURRENT_USER_TIMEOUT_MS = 8000;

export async function getCurrentUser(options: GetCurrentUserOptions = {}): Promise<AuthUserResponse> {
  const controller = new AbortController();
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const timeoutMs = options.timeoutMs ?? DEFAULT_CURRENT_USER_TIMEOUT_MS;

  try {
    return await Promise.race([
      requestAuthUser('/api/auth/me', { cache: 'no-store', signal: controller.signal }, '读取账号失败'),
      new Promise<AuthUserResponse>((_resolve, reject) => {
        timeoutId = setTimeout(() => {
          controller.abort();
          reject(new Error('账号状态读取超时，请检查数据库连接或服务端配置'));
        }, timeoutMs);
      }),
    ]);
  } catch (error) {
    if (controller.signal.aborted || isAbortError(error)) {
      throw new Error('账号状态读取超时，请检查数据库连接或服务端配置');
    }
    throw error;
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

export async function register(input: AuthCredentials): Promise<AuthSuccessResponse> {
  return submitAuth(
    '/api/auth/register',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    },
    '注册失败',
  );
}

export async function login(input: AuthCredentials): Promise<AuthSuccessResponse> {
  return submitAuth(
    '/api/auth/login',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    },
    '登录失败',
  );
}

export async function logout(): Promise<{ ok: true }> {
  const body = await requestJson('/api/auth/logout', { method: 'POST' }, '退出登录失败');
  if (isLogoutResponse(body)) return body;
  throw new Error(readApiMessage(body) ?? '退出登录失败');
}

async function requestAuthUser(
  url: string,
  init: RequestInit,
  fallbackMessage: string,
): Promise<AuthUserResponse> {
  const body = await requestJson(url, init, fallbackMessage);
  if (isAuthUserResponse(body, true)) return body;
  throw new Error(readApiMessage(body) ?? fallbackMessage);
}

async function submitAuth(url: string, init: RequestInit, fallbackMessage: string): Promise<AuthSuccessResponse> {
  const body = await requestJson(url, init, fallbackMessage);
  if (isAuthSuccessResponse(body)) return body;
  throw new Error(readApiMessage(body) ?? fallbackMessage);
}

async function requestJson(url: string, init: RequestInit, fallbackMessage: string): Promise<unknown> {
  const response = await fetch(url, init);
  const body = await readJson(response);

  if (!response.ok) {
    throw new Error(readApiMessage(body) ?? fallbackMessage);
  }

  return body;
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function readApiMessage(body: unknown) {
  if (typeof body !== 'object' || body === null || !('message' in body)) return undefined;
  const message = (body as { message?: unknown }).message;
  return typeof message === 'string' && message.trim() ? message : undefined;
}

function isAuthUserResponse(body: unknown, allowNullUser: boolean): body is AuthUserResponse {
  if (typeof body !== 'object' || body === null || !('user' in body)) return false;
  const response = body as { user?: unknown };
  if (response.user === null) return allowNullUser;
  return isPublicUser(response.user);
}

function isAuthSuccessResponse(body: unknown): body is AuthSuccessResponse {
  return typeof body === 'object' && body !== null && 'user' in body && isPublicUser((body as { user?: unknown }).user);
}

function isPublicUser(user: unknown): user is PublicUser {
  if (typeof user !== 'object' || user === null) return false;
  const candidate = user as { id?: unknown; email?: unknown; role?: unknown };
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.email === 'string' &&
    (candidate.role === 'user' || candidate.role === 'admin')
  );
}

function isLogoutResponse(body: unknown): body is { ok: true } {
  return typeof body === 'object' && body !== null && (body as { ok?: unknown }).ok === true;
}

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === 'AbortError';
}
