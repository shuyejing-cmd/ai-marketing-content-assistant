'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';
import { ArrowLeft, LogIn, Sparkles, UserPlus } from 'lucide-react';
import { AppShell } from '@/components/AppShell';
import { Button } from '@/components/ui/Button';
import { Feedback, Field, SurfaceCard } from '@/components/ui/Primitives';
import { SegmentedTabs } from '@/components/ui/SegmentedTabs';
import { login, register } from '@/features/auth/auth-client';
import { getOwnerId } from '@/features/generation/owner-id';

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
      <div className="mx-auto flex min-h-[calc(100dvh-2.5rem)] w-full max-w-[520px] flex-col justify-center py-4 sm:py-8">
        <header className="mb-5">
          <Link
            aria-label="返回首页"
            className="ui-icon-button"
            href="/"
          >
            <ArrowLeft size={18} aria-hidden="true" />
          </Link>
          <span className="mt-7 grid h-12 w-12 place-items-center rounded-lg bg-accent-soft text-accent">
            <Sparkles size={22} aria-hidden="true" />
          </span>
          <h1 className="mt-4 text-[28px] font-semibold leading-9 text-ink">欢迎回来</h1>
          <p className="mt-2 text-[14px] leading-6 text-muted">
            登录或注册后，当前浏览器里的会话与作品会自动绑定到账号。
          </p>
        </header>

        <SurfaceCard className="p-4 sm:p-5">
          <SegmentedTabs
            ariaLabel="账号操作"
            items={[
              { label: '登录', value: 'login' },
              { label: '注册', value: 'register' },
            ]}
            onValueChange={(value) => {
              setMode(value as AuthMode);
              setError(null);
            }}
            value={mode}
          />

          <form className="mt-5 grid gap-4" onSubmit={handleSubmit}>
            <Field
              autoComplete="email"
              label="邮箱"
              onChange={(event) => setEmail(event.target.value)}
              required
              type="email"
              value={email}
            />
            <Field
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              hint={mode === 'register' ? '至少 8 位字符' : undefined}
              label="密码"
              minLength={8}
              onChange={(event) => setPassword(event.target.value)}
              required
              type="password"
              value={password}
            />

            {error ? <Feedback tone="error">{error}</Feedback> : null}

            <Button
              fullWidth
              loading={submitting}
              loadingLabel="提交中..."
              size="lg"
              type="submit"
            >
              {mode === 'login' ? (
                <LogIn size={17} aria-hidden="true" />
              ) : (
                <UserPlus size={17} aria-hidden="true" />
              )}
              {mode === 'login' ? '登录并保留内容' : '注册并保留内容'}
            </Button>
          </form>
        </SurfaceCard>
      </div>
    </AppShell>
  );
}
