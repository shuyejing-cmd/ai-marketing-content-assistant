import { hashPassword, verifyPassword } from '../src/features/auth/server/password';
import { scrypt } from 'node:crypto';
import { promisify } from 'node:util';
import { vi } from 'vitest';

vi.mock('server-only', () => ({}));

const scryptAsync = promisify(scrypt);

describe('password hashing', () => {
  it('stores a scrypt hash instead of the plain password', async () => {
    const hash = await hashPassword('correct horse battery staple');

    expect(hash).not.toBe('correct horse battery staple');
    expect(hash).toMatch(/^scrypt-v1\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+$/);
  });

  it('uses a different salt when hashing the same password twice', async () => {
    const first = await hashPassword('correct horse battery staple');
    const second = await hashPassword('correct horse battery staple');

    expect(first).not.toBe(second);
  });

  it('verifies matching passwords and rejects wrong passwords', async () => {
    const hash = await hashPassword('correct horse battery staple');

    await expect(verifyPassword('correct horse battery staple', hash)).resolves.toBe(true);
    await expect(verifyPassword('wrong password', hash)).resolves.toBe(false);
  });

  it('rejects malformed stored hashes', async () => {
    await expect(verifyPassword('anything', 'plain-text')).resolves.toBe(false);
  });

  it('rejects stored hashes with the wrong version', async () => {
    const hash = await hashPassword('correct horse battery staple');

    await expect(verifyPassword('correct horse battery staple', hash.replace('scrypt-v1$', 'scrypt-v2$'))).resolves.toBe(false);
  });

  it('rejects stored hashes with extra segments', async () => {
    const hash = await hashPassword('correct horse battery staple');

    await expect(verifyPassword('correct horse battery staple', `${hash}$extra`)).resolves.toBe(false);
  });

  it('rejects stored hashes with a salt length other than 16 bytes', async () => {
    const shortSalt = Buffer.from('short');
    const derived = (await scryptAsync('correct horse battery staple', shortSalt, 64)) as Buffer;
    const hash = `scrypt-v1$${shortSalt.toString('base64')}$${derived.toString('base64')}`;

    await expect(verifyPassword('correct horse battery staple', hash)).resolves.toBe(false);
  });

  it('rejects stored hashes with a derived hash length other than 64 bytes', async () => {
    const salt = Buffer.alloc(16, 1);
    const shortDerived = (await scryptAsync('correct horse battery staple', salt, 32)) as Buffer;
    const hash = `scrypt-v1$${salt.toString('base64')}$${shortDerived.toString('base64')}`;

    await expect(verifyPassword('correct horse battery staple', hash)).resolves.toBe(false);
  });

  it('rejects stored hashes with whitespace in base64 segments', async () => {
    const [version, saltBase64, hashBase64] = (await hashPassword('correct horse battery staple')).split('$');
    const hash = `${version}$${saltBase64.slice(0, 4)} ${saltBase64.slice(4)}$${hashBase64}`;

    await expect(verifyPassword('correct horse battery staple', hash)).resolves.toBe(false);
  });

  it('rejects stored hashes with missing base64 padding', async () => {
    const hash = (await hashPassword('correct horse battery staple')).replace(/=+$/u, '');

    await expect(verifyPassword('correct horse battery staple', hash)).resolves.toBe(false);
  });
});
