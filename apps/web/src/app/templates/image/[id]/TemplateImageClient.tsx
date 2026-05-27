'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, CalendarDays, ImagePlus, Menu, Wand2 } from 'lucide-react';
import { ActivityInfoForm } from '@/components/ActivityInfoForm';
import { AppShell } from '@/components/AppShell';
import { BottomSheet } from '@/components/BottomSheet';
import { ImageUploader } from '@/components/ImageUploader';
import { ResultCard } from '@/components/ResultCard';
import { logFrontendRunEvent } from '@/features/generation/dev-run-log-client';
import { regenerateTask } from '@/features/generation/generation-client';
import type { CampaignInfo, GenerationTask } from '@/features/generation/generation-types';
import { summarizeImageDataUrl } from '@/features/generation/image-summary';
import { getActiveTask, type GenerationSession } from '@/features/generation/local-sessions';
import {
  getCurrentTemplateRemoteSessionId,
  getOwnerId,
  setCurrentTemplateRemoteSessionId,
} from '@/features/generation/owner-id';
import {
  createSession as createRemoteSession,
  deleteSession as deleteRemoteSession,
  listSessions as listRemoteSessions,
  renameSession as renameRemoteSession,
} from '@/features/generation/session-client';
import { upsertTaskIntoSession } from '@/features/generation/session-task-order';
import {
  createTemplateGenerationTask,
  getTemplate,
} from '@/features/templates/template-client';
import type { PublicTemplate } from '@/features/templates/template-types';

type SheetKey = 'upload' | 'info' | 'menu' | null;

