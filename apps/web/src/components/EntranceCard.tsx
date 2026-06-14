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
      className="group flex min-h-[156px] flex-col items-start rounded-lg border border-line/90 bg-white p-5 shadow-soft transition duration-200 hover:-translate-y-0.5 hover:border-accent/30 hover:shadow-control focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:min-h-[176px]"
    >
      <span className="grid h-12 w-12 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent transition group-hover:bg-accent group-hover:text-white">
        <Icon size={22} aria-hidden="true" />
      </span>
      <span className="mt-5 flex min-w-0 w-full flex-1 items-end gap-3">
        <span className="min-w-0 flex-1">
          <span className="block text-xl font-semibold leading-7 text-ink">{title}</span>
          <span className="mt-1 block text-[13px] leading-5 text-muted">{description}</span>
        </span>
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-line text-muted transition group-hover:border-accent/30 group-hover:text-accent">
          <ChevronRight size={18} aria-hidden="true" />
        </span>
      </span>
    </Link>
  );
}
