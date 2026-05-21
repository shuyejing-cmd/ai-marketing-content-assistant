'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
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
import {
  createGenerationTask,
  modifyTask,
  regenerateTask,
} from '@/features/generation/generation-client';
import type {
  CampaignInfo,
  Channel,
  GenerationTask,
  MarketingScene,
  StyleTemplate,
} from '@/features/generation/generation-types';
import {
  createEmptySession,
  getActiveTask,
  getCurrentSessionId,
  loadSessions,
  saveTaskToCurrentSession,
  setCurrentSessionId,
  type GenerationSession,
} from '@/features/generation/local-sessions';

type SheetKey = 'upload' | 'channel' | 'scene' | 'style' | 'info' | 'menu' | null;

const defaultChannels: Channel[] = ['wechat'];
const defaultScene: MarketingScene = 'new_product';
const defaultStyle: StyleTemplate = 'young_trendy';

export default function ImagePage() {
  const [activeSheet, setActiveSheet] = useState<SheetKey>(null);
  const [requestText, setRequestText] = useState('');
  const [uploadedImageDataUrl, setUploadedImageDataUrl] = useState<string | undefined>();
  const [channels, setChannels] = useState<Channel[]>(defaultChannels);
  const [scene, setScene] = useState<MarketingScene>(defaultScene);
  const [style, setStyle] = useState<StyleTemplate>(defaultStyle);
  const [campaignInfo, setCampaignInfo] = useState<CampaignInfo>({});
  const [task, setTask] = useState<GenerationTask | null>(null);
  const [sessions, setSessions] = useState<GenerationSession[]>([]);
  const [currentSession, setCurrentSession] = useState<GenerationSession | null>(null);
  const [modifyingResultId, setModifyingResultId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const storedSessions = loadSessions();
    const storedCurrentSessionId = getCurrentSessionId();
    const restoredSession =
      storedSessions.find((session) => session.id === storedCurrentSessionId) ??
      storedSessions[0] ??
      createEmptySession();

    restoreSession(restoredSession);
    setSessions(loadSessions());
  }, []);

  function restoreSession(session: GenerationSession) {
    setCurrentSessionId(session.id);
    setCurrentSession(session);
    setModifyingResultId(null);
    setRequestText('');

    const activeTask = getActiveTask(session);
    setTask(activeTask);

    if (activeTask) {
      setUploadedImageDataUrl(activeTask.request.uploadedImageDataUrl);
      setChannels(activeTask.request.channels.length > 0 ? activeTask.request.channels : defaultChannels);
      setScene(activeTask.request.scene);
      setStyle(activeTask.request.style);
      setCampaignInfo(activeTask.request.campaignInfo);
      return;
    }

    resetComposerState();
  }

  function resetComposerState() {
    setUploadedImageDataUrl(undefined);
    setChannels(defaultChannels);
    setScene(defaultScene);
    setStyle(defaultStyle);
    setCampaignInfo({});
  }

  function persistTask(nextTask: GenerationTask) {
    const updatedSession = saveTaskToCurrentSession(nextTask);
    setCurrentSession(updatedSession);
    setSessions(loadSessions());
  }

  async function handleSubmit() {
    setLoading(true);
    setError(null);
    try {
      if (task && modifyingResultId) {
        const modifiedTask = await modifyTask(task.id, modifyingResultId, requestText);
        setTask(modifiedTask);
        persistTask(modifiedTask);
        setModifyingResultId(null);
        setRequestText('');
        return;
      }

      const nextTask = await createGenerationTask({
        requestText,
        uploadedImageDataUrl,
        channels,
        scene,
        style,
        campaignInfo,
      });
      setTask(nextTask);
      persistTask(nextTask);
      setRequestText('');
    } catch (generationError) {
      setError(generationError instanceof Error ? generationError.message : '生成失败');
    } finally {
      setLoading(false);
    }
  }

  async function handleRegenerate() {
    if (!task) return;
    setLoading(true);
    setError(null);
    try {
      const nextTask = await regenerateTask(task.id);
      setTask(nextTask);
      persistTask(nextTask);
      setModifyingResultId(null);
    } catch (generationError) {
      setError(generationError instanceof Error ? generationError.message : '重新生成失败');
    } finally {
      setLoading(false);
    }
  }

  function handleCreateSession() {
    const nextSession = createEmptySession();
    setCurrentSession(nextSession);
    setSessions(loadSessions());
    setTask(null);
    setRequestText('');
    setModifyingResultId(null);
    setError(null);
    resetComposerState();
    setActiveSheet(null);
  }

  function handleSelectSession(session: GenerationSession) {
    restoreSession(session);
    setSessions(loadSessions());
    setActiveSheet(null);
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

          {task ? (
            <div className="grid gap-3">
              {task.results.map((result) => (
                <ResultCard
                  key={result.id}
                  result={result}
                  onRegenerate={handleRegenerate}
                  onModify={(resultId) => {
                    setModifyingResultId(resultId);
                    setRequestText('');
                  }}
                />
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
          <QuickActionBar onOpen={setActiveSheet} uploadedImageDataUrl={uploadedImageDataUrl} />
          <ChatComposer
            value={requestText}
            loading={loading}
            onChange={setRequestText}
            onSubmit={handleSubmit}
          />
        </footer>
      </div>

      <BottomSheet title="上传图片" open={activeSheet === 'upload'} onClose={() => setActiveSheet(null)}>
        <ImageUploader imageDataUrl={uploadedImageDataUrl} onChange={setUploadedImageDataUrl} />
      </BottomSheet>

      <BottomSheet title="发布渠道" open={activeSheet === 'channel'} onClose={() => setActiveSheet(null)}>
        <OptionPicker multiple value={channels} options={channelOptions} onChange={(value) => setChannels(value as Channel[])} />
      </BottomSheet>

      <BottomSheet title="营销场景" open={activeSheet === 'scene'} onClose={() => setActiveSheet(null)}>
        <OptionPicker value={scene} options={sceneOptions} onChange={(value) => setScene(value as MarketingScene)} />
      </BottomSheet>

      <BottomSheet title="风格模板" open={activeSheet === 'style'} onClose={() => setActiveSheet(null)}>
        <OptionPicker value={style} options={styleOptions} onChange={(value) => setStyle(value as StyleTemplate)} />
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
                    <span className="block text-[14px] font-semibold leading-5 text-ink">{session.title}</span>
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

function getSessionSummary(session: GenerationSession) {
  const activeTask = getActiveTask(session);
  return activeTask?.request.requestText ?? '暂无生成内容';
}

function formatSessionTime(value: string) {
  return new Date(value).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}
