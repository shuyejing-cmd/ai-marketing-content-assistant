'use client';

import Link from 'next/link';
import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import {
  ArrowLeft,
  Menu,
  Pencil,
  Plus,
  SlidersHorizontal,
  Trash2,
  X,
} from 'lucide-react';
import { ActivityInfoForm } from '@/components/ActivityInfoForm';
import { AppShell } from '@/components/AppShell';
import { BottomSheet } from '@/components/BottomSheet';
import { ChatComposer } from '@/components/ChatComposer';
import { ImageUploader } from '@/components/ImageUploader';
import { OptionPicker } from '@/components/OptionPicker';
import { QuickActionBar } from '@/components/QuickActionBar';
import { ResultCard } from '@/components/ResultCard';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import {
  ConfigSummary,
  Feedback,
  SurfaceCard,
} from '@/components/ui/Primitives';
import {
  channelOptions,
  sceneOptions,
  styleOptions,
} from '@/features/generation/generation-options';
import { logFrontendRunEvent } from '@/features/generation/dev-run-log-client';
import {
  createGenerationTask,
  modifyTask,
  regenerateTask,
} from '@/features/generation/generation-client';
import { summarizeImageDataUrl } from '@/features/generation/image-summary';
import {
  getCurrentFreeRemoteSessionId,
  getOwnerId,
  setCurrentFreeRemoteSessionId,
} from '@/features/generation/owner-id';
import {
  createSession as createRemoteSession,
  deleteSession as deleteRemoteSession,
  listSessions as listRemoteSessions,
  renameSession as renameRemoteSession,
} from '@/features/generation/session-client';
import type {
  CampaignInfo,
  Channel,
  GenerationTask,
  MarketingScene,
  StyleTemplate,
} from '@/features/generation/generation-types';
import {
  getActiveTask,
  type GenerationSession,
} from '@/features/generation/local-sessions';
import { upsertTaskIntoSession } from '@/features/generation/session-task-order';
import type { ProcessedUploadImage } from '@/features/image-upload/image-types';

type SheetKey =
  | 'config'
  | 'upload'
  | 'channel'
  | 'scene'
  | 'style'
  | 'info'
  | 'menu'
  | null;

const defaultChannels: Channel[] = ['wechat'];
const defaultScene: MarketingScene = 'new_product';
const defaultStyle: StyleTemplate = 'young_trendy';

