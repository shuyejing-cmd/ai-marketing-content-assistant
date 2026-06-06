'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ArrowLeft, ImagePlus, Save, UploadCloud } from 'lucide-react';
import { AppShell } from '@/components/AppShell';
import {
  createAdminTemplate,
  listAdminTemplates,
  updateAdminTemplate,
} from '@/features/templates/template-client';
import type { AdminTemplate, TemplateInput, TemplateType } from '@/features/templates/template-types';

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
        const withoutCurrent = previous.filter((template) => template.id !== nextTemplate.id);
        return [nextTemplate, ...withoutCurrent].sort(
          (left, right) =>
            left.sortOrder - right.sortOrder ||
            new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
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
      const updated = await updateAdminTemplate(template.id, { published: !template.published });
      setTemplates((previous) => previous.map((item) => (item.id === updated.id ? updated : item)));
    } catch (templateError) {
      setError(templateError instanceof Error ? templateError.message : '更新发布状态失败');
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
      <div className="flex min-h-dvh flex-col pb-6">
        <header className="flex items-center gap-3 pt-1">
          <Link href="/" className="grid h-9 w-9 place-items-center rounded-full border border-line bg-surface">
            <ArrowLeft size={18} aria-hidden="true" />
          </Link>
          <div>
            <h1 className="text-[22px] font-semibold leading-7 text-ink">模板管理</h1>
            <p className="mt-1 text-[13px] text-muted">创建、编辑和发布图片/视频模板。</p>
          </div>
        </header>

        {error ? (
          <div className="mt-3 rounded-lg border border-warm bg-white p-3 text-[14px] text-warm">{error}</div>
        ) : null}
        {saved ? (
          <div className="mt-3 rounded-lg border border-accent bg-white p-3 text-[14px] text-accent">{saved}</div>
        ) : null}

        <section className="mt-4 rounded-lg border border-line bg-surface p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-[17px] font-semibold text-ink">{editingId ? '编辑模板' : '新建模板'}</h2>
            {editingId ? (
              <button type="button" onClick={resetForm} className="text-[13px] font-medium text-muted">
                取消编辑
              </button>
            ) : null}
          </div>

          <div className="mt-4 grid gap-3">
            <label className="grid gap-1.5 text-[14px] text-ink">
              模板类型
              <select
                value={form.type}
                onChange={(event) => setForm({ ...form, type: event.target.value as TemplateType })}
                className="h-11 rounded-lg border border-line bg-white px-3 outline-none focus:border-accent"
              >
                <option value="image">图片模板</option>
                <option value="video">视频模板</option>
              </select>
            </label>

            <label className="grid gap-1.5 text-[14px] text-ink">
              模板标题
              <input
                value={form.title}
                onChange={(event) => setForm({ ...form, title: event.target.value })}
                placeholder="例如：国庆焕新海报"
                className="h-11 rounded-lg border border-line px-3 outline-none focus:border-accent"
              />
            </label>

            <label className="grid gap-1.5 text-[14px] text-ink">
              模板描述
              <textarea
                value={form.description}
                onChange={(event) => setForm({ ...form, description: event.target.value })}
                placeholder="给用户看的模板说明"
                rows={2}
                className="resize-none rounded-lg border border-line px-3 py-2 outline-none focus:border-accent"
              />
            </label>

            <label className="grid gap-1.5 text-[14px] text-ink">
              排序
              <input
                type="number"
                value={form.sortOrder ?? 0}
                onChange={(event) => setForm({ ...form, sortOrder: Number(event.target.value) })}
                className="h-11 rounded-lg border border-line px-3 outline-none focus:border-accent"
              />
            </label>

            <label className="grid gap-1.5 text-[14px] text-ink">
              封面图
              <div className="rounded-lg border border-dashed border-line bg-canvas p-3">
                {form.coverImageDataUrl ? (
                  <img src={form.coverImageDataUrl} alt="模板封面预览" className="aspect-[4/3] w-full rounded-lg object-cover" />
                ) : (
                  <div className="grid aspect-[4/3] place-items-center text-[13px] text-muted">
                    <ImagePlus size={24} aria-hidden="true" />
                    上传模板封面
                  </div>
                )}
                <input
                  type="file"
                  accept="image/*"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = () => setForm((current) => ({ ...current, coverImageDataUrl: String(reader.result) }));
                    reader.readAsDataURL(file);
                  }}
                  className="mt-3 w-full text-[13px]"
                />
              </div>
            </label>

            <label className="grid gap-1.5 text-[14px] text-ink">
              内部 Prompt
              <textarea
                value={form.prompt}
                onChange={(event) => setForm({ ...form, prompt: event.target.value })}
                placeholder="这里写模板内部提示词。普通用户不会看到。"
                rows={8}
                className="resize-none rounded-lg border border-line px-3 py-2 font-mono text-[13px] leading-5 outline-none focus:border-accent"
              />
            </label>

            <label className="flex items-center gap-2 text-[14px] text-ink">
              <input
                type="checkbox"
                checked={form.published}
                onChange={(event) => setForm({ ...form, published: event.target.checked })}
              />
              发布到首页模板列表
            </label>

            <button
              type="button"
              onClick={handleSubmit}
              disabled={loading}
              className="flex h-11 items-center justify-center gap-2 rounded-lg bg-accent text-[15px] font-semibold text-white disabled:bg-line disabled:text-muted"
            >
              {editingId ? <Save size={16} aria-hidden="true" /> : <UploadCloud size={16} aria-hidden="true" />}
              {editingId ? '保存模板' : '创建模板'}
            </button>
          </div>
        </section>

        <section className="mt-5">
          <h2 className="text-[17px] font-semibold text-ink">已有模板</h2>
          <div className="mt-3 grid gap-3">
            {templates.length > 0 ? (
              templates.map((template) => (
                <article key={template.id} className="rounded-lg border border-line bg-surface p-3">
                  <div className="flex gap-3">
                    <img src={template.coverImageDataUrl} alt="" className="h-20 w-20 rounded-lg object-cover" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-[15px] font-semibold text-ink">{template.title}</p>
                        <span className="rounded-full bg-canvas px-2 py-0.5 text-[11px] text-muted">
                          {template.type === 'image' ? '图片' : '视频'}
                        </span>
                      </div>
                      <p className="mt-1 line-clamp-2 text-[12px] leading-5 text-muted">{template.description}</p>
                      <p className="mt-1 text-[11px] text-muted">
                        排序 {template.sortOrder} / {template.published ? '已发布' : '未发布'}
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      onClick={() => startEditing(template)}
                      className="h-9 flex-1 rounded-lg border border-line text-[13px] text-ink"
                    >
                      编辑
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleTogglePublish(template)}
                      className="h-9 flex-1 rounded-lg border border-line text-[13px] text-ink"
                    >
                      {template.published ? '下架' : '发布'}
                    </button>
                  </div>
                </article>
              ))
            ) : (
              <div className="rounded-lg border border-line bg-surface p-4 text-[14px] text-muted">
                {loading ? '正在读取模板...' : '暂无模板。'}
              </div>
            )}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
