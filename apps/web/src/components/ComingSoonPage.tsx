import Link from 'next/link';
import { ArrowLeft, FileText, Sparkles, Video } from 'lucide-react';
import { AppShell } from '@/components/AppShell';

export function ComingSoonPage({
  description,
  icon,
  title,
}: {
  description: string;
  icon: 'copy' | 'video';
  title: string;
}) {
  const Icon = icon === 'copy' ? FileText : Video;

  return (
    <AppShell>
      <div className="mx-auto flex min-h-[calc(100dvh-2.5rem)] max-w-2xl flex-col justify-center py-10">
        <Link aria-label="返回首页" className="ui-icon-button" href="/">
          <ArrowLeft size={18} aria-hidden="true" />
        </Link>
        <div className="mt-8 border-y border-line py-10 sm:py-14">
          <span className="inline-flex items-center gap-2 text-sm font-semibold text-accent">
            <Sparkles size={16} aria-hidden="true" />
            即将开放
          </span>
          <span className="mt-5 grid h-14 w-14 place-items-center rounded-lg bg-accent-soft text-accent">
            <Icon size={26} aria-hidden="true" />
          </span>
          <h1 className="mt-5 text-[32px] font-semibold leading-tight text-ink sm:text-[40px]">
            {title}
          </h1>
          <p className="mt-3 max-w-xl text-[15px] leading-7 text-muted">{description}</p>
        </div>
      </div>
    </AppShell>
  );
}
