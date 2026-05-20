'use client';

import { Copy, Download, RotateCcw, Wand2 } from 'lucide-react';
import { useRef, useState } from 'react';
import type { GenerationResult } from '@/features/generation/generation-types';
import { downloadNodeAsPng } from '@/lib/download';
import { PosterPreview } from './PosterPreview';

type ResultCardProps = {
  result: GenerationResult;
  onRegenerate: () => void;
  onModify: (resultId: string) => void;
};

export function ResultCard({ result, onRegenerate, onModify }: ResultCardProps) {
  const posterRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(result.publishingCopy);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
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
          {copied ? '已复制' : '复制文案'}
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
    </article>
  );
}
