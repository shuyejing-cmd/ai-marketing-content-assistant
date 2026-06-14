'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  ImagePlus,
  Menu,
  Pencil,
  Plus,
  Trash2,
  Wand2,
} from 'lucide-react';
import { ActivityInfoForm } from '@/components/ActivityInfoForm';
import { AppShell } from '@/components/AppShell';
import { BottomSheet } from '@/components/BottomSheet';
import { ImageUploader } from '@/components/ImageUploader';
import { ResultCard } from '@/components/ResultCard';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { Feedback, SurfaceCard } from '@/components/ui/Primitives';
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
import type { ProcessedUploadImage } from '@/features/image-upload/image-types';

export function TemplateImageClient({ templateId }: { templateId: string }) {
  const [template, setTemplate] = useState<PublicTemplate | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [uploadedImage, setUploadedImage] = useState<ProcessedUploadImage | undefined>();
  const [imageProcessing, setImageProcessing] = useState(false);
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
        remoteSessions.find(
          (session) => session.id === getCurrentTemplateRemoteSessionId(templateId),
        ) ??
        remoteSessions[0] ??
        (await createRemoteSession(nextOwnerId, { kind: 'template', templateId }));

      restoreSession(restoredSession, false);
      setSessions(remoteSessions.length > 0 ? remoteSessions : [restoredSession]);
    } catch (templateError) {
      setError(templateError instanceof Error ? templateError.message : '读取模板失败');
    }
  }

  function restoreSession(session: GenerationSession, resetComposer = true) {
    setCurrentTemplateRemoteSessionId(templateId, session.id);
    setCurrentSession(session);
    setTask(getActiveTask(session));
    if (resetComposer) {
      setUploadedImage(undefined);
      setImageProcessing(false);
      setCampaignInfo({});
    }
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

  function handleUploadedImageChange(image: ProcessedUploadImage | undefined) {
    setUploadedImage(image);
    if (!image) return;
    logFrontendEvent('frontend.image.uploaded', {
      image: summarizeImageDataUrl(image.dataUrl),
      width: image.width,
      height: image.height,
      processing: image.processing,
      source: 'template',
    });
  }

  async function handleSubmit() {
    if (imageProcessing) {
      setError('图片仍在处理中，请稍候');
      return;
    }

    if (!template || !uploadedImage) {
      setError('请先上传图片');
      return;
    }

    setLoading(true);
    setError(null);
    logFrontendEvent('frontend.generation.submit', {
      hasUploadedImage: true,
      image: summarizeImageDataUrl(uploadedImage.dataUrl),
      filledCampaignFields: getFilledCampaignFields(campaignInfo),
      mode: 'template-image-to-image',
    });
    try {
      const nextTask = await createTemplateGenerationTask(
        template.id,
        {
          uploadedImageDataUrl: uploadedImage.dataUrl,
          campaignInfo,
        },
        {
          ownerId: ownerId ?? undefined,
          sessionId: currentSession?.id,
        },
      );
      setTask(nextTask);
      persistTask(nextTask);
      setUploadedImage(undefined);
      setImageProcessing(false);
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
    const nextSession = await createRemoteSession(ownerId, {
      kind: 'template',
      templateId,
    });
    setCurrentTemplateRemoteSessionId(templateId, nextSession.id);
    setCurrentSession(nextSession);
    setSessions((previous) => [nextSession, ...previous]);
    setTask(null);
    setUploadedImage(undefined);
    setImageProcessing(false);
    setCampaignInfo({});
    setError(null);
    setMenuOpen(false);
  }

  function handleSelectSession(session: GenerationSession) {
    restoreSession(session);
    setMenuOpen(false);
  }

  async function handleRenameSession(session: GenerationSession) {
    if (!ownerId) return;
    const title = window.prompt('输入新的会话名称', session.title);
    if (!title) return;
    const renamed = await renameRemoteSession(ownerId, session.id, title);
    setSessions((previous) =>
      previous.map((item) => (item.id === session.id ? renamed : item)),
    );
    if (currentSession?.id === session.id) setCurrentSession(renamed);
  }

  async function handleDeleteSession(session: GenerationSession) {
    if (!ownerId || !window.confirm(`删除“${session.title}”？`)) return;
    setError(null);
    try {
      await deleteRemoteSession(ownerId, session.id);
      const remaining = sessions.filter((item) => item.id !== session.id);
      const nextSession =
        remaining[0] ??
        (await createRemoteSession(ownerId, { kind: 'template', templateId }));
      setSessions(remaining.length > 0 ? remaining : [nextSession]);
      if (currentSession?.id === session.id || remaining.length === 0) {
        restoreSession(nextSession);
      }
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : '删除会话失败');
    }
  }

  return (
    <AppShell>
      <div className="min-h-[calc(100dvh-2.5rem)]">
        <header className="flex min-h-16 items-center gap-3 border-b border-line/80">
          <Link aria-label="返回首页" className="ui-icon-button" href="/">
            <ArrowLeft size={18} aria-hidden="true" />
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-xl font-semibold text-ink">
              {template?.title ?? '图片模板'}
            </h1>
            <p className="truncate text-xs text-muted">
              {currentSession?.title ?? '模板图片会话'}
            </p>
          </div>
          <IconButton label="打开会话菜单" onClick={() => setMenuOpen(true)}>
            <Menu size={18} aria-hidden="true" />
          </IconButton>
        </header>

        <div className="grid gap-4 py-4 lg:grid-cols-[380px_minmax(0,1fr)]">
          <aside aria-label="模板输入配置" className="min-w-0 lg:sticky lg:top-4 lg:self-start">
            <SurfaceCard className="grid gap-5">
              {template ? (
                <section className="overflow-hidden rounded-lg border border-line">
                  <img
                    alt=""
                    className="aspect-[16/9] w-full bg-canvas object-cover"
                    src={template.coverImageDataUrl}
                  />
                  <div className="p-3">
                    <p className="text-sm font-semibold text-ink">
                      使用模板：{template.title}
                    </p>
                    <p className="mt-1 text-xs leading-5 text-muted">
                      {template.description}
                    </p>
                  </div>
                </section>
              ) : null}

              <Feedback tone="info">
                模板提示词已锁定。上传参考图片并填写活动信息即可生成。
              </Feedback>

              <section>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-base font-semibold text-ink">参考图片</h2>
                    <p className="mt-1 text-xs text-muted">商品主体将完整显示，不进行裁切。</p>
                  </div>
                  <Button
                    onClick={() =>
                      document.querySelector<HTMLInputElement>(
                        'input[type="file"]',
                      )?.click()
                    }
                    size="sm"
                    variant="secondary"
                  >
                    <ImagePlus size={16} aria-hidden="true" />
                    上传图片
                  </Button>
                </div>
                <div className="mt-3">
                  <ImageUploader
                    image={uploadedImage}
                    onChange={handleUploadedImageChange}
                    onProcessingChange={setImageProcessing}
                  />
                </div>
              </section>

              <section>
                <h2 className="text-base font-semibold text-ink">活动信息</h2>
                <p className="mt-1 text-xs leading-5 text-muted">
                  可选填写，用于补充价格、时间和门店信息。
                </p>
                <div className="mt-3">
                  <ActivityInfoForm value={campaignInfo} onChange={setCampaignInfo} />
                </div>
              </section>

              {error ? <Feedback tone="error">{error}</Feedback> : null}
              {imageProcessing ? (
                <Feedback tone="info">正在处理图片，请稍候...</Feedback>
              ) : null}

              {ownerId && currentSession && template ? (
                <Button
                  fullWidth
                  loading={loading || imageProcessing}
                  loadingLabel={imageProcessing ? '正在处理图片...' : '生成中...'}
                  onClick={handleSubmit}
                  size="lg"
                  disabled={!uploadedImage}
                >
                  <Wand2 size={17} aria-hidden="true" />
                  生成模板图片
                </Button>
              ) : (
                <Feedback tone="info">正在读取模板会话...</Feedback>
              )}
            </SurfaceCard>
          </aside>

          <section
            aria-label="模板生成结果"
            className="min-w-0 rounded-lg border border-line/80 bg-white/55 p-3 sm:p-4"
          >
            <div>
              <p className="text-xs font-semibold text-accent">生成画布</p>
              <h2 className="mt-1 text-lg font-semibold text-ink">模板生成结果</h2>
            </div>

            <div className="mt-4 grid gap-3">
              {loading ? <Feedback tone="info">正在按模板生成图片...</Feedback> : null}
              {currentSession && currentSession.tasks.length > 0 ? (
                currentSession.tasks.map((historyTask, index) => (
                  <div
                    className="grid gap-3"
                    key={historyTask.id}
                    ref={
                      index === currentSession.tasks.length - 1
                        ? latestResultRef
                        : undefined
                    }
                  >
                    <div className="ml-auto max-w-[86%] rounded-lg rounded-br-sm bg-accent px-3 py-2 text-[14px] leading-6 text-white shadow-control">
                      {historyTask.request.templateTitle
                        ? `使用模板：${historyTask.request.templateTitle}`
                        : historyTask.request.requestText || '生成图片营销方案'}
                    </div>
                    <div className="grid gap-3 2xl:grid-cols-2">
                      {historyTask.results.map((result) => (
                        <ResultCard
                          key={result.id}
                          modifyDisabled
                          modifyLabel="模板锁定"
                          onRegenerate={() => {
                            setTask(historyTask);
                            void handleRegenerate(historyTask);
                          }}
                          result={result}
                        />
                      ))}
                    </div>
                  </div>
                ))
              ) : !loading ? (
                <div className="grid min-h-[420px] place-items-center border-t border-line text-center">
                  <div className="max-w-sm">
                    <p className="text-lg font-semibold text-ink">等待生成模板图片</p>
                    <p className="mt-2 text-sm leading-6 text-muted">
                      上传参考图片后开始生成，结果会保留在当前模板会话中。
                    </p>
                  </div>
                </div>
              ) : null}
            </div>
          </section>
        </div>
      </div>

      <BottomSheet
        onClose={() => setMenuOpen(false)}
        open={menuOpen}
        title="会话菜单"
      >
        <div className="grid gap-4">
          <Button fullWidth onClick={handleCreateSession}>
            <Plus size={17} aria-hidden="true" />
            新建模板会话
          </Button>
          <div className="grid gap-2">
            {sessions.map((session) => (
              <TemplateSessionRow
                current={currentSession?.id === session.id}
                key={session.id}
                onDelete={() => void handleDeleteSession(session)}
                onRename={() => void handleRenameSession(session)}
                onSelect={() => handleSelectSession(session)}
                session={session}
              />
            ))}
          </div>
        </div>
      </BottomSheet>
    </AppShell>
  );
}

