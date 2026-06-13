import sharp from 'sharp';
import { ImageProcessingError } from '../src/features/image-upload/image-errors';
import {
  MAX_FINAL_IMAGE_BYTES,
  MAX_FINAL_IMAGE_EDGE,
  MAX_FINAL_IMAGE_PIXELS,
} from '../src/features/image-upload/image-types';
import { validateGenerationImageDataUrl } from '../src/features/image-upload/server/validate-generation-image';
import {
  tinyJpegDataUrl,
  tinyPngDataUrl,
  tinyWebpDataUrl,
} from './test-image-fixtures';

describe('validateGenerationImageDataUrl', () => {
  it.each([
    ['JPEG', tinyJpegDataUrl, 'image/jpeg'],
    ['PNG', tinyPngDataUrl, 'image/png'],
    ['WebP', tinyWebpDataUrl, 'image/webp'],
  ])('accepts a valid tiny %s image', async (_label, dataUrl, mimeType) => {
    await expect(validateGenerationImageDataUrl(dataUrl)).resolves.toMatchObject({
      mimeType,
      width: 1,
      height: 1,
      buffer: expect.any(Buffer),
    });
  });

  it('accepts a valid image at exactly 10 MiB without changing its bytes', async () => {
    const tinyJpeg = dataUrlBuffer(tinyJpegDataUrl);
    const input = Buffer.alloc(MAX_FINAL_IMAGE_BYTES);
    tinyJpeg.copy(input);
    const dataUrl = `data:image/jpeg;base64,${input.toString('base64')}`;

    const result = await validateGenerationImageDataUrl(dataUrl);

    expect(input.length).toBe(MAX_FINAL_IMAGE_BYTES);
    expect(result.buffer.equals(input)).toBe(true);
  }, 20_000);

  it.each([
    '',
    'data:image/png;base64,',
    'data:image/png;base64,%not-base64%',
    'data:image/png;base64,a',
    'data:image/png;base64,a===',
    'data:image/png;base64,aW52YWxpZA==\n',
  ])('rejects an empty or malformed data URL: %j', async (dataUrl) => {
    await expect(validateGenerationImageDataUrl(dataUrl)).rejects.toMatchObject({
      code: 'IMAGE_INVALID',
      status: 400,
    });
  });

  it('rejects bytes whose signature does not match the declared MIME type', async () => {
    const mismatched = tinyJpegDataUrl.replace('data:image/jpeg', 'data:image/png');

    await expect(validateGenerationImageDataUrl(mismatched)).rejects.toMatchObject({
      code: 'IMAGE_INVALID',
      status: 400,
    });
  });

  it('rejects non-image bytes declared as a supported image type', async () => {
    await expect(
      validateGenerationImageDataUrl('data:image/png;base64,aW52YWxpZA=='),
    ).rejects.toMatchObject({
      code: 'IMAGE_INVALID',
      status: 400,
    });
  });

  it('rejects HEIC before it reaches image decoding', async () => {
    const input = Buffer.alloc(24);
    input.writeUInt32BE(24, 0);
    input.write('ftyp', 4, 'ascii');
    input.write('heic', 8, 'ascii');
    input.writeUInt32BE(0, 12);
    input.write('mif1', 16, 'ascii');
    input.write('heic', 20, 'ascii');

    await expect(
      validateGenerationImageDataUrl(`data:image/heic;base64,${input.toString('base64')}`),
    ).rejects.toMatchObject({
      code: 'IMAGE_UNSUPPORTED_FORMAT',
      status: 415,
    });
  });

  it('rejects signature-correct bytes larger than 10 MiB before image decoding', async () => {
    const input = Buffer.alloc(MAX_FINAL_IMAGE_BYTES + 1);
    input.set([0xff, 0xd8, 0xff], 0);

    await expect(
      validateGenerationImageDataUrl(`data:image/jpeg;base64,${input.toString('base64')}`),
    ).rejects.toMatchObject({
      code: 'IMAGE_OUTPUT_TOO_LARGE',
      status: 413,
    });
  });

  it('rejects oversized canonical base64 before Buffer decoding or Sharp inspection', async () => {
    const encoded = 'A'.repeat((Math.floor(MAX_FINAL_IMAGE_BYTES / 3) + 1) * 4);
    const bufferFrom = vi.spyOn(Buffer, 'from').mockImplementation(() => {
      throw new Error('Buffer decoding must not run');
    });

    try {
      await expect(
        validateGenerationImageDataUrl(`data:image/jpeg;base64,${encoded}`),
      ).rejects.toMatchObject({
        code: 'IMAGE_OUTPUT_TOO_LARGE',
        status: 413,
      });

      expect(bufferFrom).not.toHaveBeenCalled();
    } finally {
      bufferFrom.mockRestore();
    }
  });

  it('rejects an image whose metadata is readable but pixel stream is corrupt', async () => {
    const valid = await sharp({
      create: {
        width: 32,
        height: 32,
        channels: 3,
        background: '#abcdef',
      },
    })
      .png()
      .toBuffer();
    const idatTypeOffset = valid.indexOf(Buffer.from('IDAT'));
    const corrupt = valid.subarray(0, idatTypeOffset + 12);

    await expect(
      sharp(corrupt, {
        failOn: 'error',
        limitInputPixels: MAX_FINAL_IMAGE_PIXELS,
      }).metadata(),
    ).resolves.toMatchObject({
      width: 32,
      height: 32,
    });

    await expect(
      validateGenerationImageDataUrl(`data:image/png;base64,${corrupt.toString('base64')}`),
    ).rejects.toMatchObject({
      code: 'IMAGE_INVALID',
      status: 400,
    });
  });

  it('maps corrupt decoder input to a stable image error', async () => {
    const input = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01, 0x02,
    ]);

    let caught: unknown;
    try {
      await validateGenerationImageDataUrl(`data:image/png;base64,${input.toString('base64')}`);
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(ImageProcessingError);
    expect(caught).toMatchObject({
      code: 'IMAGE_INVALID',
      status: 400,
      message: new ImageProcessingError('IMAGE_INVALID', 400).message,
    });
  });

  it('rejects an image whose longest edge exceeds 4096 pixels', async () => {
    const input = await sharp({
      create: {
        width: 4097,
        height: 1,
        channels: 3,
        background: '#ffffff',
      },
    })
      .png()
      .toBuffer();

    await expect(
      validateGenerationImageDataUrl(`data:image/png;base64,${input.toString('base64')}`),
    ).rejects.toMatchObject({
      code: 'IMAGE_DIMENSIONS_TOO_LARGE',
      status: 422,
    });
  });

  it(
    'accepts an image whose longest edge is exactly 4096 pixels',
    async () => {
      const input = await sharp({
        create: {
          width: MAX_FINAL_IMAGE_EDGE,
          height: 1,
          channels: 3,
          background: '#ffffff',
        },
      })
        .png()
        .toBuffer();

      await expect(
        validateGenerationImageDataUrl(`data:image/png;base64,${input.toString('base64')}`),
      ).resolves.toMatchObject({
        width: MAX_FINAL_IMAGE_EDGE,
        height: 1,
      });
    },
    20_000,
  );

  it(
    'accepts an image with exactly 4096 squared pixels',
    async () => {
      const input = await sharp({
        create: {
          width: MAX_FINAL_IMAGE_EDGE,
          height: MAX_FINAL_IMAGE_EDGE,
          channels: 3,
          background: '#ffffff',
        },
      })
        .png()
        .toBuffer();

      await expect(
        validateGenerationImageDataUrl(`data:image/png;base64,${input.toString('base64')}`),
      ).resolves.toMatchObject({
        width: MAX_FINAL_IMAGE_EDGE,
        height: MAX_FINAL_IMAGE_EDGE,
      });
    },
    30_000,
  );

  it(
    'rejects an image whose total pixels exceed 4096 squared',
    async () => {
      const input = await sharp({
        create: {
          width: 4097,
          height: 4096,
          channels: 3,
          background: '#ffffff',
        },
      })
        .png()
        .toBuffer();

      await expect(
        validateGenerationImageDataUrl(`data:image/png;base64,${input.toString('base64')}`),
      ).rejects.toMatchObject({
        code: 'IMAGE_DIMENSIONS_TOO_LARGE',
        status: 422,
      });
    },
    20_000,
  );
});

function dataUrlBuffer(dataUrl: string) {
  return Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64');
}
