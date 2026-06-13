import {
  ImageProcessingError,
  imageErrorPayload,
  isImageProcessingErrorCode,
} from '../src/features/image-upload/image-errors';
import {
  MAX_IMAGE_SIGNATURE_BYTES,
  detectImageMime,
  readImageSignature,
} from '../src/features/image-upload/image-signature';
import {
  MAX_FINAL_IMAGE_BYTES,
  MAX_FINAL_IMAGE_EDGE,
  MAX_FINAL_IMAGE_PIXELS,
  MAX_HEIC_SOURCE_BYTES,
  type FinalImageMime,
  type ImageProcessingErrorCode,
  type ImageProcessingMode,
  type ProcessedUploadImage,
  type UploadImageMime,
} from '../src/features/image-upload/image-types';

function ascii(value: string): number[] {
  return Array.from(value, (character) => character.charCodeAt(0));
}

function isoBmff(
  majorBrand: string,
  compatibleBrands: string[] = [],
  declaredSize?: number,
): Uint8Array {
  const bytes = new Uint8Array([
    0,
    0,
    0,
    0,
    ...ascii('ftyp'),
    ...ascii(majorBrand),
    0,
    0,
    0,
    0,
    ...compatibleBrands.flatMap(ascii),
  ]);
  const boxSize = declaredSize ?? bytes.length;

  bytes[0] = (boxSize >>> 24) & 0xff;
  bytes[1] = (boxSize >>> 16) & 0xff;
  bytes[2] = (boxSize >>> 8) & 0xff;
  bytes[3] = boxSize & 0xff;
  return bytes;
}

