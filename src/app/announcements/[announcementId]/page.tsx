// 公告詳情：顯示單則已發布公告的完整內容。未登入亦可瀏覽
// （沿用 08_public_announcements.sql 的 anon SELECT policy：限 status='published'）。

import Link from "next/link";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { Markdown } from "@/components/admin/markdown";

export const dynamic = "force-dynamic";

const DATE_FORMATTER = new Intl.DateTimeFormat("zh-TW", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  timeZone: "Asia/Taipei",
});

interface AnnouncementDetail {
  id: string;
  title: string;
  content: string;
  is_pinned: boolean;
  published_at: string | null;
}

async function fetchAnnouncement(id: string): Promise<AnnouncementDetail | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("announcements")
    .select("id, title, content, is_pinned, published_at")
    .eq("id", id)
    .eq("status", "published")
    .maybeSingle();
  return (data as AnnouncementDetail | null) ?? null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ announcementId: string }>;
}): Promise<Metadata> {
  const { announcementId } = await params;
  const announcement = await fetchAnnouncement(announcementId);
  return {
    title: announcement
      ? `${announcement.title} | 宜蘭家扶中心`
      : "最新消息 | 宜蘭家扶中心",
  };
}

export default async function AnnouncementDetailPage({
  params,
}: {
  params: Promise<{ announcementId: string }>;
}) {
  const { announcementId } = await params;
  const announcement = await fetchAnnouncement(announcementId);

  return (
    <main className="w-full flex-1 bg-white">
      <div className="w-full px-4 py-6 sm:px-6">
      <Link
        href="/announcements"
        className="mb-5 inline-flex items-center gap-1 text-sm font-medium text-slate-500 transition-colors hover:text-primary"
      >
        <span className="material-symbols-outlined text-[18px]">arrow_back</span>
        返回最新消息
      </Link>

      {!announcement ? (
        <div className="py-16 text-center">
          <span className="material-symbols-outlined mb-2 text-4xl text-slate-300">
            search_off
          </span>
          <p className="text-sm text-slate-500">找不到這則公告，可能已被下架或不存在。</p>
          <Link
            href="/announcements"
            className="mt-4 inline-flex items-center justify-center rounded-md bg-primary px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary/90"
          >
            回最新消息列表
          </Link>
        </div>
      ) : (
        <article className="rounded-md border border-slate-200 bg-white p-5 sm:p-6">
          <div className="flex items-start gap-2 border-b border-slate-200 pb-4">
            {announcement.is_pinned && (
              <span className="material-symbols-outlined mt-0.5 shrink-0 text-[19px] text-amber-500">
                push_pin
              </span>
            )}
            <div>
              <h1 className="text-xl font-bold tracking-tight text-slate-900">
                {announcement.title}
              </h1>
              <time className="mt-1 block text-xs text-slate-400">
                {announcement.published_at
                  ? DATE_FORMATTER.format(new Date(announcement.published_at))
                  : ""}
              </time>
            </div>
          </div>
          <div className="pt-5">
            <Markdown content={announcement.content} />
          </div>
        </article>
      )}
      </div>
    </main>
  );
}
