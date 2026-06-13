export async function convertHeicInBrowser(file: Blob): Promise<Blob> {
  const { heicTo } = await import('heic-to/csp');
  const converted = await heicTo({
    blob: file,
    type: 'image/jpeg',
    quality: 0.92,
  });

  if (!(converted instanceof Blob)) {
    throw new Error('HEIC converter did not return a Blob');
  }

  return converted;
}
