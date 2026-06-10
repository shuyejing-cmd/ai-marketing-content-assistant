import { handleConvertPost } from '../../../../features/image-upload/server/convert-route-handler';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  return handleConvertPost(request);
}
