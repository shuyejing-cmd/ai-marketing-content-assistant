'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Image, Video } from 'lucide-react';
import { listTemplates } from '@/features/templates/template-client';
import type { PublicTemplate, TemplateType } from '@/features/templates/template-types';

export function TemplateGallery() {
  const [type, setType] = useState<TemplateType>('image');
  const [templates, setTemplates] = useState<PublicTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    listTemplates(type)
      .then((items) => {
        if (active) setTemplates(items);
      })
      .catch((templateError) => {
        if (active) {
          setError(templateError instanceof Error ? templateError.message : '读取模板失败');
          setTemplates([]);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [type]);

  return (
    <section className="mt-8">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-[19px] font-semibold leading-7 text-ink">模板应用</h2>
          <p className="mt-1 text-[13px] leading-5 text-muted">选择模板后上传图片即可生成。</p>
        </div>
        <div className="flex rounded-lg border border-line bg-surface p-1">
          <TemplateTab active={type === 'image'} label="图片" icon={Image} onClick={() => setType('image')} />
          <TemplateTab active={type === 'video'} label="视频" icon={Video} onClick={() => setType('video')} />
        </div>
      </div>

      <div className="mt-3 grid gap-3">
        {loading ? (
          <div className="rounded-lg border border-line bg-surface p-4 text-[14px] text-muted">正在读取模板...</div>
        ) : null}

        {error ? (
          <div className="rounded-lg border border-warm bg-white p-3 text-[14px] text-warm">{error}</div>
        ) : null}

        {!loading && !error && templates.length === 0 ? (
          <div className="rounded-lg border border-line bg-surface p-4 text-[14px] leading-6 text-muted">
            暂无已发布{type === 'image' ? '图片' : '视频'}模板。
          </div>
        ) : null}

        {templates.map((template) =>
          template.type === 'image' ? (
            <Link
              key={template.id}
              href={`/templates/image/${template.id}`}
              className="group overflow-hidden rounded-lg border border-line bg-surface shadow-soft"
            >
              <TemplateCover template={template} />
              <div className="p-3">
                <p className="text-[15px] font-semibold leading-6 text-ink">{template.title}</p>
                <p className="mt-1 line-clamp-2 text-[13px] leading-5 text-muted">{template.description}</p>
              </div>
            </Link>
          ) : (
            <article
              key={template.id}
              className="overflow-hidden rounded-lg border border-line bg-surface opacity-85 shadow-soft"
            >
              <TemplateCover template={template} badge="即将开放" />
              <div className="p-3">
                <p className="text-[15px] font-semibold leading-6 text-ink">{template.title}</p>
                <p className="mt-1 line-clamp-2 text-[13px] leading-5 text-muted">{template.description}</p>
              </div>
            </article>
          ),
        )}
      </div>
    </section>
  );
}

function TemplateTab({
  active,
  label,
  icon: Icon,
  onClick,
}: {
  active: boolean;
  label: string;
  icon: typeof Image;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex h-8 items-center gap-1.5 rounded-md px-3 text-[13px] ${
        active ? 'bg-accent text-white' : 'text-muted'
      }`}
    >
      <Icon size={14} aria-hidden="true" />
      {label}
    </button>
  );
}

function TemplateCover({ template, badge }: { template: PublicTemplate; badge?: string }) {
  return (
    <div className="relative aspect-[4/3] overflow-hidden bg-canvas">
      <img src={template.coverImageDataUrl} alt="" className="h-full w-full object-cover transition-transform group-hover:scale-[1.02]" />
      <div className="absolute inset-x-0 top-0 bg-gradient-to-b from-black/70 to-transparent p-3">
        <p className="text-[17px] font-semibold leading-6 text-white">{template.title}</p>
      </div>
      {badge ? (
        <span className="absolute bottom-3 right-3 rounded-full bg-white/92 px-3 py-1 text-[12px] font-medium text-ink">
          {badge}
        </span>
      ) : null}
    </div>
  );
}
