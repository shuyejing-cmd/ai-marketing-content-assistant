import 'server-only';

import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt);
const VERSION = 'scrypt-v1';
const KEY_LENGTH = 64;
const SALT_BYTES = 16;
const BASE64_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u;

export async function hashPassword(password: string) {
  const salt = randomBytes(SALT_BYTES);
  const derived = (await scryptAsync(password, salt, KEY_LENGTH)) as Buffer;
  return `${VERSION}$${salt.toString('base64')}$${derived.toString('base64')}`;
}

export async function verifyPassword(password: string, storedHash: string) {
  const parts = storedHash.split('$');
  if (parts.length !== 3) return false;

  const [version, saltBase64, hashBase64] = parts;
  if (version !== VERSION || !saltBase64 || !hashBase64) return false;
  if (!isCanonicalBase64(saltBase64) || !isCanonicalBase64(hashBase64)) return false;

  const salt = Buffer.from(saltBase64, 'base64');
  const expected = Buffer.from(hashBase64, 'base64');
  if (salt.length !== SALT_BYTES) return false;
  if (expected.length !== KEY_LENGTH) return false;

  const actual = (await scryptAsync(password, salt, expected.length)) as Buffer;
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function isCanonicalBase64(value: string) {
  if (!BASE64_PATTERN.test(value)) return false;
  return Buffer.from(value, 'base64').toString('base64') === value;
}
