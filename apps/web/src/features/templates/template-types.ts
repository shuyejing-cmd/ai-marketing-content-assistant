export type TemplateType = 'image' | 'video';

export type PublicTemplate = {
  id: string;
  type: TemplateType;
  title: string;
  description: string;
  coverImageDataUrl: string;
  published: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type AdminTemplate = PublicTemplate & {
  prompt: string;
};

export type TemplateInput = {
  type: TemplateType;
  title: string;
  description: string;
  coverImageDataUrl: string;
  prompt: string;
  published: boolean;
  sortOrder?: number;
};

export type TemplateUpdateInput = Partial<TemplateInput>;
