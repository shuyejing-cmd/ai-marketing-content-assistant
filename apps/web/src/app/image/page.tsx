'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { ActivityInfoForm } from '@/components/ActivityInfoForm';
import { AppShell } from '@/components/AppShell';
import { BottomSheet } from '@/components/BottomSheet';
import { ChatComposer } from '@/components/ChatComposer';
import { ImageUploader } from '@/components/ImageUploader';
import { OptionPicker } from '@/components/OptionPicker';
import { QuickActionBar } from '@/components/QuickActionBar';
import {
  channelOptions,
  sceneOptions,
  styleOptions,
} from '@/features/generation/generation-options';
import { createGenerationTask } from '@/features/generation/generation-client';
import type {
  CampaignInfo,
  Channel,
  GenerationTask,
  MarketingScene,
  StyleTemplate,
} from '@/features/generation/generation-types';

type SheetKey = 'upload' | 'channel' | 'scene' | 'style' | 'info' | null;

export default function ImagePage() {
  const [activeSheet, setActiveSheet] = useState<SheetKey>(null);
  const [requestText, setRequestText] = useState('');
  const [uploadedImageDataUrl, setUploadedImageDataUrl] = useState<string | undefined>();
  const [channels, setChannels] = useState<Channel[]>(['wechat']);
  const [scene, setScene] = useState<MarketingScene>('new_product');
  const [style, setStyle] = useState<StyleTemplate>('young_trendy');
  const [campaignInfo, setCampaignInfo] = useState<CampaignInfo>({});
  const [task, setTask] = useState<GenerationTask | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    setLoading(true);
    setError(null);
    try {
      const nextTask = await createGenerationTask({
        requestText,
        uploadedImageDataUrl,
        channels,
        scene,
        style,
        campaignInfo,
      });
      setTask(nextTask);
      setRequestText('');
    } catch (generationError) {
      setError(generationError instanceof Error ? generationError.message : '生成失败');
    } finally {
      setLoading(false);
    }
  }

  return (
    <AppShell>
      <div className="flex min-h-dvh flex-col pb-4">
        <header className="flex items-center gap-3 pt-1">
          <Link href="/" className="grid h-9 w-9 place-items-center rounded-full border border-line bg-surface">
            <ArrowLeft size={18} aria-hidden="true" />
          </Link>
          <div>
            <h1 className="text-[22px] font-semibold text-ink">图片营销</h1>
            <p className="text-[13px] text-muted">一句话生成图文营销包</p>
          </div>
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
            <div className="rounded-lg border border-line bg-surface p-3">
              <p className="text-[15px] font-semibold text-ink">已生成 {task.results.length} 套方案</p>
              <div className="mt-2 grid gap-2">
                {task.results.map((result) => (
                  <div key={result.id} className="rounded-lg bg-canvas p-3 text-[14px] text-ink">
                    {result.title}
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </section>

        <footer className="sticky bottom-0 -mx-4 bg-canvas px-4 pb-2 pt-3">
          <QuickActionBar onOpen={setActiveSheet} />
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
    </AppShell>
  );
}
