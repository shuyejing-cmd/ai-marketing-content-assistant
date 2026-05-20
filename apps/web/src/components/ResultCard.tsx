'use client';

import { Copy, Download, RotateCcw, Wand2 } from 'lucide-react';
import { useRef, useState } from 'react';
import type { GenerationResult } from '@/features/generation/generation-types';
import { downloadNodeAsPng } from '@/lib/download';
import { PosterPreview } from './PosterPreview';

type CopyState = 'idle' | 'copied' | 'failed';

type ResultCardProps = {
  result: GenerationResult;
  onRegenerate: () => void;
  onModify: (resultId: string) => void;
};

export function ResultCard({ result, onRegenerate, onModify }: ResultCardProps) {
  const posterRef = useRef<HTMLDivElement>(null);
  const [copyState, setCopyState] = useState<CopyState>('idle');

  async function handleCopy() {
    const copied = await copyText(result.publishingCopy);
    setCopyState(copied ? 'copied' : 'failed');
    window.setTimeout(() => setCopyState('idle'), 1600);
  }

  async function handleDownload() {
    if (!posterRef.current) return;
    await downloadNodeAsPng(posterRef.current, `${result.id}.png`);
  }

  return (
    <article className="rounded-lg border border-line bg-surface p-3 shadow-soft">
      <div ref={posterRef}>
        <PosterPreview result={result} />
      </div>

      <div className="mt-3">
        <p className="text-[17px] font-semibold leading-6 text-ink">{result.title}</p>
        <p className="mt-2 whitespace-pre-line text-[14px] leading-6 text-muted">
          {result.publishingCopy}
        </p>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={handleCopy}
          className="flex h-10 items-center justify-center gap-1 rounded-lg border border-line text-[13px] text-ink"
        >
          <Copy size={15} aria-hidden="true" />
          {copyState === 'copied' ? '已复制' : '复制文案'}
        </button>
        <button
          type="button"
          onClick={handleDownload}
          className="flex h-10 items-center justify-center gap-1 rounded-lg border border-line text-[13px] text-ink"
        >
          <Download size={15} aria-hidden="true" />
          下载图片
        </button>
        <button
          type="button"
          onClick={onRegenerate}
          className="flex h-10 items-center justify-center gap-1 rounded-lg border border-line text-[13px] text-ink"
        >
          <RotateCcw size={15} aria-hidden="true" />
          重新生成
        </button>
        <button
          type="button"
          onClick={() => onModify(result.id)}
          className="flex h-10 items-center justify-center gap-1 rounded-lg bg-accent text-[13px] text-white"
        >
          <Wand2 size={15} aria-hidden="true" />
          二次修改
        </button>
      </div>

      {copyState === 'failed' ? (
        <p className="mt-2 text-[12px] leading-5 text-warm">复制失败，请长按文案手动复制</p>
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
