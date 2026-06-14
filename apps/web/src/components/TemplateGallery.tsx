'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { listTemplates } from '@/features/templates/template-client';
import type { PublicTemplate, TemplateType } from '@/features/templates/template-types';
import { Feedback } from '@/components/ui/Primitives';
import { SegmentedTabs } from '@/components/ui/SegmentedTabs';

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
    <section className="py-10 sm:py-12">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-semibold text-accent">快捷开始</p>
          <h2 className="mt-2 text-2xl font-semibold leading-8 text-ink">模板应用</h2>
          <p className="mt-1 text-[14px] leading-6 text-muted">选择模板，上传产品图片即可生成。</p>
        </div>
        <SegmentedTabs
          ariaLabel="模板类型"
          className="w-full sm:w-[220px]"
          items={[
            { label: '图片', value: 'image' },
            { label: '视频', value: 'video' },
          ]}
          onValueChange={(value) => setType(value as TemplateType)}
          value={type}
        />
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {loading ? (
          <Feedback tone="info">正在读取模板...</Feedback>
        ) : null}

        {error ? (
          <Feedback tone="error">{error}</Feedback>
        ) : null}

        {!loading && !error && templates.length === 0 ? (
          <div className="rounded-lg border border-dashed border-line bg-white/70 p-5 text-[14px] leading-6 text-muted sm:col-span-2 lg:col-span-3 xl:col-span-4">
            暂无已发布{type === 'image' ? '图片' : '视频'}模板。
          </div>
        ) : null}

        {templates.map((template) =>
          template.type === 'image' ? (
            <Link
              key={template.id}
              href={`/templates/image/${template.id}`}
              className="group overflow-hidden rounded-lg border border-line bg-white shadow-soft transition hover:-translate-y-0.5 hover:border-accent/30"
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
              className="overflow-hidden rounded-lg border border-line bg-white opacity-85 shadow-soft"
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

function TemplateCover({ template, badge }: { template: PublicTemplate; badge?: string }) {
  return (
    <div className="relative aspect-[4/3] overflow-hidden bg-canvas">
      <img src={template.coverImageDataUrl} alt="" className="h-full w-full object-cover transition-transform group-hover:scale-[1.02]" />
      <div className="absolute inset-x-0 top-0 bg-gradient-to-b from-black/70 to-transparent p-3">
        <p className="text-[17px] font-semibold leading-6 text-white">{template.title}</p>
      </div>
      {badge ? (
        <span className="absolute bottom-3 right-3 rounded-full bg-white/95 px-3 py-1 text-[12px] font-medium text-ink shadow-soft">
          {badge}
        </span>
      ) : null}
    </div>
  );
}
