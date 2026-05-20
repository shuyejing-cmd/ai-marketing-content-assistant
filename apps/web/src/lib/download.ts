import { toPng } from 'html-to-image';

export async function downloadNodeAsPng(node: HTMLElement, filename: string) {
  const dataUrl = await toPng(node, { cacheBust: true, pixelRatio: 2 });
  const link = document.createElement('a');
  link.download = filename;
  link.href = dataUrl;
  link.click();
}
