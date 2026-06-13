'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Menu } from 'lucide-react';
import { ActivityInfoForm } from '@/components/ActivityInfoForm';
import { AppShell } from '@/components/AppShell';
import { BottomSheet } from '@/components/BottomSheet';
import { ChatComposer } from '@/components/ChatComposer';
import { ImageUploader } from '@/components/ImageUploader';
import { OptionPicker } from '@/components/OptionPicker';
import { QuickActionBar } from '@/components/QuickActionBar';
import { ResultCard } from '@/components/ResultCard';
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

type SheetKey = 'upload' | 'channel' | 'scene' | 'style' | 'info' | 'menu' | null;

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

  useEffect(() => {
    void initializeSessions();
  }, []);

  useEffect(() => {
    if (!loading) {
      latestResultRef.current?.scrollIntoView({ block: 'end' });
    }
  }, [currentSession?.tasks.length, loading]);

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

      const nextTask = await createGenerationTask({
        requestText,
        uploadedImageDataUrl: uploadedImage?.dataUrl,
        channels,
        scene,
        style,
        campaignInfo,
      }, {
        ownerId: ownerId ?? undefined,
        sessionId: currentSession?.id,
      });
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
    setSessions((previous) => previous.map((item) => (item.id === session.id ? renamed : item)));
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
      const nextSession = remaining[0] ?? (await createRemoteSession(ownerId, { kind: 'free' }));
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

  return (
    <AppShell>
      <div className="flex min-h-dvh flex-col pb-4">
        <header className="flex items-center gap-3 pt-1">
          <Link href="/" className="grid h-9 w-9 place-items-center rounded-full border border-line bg-surface">
            <ArrowLeft size={18} aria-hidden="true" />
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="text-[22px] font-semibold text-ink">图片营销</h1>
            <p className="truncate text-[13px] text-muted">{currentSession?.title ?? '一句话生成图文营销包'}</p>
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
          <div className="rounded-lg border border-line bg-surface p-3 text-[14px] leading-6 text-muted">
            你可以先上传商品图，也可以直接输入需求。商品图可选，上传后默认保持商品一致性。
          </div>

          {loading ? (
            <div className="rounded-lg border border-line bg-surface p-4 text-[15px] text-ink">
              正在生成 3 套图片营销方案...
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
                    {historyTask.request.requestText || '生成图片营销方案'}
                  </div>
                  {historyTask.results.map((result) => (
                    <ResultCard
                      key={result.id}
                      result={result}
                      onRegenerate={() => {
                        setTask(historyTask);
                        void handleRegenerate(historyTask);
                      }}
                      onModify={(resultId) => {
                        setTask(historyTask);
                        setModifyingResultId(resultId);
                        setRequestText('');
                      }}
                    />
                  ))}
                </div>
              ))}
            </div>
          ) : null}
        </section>

        <footer className="sticky bottom-0 -mx-4 bg-canvas px-4 pb-2 pt-3">
          {modifyingResultId ? (
            <div className="mb-2 flex items-center justify-between gap-2 rounded-lg border border-accent bg-white px-3 py-2">
              <p className="text-[13px] leading-5 text-accent">
                正在二次修改当前方案，输入你想改的地方。
              </p>
              <button
                type="button"
                onClick={cancelModification}
                className="shrink-0 rounded-full border border-accent px-3 py-1 text-[12px] text-accent"
              >
                取消二次修改
              </button>
            </div>
          ) : null}
          {ownerId && currentSession ? (
            <>
              <QuickActionBar
                onOpen={setActiveSheet}
                uploadedImageDataUrl={uploadedImage?.dataUrl}
              />
              {imageProcessing ? (
                <p role="status" className="pb-2 text-[13px] text-muted">
                  正在处理图片，请稍候...
                </p>
              ) : null}
              <ChatComposer
                value={requestText}
                loading={loading || imageProcessing}
                onChange={setRequestText}
                onSubmit={handleSubmit}
              />
            </>
          ) : (
            <div className="rounded-lg border border-line bg-surface p-3 text-[14px] text-muted">
              正在读取会话...
            </div>
          )}
        </footer>
      </div>

      <BottomSheet title="上传图片" open={activeSheet === 'upload'} onClose={() => setActiveSheet(null)}>
        <ImageUploader
          image={uploadedImage}
          onChange={handleUploadedImageChange}
          onProcessingChange={setImageProcessing}
        />
      </BottomSheet>

      <BottomSheet title="发布渠道" open={activeSheet === 'channel'} onClose={() => setActiveSheet(null)}>
        <OptionPicker multiple value={channels} options={channelOptions} onChange={(value) => handleChannelsChange(value as Channel[])} />
      </BottomSheet>

      <BottomSheet title="营销场景" open={activeSheet === 'scene'} onClose={() => setActiveSheet(null)}>
        <OptionPicker value={scene} options={sceneOptions} onChange={(value) => handleSceneChange(value as MarketingScene)} />
      </BottomSheet>

      <BottomSheet title="风格模板" open={activeSheet === 'style'} onClose={() => setActiveSheet(null)}>
        <OptionPicker value={style} options={styleOptions} onChange={(value) => handleStyleChange(value as StyleTemplate)} />
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
            新建聊天会话
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

function createSessionTitle(requestText: string) {
  const normalized = requestText.trim();
  return normalized.length > 0 ? normalized.slice(0, 18) : '新的图片会话';
}

function getSessionSummary(session: GenerationSession) {
  const activeTask = getActiveTask(session);
  return activeTask?.request.requestText ?? '暂无生成内容';
}

function getOptionLabel<T extends string>(options: Array<{ value: T; label: string }>, value: T) {
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
