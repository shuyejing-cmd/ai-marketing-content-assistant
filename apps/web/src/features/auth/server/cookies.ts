export const AUTH_COOKIE_NAME = 'ai_marketing_session';

export function readCookie(request: Request, name: string) {
  const cookieHeader = request.headers.get('cookie');
  if (!cookieHeader) return null;

  for (const part of cookieHeader.split(';')) {
    const [rawName, ...rawValueParts] = part.trim().split('=');
    if (rawName !== name) continue;

    const rawValue = rawValueParts.join('=');
    try {
      return decodeURIComponent(rawValue);
    } catch {
      return rawValue;
    }
  }

  return null;
}

export function readAuthCookie(request: Request) {
  return readCookie(request, AUTH_COOKIE_NAME);
}

export function setAuthCookie(response: Response, token: string, expiresAt: Date) {
  response.headers.append('set-cookie', serializeAuthCookie(token, expiresAt));
}

export function clearAuthCookie(response: Response) {
  response.headers.append('set-cookie', serializeAuthCookie('', new Date(0)));
}

function serializeAuthCookie(value: string, expiresAt: Date) {
  const attributes = [
    `${AUTH_COOKIE_NAME}=${encodeURIComponent(value)}`,
    'HttpOnly',
    'SameSite=Lax',
    'Path=/',
    `Expires=${expiresAt.toUTCString()}`,
  ];

  if (process.env.NODE_ENV === 'production') {
    attributes.push('Secure');
  }

  return attributes.join('; ');
}
