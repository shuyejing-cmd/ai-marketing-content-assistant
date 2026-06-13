import {
  browserImageCodec,
  type BrowserImageCodec,
} from './browser-image-codec';
import { ImageProcessingError } from './image-errors';
import {
  MAX_FINAL_IMAGE_BYTES,
  MAX_FINAL_IMAGE_EDGE,
  type FinalImageMime,
  type ProcessedUploadImage,
} from './image-types';

const LOSSY_QUALITIES = [0.92, 0.86, 0.8, 0.72, 0.64, 0.56, 0.48] as const;
const MAX_SIZE_ROUNDS = 12;
const SIZE_REDUCTION = 0.9;
const MAX_PROCESSING_PIXELS = 40_000_000;

function processingFailure(cause: unknown): ImageProcessingError {
  return new ImageProcessingError('IMAGE_PROCESSING_FAILED', 400, { cause });
}

function assertEncodedMime(blob: Blob, mimeType: FinalImageMime): void {
  if (blob.type !== mimeType) {
    throw processingFailure(
      new Error(`Image codec returned ${blob.type}; expected ${mimeType}`),
    );
  }
}

async function toDataUrl(
  blob: Blob,
  mimeType: FinalImageMime,
  codec: BrowserImageCodec,
): Promise<string> {
  try {
    return await codec.toDataUrl(blob, mimeType);
  } catch (error) {
    if (error instanceof ImageProcessingError) {
      throw error;
    }
    throw processingFailure(error);
  }
}

function dimensionsAtScale(
  width: number,
  height: number,
  scale: number,
): { width: number; height: number } {
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

export async function processBrowserImage(
  file: Blob,
  mimeType: FinalImageMime,
  codec: BrowserImageCodec = browserImageCodec,
): Promise<ProcessedUploadImage> {
  let session;
  try {
    session = await codec.open(file);
  } catch (error) {
    throw new ImageProcessingError('IMAGE_INVALID', 400, { cause: error });
  }

  try {
    const sourceWidth = session.width;
    const sourceHeight = session.height;
    if (
      !Number.isFinite(sourceWidth) ||
      !Number.isFinite(sourceHeight) ||
      sourceWidth <= 0 ||
      sourceHeight <= 0
    ) {
      throw new ImageProcessingError('IMAGE_INVALID', 400, {
        cause: new Error('Image dimensions must be positive finite numbers'),
      });
    }

    if (sourceWidth * sourceHeight > MAX_PROCESSING_PIXELS) {
      throw new ImageProcessingError('IMAGE_DIMENSIONS_TOO_LARGE', 422);
    }

    const maxEdge = Math.max(sourceWidth, sourceHeight);
    const exceedsBytes = file.size > MAX_FINAL_IMAGE_BYTES;
    const exceedsDimensions = maxEdge > MAX_FINAL_IMAGE_EDGE;

    if (!exceedsBytes && !exceedsDimensions) {
      return {
        dataUrl: await toDataUrl(file, mimeType, codec),
        mimeType,
        bytes: file.size,
        width: sourceWidth,
        height: sourceHeight,
        processing: 'original',
      };
    }

    const initialScale = Math.min(1, MAX_FINAL_IMAGE_EDGE / maxEdge);
    const qualities = mimeType === 'image/png' ? [LOSSY_QUALITIES[0]] : LOSSY_QUALITIES;

    for (let sizeRound = 0; sizeRound < MAX_SIZE_ROUNDS; sizeRound += 1) {
      const scale = initialScale * SIZE_REDUCTION ** sizeRound;
      const dimensions = dimensionsAtScale(sourceWidth, sourceHeight, scale);

      for (const quality of qualities) {
        let output: Blob;
        try {
          output = await session.encode({
            ...dimensions,
            mimeType,
            quality,
          });
        } catch (error) {
          if (error instanceof ImageProcessingError) {
            throw error;
          }
          throw processingFailure(error);
        }

        assertEncodedMime(output, mimeType);
        if (output.size > MAX_FINAL_IMAGE_BYTES) {
          continue;
        }

        return {
          dataUrl: await toDataUrl(output, mimeType, codec),
          mimeType,
          bytes: output.size,
          ...dimensions,
          processing: exceedsBytes ? 'client-compressed' : 'client-resized',
        };
      }
    }

    throw new ImageProcessingError('IMAGE_OUTPUT_TOO_LARGE', 422);
  } finally {
    session.close();
  }
}