function TemplateSessionRow({
  current,
  onDelete,
  onRename,
  onSelect,
  session,
}: {
  current: boolean;
  onDelete: () => void;
  onRename: () => void;
  onSelect: () => void;
  session: GenerationSession;
}) {
  return (
    <div
      className={`rounded-lg border p-2 ${
        current ? 'border-accent bg-accent-soft' : 'border-line bg-white'
      }`}
    >
      <button
        aria-label={`打开会话${session.title}`}
        className="min-h-11 w-full px-1 text-left"
        onClick={onSelect}
        type="button"
      >
        <span className="block text-sm font-semibold text-ink">
          {session.title}
          {current ? '（当前）' : ''}
        </span>
        <span className="mt-1 line-clamp-2 block text-xs leading-5 text-muted">
          {getSessionSummary(session)}
        </span>
        <span className="mt-1 block text-[11px] text-muted">
          {formatSessionTime(session.updatedAt)}
        </span>
      </button>
      <div className="mt-1 flex justify-end gap-1 border-t border-line/70 pt-2">
        <IconButton label={`重命名${session.title}`} onClick={onRename}>
          <Pencil size={15} aria-hidden="true" />
        </IconButton>
        <IconButton label={`删除${session.title}`} onClick={onDelete} tone="danger">
          <Trash2 size={15} aria-hidden="true" />
        </IconButton>
      </div>
    </div>
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
