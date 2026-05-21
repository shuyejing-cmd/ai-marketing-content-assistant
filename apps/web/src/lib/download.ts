import type { GenerationResult } from '@/features/generation/generation-types';

const CANVAS_WIDTH = 1080;
const CANVAS_HEIGHT = 1350;

export async function downloadResultAsPng(result: GenerationResult, filename: string) {
  const canvas = document.createElement('canvas');
  canvas.width = CANVAS_WIDTH;
  canvas.height = CANVAS_HEIGHT;

  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Canvas is not available');
  }

  await drawPoster(context, result);

  const blob = await canvasToBlob(canvas);
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.download = filename;
  link.href = url;
  link.click();
  URL.revokeObjectURL(url);
}

async function drawPoster(context: CanvasRenderingContext2D, result: GenerationResult) {
  context.fillStyle = '#efe4d2';
  context.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  await drawHeroArea(context, result);
  drawLabel(context, result.uploadedImageDataUrl ? '保留商品图' : '无图生成');
  drawCopyPanel(context, result);
}

async function drawHeroArea(context: CanvasRenderingContext2D, result: GenerationResult) {
  const x = 80;
  const y = 80;
  const width = CANVAS_WIDTH - 160;
  const height = 560;

  roundedRect(context, x, y, width, height, 28);
  context.fillStyle = '#203b35';
  context.fill();

  if (!result.uploadedImageDataUrl) {
    context.fillStyle = '#ffffff';
    context.font = '700 42px system-ui, sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText('通用营销主视觉', CANVAS_WIDTH / 2, y + height / 2);
  }

  if (result.uploadedImageDataUrl) {
    await drawUploadedImage(context, result.uploadedImageDataUrl, x, y, width, height);
  }
}

function drawLabel(context: CanvasRenderingContext2D, label: string) {
  context.fillStyle = 'rgba(0, 0, 0, 0.56)';
  roundedRect(context, 80, 80, 210, 58, 0);
  context.fill();
  context.fillStyle = '#ffffff';
  context.font = '400 28px system-ui, sans-serif';
  context.textAlign = 'left';
  context.textBaseline = 'middle';
  context.fillText(label, 105, 110);
}

function drawCopyPanel(context: CanvasRenderingContext2D, result: GenerationResult) {
  const [headline, benefit, footer] = result.imageText;
  const x = 80;
  const y = 820;
  const width = CANVAS_WIDTH - 160;
  const height = 400;

  context.fillStyle = '#ffffff';
  roundedRect(context, x, y, width, height, 28);
  context.fill();

  context.fillStyle = '#1f2328';
  context.font = '800 58px system-ui, sans-serif';
  context.textAlign = 'left';
  context.textBaseline = 'top';
  const headlineLines = wrapText(context, headline, width - 80);
  headlineLines.slice(0, 2).forEach((line, index) => {
    context.fillText(line, x + 40, y + 44 + index * 72);
  });

  context.fillStyle = '#d9552f';
  context.font = '700 38px system-ui, sans-serif';
  context.fillText(benefit, x + 40, y + 220);

  context.fillStyle = '#69717d';
  context.font = '400 30px system-ui, sans-serif';
  context.fillText(footer, x + 40, y + 282);
}

async function drawUploadedImage(
  context: CanvasRenderingContext2D,
  src: string,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  try {
    const image = await loadImage(src);
    const scale = Math.max(width / image.width, height / image.height);
    const drawWidth = image.width * scale;
    const drawHeight = image.height * scale;
    context.drawImage(
      image,
      x + (width - drawWidth) / 2,
      y + (height - drawHeight) / 2,
      drawWidth,
      drawHeight,
    );
  } catch {
    context.fillStyle = '#ffffff';
    context.font = '700 42px system-ui, sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText('商品图读取失败', CANVAS_WIDTH / 2, y + height / 2);
  }
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
        return;
      }
      reject(new Error('Canvas export failed'));
    }, 'image/png');
  });
}

function roundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.lineTo(x + width - radius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + radius);
  context.lineTo(x + width, y + height - radius);
  context.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  context.lineTo(x + radius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - radius);
  context.lineTo(x, y + radius);
  context.quadraticCurveTo(x, y, x + radius, y);
  context.closePath();
}

function wrapText(context: CanvasRenderingContext2D, text: string, maxWidth: number) {
  const lines: string[] = [];
  let line = '';

  for (const char of text) {
    const nextLine = `${line}${char}`;
    if (context.measureText(nextLine).width > maxWidth && line) {
      lines.push(line);
      line = char;
    } else {
      line = nextLine;
    }
  }

  if (line) {
    lines.push(line);
  }

  return lines;
}
