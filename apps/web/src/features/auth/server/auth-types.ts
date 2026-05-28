export type UserRole = 'user' | 'admin';

export type PublicUser = {
  id: string;
  email: string;
  role: UserRole;
};

export type UserRecord = PublicUser & {
  passwordHash: string;
};

export type AuthResult = {
  user: PublicUser;
  sessionToken: string;
  expiresAt: Date;
};
