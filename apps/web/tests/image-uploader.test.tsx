// @vitest-environment jsdom

import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React, { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ImageUploader } from '../src/components/ImageUploader';
import { processUploadImage } from '../src/features/image-upload/image-processing-client';
import type { ProcessedUploadImage } from '../src/features/image-upload/image-types';

vi.mock('../src/features/image-upload/image-processing-client', () => ({
  processUploadImage: vi.fn(),
}));

const processImage = vi.mocked(processUploadImage);
vi.stubGlobal('React', React);

const readyImage: ProcessedUploadImage = {
  dataUrl: 'data:image/png;base64,cmVhZHk=',
  mimeType: 'image/png',
  bytes: 5,
  width: 1,
  height: 1,
  processing: 'original',
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('ImageUploader', () => {
  it('declares the supported image MIME types and extensions', () => {
    render(<ImageUploader onChange={vi.fn()} />);

    expect(screen.getByLabelText('选择商品图片').getAttribute('accept')).toBe(
      'image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif',
    );
  });

  it('shows processing state and disables selection and removal', async () => {
    const pending = deferred<ProcessedUploadImage>();
    processImage.mockReturnValueOnce(pending.promise);
    const onProcessingChange = vi.fn();
    const user = userEvent.setup();

    render(
      <ImageUploader
        image={readyImage}
        onChange={vi.fn()}
        onProcessingChange={onProcessingChange}
      />,
    );

    await user.upload(screen.getByLabelText('选择商品图片'), imageFile('next.png'));

    expect(screen.getByRole('status').textContent).toContain('正在处理图片');
    expect((screen.getByLabelText('选择商品图片') as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: '移除图片' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect(onProcessingChange).toHaveBeenCalledWith(true);
  });

  it('reports success, previews with object-contain, and returns the processed image', async () => {
    processImage.mockResolvedValueOnce(readyImage);
    const onChange = vi.fn();
    const user = userEvent.setup();

    render(<ControlledUploader onChange={onChange} />);
    await user.upload(screen.getByLabelText('选择商品图片'), imageFile('ready.png'));

    expect(await screen.findByText('上传成功')).toBeTruthy();
    expect(onChange).toHaveBeenCalledWith(readyImage);
    expect(screen.getByRole('img', { name: '已上传图片预览' }).className).toContain(
      'object-contain',
    );
  });

  it('shows a Chinese processing error without changing the image', async () => {
    processImage.mockRejectedValueOnce(new Error('图片处理失败，请重新选择一张图片'));
    const onChange = vi.fn();
    const user = userEvent.setup();

    render(<ImageUploader onChange={onChange} />);
    await user.upload(screen.getByLabelText('选择商品图片'), imageFile('broken.png'));

    expect((await screen.findByRole('alert')).textContent).toContain(
      '图片处理失败，请重新选择一张图片',
    );
    expect(onChange).not.toHaveBeenCalled();
    expect((screen.getByLabelText('选择商品图片') as HTMLInputElement).disabled).toBe(false);
  });

  it('aborts A and prevents its late result from replacing B', async () => {
    const first = deferred<ProcessedUploadImage>();
    const second = deferred<ProcessedUploadImage>();
    const imageB = { ...readyImage, dataUrl: 'data:image/png;base64,Yg==' };
    processImage.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const onChange = vi.fn();

    render(<ControlledUploader onChange={onChange} />);
    const input = screen.getByLabelText('选择商品图片') as HTMLInputElement;

    await act(async () => {
      setFiles(input, [imageFile('a.png')]);
      input.dispatchEvent(new Event('change', { bubbles: true }));
      setFiles(input, [imageFile('b.png')]);
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });

    expect(processImage).toHaveBeenCalledTimes(2);
    const firstSignal = processImage.mock.calls[0][2];
    expect(firstSignal?.aborted).toBe(true);

    second.resolve(imageB);
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(imageB));

    first.resolve(readyImage);
    await act(async () => {
      await first.promise;
    });

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('img', { name: '已上传图片预览' }).getAttribute('src')).toBe(
      imageB.dataUrl,
    );
  });

  it('aborts the current processing request when unmounted', async () => {
    const pending = deferred<ProcessedUploadImage>();
    processImage.mockReturnValueOnce(pending.promise);
    const onProcessingChange = vi.fn();
    const user = userEvent.setup();
    const view = render(
      <ImageUploader onChange={vi.fn()} onProcessingChange={onProcessingChange} />,
    );

    await user.upload(screen.getByLabelText('选择商品图片'), imageFile('pending.png'));
    const signal = processImage.mock.calls[0][2];

    view.unmount();

    expect(signal?.aborted).toBe(true);
    expect(onProcessingChange).toHaveBeenLastCalledWith(false);
  });
});

function ControlledUploader({ onChange }: { onChange: (image?: ProcessedUploadImage) => void }) {
  const [image, setImage] = useState<ProcessedUploadImage>();
  return (
    <ImageUploader
      image={image}
      onChange={(nextImage) => {
        setImage(nextImage);
        onChange(nextImage);
      }}
    />
  );
}

function imageFile(name: string) {
  return new File(['image'], name, { type: 'image/png' });
}

function setFiles(input: HTMLInputElement, files: File[]) {
  Object.defineProperty(input, 'files', {
    configurable: true,
    value: files,
  });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}
