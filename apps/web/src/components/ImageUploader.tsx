'use client';

import React, { useEffect, useRef, useState } from 'react';
import { processUploadImage } from '@/features/image-upload/image-processing-client';
import type { ProcessedUploadImage } from '@/features/image-upload/image-types';

type ImageUploaderProps = {
  image?: ProcessedUploadImage;
  onChange: (image?: ProcessedUploadImage) => void;
  onProcessingChange?: (processing: boolean) => void;
};

type UploadStatus = 'idle' | 'processing' | 'ready' | 'error';

const ACCEPTED_IMAGES =
  'image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif';

export function ImageUploader({
  image,
  onChange,
  onProcessingChange,
}: ImageUploaderProps): React.ReactElement {
  const previewDataUrl = image?.dataUrl;
  const [status, setStatus] = useState<UploadStatus>(previewDataUrl ? 'ready' : 'idle');
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const onProcessingChangeRef = useRef(onProcessingChange);

  useEffect(() => {
    onProcessingChangeRef.current = onProcessingChange;
  }, [onProcessingChange]);

  useEffect(() => {
    setStatus(previewDataUrl ? 'ready' : 'idle');
    setError(null);
  }, [previewDataUrl]);

  useEffect(
    () => () => {
      requestIdRef.current += 1;
      abortRef.current?.abort();
      onProcessingChangeRef.current?.(false);
    },
    [],
  );

  async function handleFile(file: File) {
    const requestId = ++requestIdRef.current;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setStatus('processing');
    setError(null);
    onProcessingChange?.(true);

    try {
      const nextImage = await processUploadImage(file, undefined, controller.signal);
      if (controller.signal.aborted || requestId !== requestIdRef.current) return;
      onChange(nextImage);
      setStatus('ready');
    } catch (processingError) {
      if (controller.signal.aborted || requestId !== requestIdRef.current) return;
      setStatus('error');
      setError(
        processingError instanceof Error
          ? processingError.message
          : '图片处理失败，请重新选择一张图片',
      );
    } finally {
      if (requestId === requestIdRef.current) {
        abortRef.current = null;
        onProcessingChange?.(false);
      }
    }
  }

  function removeImage() {
    requestIdRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
    setError(null);
    setStatus('idle');
    onProcessingChange?.(false);
    onChange(undefined);
  }

  const processing = status === 'processing';

  return (
    <div className="grid gap-3">
      {status === 'processing' ? (
        <div
          role="status"
          aria-live="polite"
          className="rounded-lg border border-line bg-canvas p-2 text-[13px] font-medium text-muted"
        >
          正在处理图片
        </div>
      ) : null}

      {status === 'error' && error ? (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 p-2 text-[13px] font-medium text-red-700"
        >
          {error}
        </div>
      ) : null}

      {status === 'ready' && previewDataUrl ? (
        <div
          role="status"
          aria-live="polite"
          className="rounded-lg border border-accent bg-white p-2 text-[13px] font-medium text-accent"
        >
          上传成功
        </div>
      ) : null}

      {previewDataUrl ? (
        <img
          src={previewDataUrl}
          alt="已上传图片预览"
          className="aspect-[4/3] w-full rounded-lg bg-canvas object-contain"
        />
      ) : (
        <div className="grid aspect-[4/3] place-items-center rounded-lg border border-dashed border-line bg-canvas px-4 text-center text-sm leading-6 text-muted">
          商品图可选，上传后会优先保持商品一致性
        </div>
      )}

      <label className="grid gap-1 text-sm text-muted">
        <span>选择商品图片</span>
        <input
          type="file"
          accept={ACCEPTED_IMAGES}
          disabled={processing}
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (file) void handleFile(file);
          }}
        />
      </label>

      {previewDataUrl ? (
        <button
          type="button"
          disabled={processing}
          onClick={removeImage}
          className="rounded-lg border border-line py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
        >
          移除图片
        </button>
      ) : null}
    </div>
  );
}
