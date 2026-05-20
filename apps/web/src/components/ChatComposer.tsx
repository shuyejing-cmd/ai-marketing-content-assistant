'use client';

import { Send } from 'lucide-react';

type ChatComposerProps = {
  value: string;
  loading: boolean;
  onChange: (value: string) => void;
  onSubmit: () => void;
};

export function ChatComposer({ value, loading, onChange, onSubmit }: ChatComposerProps) {
  return (
    <div className="flex items-end gap-2 rounded-2xl border border-line bg-surface p-2 shadow-soft">
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onInput={(event) => onChange(event.currentTarget.value)}
        rows={1}
        placeholder="描述你想生成的营销图片..."
        className="max-h-28 min-h-10 flex-1 resize-none bg-transparent px-2 py-2 text-[15px] outline-none"
      />
      <button
        type="button"
        disabled={loading || value.trim().length === 0}
        onClick={onSubmit}
        className="grid h-10 w-10 place-items-center rounded-full bg-accent text-white disabled:bg-line"
        aria-label="发送"
      >
        <Send size={18} />
      </button>
    </div>
  );
}
