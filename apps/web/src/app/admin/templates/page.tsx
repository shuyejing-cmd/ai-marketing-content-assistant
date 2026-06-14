'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ArrowLeft, ImagePlus, Save, UploadCloud } from 'lucide-react';
import { AppShell } from '@/components/AppShell';
import { Button } from '@/components/ui/Button';
import {
  Feedback,
  Field,
  SurfaceCard,
  TextArea,
} from '@/components/ui/Primitives';
import { SegmentedTabs } from '@/components/ui/SegmentedTabs';
import {
  createAdminTemplate,
  listAdminTemplates,
  updateAdminTemplate,
} from '@/features/templates/template-client';
import type {
  AdminTemplate,
  TemplateInput,
  TemplateType,
} from '@/features/templates/template-types';

const emptyForm: TemplateInput = {
  type: 'image',
  title: '',
  description: '',
  coverImageDataUrl: '',
  prompt: '',
  published: false,
  sortOrder: 0,
};

export default function TemplateAdminPage() {
  const [templates, setTemplates] = useState<AdminTemplate[]>([]);
  const [form, setForm] = useState<TemplateInput>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  useEffect(() => {
    void refreshTemplates();
  }, []);

  async function refreshTemplates() {
    setLoading(true);
    setError(null);
    try {
      const items = await listAdminTemplates();
      setTemplates(items);
    } catch (templateError) {
      setError(templateError instanceof Error ? templateError.message : '读取模板失败');
      setTemplates([]);
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit() {
    setLoading(true);
    setError(null);
    setSaved(null);
    try {
      const nextTemplate = editingId
        ? await updateAdminTemplate(editingId, form)
        : await createAdminTemplate(form);
      setSaved(editingId ? '模板已更新' : '模板已创建');
      setEditingId(null);
      setForm(emptyForm);
      setTemplates((previous) => {
        const withoutCurrent = previous.filter(
          (template) => template.id !== nextTemplate.id,
        );
        return [nextTemplate, ...withoutCurrent].sort(
          (left, right) =>
            left.sortOrder - right.sortOrder ||
            new Date(right.createdAt).getTime() -
              new Date(left.createdAt).getTime(),
        );
      });
    } catch (templateError) {
      setError(templateError instanceof Error ? templateError.message : '保存模板失败');
    } finally {
      setLoading(false);
    }
  }

  async function handleTogglePublish(template: AdminTemplate) {
    setLoading(true);
    setError(null);
    try {
      const updated = await updateAdminTemplate(template.id, {
        published: !template.published,
      });
      setTemplates((previous) =>
        previous.map((item) => (item.id === updated.id ? updated : item)),
      );
    } catch (templateError) {
      setError(
        templateError instanceof Error ? templateError.message : '更新发布状态失败',
      );
    } finally {
      setLoading(false);
    }
  }

  function startEditing(template: AdminTemplate) {
    setEditingId(template.id);
    setForm({
      type: template.type,
      title: template.title,
      description: template.description,
      coverImageDataUrl: template.coverImageDataUrl,
      prompt: template.prompt,
      published: template.published,
      sortOrder: template.sortOrder,
    });
    setSaved(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function resetForm() {
    setEditingId(null);
    setForm(emptyForm);
    setSaved(null);
  }

  return (
    <AppShell>
      <div className="min-h-[calc(100dvh-2.5rem)]">
        <header className="flex min-h-16 items-center gap-3 border-b border-line/80">
          <Link aria-label="返回首页" className="ui-icon-button" href="/">
            <ArrowLeft size={18} aria-hidden="true" />
          </Link>
          <div>
            <h1 className="text-xl font-semibold text-ink">模板管理</h1>
            <p className="mt-1 text-xs text-muted">创建、编辑和发布图片或视频模板。</p>
          </div>
        </header>

        <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(340px,440px)_minmax(0,1fr)]">
          <section
            aria-label="模板编辑表单"
            className="min-w-0 lg:sticky lg:top-4 lg:self-start"
          >
            <SurfaceCard>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold text-accent">
                    {editingId ? '编辑模式' : '创建模式'}
                  </p>
                  <h2 className="mt-1 text-lg font-semibold text-ink">
                    {editingId ? '编辑模板' : '新建模板'}
                  </h2>
                </div>
                {editingId ? (
                  <Button onClick={resetForm} size="sm" variant="ghost">
                    取消编辑
                  </Button>
                ) : null}
              </div>

              <div className="mt-5 grid gap-4">
                <div>
                  <p className="mb-2 text-[13px] font-semibold text-ink">模板类型</p>
                  <SegmentedTabs
                    ariaLabel="模板类型"
                    items={[
                      { label: '图片模板', value: 'image' },
                      { label: '视频模板', value: 'video' },
                    ]}
                    onValueChange={(value) =>
                      setForm({ ...form, type: value as TemplateType })
                    }
                    value={form.type}
                  />
                </div>

                <Field
                  label="模板标题"
                  onChange={(event) => setForm({ ...form, title: event.target.value })}
                  placeholder="例如：国庆焕新海报"
                  value={form.title}
                />
                <TextArea
                  label="模板描述"
                  onChange={(event) =>
                    setForm({ ...form, description: event.target.value })
                  }
                  placeholder="给用户看的模板说明"
                  rows={3}
                  value={form.description}
                />
                <Field
                  label="排序"
                  onChange={(event) =>
                    setForm({ ...form, sortOrder: Number(event.target.value) })
                  }
                  type="number"
                  value={form.sortOrder ?? 0}
                />

                <label className="grid gap-2 text-[13px] font-semibold text-ink">
                  封面图
                  <div className="rounded-lg border border-dashed border-line bg-surface-soft p-3">
                    {form.coverImageDataUrl ? (
                      <img
                        alt="模板封面预览"
                        className="aspect-[16/9] w-full rounded-lg object-cover"
                        src={form.coverImageDataUrl}
                      />
                    ) : (
                      <div className="grid aspect-[16/9] place-items-center text-center text-[13px] text-muted">
                        <span>
                          <ImagePlus
                            aria-hidden="true"
                            className="mx-auto mb-2"
                            size={24}
                          />
                          上传模板封面
                        </span>
                      </div>
                    )}
                    <input
                      accept="image/*"
                      className="mt-3 w-full text-[13px]"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (!file) return;
                        const reader = new FileReader();
                        reader.onload = () =>
                          setForm((current) => ({
                            ...current,
                            coverImageDataUrl: String(reader.result),
                          }));
                        reader.readAsDataURL(file);
                      }}
                      type="file"
                    />
                  </div>
                </label>

                <TextArea
                  className="font-mono text-[13px] leading-5"
                  label="内部 Prompt"
                  onChange={(event) => setForm({ ...form, prompt: event.target.value })}
                  placeholder="这里写模板内部提示词。普通用户不会看到。"
                  rows={8}
                  value={form.prompt}
                />

                <label className="flex min-h-11 items-center justify-between gap-4 rounded-lg border border-line bg-surface-soft px-3 text-[14px] text-ink">
                  <span>
                    <span className="block font-semibold">发布到首页</span>
                    <span className="mt-0.5 block text-xs text-muted">
                      开启后所有用户可见
                    </span>
                  </span>
                  <input
                    checked={form.published}
                    className="h-5 w-5 accent-accent"
                    onChange={(event) =>
                      setForm({ ...form, published: event.target.checked })
                    }
                    type="checkbox"
                  />
                </label>

                {error ? <Feedback tone="error">{error}</Feedback> : null}
                {saved ? <Feedback tone="success">{saved}</Feedback> : null}

                <Button
                  fullWidth
                  loading={loading}
                  loadingLabel="保存中..."
                  onClick={handleSubmit}
                  size="lg"
                >
                  {editingId ? (
                    <Save size={16} aria-hidden="true" />
                  ) : (
                    <UploadCloud size={16} aria-hidden="true" />
                  )}
                  {editingId ? '保存模板' : '创建模板'}
                </Button>
              </div>
            </SurfaceCard>
          </section>

          <section
            aria-label="模板列表"
            className="min-w-0 rounded-lg border border-line/80 bg-white/55 p-3 sm:p-4"
          >
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="text-xs font-semibold text-accent">内容资产</p>
                <h2 className="mt-1 text-lg font-semibold text-ink">已有模板</h2>
              </div>
              <span className="text-xs text-muted">{templates.length} 个模板</span>
            </div>

            <div className="mt-4 grid gap-3 xl:grid-cols-2">
              {templates.length > 0 ? (
                templates.map((template) => (
                  <article
                    className="rounded-lg border border-line bg-white p-3 shadow-soft"
                    key={template.id}
                  >
                    <div className="flex gap-3">
                      <img
                        alt=""
                        className="h-24 w-24 shrink-0 rounded-lg bg-canvas object-cover"
                        src={template.coverImageDataUrl}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="min-w-0 flex-1 truncate text-[15px] font-semibold text-ink">
                            {template.title}
                          </p>
                          <span
                            className={`rounded-full px-2 py-1 text-[11px] font-semibold ${
                              template.published
                                ? 'bg-[#eaf8f2] text-[#168257]'
                                : 'bg-[#eef0f2] text-muted'
                            }`}
                          >
                            {template.published ? '已发布' : '未发布'}
                          </span>
                        </div>
                        <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted">
                          {template.description}
                        </p>
                        <p className="mt-2 text-[11px] text-muted">
                          {template.type === 'image' ? '图片模板' : '视频模板'} ·
                          排序 {template.sortOrder}
                        </p>
                      </div>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <Button
                        onClick={() => startEditing(template)}
                        size="sm"
                        variant="secondary"
                      >
                        编辑
                      </Button>
                      <Button
                        aria-label={`${template.published ? '下架' : '发布'}${template.title}`}
                        onClick={() => void handleTogglePublish(template)}
                        size="sm"
                        variant={template.published ? 'ghost' : 'primary'}
                      >
                        {template.published ? '下架' : '发布'}
                      </Button>
                    </div>
                  </article>
                ))
              ) : (
                <div className="rounded-lg border border-dashed border-line bg-white p-5 text-sm text-muted xl:col-span-2">
                  {loading ? '正在读取模板...' : '暂无模板。'}
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </AppShell>
  );
}
