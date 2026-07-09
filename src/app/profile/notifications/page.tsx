"use client";

// 個人中心：通知列表頁。顯示自己全部站內通知（RLS 限本人列），
// 未讀高亮、可全部標為已讀；點擊單則標記已讀並導向對應頁面。
// 結構比照 /profile/registrations（client component + useAuth + RLS 查詢）。

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/components/auth-provider";
import { useToast } from "@/components/ui/toast";
import { markNotificationsRead } from "@/lib/actions/notifications";
import { getNotificationDisplay } from "@/lib/notifications";

const TIME_FORMATTER = new Intl.DateTimeFormat("zh-TW", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Asia/Taipei",
  hourCycle: "h23",
});

interface NotificationItem {
  id: string;
  notification_type: string;
  payload: Record<string, unknown> | null;
  read_at: string | null;
  created_at: string;
}

type FilterKey = "all" | "unread";

export default function NotificationsPage() {
  const [supabase] = useState(() => createClient());
  const router = useRouter();
  const toast = useToast();
  const { user, isLoading: authLoading } = useAuth();

  const [items, setItems] = useState<NotificationItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [marking, setMarking] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("notification_outbox")
      .select("id, notification_type, payload, read_at, created_at")
      .order("created_at", { ascending: false });

    if (error) {
      toast.error(`通知載入失敗：${error.message}`);
    } else {
      setItems((data ?? []) as NotificationItem[]);
    }
    setIsLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setIsLoading(false);
      return;
    }
    load();
  }, [authLoading, user, load]);

  const unreadCount = items.filter((it) => !it.read_at).length;
  const filtered = filter === "unread" ? items.filter((it) => !it.read_at) : items;

  const handleMarkAllRead = async () => {
    if (marking || unreadCount === 0) return;
    setMarking(true);
    const result = await markNotificationsRead();
    setMarking(false);
    if (result.error) {
      toast.error(result.error, "操作失敗");
      return;
    }
    const now = new Date().toISOString();
    setItems((current) => current.map((it) => ({ ...it, read_at: it.read_at ?? now })));
    toast.success("已將全部通知標為已讀。");
  };

  const handleItemClick = async (item: NotificationItem) => {
    if (!item.read_at) {
      setItems((current) =>
        current.map((it) =>
          it.id === item.id ? { ...it, read_at: new Date().toISOString() } : it
        )
      );
      markNotificationsRead([item.id]);
    }
    const { href } = getNotificationDisplay(item.notification_type, item.payload);
    if (href) router.push(href);
  };

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center py-20">
        <span className="material-symbols-outlined animate-spin text-4xl text-primary">
          progress_activity
        </span>
      </div>
    );
  }

  return (
    <main className="flex-1 bg-white px-4 py-6 sm:px-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold leading-tight tracking-tight text-slate-900">
            通知
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            帳號審核、報名結果與活動異動都會在這裡通知你。
          </p>
        </div>
        <button
          type="button"
          onClick={handleMarkAllRead}
          disabled={marking || unreadCount === 0}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <span className="material-symbols-outlined text-[18px]">done_all</span>
          全部標為已讀
        </button>
      </div>

      <div className="mb-4 flex gap-2">
        {(
          [
            { key: "all", label: `全部（${items.length}）` },
            { key: "unread", label: `未讀（${unreadCount}）` },
          ] as { key: FilterKey; label: string }[]
        ).map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setFilter(tab.key)}
            aria-pressed={filter === tab.key}
            className={`rounded-full px-4 py-1.5 text-sm font-semibold transition-colors ${
              filter === tab.key
                ? "bg-primary text-white"
                : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="py-16 text-center text-slate-400">
          <span className="material-symbols-outlined mb-3 block text-5xl">
            notifications_off
          </span>
          <p className="text-sm">
            {filter === "unread" ? "沒有未讀通知" : "目前沒有任何通知"}
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {filtered.map((item) => {
            const display = getNotificationDisplay(item.notification_type, item.payload);
            const unread = !item.read_at;
            return (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => handleItemClick(item)}
                  className={`flex w-full items-start gap-3 rounded-md border p-4 text-left transition-all hover:shadow-md ${
                    unread
                      ? "border-primary/30 bg-primary/5"
                      : "border-slate-200 bg-white hover:border-slate-300"
                  }`}
                >
                  <span
                    className={`mt-1.5 size-2.5 shrink-0 rounded-full ${
                      unread ? "bg-primary" : "bg-slate-200"
                    }`}
                  />
                  <span className="min-w-0 flex-1">
                    <span
                      className={`block text-sm ${
                        unread ? "font-bold text-slate-900" : "font-semibold text-slate-700"
                      }`}
                    >
                      {display.title}
                    </span>
                    {display.lines.map((line, i) => (
                      <span key={i} className="mt-0.5 block text-sm text-slate-500">
                        {line}
                      </span>
                    ))}
                    <span className="mt-1.5 block text-xs text-slate-400">
                      {TIME_FORMATTER.format(new Date(item.created_at))}
                    </span>
                  </span>
                  {display.href && (
                    <span className="material-symbols-outlined mt-1 shrink-0 text-[18px] text-slate-300">
                      arrow_forward
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
