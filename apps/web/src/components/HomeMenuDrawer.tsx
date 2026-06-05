'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  Boxes,
  ChevronRight,
  LayoutTemplate,
  LogIn,
  LogOut,
  Menu,
  ShieldCheck,
  UserRound,
  X,
} from 'lucide-react';
import { getCurrentUser, logout } from '@/features/auth/auth-client';
import type { PublicUser } from '@/features/auth/server/auth-types';

export function HomeMenuDrawer() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [user, setUser] = useState<PublicUser | null>(null);
  const [loadingUser, setLoadingUser] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  function openDrawer() {
    setUser(null);
    setLoadingUser(true);
    setAuthError(null);
    setOpen(true);
  }

  useEffect(() => {
    if (!open) return;

    let ignore = false;
    setLoadingUser(true);
    setUser(null);
    setAuthError(null);

    getCurrentUser()
      .then((response) => {
        if (!ignore) setUser(response.user);
      })
      .catch(() => {
        if (!ignore) {
          setUser(null);
          setAuthError('账号状态读取失败');
        }
      })
      .finally(() => {
        if (!ignore) setLoadingUser(false);
      });

    return () => {
      ignore = true;
    };
  }, [open]);

  async function handleLogout() {
    setLoadingUser(true);
    setAuthError(null);
    try {
      await logout();
      setUser(null);
      router.refresh();
    } catch {
      setAuthError('退出登录失败');
    } finally {
      setLoadingUser(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={openDrawer}
        className="grid h-9 w-9 place-items-center rounded-full border border-line bg-surface"
        aria-label="打开主页菜单"
      >
        <Menu size={18} aria-hidden="true" />
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={() => setOpen(false)}>
          <section
            role="dialog"
            aria-modal="true"
            aria-label="主页菜单"
            className="h-full w-[82%] max-w-[352px] translate-x-0 overflow-auto bg-surface px-4 py-5 shadow-soft"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="flex items-center justify-between">
              <div>
                <p className="text-[13px] font-medium text-accent">AI 营销内容助手</p>
                <h2 className="mt-1 text-[20px] font-semibold text-ink">主页菜单</h2>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="grid h-9 w-9 place-items-center rounded-full border border-line"
                aria-label="关闭主页菜单"
              >
                <X size={18} aria-hidden="true" />
              </button>
            </header>

            <div className="mt-6 grid gap-5">
              <section>
                <h3 className="text-[13px] font-semibold text-muted">空间</h3>
                <div className="mt-2 grid gap-2">
                  <PlaceholderItem icon={Boxes} title="产品空间" description="产品资料与品牌资产占位" />
                  <PlaceholderItem icon={UserRound} title="个人空间" description="个人内容与偏好占位" />
                </div>
              </section>

              {user?.role === 'admin' ? (
                <section>
                  <h3 className="text-[13px] font-semibold text-muted">模板</h3>
                  <Link
                    href="/admin/templates"
                    className="mt-2 flex items-center gap-3 rounded-lg border border-line bg-white p-3"
                  >
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-canvas text-accent">
                      <LayoutTemplate size={18} aria-hidden="true" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[15px] font-semibold text-ink">模板创建/管理</span>
                      <span className="mt-1 block text-[12px] leading-5 text-muted">进入现有模板后台</span>
                    </span>
                    <ChevronRight size={18} className="shrink-0 text-muted" aria-hidden="true" />
                  </Link>
                </section>
              ) : null}

              <section>
                <h3 className="text-[13px] font-semibold text-muted">账号</h3>
                <div className="mt-2 grid gap-2">
                  {loadingUser ? (
                    <PlaceholderItem icon={ShieldCheck} title="账号状态读取中" description="正在确认当前登录状态" />
                  ) : user ? (
                    <div className="flex items-center gap-3 rounded-lg border border-line bg-white p-3">
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-canvas text-accent">
                        <UserRound size={18} aria-hidden="true" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[15px] font-semibold text-ink">{user.email}</span>
                        <span className="mt-1 block text-[12px] leading-5 text-muted">
                          {user.role === 'admin' ? '管理员账号' : '已登录账号'}
                        </span>
                      </span>
                      <button
                        type="button"
                        onClick={handleLogout}
                        className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-line text-muted"
                        aria-label="退出登录"
                      >
                        <LogOut size={17} aria-hidden="true" />
                      </button>
                    </div>
                  ) : (
                    <Link href="/auth" className="flex items-center gap-3 rounded-lg border border-line bg-white p-3">
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-canvas text-accent">
                        <LogIn size={18} aria-hidden="true" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[15px] font-semibold text-ink">登录 / 注册</span>
                        <span className="mt-1 block text-[12px] leading-5 text-muted">保留当前浏览器里的内容</span>
                      </span>
                      <ChevronRight size={18} className="shrink-0 text-muted" aria-hidden="true" />
                    </Link>
                  )}
                  {authError ? <p className="px-1 text-[12px] leading-5 text-warm">{authError}</p> : null}
                </div>
              </section>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}

type PlaceholderItemProps = {
  icon: typeof Boxes;
  title: string;
  description: string;
};

function PlaceholderItem({ icon: Icon, title, description }: PlaceholderItemProps) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-line bg-white p-3">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-canvas text-muted">
        <Icon size={18} aria-hidden="true" />
      </span>
      <span className="min-w-0">
        <span className="block text-[15px] font-semibold text-ink">{title}</span>
        <span className="mt-1 block text-[12px] leading-5 text-muted">{description}</span>
      </span>
    </div>
  );
}
