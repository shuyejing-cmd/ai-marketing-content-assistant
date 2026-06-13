import type { UploadImageMime } from './image-types';

export const MAX_IMAGE_SIGNATURE_BYTES = 4096;

const BRAND_AVIF = 0x61766966;
const BRAND_AVIS = 0x61766973;
const BRAND_HEIC = 0x68656963;
const BRAND_HEIX = 0x68656978;
const BRAND_HEVC = 0x68657663;
const BRAND_HEVX = 0x68657678;
const BRAND_MIF1 = 0x6d696631;
const BRAND_MSF1 = 0x6d736631;

export function detectImageMime(bytes: Uint8Array): UploadImageMime | null {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (matches(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP') return 'image/webp';
  if (ascii(bytes, 4, 4) !== 'ftyp') return null;

  const boxSize = readUint32(bytes, 0);
  if (
    boxSize < 16 ||
    boxSize > bytes.length ||
    boxSize > MAX_IMAGE_SIGNATURE_BYTES ||
    (boxSize - 16) % 4 !== 0
  ) {
    return null;
  }

  let hasAvif = false;
  let hasHeic = false;
  let hasHeif = false;
  let offset = 8;

  while (offset < boxSize) {
    const brand = readUint32(bytes, offset);
    hasAvif ||= brand === BRAND_AVIF || brand === BRAND_AVIS;
    hasHeic ||=
      brand === BRAND_HEIC ||
      brand === BRAND_HEIX ||
      brand === BRAND_HEVC ||
      brand === BRAND_HEVX;
    hasHeif ||= brand === BRAND_MIF1 || brand === BRAND_MSF1;
    offset = offset === 8 ? 16 : offset + 4;
  }

  if (hasAvif) return null;
  if (hasHeic) return 'image/heic';
  if (hasHeif) return 'image/heif';
  return null;
}

export async function readImageSignature(file: Blob): Promise<Uint8Array> {
  const buffer = await file.slice(0, MAX_IMAGE_SIGNATURE_BYTES).arrayBuffer();
  return new Uint8Array(buffer);
}

function matches(bytes: Uint8Array, signature: number[]) {
  return signature.every((value, index) => bytes[index] === value);
}

function ascii(bytes: Uint8Array, offset: number, length: number) {
  return String.fromCharCode(...bytes.slice(offset, offset + length));
}

function readUint32(bytes: Uint8Array, offset: number) {
  return (
    bytes[offset] * 0x1000000 +
    bytes[offset + 1] * 0x10000 +
    bytes[offset + 2] * 0x100 +
    bytes[offset + 3]
  );
}
