'use client';

import { Send } from 'lucide-react';
import { IconButton } from '@/components/ui/IconButton';

type ChatComposerProps = {
  value: string;
  loading: boolean;
  onChange: (value: string) => void;
  onSubmit: () => void;
};

export function ChatComposer({ value, loading, onChange, onSubmit }: ChatComposerProps) {
  return (
    <div className="flex items-end gap-2 rounded-lg border border-line bg-white p-2 shadow-soft focus-within:border-accent">
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onInput={(event) => onChange(event.currentTarget.value)}
        rows={1}
        placeholder="描述你想生成的营销图片..."
        className="max-h-28 min-h-10 flex-1 resize-none bg-transparent px-2 py-2 text-[15px] outline-none"
      />
      <IconButton
        label="发送"
        disabled={loading || value.trim().length === 0}
        onClick={onSubmit}
        className="border-accent bg-accent text-white hover:bg-accent-strong hover:text-white disabled:border-line disabled:bg-line disabled:text-muted"
      >
        <Send size={18} aria-hidden="true" />
      </IconButton>
    </div>
  );
}
