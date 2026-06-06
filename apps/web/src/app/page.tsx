import { FileText, Image, Video } from 'lucide-react';
import { AppShell } from '@/components/AppShell';
import { EntranceCard } from '@/components/EntranceCard';
import { HomeMenuDrawer } from '@/components/HomeMenuDrawer';
import { TemplateGallery } from '@/components/TemplateGallery';

export default function HomePage() {
  return (
    <AppShell>
      <section className="pt-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm font-medium text-accent">AI 营销内容助手</p>
            <h1 className="mt-3 text-[28px] font-semibold leading-9 text-ink">
              今天想做什么营销内容？
            </h1>
          </div>
          <HomeMenuDrawer />
        </div>
        <p className="mt-3 text-[15px] leading-6 text-muted">
          先选内容类型，再用一句话和几个快捷选项生成能直接发布的营销内容。
        </p>
      </section>

      <section className="mt-7 grid gap-3">
        <EntranceCard
          href="/copy"
          title="文案"
          description="朋友圈、小红书、抖音标题、活动话术"
          icon={FileText}
        />
        <EntranceCard
          href="/image"
          title="图片"
          description="营销海报、朋友圈图、小红书封面"
          icon={Image}
        />
        <EntranceCard
          href="/video"
          title="视频"
          description="短视频脚本、分镜、字幕、口播"
          icon={Video}
        />
      </section>

      <TemplateGallery />
    </AppShell>
  );
}