export function TemplateImageClient({ templateId }: { templateId: string }) {
  const [template, setTemplate] = useState<PublicTemplate | null>(null);
  const [activeSheet, setActiveSheet] = useState<SheetKey>(null);
  const [uploadedImageDataUrl, setUploadedImageDataUrl] = useState<string | undefined>();
  const [campaignInfo, setCampaignInfo] = useState<CampaignInfo>({});
  const [task, setTask] = useState<GenerationTask | null>(null);
  const [sessions, setSessions] = useState<GenerationSession[]>([]);
  const [currentSession, setCurrentSession] = useState<GenerationSession | null>(null);
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const latestResultRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    void initialize();
  }, [templateId]);

  useEffect(() => {
    if (!loading) latestResultRef.current?.scrollIntoView({ block: 'end' });
  }, [currentSession?.tasks.length, loading]);

  async function initialize() {
    setError(null);
    try {
      const nextOwnerId = getOwnerId();
      setOwnerId(nextOwnerId);
      const [nextTemplate, remoteSessions] = await Promise.all([
        getTemplate(templateId),
        listRemoteSessions(nextOwnerId, { kind: 'template', templateId }),
      ]);
      setTemplate(nextTemplate);

      const restoredSession =
        remoteSessions.find((session) => session.id === getCurrentTemplateRemoteSessionId(templateId)) ??
        remoteSessions[0] ??
        (await createRemoteSession(nextOwnerId, { kind: 'template', templateId }));

      restoreSession(restoredSession);
      setSessions(remoteSessions.length > 0 ? remoteSessions : [restoredSession]);
    } catch (templateError) {
      setError(templateError instanceof Error ? templateError.message : '读取模板失败');
    }
  }

  function restoreSession(session: GenerationSession) {
    setCurrentTemplateRemoteSessionId(templateId, session.id);
    setCurrentSession(session);
    setTask(getActiveTask(session));
    setUploadedImageDataUrl(undefined);
    setCampaignInfo({});
  }

  function persistTask(nextTask: GenerationTask) {
    const updatedSession = upsertTaskIntoSession(currentSession, nextTask);
    setCurrentSession(updatedSession);
    setSessions((previous) => [
      updatedSession,
      ...previous.filter((session) => session.id !== updatedSession.id),
    ]);
  }

  function logFrontendEvent(event: string, payload: Record<string, unknown> = {}) {
    logFrontendRunEvent(event, {
      ownerId,
      sessionId: currentSession?.id ?? null,
      templateId,
      templateTitle: template?.title ?? null,
      ...payload,
    });
  }

  function handleUploadedImageChange(imageDataUrl: string | undefined) {
    setUploadedImageDataUrl(imageDataUrl);
    if (!imageDataUrl) return;
    logFrontendEvent('frontend.image.uploaded', {
      image: summarizeImageDataUrl(imageDataUrl),
      source: 'template',
    });
  }

  async function handleSubmit() {
    if (!template || !uploadedImageDataUrl) {
      setError('请先上传图片');
      return;
    }

    setLoading(true);
    setError(null);
    logFrontendEvent('frontend.generation.submit', {
      hasUploadedImage: true,
      image: summarizeImageDataUrl(uploadedImageDataUrl),
      filledCampaignFields: getFilledCampaignFields(campaignInfo),
      mode: 'template-image-to-image',
    });
    try {
      const nextTask = await createTemplateGenerationTask(
        template.id,
        {
          uploadedImageDataUrl,
          campaignInfo,
        },
        {
          ownerId: ownerId ?? undefined,
          sessionId: currentSession?.id,
        },
      );
      setTask(nextTask);
      persistTask(nextTask);
      setUploadedImageDataUrl(undefined);
      setCampaignInfo({});
    } catch (generationError) {
      setError(generationError instanceof Error ? generationError.message : '模板生成失败');
    } finally {
      setLoading(false);
    }
  }

  async function handleRegenerate(targetTask = task) {
    if (!targetTask) return;
    setLoading(true);
    setError(null);
    try {
      const nextTask = await regenerateTask(targetTask.id, {
        ownerId: ownerId ?? undefined,
        sessionId: currentSession?.id,
      });
      setTask(nextTask);
      persistTask(nextTask);
    } catch (generationError) {
      setError(generationError instanceof Error ? generationError.message : '重新生成失败');
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateSession() {
    if (!ownerId) return;
    const nextSession = await createRemoteSession(ownerId, { kind: 'template', templateId });
    setCurrentTemplateRemoteSessionId(templateId, nextSession.id);
    setCurrentSession(nextSession);
    setSessions((previous) => [nextSession, ...previous]);
    setTask(null);
    setUploadedImageDataUrl(undefined);
    setCampaignInfo({});
    setError(null);
    setActiveSheet(null);
  }

  function handleSelectSession(session: GenerationSession) {
    restoreSession(session);
    setActiveSheet(null);
  }

  async function handleRenameSession(session: GenerationSession) {
    if (!ownerId) return;
    const title = window.prompt('输入新的会话名称', session.title);
    if (!title) return;
    const renamed = await renameRemoteSession(ownerId, session.id, title);
    setSessions((previous) => previous.map((item) => (item.id === session.id ? renamed : item)));
    if (currentSession?.id === session.id) setCurrentSession(renamed);
  }

  async function handleDeleteSession(session: GenerationSession) {
    if (!ownerId || !window.confirm(`删除“${session.title}”？`)) return;
    setError(null);
    try {
      await deleteRemoteSession(ownerId, session.id);
      const remaining = sessions.filter((item) => item.id !== session.id);
      const nextSession = remaining[0] ?? (await createRemoteSession(ownerId, { kind: 'template', templateId }));
      setSessions(remaining.length > 0 ? remaining : [nextSession]);
      if (currentSession?.id === session.id || remaining.length === 0) restoreSession(nextSession);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : '删除会话失败');
    }
  }

  return (
    <AppShell>
      <div className="flex min-h-dvh flex-col pb-4">
        <header className="flex items-center gap-3 pt-1">
          <Link href="/" className="grid h-9 w-9 place-items-center rounded-full border border-line bg-surface">
            <ArrowLeft size={18} aria-hidden="true" />
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-[22px] font-semibold text-ink">
              {template?.title ?? '图片模板'}
            </h1>
            <p className="truncate text-[13px] text-muted">{currentSession?.title ?? '模板图片会话'}</p>
          </div>
          <button
            type="button"
            onClick={() => setActiveSheet('menu')}
            className="grid h-9 w-9 place-items-center rounded-full border border-line bg-surface"
            aria-label="打开会话菜单"
          >
            <Menu size={18} aria-hidden="true" />
          </button>
        </header>

        <section className="mt-5 flex-1 space-y-3">
          {template ? (
            <article className="overflow-hidden rounded-lg border border-line bg-surface shadow-soft">
              <img src={template.coverImageDataUrl} alt="" className="aspect-[4/3] w-full object-cover" />
              <div className="p-3">
                <p className="text-[15px] font-semibold leading-6 text-ink">使用模板：{template.title}</p>
                <p className="mt-1 text-[13px] leading-5 text-muted">{template.description}</p>
              </div>
            </article>
          ) : null}

          <div className="rounded-lg border border-line bg-surface p-3 text-[14px] leading-6 text-muted">
            模板模式会锁定内部提示词。你只需要上传参考图片，并填写活动信息。
          </div>

          {loading ? (
            <div className="rounded-lg border border-line bg-surface p-4 text-[15px] text-ink">
              正在按模板生成图片...
            </div>
          ) : null}

          {error ? (
            <div className="rounded-lg border border-warm bg-white p-3 text-[14px] text-warm">{error}</div>
          ) : null}

          {currentSession && currentSession.tasks.length > 0 ? (
            <div className="grid gap-3">
              {currentSession.tasks.map((historyTask, index) => (
                <div
                  key={historyTask.id}
                  ref={index === currentSession.tasks.length - 1 ? latestResultRef : undefined}
                  className="grid gap-2"
                >
                  <div className="ml-auto max-w-[86%] rounded-2xl rounded-br-sm bg-accent px-3 py-2 text-[14px] leading-6 text-white">
                    {historyTask.request.templateTitle
                      ? `使用模板：${historyTask.request.templateTitle}`
                      : historyTask.request.requestText || '生成图片营销方案'}
                  </div>
                  {historyTask.results.map((result) => (
                    <ResultCard
                      key={result.id}
                      result={result}
                      onRegenerate={() => {
                        setTask(historyTask);
                        void handleRegenerate(historyTask);
                      }}
                      modifyDisabled
                      modifyLabel="模板锁定"
                    />
                  ))}
                </div>
              ))}
            </div>
          ) : null}
        </section>

        <footer className="sticky bottom-0 -mx-4 bg-canvas px-4 pb-2 pt-3">
          {ownerId && currentSession && template ? (
            <>
              <div className="flex gap-2 overflow-x-auto pb-2">
                <button
                  type="button"
                  onClick={() => setActiveSheet('upload')}
                  className="flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-line bg-surface px-3 text-[13px] text-ink"
                >
                  {uploadedImageDataUrl ? (
                    <img src={uploadedImageDataUrl} alt="" className="h-5 w-5 rounded-full object-cover" />
                  ) : (
                    <ImagePlus size={15} aria-hidden="true" />
                  )}
                  {uploadedImageDataUrl ? '已上传图片' : '上传图片'}
                </button>
                <button
                  type="button"
                  onClick={() => setActiveSheet('info')}
                  className="flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-line bg-surface px-3 text-[13px] text-ink"
                >
                  <CalendarDays size={15} aria-hidden="true" />
                  活动信息
                </button>
              </div>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={loading || !uploadedImageDataUrl}
                className="flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-accent text-[15px] font-semibold text-white disabled:bg-line disabled:text-muted"
              >
                <Wand2 size={17} aria-hidden="true" />
                {loading ? '生成中...' : '生成模板图片'}
              </button>
            </>
          ) : (
            <div className="rounded-lg border border-line bg-surface p-3 text-[14px] text-muted">
              正在读取模板会话...
            </div>
          )}
        </footer>
      </div>

      <BottomSheet title="上传图片" open={activeSheet === 'upload'} onClose={() => setActiveSheet(null)}>
        <ImageUploader imageDataUrl={uploadedImageDataUrl} onChange={handleUploadedImageChange} />
      </BottomSheet>

      <BottomSheet title="活动信息" open={activeSheet === 'info'} onClose={() => setActiveSheet(null)}>
        <ActivityInfoForm value={campaignInfo} onChange={setCampaignInfo} />
      </BottomSheet>

      <BottomSheet title="会话菜单" open={activeSheet === 'menu'} onClose={() => setActiveSheet(null)}>
        <div className="grid gap-4">
          <button
            type="button"
            onClick={handleCreateSession}
            className="h-11 rounded-lg bg-accent text-[15px] font-semibold text-white"
          >
            新建模板会话
          </button>

          <section>
            <h2 className="text-[15px] font-semibold text-ink">历史会话记录</h2>
            <div className="mt-2 grid gap-2">
              {sessions.length > 0 ? (
                sessions.map((session) => (
                  <button
                    key={session.id}
                    type="button"
                    onClick={() => handleSelectSession(session)}
                    className="rounded-lg border border-line bg-white p-3 text-left"
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="block text-[14px] font-semibold leading-5 text-ink">
                        {session.title}
                        {currentSession?.id === session.id ? '（当前）' : ''}
                      </span>
                      <span className="flex shrink-0 gap-2">
                        <span
                          role="button"
                          tabIndex={0}
                          onClick={(event) => {
                            event.stopPropagation();
                            void handleRenameSession(session);
                          }}
                          className="rounded-full border border-line px-2 py-1 text-[11px] text-muted"
                        >
                          重命名
                        </span>
                        <span
                          role="button"
                          tabIndex={0}
                          onClick={(event) => {
                            event.stopPropagation();
                            void handleDeleteSession(session);
                          }}
                          className="rounded-full border border-line px-2 py-1 text-[11px] text-warm"
                        >
                          删除
                        </span>
                      </span>
                    </span>
                    <span className="mt-1 block text-[12px] leading-5 text-muted">
                      {getSessionSummary(session)}
                    </span>
                    <span className="mt-1 block text-[11px] text-muted">
                      {formatSessionTime(session.updatedAt)}
                    </span>
                  </button>
                ))
              ) : (
                <p className="rounded-lg bg-canvas p-3 text-[13px] text-muted">暂无历史会话</p>
              )}
            </div>
          </section>
        </div>
      </BottomSheet>
    </AppShell>
  );
}

function getFilledCampaignFields(campaignInfo: CampaignInfo) {
  return Object.entries(campaignInfo)
    .filter(([, value]) => Boolean(value))
    .map(([key]) => key);
}

function getSessionSummary(session: GenerationSession) {
  const activeTask = getActiveTask(session);
  if (!activeTask) return '暂无生成内容';
  return activeTask.request.templateTitle
    ? `使用模板：${activeTask.request.templateTitle}`
    : activeTask.request.requestText || '图片营销内容';
}

function formatSessionTime(value: string) {
  return new Date(value).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}
