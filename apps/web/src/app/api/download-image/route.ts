export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const rawUrl = requestUrl.searchParams.get('url');
  if (!rawUrl) {
    return new Response('Missing image URL', { status: 400 });
  }

  let imageUrl: URL;
  try {
    imageUrl = new URL(rawUrl);
  } catch {
    return new Response('Invalid image URL', { status: 400 });
  }

  if (imageUrl.protocol !== 'https:' && imageUrl.protocol !== 'http:') {
    return new Response('Unsupported image URL', { status: 400 });
  }

  const upstream = await fetch(imageUrl.toString());
  if (!upstream.ok) {
    return new Response('Image download failed', { status: 502 });
  }

  const contentType = upstream.headers.get('Content-Type') ?? 'application/octet-stream';
  const filename = sanitizeFilename(requestUrl.searchParams.get('filename') ?? filenameFromUrl(imageUrl));

  return new Response(upstream.body, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}

function filenameFromUrl(url: URL) {
  const name = url.pathname.split('/').filter(Boolean).at(-1);
  return name && name.includes('.') ? name : 'generated-image.png';
}

function sanitizeFilename(value: string) {
  const normalized = value.trim().replace(/[/\\?%*:|"<>]/g, '-');
  return normalized || 'generated-image.png';
}
