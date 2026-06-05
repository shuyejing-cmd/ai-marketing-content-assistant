'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';
import { ArrowLeft, LogIn, UserPlus } from 'lucide-react';
import { AppShell } from '@/components/AppShell';
import { getOwnerId } from '@/features/generation/owner-id';
import { login, register } from '@/features/auth/auth-client';

type AuthMode = 'login' | 'register';

export default function AuthPage() {
  const router = useRouter();
  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const input = {
        email,
        password,
        anonymousOwnerId: getOwnerId(),
      };
      if (mode === 'login') {
        await login(input);
      } else {
        await register(input);
      }
      router.push('/');
      router.refresh();
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : '账号操作失败');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AppShell>
      <div className="flex min-h-dvh flex-col pb-6">
        <header className="flex items-center gap-3 pt-1">
          <Link href="/" className="grid h-9 w-9 place-items-center rounded-full border border-line bg-surface">
            <ArrowLeft size={18} aria-hidden="true" />
          </Link>
          <div>
            <h1 className="text-[22px] font-semibold leading-7 text-ink">账号登录</h1>
            <p className="mt-1 text-[13px] text-muted">登录后会自动保留当前浏览器里的内容</p>
          </div>
        </header>

        <section className="mt-6 rounded-lg border border-line bg-surface p-4">
          <div className="grid grid-cols-2 rounded-lg border border-line bg-white p-1">
            <button
              type="button"
              onClick={() => setMode('login')}
              className={`flex h-10 items-center justify-center gap-2 rounded-md text-[14px] font-semibold ${
                mode === 'login' ? 'bg-ink text-white' : 'text-muted'
              }`}
            >
              <LogIn size={16} aria-hidden="true" />
              登录
            </button>
            <button
              type="button"
              onClick={() => setMode('register')}
              className={`flex h-10 items-center justify-center gap-2 rounded-md text-[14px] font-semibold ${
                mode === 'register' ? 'bg-ink text-white' : 'text-muted'
              }`}
            >
              <UserPlus size={16} aria-hidden="true" />
              注册
            </button>
          </div>

          <form className="mt-5 grid gap-4" onSubmit={handleSubmit}>
            <label className="grid gap-1.5 text-[14px] text-ink">
              邮箱
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                required
                className="h-11 rounded-lg border border-line bg-white px-3 outline-none focus:border-accent"
              />
            </label>

            <label className="grid gap-1.5 text-[14px] text-ink">
              密码
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                required
                minLength={8}
                className="h-11 rounded-lg border border-line bg-white px-3 outline-none focus:border-accent"
              />
            </label>

            {error ? (
              <div className="rounded-lg border border-warm bg-white p-3 text-[14px] leading-5 text-warm">{error}</div>
            ) : null}

            <button
              type="submit"
              disabled={submitting}
              className="mt-1 flex h-11 items-center justify-center gap-2 rounded-lg bg-accent text-[15px] font-semibold text-white disabled:opacity-60"
            >
              {mode === 'login' ? <LogIn size={17} aria-hidden="true" /> : <UserPlus size={17} aria-hidden="true" />}
              {submitting ? '提交中...' : mode === 'login' ? '登录并保留内容' : '注册并保留内容'}
            </button>
          </form>
        </section>
      </div>
    </AppShell>
  );
}
