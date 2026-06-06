import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import { ChevronRight } from 'lucide-react';

type EntranceCardProps = {
  href: string;
  title: string;
  description: string;
  icon: LucideIcon;
};

export function EntranceCard({ href, title, description, icon: Icon }: EntranceCardProps) {
  return (
    <Link
      href={href}
      className="flex min-h-[96px] items-center gap-4 rounded-lg border border-line bg-surface p-4 shadow-soft"
    >
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-accent text-white">
        <Icon size={22} aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[18px] font-semibold leading-6 text-ink">{title}</span>
        <span className="mt-1 block text-[13px] leading-5 text-muted">{description}</span>
      </span>
      <ChevronRight className="shrink-0 text-muted" size={20} aria-hidden="true" />
    </Link>
  );
}
