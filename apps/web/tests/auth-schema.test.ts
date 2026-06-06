import { readdirSync, readFileSync } from 'node:fs';
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

  it('has a migration for account and login session tables', () => {
    const migrationsDir = join(process.cwd(), 'prisma/migrations');
    const migrationSql = readdirSync(migrationsDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => readFileSync(join(migrationsDir, entry.name, 'migration.sql'), 'utf8'))
      .join('\n');

    expect(migrationSql).toContain('CREATE TABLE "User"');
    expect(migrationSql).toContain('CREATE TABLE "AuthSession"');
    expect(migrationSql).toContain('CREATE UNIQUE INDEX "User_email_key"');
    expect(migrationSql).toContain('CREATE UNIQUE INDEX "AuthSession_tokenHash_key"');
  });
});
