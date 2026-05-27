import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt);
const VERSION = 'scrypt-v1';
const KEY_LENGTH = 64;
const SALT_BYTES = 16;

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

  const salt = Buffer.from(saltBase64, 'base64');
  const expected = Buffer.from(hashBase64, 'base64');
  if (salt.length !== SALT_BYTES) return false;
  if (expected.length !== KEY_LENGTH) return false;

  const actual = (await scryptAsync(password, salt, expected.length)) as Buffer;
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
