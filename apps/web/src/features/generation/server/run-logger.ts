export type BackendLogMeta = Record<string, unknown>;

export type BackendRunLogger = {
  step(name: string, meta?: BackendLogMeta): void;
  error(name: string, meta?: BackendLogMeta): void;
  block(name: string, content: string, meta?: BackendLogMeta): void;
};

const MAX_VALUE_LENGTH = 140;

export function createBackendRunLogger(scope: string, baseMeta: BackendLogMeta = {}): BackendRunLogger {
  const startedAt = Date.now();

  return {
    step(name, meta) {
      writeLog('info', scope, name, { ...baseMeta, ...meta, elapsedMs: Date.now() - startedAt });
    },
    error(name, meta) {
      writeLog('error', scope, name, { ...baseMeta, ...meta, elapsedMs: Date.now() - startedAt });
    },
    block(name, content, meta) {
      const nextMeta = { ...baseMeta, ...meta, chars: content.length, elapsedMs: Date.now() - startedAt };
      writeLog('info', scope, `${name}.begin`, nextMeta);
      console.info(content);
      writeLog('info', scope, `${name}.end`, nextMeta);
    },
  };
}

function writeLog(level: 'info' | 'error', scope: string, name: string, meta: BackendLogMeta) {
  const line = [
    `[${new Date().toISOString()}]`,
    `[${scope}]`,
    name,
    serializeMeta(meta),
  ]
    .filter(Boolean)
    .join(' ');

  if (level === 'error') {
    console.error(line);
  } else {
    console.info(line);
  }
}

function serializeMeta(meta: BackendLogMeta) {
  return Object.entries(meta)
    .filter(([key, value]) => value !== undefined && !isPrivateImageKey(key))
    .map(([key, value]) => `${key}=${formatValue(key, value)}`)
    .join(' ');
}

function formatValue(key: string, value: unknown): string {
  if (isSensitiveKey(key)) return '[redacted]';
  if (typeof value === 'string') return formatString(value);
  if (typeof value === 'number' || typeof value === 'boolean' || value === null) return String(value);
  return formatString(safeJsonStringify(sanitizeStructuredValue(value)));
}

function formatString(value: string) {
  if (value.startsWith('data:image/') && value.includes(';base64,')) {
    return `[redacted image data length=${value.length}]`;
  }

  const normalized = value.replace(/\s+/g, ' ').trim();
  if (normalized.length <= MAX_VALUE_LENGTH) return normalized;
  return `${normalized.slice(0, MAX_VALUE_LENGTH - 3)}...`;
}

function isSensitiveKey(key: string) {
  return /api[_-]?key|authorization|password|secret|token/i.test(key);
}

function isPrivateImageKey(key: string): boolean {
  const normalized = key.replace(/[^a-z0-9]/gi, '').toLowerCase();
  return (
    normalized.includes('dataurl') ||
    normalized.includes('base64') ||
    normalized === 'b64json' ||
    normalized.includes('gps')
  );
}

function sanitizeStructuredValue(value: unknown): unknown {
  if (typeof value === 'string') {
    return value.startsWith('data:image/') && value.includes(';base64,')
      ? `[redacted image data length=${value.length}]`
      : value;
  }
  if (Array.isArray(value)) return value.map(sanitizeStructuredValue);
  if (!isRecord(value)) return value;

  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !isPrivateImageKey(key))
      .map(([key, nestedValue]) => [key, sanitizeStructuredValue(nestedValue)]),
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function safeJsonStringify(value: unknown) {
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return '[unserializable]';
  }
}
