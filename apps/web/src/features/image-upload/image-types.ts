export const MAX_FINAL_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_FINAL_IMAGE_EDGE = 4096;
export const MAX_FINAL_IMAGE_PIXELS = MAX_FINAL_IMAGE_EDGE * MAX_FINAL_IMAGE_EDGE;
export const MAX_HEIC_SOURCE_BYTES = 40 * 1024 * 1024;

export type FinalImageMime = 'image/jpeg' | 'image/png' | 'image/webp';
export type UploadImageMime = FinalImageMime | 'image/heic' | 'image/heif';
export type ImageProcessingMode =
  | 'original'
  | 'client-resized'
  | 'client-compressed'
  | 'client-heic-converted'
  | 'server-heic-converted';

export type ProcessedUploadImage = {
  dataUrl: string;
  mimeType: FinalImageMime;
  bytes: number;
  width: number;
  height: number;
  processing: ImageProcessingMode;
};

export type ImageProcessingErrorCode =
  | 'IMAGE_INVALID'
  | 'IMAGE_UNSUPPORTED_FORMAT'
  | 'IMAGE_INPUT_TOO_LARGE'
  | 'IMAGE_DIMENSIONS_TOO_LARGE'
  | 'IMAGE_PROCESSING_FAILED'
  | 'IMAGE_OUTPUT_TOO_LARGE'
  | 'IMAGE_PROCESSING_UNAVAILABLE';
