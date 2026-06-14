'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
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
import { Feedback } from '@/components/ui/Primitives';
import { IconButton } from '@/components/ui/IconButton';

const focusableSelector = [
  'button:not([disabled])',
  'a[href]',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export function HomeMenuDrawer() {
  const router = useRouter();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const [open, setOpen] = useState(false);
  const [user, setUser] = useState<PublicUser | null>(null);
  const [loadingUser, setLoadingUser] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  function setDrawerOpen(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) triggerRef.current?.focus();
  }

  function openDrawer() {
    setUser(null);
    setLoadingUser(true);
    setAuthError(null);
    setOpen(true);
  }

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setDrawerOpen(false);
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

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
      .catch((error) => {
        if (!ignore) {
          setUser(null);
          setAuthError(
            error instanceof Error
              ? error.message
              : '账号状态读取失败，请检查数据库连接或服务端配置',
          );
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

  function trapFocus(event: React.KeyboardEvent<HTMLElement>) {
    if (event.key !== 'Tab') return;
    const focusable = Array.from(
      panelRef.current?.querySelectorAll<HTMLElement>(focusableSelector) ?? [],
    );
    if (focusable.length === 0) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return (
    <>
      <IconButton
        ref={triggerRef}
        label="打开主页菜单"
        onClick={openDrawer}
        selected={open}
      >
        <Menu size={19} aria-hidden="true" />
      </IconButton>

      {open ? (
        <div className="fixed inset-0 z-50">
          <button
            aria-label="关闭主页菜单遮罩"
            className="absolute inset-0 h-full w-full border-0 bg-black/35 backdrop-blur-[2px]"
            onClick={() => setDrawerOpen(false)}
            tabIndex={-1}
            type="button"
          />
          <section
            ref={panelRef}
            aria-label="主页菜单"
            aria-modal="true"
            className="absolute inset-y-0 right-0 w-[88%] max-w-[380px] overflow-auto border-l border-line bg-[#fbfbfa] p-5 shadow-[-18px_0_45px_rgba(22,31,41,0.16)] sm:p-6"
            onKeyDown={trapFocus}
            role="dialog"
          >
            <header className="flex items-center justify-between">
              <div>
                <p className="text-[13px] font-semibold text-accent">AI 营销内容助手</p>
                <h2 className="mt-1 text-xl font-semibold text-ink">主页菜单</h2>
              </div>
              <IconButton
                ref={closeRef}
                label="关闭主页菜单"
                onClick={() => setDrawerOpen(false)}
              >
                <X size={18} aria-hidden="true" />
              </IconButton>
            </header>

            <div className="mt-7 grid gap-7">
              <MenuSection title="空间">
                <PlaceholderItem
                  description="产品资料与品牌资产占位"
                  icon={Boxes}
                  title="产品空间"
                />
                <PlaceholderItem
                  description="个人内容与偏好占位"
                  icon={UserRound}
                  title="个人空间"
                />
              </MenuSection>

              {user ? (
                <MenuSection title="模板">
                  <MenuLink
                    description="创建、编辑和发布营销模板"
                    href="/admin/templates"
                    icon={LayoutTemplate}
                    title="模板创建/管理"
                  />
                </MenuSection>
              ) : null}

              <MenuSection title="账号">
                {loadingUser ? (
                  <PlaceholderItem
                    description="正在确认当前登录状态"
                    icon={ShieldCheck}
                    title="账号状态读取中"
                  />
                ) : user ? (
                  <div className="flex min-h-[68px] items-center gap-3 border-b border-line py-3">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent">
                      <UserRound size={18} aria-hidden="true" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] font-semibold text-ink">
                        {user.email}
                      </span>
                      <span className="mt-1 block text-xs text-muted">
                        {user.role === 'admin' ? '管理员账号' : '已登录账号'}
                      </span>
                    </span>
                    <IconButton label="退出登录" onClick={handleLogout}>
                      <LogOut size={17} aria-hidden="true" />
                    </IconButton>
                  </div>
                ) : (
                  <MenuLink
                    description="保留当前浏览器里的内容"
                    href="/auth"
                    icon={LogIn}
                    title="登录 / 注册"
                  />
                )}
                {authError ? <Feedback tone="error">{authError}</Feedback> : null}
              </MenuSection>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}

function MenuSection({
  children,
  title,
}: {
  children: React.ReactNode;
  title: string;
}) {
  return (
    <section>
      <h3 className="text-xs font-semibold text-muted">{title}</h3>
      <div className="mt-2 grid gap-1">{children}</div>
    </section>
  );
}

type MenuItemProps = {
  icon: typeof Boxes;
  title: string;
  description: string;
};

function PlaceholderItem({ description, icon: Icon, title }: MenuItemProps) {
  return (
    <div className="flex min-h-[68px] items-center gap-3 border-b border-line py-3">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-white text-muted shadow-soft">
        <Icon size={18} aria-hidden="true" />
      </span>
      <span className="min-w-0">
        <span className="block text-[14px] font-semibold text-ink">{title}</span>
        <span className="mt-1 block text-xs leading-5 text-muted">{description}</span>
      </span>
    </div>
  );
}

function MenuLink({
  description,
  href,
  icon: Icon,
  title,
}: MenuItemProps & { href: string }) {
  return (
    <Link
      className="group flex min-h-[68px] items-center gap-3 border-b border-line py-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      href={href}
    >
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent">
        <Icon size={18} aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] font-semibold text-ink">{title}</span>
        <span className="mt-1 block text-xs leading-5 text-muted">{description}</span>
      </span>
      <ChevronRight
        aria-hidden="true"
        className="shrink-0 text-muted transition group-hover:text-accent"
        size={18}
      />
    </Link>
  );
}
