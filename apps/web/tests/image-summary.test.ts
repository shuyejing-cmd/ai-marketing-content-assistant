import { summarizeImageDataUrl } from '../src/features/generation/image-summary';

describe('summarizeImageDataUrl', () => {
  it('summarizes data URLs without returning base64 content', () => {
    const summary = summarizeImageDataUrl('data:image/png;base64,YWJjZGVmZw==');

    expect(summary).toEqual(
      expect.objectContaining({
        mimeType: 'image/png',
        base64Length: 12,
        estimatedBytes: 7,
        hash: expect.stringMatching(/^img_[a-f0-9]{8}$/),
      }),
    );
    expect(JSON.stringify(summary)).not.toContain('YWJjZGVmZw');
  });

  it('marks invalid data URLs without throwing', () => {
    expect(summarizeImageDataUrl('not-a-data-url')).toEqual(
      expect.objectContaining({
        mimeType: 'unknown',
        valid: false,
      }),
    );
  });
});
