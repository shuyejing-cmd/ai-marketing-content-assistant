import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('auth Prisma schema', () => {
  const schema = readFileSync(join(process.cwd(), 'prisma/schema.prisma'), 'utf8');

  it('defines account and login session models', () => {
    expect(schema).toContain('model User');
    expect(schema).toContain('email        String        @unique');
    expect(schema).toContain('passwordHash String');
    expect(schema).toContain('role         String        @default("user")');
    expect(schema).toContain('model AuthSession');
    expect(schema).toContain('tokenHash String   @unique');
    expect(schema).toContain('user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)');
  });
});
