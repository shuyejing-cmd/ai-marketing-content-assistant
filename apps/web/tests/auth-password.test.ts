import { hashPassword, verifyPassword } from '../src/features/auth/server/password';
import { scrypt } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt);

describe('password hashing', () => {
  it('stores a scrypt hash instead of the plain password', async () => {
    const hash = await hashPassword('correct horse battery staple');

    expect(hash).not.toBe('correct horse battery staple');
    expect(hash).toMatch(/^scrypt-v1\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+$/);
  });

  it('verifies matching passwords and rejects wrong passwords', async () => {
    const hash = await hashPassword('correct horse battery staple');

    await expect(verifyPassword('correct horse battery staple', hash)).resolves.toBe(true);
    await expect(verifyPassword('wrong password', hash)).resolves.toBe(false);
  });

  it('rejects malformed stored hashes', async () => {
    await expect(verifyPassword('anything', 'plain-text')).resolves.toBe(false);
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
});
