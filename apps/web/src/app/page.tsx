import { FileText, Image, Sparkles, Video } from 'lucide-react';
import { AppShell } from '@/components/AppShell';
import { EntranceCard } from '@/components/EntranceCard';
import { HomeMenuDrawer } from '@/components/HomeMenuDrawer';
import { TemplateGallery } from '@/components/TemplateGallery';

export default function HomePage() {
  return (
    <AppShell>
      <header className="flex min-h-14 items-center justify-between border-b border-line/80">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-lg bg-gradient-to-b from-[#1186df] to-accent text-white shadow-control">
            <Sparkles size={20} aria-hidden="true" />
          </span>
          <div>
            <p className="text-[15px] font-semibold text-ink">AI 营销内容助手</p>
            <p className="text-xs text-muted">让创意更快落地</p>
          </div>
        </div>
        <HomeMenuDrawer />
      </header>

      <section className="py-8 sm:py-10 lg:py-12">
        <p className="text-sm font-semibold text-accent">开始创作</p>
        <h1 className="mt-3 max-w-3xl text-[30px] font-semibold leading-tight text-ink sm:text-[38px]">
          今天想做什么营销内容？
        </h1>
        <p className="mt-3 max-w-2xl text-[15px] leading-7 text-muted sm:text-base">
          选择内容类型，输入产品与活动信息，快速生成可直接发布的营销素材。
        </p>
      </section>

      <section aria-label="营销内容类型" className="grid gap-4 md:grid-cols-3">
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
