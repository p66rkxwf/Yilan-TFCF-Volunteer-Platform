// 前台最新消息：只列標題，點擊進入詳情頁。未登入亦可瀏覽
// （需先執行 supabase/v2/08_public_announcements.sql 開放 anon 讀取）。

import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const DATE_FORMATTER = new Intl.DateTimeFormat("zh-TW", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  timeZone: "Asia/Taipei",
});

interface AnnouncementListRow {
  id: string;
  title: string;
  is_pinned: boolean;
  published_at: string | null;
}

export default async function AnnouncementsPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("announcements")
    .select("id, title, is_pinned, published_at")
    .eq("status", "published")
    .order("is_pinned", { ascending: false })
    .order("published_at", { ascending: false });

  const rows = (data ?? []) as AnnouncementListRow[];

  return (
    <main className="w-full flex-1 bg-white">
      <div className="w-full px-4 py-6 sm:px-6">
      <div className="mb-5 border-b border-slate-200 pb-3">
        <h1 className="text-xl font-bold tracking-tight text-slate-900">最新消息</h1>
        <p className="mt-1 text-sm text-slate-500">宜蘭家扶中心的公告與通知，置頂消息優先顯示。</p>
      </div>

      {rows.length === 0 ? (
        <div className="py-16 text-center">
          <span aria-hidden="true" className="material-symbols-outlined mb-2 text-4xl text-slate-300">inbox</span>
          <p className="text-sm text-slate-500">目前沒有公告。</p>
        </div>
      ) : (
        <div>
          <ul className="divide-y divide-slate-100">
            {rows.map((row) => (
              <li key={row.id}>
                <Link
                  href={`/announcements/${row.id}`}
                  className="group flex items-center gap-3 py-3.5 transition-colors hover:bg-slate-50/70"
                >
                  {row.is_pinned && (
                    <span aria-hidden="true" className="material-symbols-outlined shrink-0 text-[18px] text-amber-500">
                      push_pin
                    </span>
                  )}
                  <span className="min-w-0 flex-1 truncate font-semibold text-slate-800 group-hover:text-primary">
                    {row.title}
                  </span>
                  <time className="shrink-0 text-xs text-slate-400">
                    {row.published_at ? DATE_FORMATTER.format(new Date(row.published_at)) : ""}
                  </time>
                  <span aria-hidden="true" className="material-symbols-outlined shrink-0 text-[18px] text-slate-300 transition-transform group-hover:translate-x-0.5 group-hover:text-primary">
                    chevron_right
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
      </div>
    </main>
  );
}