export default function ImagePage() {
  const [activeSheet, setActiveSheet] = useState<SheetKey>(null);
  const [requestText, setRequestText] = useState('');
  const [uploadedImage, setUploadedImage] = useState<ProcessedUploadImage | undefined>();
  const [imageProcessing, setImageProcessing] = useState(false);
  const [channels, setChannels] = useState<Channel[]>(defaultChannels);
  const [scene, setScene] = useState<MarketingScene>(defaultScene);
  const [style, setStyle] = useState<StyleTemplate>(defaultStyle);
  const [campaignInfo, setCampaignInfo] = useState<CampaignInfo>({});
  const [task, setTask] = useState<GenerationTask | null>(null);
  const [sessions, setSessions] = useState<GenerationSession[]>([]);
  const [currentSession, setCurrentSession] = useState<GenerationSession | null>(null);
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [modifyingResultId, setModifyingResultId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const latestResultRef = useRef<HTMLDivElement | null>(null);
  const configCloseRef = useRef<HTMLButtonElement>(null);
  const configPanelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void initializeSessions();
  }, []);

  useEffect(() => {
    if (!loading) {
      latestResultRef.current?.scrollIntoView({ block: 'end' });
    }
  }, [currentSession?.tasks.length, loading]);

  useEffect(() => {
    if (activeSheet !== 'config') return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    configCloseRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setActiveSheet(null);
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, [activeSheet]);

  function trapConfigFocus(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'Tab') return;
    const focusable = Array.from(
      configPanelRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ) ?? [],
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

  async function initializeSessions() {
    try {
      const nextOwnerId = getOwnerId();
      setOwnerId(nextOwnerId);
      const remoteSessions = await listRemoteSessions(nextOwnerId, { kind: 'free' });
      const restoredSession =
        remoteSessions.find((session) => session.id === getCurrentFreeRemoteSessionId()) ??
        remoteSessions[0] ??
        (await createRemoteSession(nextOwnerId, { kind: 'free' }));

      restoreSession(restoredSession);
      setSessions(remoteSessions.length > 0 ? remoteSessions : [restoredSession]);
    } catch (sessionError) {
      setError(sessionError instanceof Error ? sessionError.message : '读取会话失败');
    }
  }

  function restoreSession(session: GenerationSession) {
    setCurrentFreeRemoteSessionId(session.id);
    setCurrentSession(session);
    setModifyingResultId(null);
    setRequestText('');

    const activeTask = getActiveTask(session);
    setTask(activeTask);
    resetComposerState();
  }

  function resetComposerState() {
    setUploadedImage(undefined);
    setImageProcessing(false);
    setChannels(defaultChannels);
    setScene(defaultScene);
    setStyle(defaultStyle);
    setCampaignInfo({});
  }

  function logFrontendEvent(event: string, payload: Record<string, unknown> = {}) {
    logFrontendRunEvent(event, {
      ownerId,
      sessionId: currentSession?.id ?? null,
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
      source: 'free',
    });
  }

  function handleChannelsChange(value: Channel | Channel[]) {
    const nextChannels = Array.isArray(value) ? value : [value];
    logFrontendEvent('frontend.option.changed', {
      field: 'channels',
      previousValue: channels,
      value: nextChannels,
      label: nextChannels.map((channel) => getOptionLabel(channelOptions, channel)).join(','),
    });
    setChannels(nextChannels);
  }

  function handleSceneChange(value: MarketingScene | MarketingScene[]) {
    const nextScene = Array.isArray(value) ? value[0] : value;
    logFrontendEvent('frontend.option.changed', {
      field: 'scene',
      previousValue: scene,
      value: nextScene,
      label: getOptionLabel(sceneOptions, nextScene),
    });
    setScene(nextScene);
  }

  function handleStyleChange(value: StyleTemplate | StyleTemplate[]) {
    const nextStyle = Array.isArray(value) ? value[0] : value;
    logFrontendEvent('frontend.option.changed', {
      field: 'style',
      previousValue: style,
      value: nextStyle,
      label: getOptionLabel(styleOptions, nextStyle),
    });
    setStyle(nextStyle);
  }

  function persistTask(nextTask: GenerationTask) {
    const updatedSession = upsertTaskIntoSession(currentSession, nextTask);
    setCurrentSession(updatedSession);
    setSessions((previous) => [
      updatedSession,
      ...previous.filter((session) => session.id !== updatedSession.id),
    ]);
  }

  async function handleSubmit() {
    if (imageProcessing) {
      setError('图片仍在处理中，请稍候');
      return;
    }

    setLoading(true);
    setError(null);
    logFrontendEvent('frontend.generation.submit', {
      textLength: requestText.trim().length,
      hasUploadedImage: Boolean(uploadedImage),
      image: uploadedImage ? summarizeImageDataUrl(uploadedImage.dataUrl) : undefined,
      channels: channels.map((channel) => ({
        value: channel,
        label: getOptionLabel(channelOptions, channel),
      })),
      scene: {
        value: scene,
        label: getOptionLabel(sceneOptions, scene),
      },
      style: {
        value: style,
        label: getOptionLabel(styleOptions, style),
      },
      filledCampaignFields: getFilledCampaignFields(campaignInfo),
      mode: uploadedImage ? 'image-to-image' : 'text-to-image',
      isModification: Boolean(task && modifyingResultId),
    });
    try {
      if (task && modifyingResultId) {
        const modifiedTask = await modifyTask(task.id, modifyingResultId, requestText, {
          ownerId: ownerId ?? undefined,
          sessionId: currentSession?.id,
        });
        setTask(modifiedTask);
        persistTask(modifiedTask);
        setModifyingResultId(null);
        setRequestText('');
        resetComposerState();
        return;
      }

      const nextTask = await createGenerationTask(
        {
          requestText,
          uploadedImageDataUrl: uploadedImage?.dataUrl,
          channels,
          scene,
          style,
          campaignInfo,
        },
        {
          ownerId: ownerId ?? undefined,
          sessionId: currentSession?.id,
        },
      );
      setTask(nextTask);
      persistTask(nextTask);
      setRequestText('');
      resetComposerState();
    } catch (generationError) {
      setError(generationError instanceof Error ? generationError.message : '生成失败');
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
      setModifyingResultId(null);
    } catch (generationError) {
      setError(generationError instanceof Error ? generationError.message : '重新生成失败');
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateSession() {
    if (!ownerId) return;
    const nextSession = await createRemoteSession(ownerId, { kind: 'free' });
    setCurrentFreeRemoteSessionId(nextSession.id);
    setCurrentSession(nextSession);
    setSessions((previous) => [nextSession, ...previous]);
    setTask(null);
    setRequestText('');
    setModifyingResultId(null);
    setError(null);
    resetComposerState();
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
    setSessions((previous) =>
      previous.map((item) => (item.id === session.id ? renamed : item)),
    );
    if (currentSession?.id === session.id) {
      setCurrentSession(renamed);
    }
  }

  async function handleDeleteSession(session: GenerationSession) {
    if (!ownerId || !window.confirm(`删除「${session.title}」？`)) return;
    setError(null);
    try {
      await deleteRemoteSession(ownerId, session.id);
      const remaining = sessions.filter((item) => item.id !== session.id);
      const nextSession =
        remaining[0] ?? (await createRemoteSession(ownerId, { kind: 'free' }));
      setSessions(remaining.length > 0 ? remaining : [nextSession]);
      if (currentSession?.id === session.id || remaining.length === 0) {
        restoreSession(nextSession);
      }
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : '删除会话失败');
    }
  }

  function cancelModification() {
    setModifyingResultId(null);
    setRequestText('');
  }

  const configItems = [
    {
      label: '发布渠道',
      value: channels.map((channel) => getOptionLabel(channelOptions, channel)).join('、'),
    },
    { label: '营销场景', value: getOptionLabel(sceneOptions, scene) },
    { label: '视觉风格', value: getOptionLabel(styleOptions, style) },
  ];

  return (
    <AppShell>
      <div className="min-h-[calc(100dvh-2.5rem)]">
        <header className="flex min-h-16 items-center gap-3 border-b border-line/80">
          <Link aria-label="返回首页" className="ui-icon-button" href="/">
            <ArrowLeft size={18} aria-hidden="true" />
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-semibold text-ink">图片营销</h1>
            <p className="truncate text-xs text-muted">
              {currentSession?.title ?? '一句话生成图文营销包'}
            </p>
          </div>
          <IconButton
            className="xl:hidden"
            label="打开会话菜单"
            onClick={() => setActiveSheet('menu')}
          >
            <Menu size={18} aria-hidden="true" />
          </IconButton>
        </header>

        <div className="grid min-h-[calc(100dvh-7rem)] gap-4 pb-44 pt-4 lg:grid-cols-[minmax(0,1fr)_360px] lg:pb-4 xl:grid-cols-[240px_minmax(0,1fr)_360px]">
          <nav
            aria-label="会话列表"
            className="hidden min-h-0 flex-col border-r border-line pr-4 xl:flex"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-accent">创作记录</p>
                <h2 className="mt-1 text-base font-semibold text-ink">会话列表</h2>
              </div>
              <IconButton label="新建聊天会话" onClick={handleCreateSession}>
                <Plus size={18} aria-hidden="true" />
              </IconButton>
            </div>
            <div className="mt-4 grid gap-2 overflow-y-auto">
              {sessions.map((session) => (
                <SessionRow
                  current={currentSession?.id === session.id}
                  key={session.id}
                  onDelete={() => void handleDeleteSession(session)}
                  onRename={() => void handleRenameSession(session)}
                  onSelect={() => handleSelectSession(session)}
                  session={session}
                />
              ))}
              {sessions.length === 0 ? (
                <p className="text-sm text-muted">正在读取会话...</p>
              ) : null}
            </div>
          </nav>

          <section
            aria-label="生成结果"
            className="min-w-0 rounded-lg border border-line/80 bg-white/55 p-3 sm:p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold text-accent">生成画布</p>
                <h2 className="mt-1 text-lg font-semibold text-ink">营销方案</h2>
              </div>
              <Button
                className="lg:hidden"
                onClick={() => setActiveSheet('config')}
                size="sm"
                variant="secondary"
              >
                <SlidersHorizontal size={16} aria-hidden="true" />
                配置
              </Button>
            </div>

            <div className="mt-4 grid gap-3">
              <Feedback tone="info">
                可直接输入需求，也可以上传商品图以保持商品主体一致。
              </Feedback>
              {loading ? <Feedback tone="info">正在生成 3 套图片营销方案...</Feedback> : null}
              {error ? <Feedback tone="error">{error}</Feedback> : null}

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
                      {historyTask.request.requestText || '生成图片营销方案'}
                    </div>
                    <div className="grid gap-3 2xl:grid-cols-2">
                      {historyTask.results.map((result) => (
                        <ResultCard
                          key={result.id}
                          onModify={(resultId) => {
                            setTask(historyTask);
                            setModifyingResultId(resultId);
                            setRequestText('');
                          }}
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
                <div className="grid min-h-[320px] place-items-center border-t border-line text-center">
                  <div className="max-w-sm">
                    <p className="text-lg font-semibold text-ink">还没有生成结果</p>
                    <p className="mt-2 text-sm leading-6 text-muted">
                      在右侧填写需求并发送，生成的图片与发布文案会显示在这里。
                    </p>
                  </div>
                </div>
              ) : null}
            </div>
          </section>

          {activeSheet === 'config' ? (
            <button
              aria-label="关闭生成配置遮罩"
              className="fixed inset-0 z-40 border-0 bg-black/35 backdrop-blur-[2px] lg:hidden"
              onClick={() => setActiveSheet(null)}
              tabIndex={-1}
              type="button"
            />
          ) : null}

          <aside
            aria-label="生成配置"
            className="min-w-0 lg:sticky lg:top-4 lg:self-start"
          >
            <div
              ref={configPanelRef}
              aria-label="生成配置"
              aria-modal={activeSheet === 'config' ? 'true' : undefined}
              className={
                activeSheet === 'config'
                  ? 'fixed inset-x-0 bottom-0 z-50 max-h-[92dvh] overflow-y-auto rounded-t-2xl border border-line bg-[#fbfbfa] p-4 shadow-[-10px_-18px_45px_rgba(22,31,41,0.16)] lg:static lg:max-h-none lg:rounded-none lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none'
                  : 'hidden lg:block'
              }
              onKeyDown={trapConfigFocus}
              role={activeSheet === 'config' ? 'dialog' : undefined}
            >
              <div className="mb-4 flex items-center justify-between lg:hidden">
                <h2 className="text-lg font-semibold text-ink">生成配置</h2>
                <IconButton
                  ref={configCloseRef}
                  label="关闭生成配置"
                  onClick={() => setActiveSheet(null)}
                >
                  <X size={18} aria-hidden="true" />
                </IconButton>
              </div>

              <SurfaceCard className="grid gap-5">
                <section>
                  <h2 className="text-base font-semibold text-ink">商品图片</h2>
                  <p className="mt-1 text-xs leading-5 text-muted">
                    10 MB 以下保持原图，超出时自动压缩；支持 HEIC/HEIF 无感转换。
                  </p>
                  <div className="mt-3">
                    <ImageUploader
                      image={uploadedImage}
                      onChange={handleUploadedImageChange}
                      onProcessingChange={setImageProcessing}
                    />
                  </div>
                </section>

                <ConfigSummary
                  items={configItems}
                  onEdit={() => setActiveSheet('channel')}
                />

                <div className="grid grid-cols-3 gap-2">
                  <Button
                    onClick={() => setActiveSheet('channel')}
                    size="sm"
                    variant="secondary"
                  >
                    渠道
                  </Button>
                  <Button
                    onClick={() => setActiveSheet('scene')}
                    size="sm"
                    variant="secondary"
                  >
                    场景
                  </Button>
                  <Button
                    onClick={() => setActiveSheet('style')}
                    size="sm"
                    variant="secondary"
                  >
                    风格
                  </Button>
                </div>

                <section>
                  <h2 className="text-base font-semibold text-ink">活动信息</h2>
                  <p className="mt-1 text-xs leading-5 text-muted">
                    可选填写，帮助模型生成更完整的图片文字。
                  </p>
                  <div className="mt-3">
                    <ActivityInfoForm
                      idPrefix="desktop-campaign"
                      value={campaignInfo}
                      onChange={setCampaignInfo}
                    />
                  </div>
                </section>
              </SurfaceCard>
            </div>

            <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-canvas/95 px-4 pb-[max(8px,env(safe-area-inset-bottom))] pt-3 backdrop-blur lg:static lg:mx-0 lg:mt-4 lg:border-0 lg:bg-transparent lg:px-0 lg:pb-0 lg:backdrop-blur-0">
              <div className="lg:hidden">
                <QuickActionBar
                  onOpen={setActiveSheet}
                  uploadedImageDataUrl={uploadedImage?.dataUrl}
                />
              </div>
              {modifyingResultId ? (
                <div className="mb-2">
                  <Feedback tone="info">
                    <span className="flex flex-wrap items-center justify-between gap-2">
                      正在二次修改当前方案。
                      <button
                        className="font-semibold text-accent"
                        onClick={cancelModification}
                        type="button"
                      >
                        取消二次修改
                      </button>
                    </span>
                  </Feedback>
                </div>
              ) : null}
              {imageProcessing ? (
                <div className="mb-2">
                  <Feedback tone="info">正在处理图片，请稍候...</Feedback>
                </div>
              ) : null}
              {ownerId && currentSession ? (
                <ChatComposer
                  loading={loading || imageProcessing}
                  onChange={setRequestText}
                  onSubmit={handleSubmit}
                  value={requestText}
                />
              ) : (
                <Feedback tone="info">正在读取会话...</Feedback>
              )}
            </div>
          </aside>
        </div>
      </div>

      <BottomSheet
        onClose={() => setActiveSheet(null)}
        open={activeSheet === 'upload'}
        title="上传图片"
      >
        <ImageUploader
          image={uploadedImage}
          onChange={handleUploadedImageChange}
          onProcessingChange={setImageProcessing}
        />
      </BottomSheet>

      <BottomSheet
        onClose={() => setActiveSheet(null)}
        open={activeSheet === 'channel'}
        title="发布渠道"
      >
        <OptionPicker
          multiple
          onChange={(value) => handleChannelsChange(value as Channel[])}
          options={channelOptions}
          value={channels}
        />
      </BottomSheet>

      <BottomSheet
        onClose={() => setActiveSheet(null)}
        open={activeSheet === 'scene'}
        title="营销场景"
      >
        <OptionPicker
          onChange={(value) => handleSceneChange(value as MarketingScene)}
          options={sceneOptions}
          value={scene}
        />
      </BottomSheet>

      <BottomSheet
        onClose={() => setActiveSheet(null)}
        open={activeSheet === 'style'}
        title="风格模板"
      >
        <OptionPicker
          onChange={(value) => handleStyleChange(value as StyleTemplate)}
          options={styleOptions}
          value={style}
        />
      </BottomSheet>

      <BottomSheet
        onClose={() => setActiveSheet(null)}
        open={activeSheet === 'info'}
        title="活动信息"
      >
        <ActivityInfoForm
          idPrefix="mobile-campaign"
          value={campaignInfo}
          onChange={setCampaignInfo}
        />
      </BottomSheet>

      <BottomSheet
        onClose={() => setActiveSheet(null)}
        open={activeSheet === 'menu'}
        title="会话菜单"
      >
        <div className="grid gap-4">
          <Button fullWidth onClick={handleCreateSession}>
            <Plus size={17} aria-hidden="true" />
            新建聊天会话
          </Button>
          <div className="grid gap-2">
            {sessions.map((session) => (
              <SessionRow
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

function SessionRow({
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

function getSessionSummary(session: GenerationSession) {
  const activeTask = getActiveTask(session);
  return activeTask?.request.requestText ?? '暂无生成内容';
}

function getOptionLabel<T extends string>(
  options: Array<{ value: T; label: string }>,
  value: T,
) {
  return options.find((option) => option.value === value)?.label ?? value;
}

function getFilledCampaignFields(campaignInfo: CampaignInfo) {
  return Object.entries(campaignInfo)
    .filter(([, value]) => Boolean(value))
    .map(([key]) => key);
}

function formatSessionTime(value: string) {
  return new Date(value).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}
