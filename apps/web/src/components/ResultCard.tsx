'use client';

import { Copy, Download, RotateCcw, Wand2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { GenerationResult } from '@/features/generation/generation-types';
import { downloadResultAsPng } from '@/lib/download';
import { PosterPreview } from './PosterPreview';
import { Button } from '@/components/ui/Button';
import { Feedback } from '@/components/ui/Primitives';

type CopyState = 'idle' | 'copied' | 'failed';
type DownloadState = 'idle' | 'downloading' | 'failed';

type ResultCardProps = {
  result: GenerationResult;
  onRegenerate: () => void;
  onModify?: (resultId: string) => void;
  modifyDisabled?: boolean;
  modifyLabel?: string;
};

export function ResultCard({ result, onRegenerate, onModify, modifyDisabled, modifyLabel }: ResultCardProps) {
  const [copyState, setCopyState] = useState<CopyState>('idle');
  const [downloadState, setDownloadState] = useState<DownloadState>('idle');
  const copyResetTimerRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (copyResetTimerRef.current !== null) {
        window.clearTimeout(copyResetTimerRef.current);
      }
    },
    [],
  );

  async function handleCopy() {
    const copied = await copyText(result.publishingCopy);
    setCopyState(copied ? 'copied' : 'failed');
    if (copyResetTimerRef.current !== null) {
      window.clearTimeout(copyResetTimerRef.current);
    }
    copyResetTimerRef.current = window.setTimeout(() => {
      setCopyState('idle');
      copyResetTimerRef.current = null;
    }, 1600);
  }

  async function handleDownload() {
    setDownloadState('downloading');
    try {
      await downloadResultAsPng(result, `${result.id}.png`);
      setDownloadState('idle');
    } catch {
      setDownloadState('failed');
    }
  }

  return (
    <article className="rounded-lg border border-line bg-white p-3 shadow-soft sm:p-4">
      <PosterPreview result={result} />

      <div className="mt-3">
        <p className="text-[17px] font-semibold leading-6 text-ink">{result.title}</p>
        <p className="mt-2 whitespace-pre-line text-[14px] leading-6 text-muted">
          {result.publishingCopy}
        </p>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button
          onClick={handleCopy}
          size="sm"
          variant="secondary"
        >
          <Copy size={15} aria-hidden="true" />
          {copyState === 'copied' ? '已复制' : '复制文案'}
        </Button>
        <Button
          onClick={handleDownload}
          disabled={downloadState === 'downloading'}
          size="sm"
          variant="secondary"
        >
          <Download size={15} aria-hidden="true" />
          {downloadState === 'downloading' ? '正在下载' : '下载图片'}
        </Button>
        <Button
          onClick={onRegenerate}
          size="sm"
          variant="secondary"
        >
          <RotateCcw size={15} aria-hidden="true" />
          重新生成
        </Button>
        <Button
          onClick={() => onModify?.(result.id)}
          disabled={modifyDisabled || !onModify}
          size="sm"
        >
          <Wand2 size={15} aria-hidden="true" />
          {modifyLabel ?? '二次修改'}
        </Button>
      </div>

      {copyState === 'failed' ? (
        <Feedback className="mt-2" tone="error">复制失败，请长按文案手动复制</Feedback>
      ) : null}
      {downloadState === 'failed' ? (
        <Feedback className="mt-2" tone="error">下载失败，请稍后重试</Feedback>
      ) : null}
    </article>
  );
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return fallbackCopyText(text);
  }
}

function fallbackCopyText(text: string) {
  const textArea = document.createElement('textarea');
  textArea.value = text;
  textArea.setAttribute('readonly', '');
  textArea.style.position = 'fixed';
  textArea.style.left = '-9999px';
  textArea.style.top = '0';
  document.body.appendChild(textArea);
  textArea.focus();
  textArea.select();

  try {
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    document.body.removeChild(textArea);
  }
}
