import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { AnnouncementBanner } from "./announcement-banner";

export const dynamic = "force-dynamic";

const DATE_FORMATTER = new Intl.DateTimeFormat("zh-TW", {
  dateStyle: "medium",
  timeZone: "Asia/Taipei",
});

interface HomeAnnouncement {
  id: string;
  title: string;
  is_pinned: boolean;
  published_at: string | null;
}

export default async function Home() {
  // 已發布公告（未登入亦可見，需先執行 supabase/v2/08_public_announcements.sql）。
  // 未執行前 anon 讀不到 → 空陣列 → 公告區塊自動隱藏，不影響其餘功能。
  const supabase = await createClient();
  const { data } = await supabase
    .from("announcements")
    .select("id, title, is_pinned, published_at")
    .eq("status", "published")
    .order("is_pinned", { ascending: false })
    .order("published_at", { ascending: false })
    .limit(20);

  const announcements = (data ?? []) as HomeAnnouncement[];
  const pinned = announcements.filter((a) => a.is_pinned).slice(0, 5);
  const latest = announcements.slice(0, 5);

  return (
    <>
      {pinned.length > 0 && <AnnouncementBanner items={pinned} />}

      <main className="grow flex flex-col md:flex-row">
        {/* 獎學金專區 */}
        <section className="relative flex-1 group overflow-hidden border-b md:border-b-0 md:border-r border-slate-200">
          <div className="absolute inset-0 bg-gradient-to-br from-slate-800 via-slate-900 to-primary transition-all duration-700 group-hover:from-slate-700 group-hover:to-primary" />
          <span className="material-symbols-outlined pointer-events-none absolute -right-8 -bottom-8 text-[220px] leading-none text-white/5 transition-transform duration-700 group-hover:scale-110">
            school
          </span>
          <div className="relative h-full flex flex-col justify-center items-center text-center p-8 md:p-16 z-10 min-h-[55vh] md:min-h-[60vh]">
            <div className="mb-6 p-4 rounded-full bg-white/10 backdrop-blur-md text-white">
              <span className="material-symbols-outlined text-4xl">school</span>
            </div>
            <h2 className="text-white text-3xl md:text-5xl font-black mb-8 tracking-tight">
              獎學金申請專區
            </h2>
            <Link
              href="/scholarship"
              className="bg-white text-slate-900 font-bold py-4 px-8 rounded-xl hover:bg-primary hover:text-white transition-all transform hover:scale-105 inline-block text-center"
            >
              即將開放
            </Link>
          </div>
        </section>

        {/* 志工專區 */}
        <section className="relative flex-1 group overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-primary via-slate-800 to-slate-900 transition-all duration-700 group-hover:from-primary group-hover:to-slate-800" />
          <span className="material-symbols-outlined pointer-events-none absolute -left-8 -bottom-8 text-[220px] leading-none text-white/5 transition-transform duration-700 group-hover:scale-110">
            volunteer_activism
          </span>
          <div className="relative h-full flex flex-col justify-center items-center text-center p-8 md:p-16 z-10 min-h-[55vh] md:min-h-[60vh]">
            <div className="mb-6 p-4 rounded-full bg-white/10 backdrop-blur-md text-white">
              <span className="material-symbols-outlined text-4xl">volunteer_activism</span>
            </div>
            <h2 className="text-white text-3xl md:text-5xl font-black mb-8 tracking-tight">
              志工報名專區
            </h2>
            <Link
              href="/volunteer"
              className="bg-transparent border-2 border-white text-white font-bold py-4 px-8 rounded-xl hover:bg-white hover:text-slate-900 transition-all transform hover:scale-105 inline-block text-center"
            >
              立即報名
            </Link>
          </div>
        </section>
      </main>

      {/* 最新消息 */}
      {latest.length > 0 && (
        <section className="bg-white border-t border-slate-200 px-4 py-12 sm:px-6">
          <div className="w-full">
            <div className="mb-4 flex items-end justify-between border-b border-slate-200 pb-2.5">
              <div>
                <h2 className="text-lg font-bold tracking-tight text-slate-900">最新消息</h2>
              </div>
              <Link
                href="/announcements"
                className="text-sm font-semibold text-primary hover:underline"
              >
                查看全部 →
              </Link>
            </div>
            <ul className="divide-y divide-slate-100">
              {latest.map((item) => (
                <li key={item.id}>
                  <Link
                    href={`/announcements/${item.id}`}
                    className="group flex items-center gap-3 py-3.5 transition-colors"
                  >
                    {item.is_pinned && (
                      <span className="material-symbols-outlined shrink-0 text-[18px] text-amber-500">
                        push_pin
                      </span>
                    )}
                    <span className="min-w-0 flex-1 truncate font-medium text-slate-800 group-hover:text-primary">
                      {item.title}
                    </span>
                    <time className="shrink-0 text-xs text-slate-400">
                      {item.published_at ? DATE_FORMATTER.format(new Date(item.published_at)) : ""}
                    </time>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}
    </>
  );
}
