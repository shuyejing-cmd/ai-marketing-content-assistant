export type ImageDataUrlSummary = {
  mimeType: string;
  base64Length: number;
  estimatedBytes: number;
  hash: string;
  valid: boolean;
};

export function summarizeImageDataUrl(dataUrl: string | undefined | null): ImageDataUrlSummary {
  if (!dataUrl) return createInvalidSummary();

  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return createInvalidSummary();

  const [, mimeType, base64] = match;
  return {
    mimeType,
    base64Length: base64.length,
    estimatedBytes: estimateBase64Bytes(base64),
    hash: `img_${hashString(base64)}`,
    valid: true,
  };
}

function createInvalidSummary(): ImageDataUrlSummary {
  return {
    mimeType: 'unknown',
    base64Length: 0,
    estimatedBytes: 0,
    hash: 'img_invalid',
    valid: false,
  };
}

function estimateBase64Bytes(base64: string) {
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((base64.length * 3) / 4) - padding);
}

function hashString(value: string) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}
