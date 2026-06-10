import type { FinalImageMime } from './image-types';

export type BrowserImageEncodeOptions = {
  width: number;
  height: number;
  mimeType: FinalImageMime;
  quality: number;
};

export type BrowserImageSession = {
  width: number;
  height: number;
  encode(options: BrowserImageEncodeOptions): Promise<Blob>;
  close(): void;
};

export type BrowserImageCodec = {
  open(file: Blob): Promise<BrowserImageSession>;
  toDataUrl(file: Blob, mimeType: FinalImageMime): Promise<string>;
};

export const browserImageCodec: BrowserImageCodec = {
  async open(file) {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });

    return {
      width: bitmap.width,
      height: bitmap.height,
      async encode(options) {
        const canvas = document.createElement('canvas');
        canvas.width = options.width;
        canvas.height = options.height;

        const context = canvas.getContext('2d');
        if (!context) {
          throw new Error('2D canvas unavailable');
        }
        context.drawImage(bitmap, 0, 0, options.width, options.height);

        return await new Promise<Blob>((resolve, reject) => {
          canvas.toBlob(
            (encoded) => {
              if (encoded) {
                resolve(encoded);
              } else {
                reject(new Error('Image encoding failed'));
              }
            },
            options.mimeType,
            options.mimeType === 'image/png' ? undefined : options.quality,
          );
        });
      },
      close() {
        bitmap.close();
      },
    };
  },

  async toDataUrl(file, mimeType) {
    const typedFile = file.type === mimeType ? file : new Blob([file], { type: mimeType });

    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error ?? new Error('FileReader failed'));
      reader.readAsDataURL(typedFile);
    });
  },
};