describe('detectImageMime', () => {
  it('detects JPEG bytes', () => {
    expect(detectImageMime(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg');
  });

  it('detects PNG bytes', () => {
    expect(
      detectImageMime(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
    ).toBe('image/png');
  });

  it('detects WebP bytes', () => {
    expect(
      detectImageMime(new Uint8Array([...ascii('RIFF'), 0, 0, 0, 0, ...ascii('WEBP')])),
    ).toBe('image/webp');
  });

  it.each(['heic', 'heix', 'hevc', 'hevx'])('detects HEIC major brand %s', (brand) => {
    expect(detectImageMime(isoBmff(brand))).toBe('image/heic');
  });

  it.each(['mif1', 'msf1'])('detects HEIF major brand %s', (brand) => {
    expect(detectImageMime(isoBmff(brand))).toBe('image/heif');
  });

  it('does not treat AVIF as HEIF', () => {
    expect(detectImageMime(isoBmff('avif'))).toBeNull();
  });

  it('does not treat a generic HEIF major brand with compatible AVIF as HEIF', () => {
    expect(detectImageMime(isoBmff('mif1', ['avif']))).toBeNull();
  });

  it('does not treat an AVIF major brand with compatible generic HEIF as HEIF', () => {
    expect(detectImageMime(isoBmff('avif', ['mif1']))).toBeNull();
  });

  it('prefers a compatible HEIC brand over a generic HEIF major brand', () => {
    expect(detectImageMime(isoBmff('mif1', ['heic']))).toBe('image/heic');
  });

  it('detects a complete generic HEIF box without an AVIF brand', () => {
    expect(detectImageMime(isoBmff('mif1', ['mif1']))).toBe('image/heif');
  });

  it('rejects an ftyp box whose declared size exceeds the available bytes', () => {
    expect(detectImageMime(isoBmff('mif1', [], 20))).toBeNull();
  });

  it('rejects an ftyp box whose declared size is shorter than the fixed fields', () => {
    expect(detectImageMime(isoBmff('mif1', [], 12))).toBeNull();
  });

  it('rejects an ftyp box with a truncated compatible brand', () => {
    const bytes = new Uint8Array([...isoBmff('mif1'), 0x61]);
    bytes[3] = bytes.length;

    expect(detectImageMime(bytes)).toBeNull();
  });

  it('detects a complete ftyp box at the signature byte limit', () => {
    const compatibleBrands = Array.from({ length: 1020 }, () => 'zzzz');
    compatibleBrands[1019] = 'heic';
    const bytes = isoBmff('zzzz', compatibleBrands);

    expect(bytes).toHaveLength(MAX_IMAGE_SIGNATURE_BYTES);
    expect(detectImageMime(bytes)).toBe('image/heic');
  });

  it('rejects a complete ftyp box larger than the signature byte limit', () => {
    const bytes = isoBmff('mif1', Array.from({ length: 1021 }, () => 'zzzz'));

    expect(bytes.length).toBeGreaterThan(MAX_IMAGE_SIGNATURE_BYTES);
    expect(detectImageMime(bytes)).toBeNull();
  });

  it.each([
    new Uint8Array(),
    new Uint8Array([0xff]),
    new Uint8Array([0x89, 0x50]),
    new Uint8Array(ascii('RIFF')),
    new Uint8Array([0, 0, 0, 24, ...ascii('ftyp')]),
  ])('returns null for arbitrary short bytes', (bytes) => {
    expect(detectImageMime(bytes)).toBeNull();
  });

  it('does not detect a RIFF file without the WEBP form type', () => {
    expect(
      detectImageMime(new Uint8Array([...ascii('RIFF'), 0, 0, 0, 0, ...ascii('WAVE')])),
    ).toBeNull();
  });
});

describe('readImageSignature', () => {
  it('reads only the signature byte limit from a large blob', async () => {
    const file = new Blob([new Uint8Array(MAX_IMAGE_SIGNATURE_BYTES + 2048).fill(0x7f)]);

    const signature = await readImageSignature(file);

    expect(signature).toHaveLength(MAX_IMAGE_SIGNATURE_BYTES);
    expect(signature.every((byte) => byte === 0x7f)).toBe(true);
  });
});

describe('image upload contracts', () => {
  it('exports the agreed image limits', () => {
    expect(MAX_IMAGE_SIGNATURE_BYTES).toBe(4096);
    expect(MAX_FINAL_IMAGE_BYTES).toBe(10 * 1024 * 1024);
    expect(MAX_FINAL_IMAGE_EDGE).toBe(4096);
    expect(MAX_FINAL_IMAGE_PIXELS).toBe(4096 * 4096);
    expect(MAX_HEIC_SOURCE_BYTES).toBe(40 * 1024 * 1024);
  });

  it('accepts the current MIME types, processing modes, and result shape', () => {
    const finalMimes = ['image/jpeg', 'image/png', 'image/webp'] satisfies FinalImageMime[];
    const uploadMimes = [
      ...finalMimes,
      'image/heic',
      'image/heif',
    ] satisfies UploadImageMime[];
    const processingModes = [
      'original',
      'client-resized',
      'client-compressed',
      'client-heic-converted',
      'server-heic-converted',
    ] satisfies ImageProcessingMode[];
    const processed = {
      dataUrl: 'data:image/jpeg;base64,/9j/',
      mimeType: finalMimes[0],
      bytes: 3,
      width: 1,
      height: 1,
      processing: processingModes[0],
    } satisfies ProcessedUploadImage;

    expect(uploadMimes).toContain('image/heif');
    expect(processed.processing).toBe('original');
  });
});

describe('image processing errors', () => {
  const cases = [
    ['IMAGE_INVALID', '无法读取该图片，文件可能已损坏'],
    ['IMAGE_UNSUPPORTED_FORMAT', '暂不支持该图片格式，请选择 JPEG、PNG、WebP、HEIC 或 HEIF'],
    ['IMAGE_INPUT_TOO_LARGE', '原始图片过大，请选择小于 40 MB 的图片'],
    ['IMAGE_DIMENSIONS_TOO_LARGE', '图片尺寸过大，无法安全处理'],
    ['IMAGE_PROCESSING_FAILED', '图片处理失败，请重新选择一张图片'],
    ['IMAGE_OUTPUT_TOO_LARGE', '图片处理后仍超过 10 MB，请选择体积较小的图片'],
    ['IMAGE_PROCESSING_UNAVAILABLE', '图片处理暂时不可用，请稍后重试'],
  ] as const satisfies ReadonlyArray<readonly [ImageProcessingErrorCode, string]>;

  it.each(cases)('provides a stable message for %s', (code, message) => {
    const error = new ImageProcessingError(code, 422);

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('ImageProcessingError');
    expect(error.code).toBe(code);
    expect(error.status).toBe(422);
    expect(error.message).toBe(message);
  });

  it('preserves a known error in the API payload', () => {
    const error = new ImageProcessingError('IMAGE_OUTPUT_TOO_LARGE', 413);

    expect(imageErrorPayload(error)).toEqual({
      status: 413,
      body: {
        code: 'IMAGE_OUTPUT_TOO_LARGE',
        message: '图片处理后仍超过 10 MB，请选择体积较小的图片',
      },
    });
  });

  it('uses a stable unavailable payload and fallback status for unknown errors', () => {
    expect(imageErrorPayload(new Error('provider detail'), 503)).toEqual({
      status: 503,
      body: {
        code: 'IMAGE_PROCESSING_UNAVAILABLE',
        message: '图片处理暂时不可用，请稍后重试',
      },
    });
  });

  it('recognizes only the seven supported error codes', () => {
    for (const [code] of cases) {
      expect(isImageProcessingErrorCode(code)).toBe(true);
    }

    expect(isImageProcessingErrorCode('IMAGE_OTHER')).toBe(false);
    expect(isImageProcessingErrorCode('toString')).toBe(false);
    expect(isImageProcessingErrorCode(null)).toBe(false);
  });
});
