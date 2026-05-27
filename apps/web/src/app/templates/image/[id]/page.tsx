import { TemplateImageClient } from './TemplateImageClient';

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function TemplateImagePage({ params }: PageProps) {
  const { id } = await params;
  return <TemplateImageClient templateId={id} />;
}
