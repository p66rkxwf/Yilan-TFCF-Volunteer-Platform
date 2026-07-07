"use client";

// Header 通知鈴鐺：未讀數徽章＋下拉近期通知（站內通知中心入口）。
// 資料直接以瀏覽器 client 讀 notification_outbox（RLS 限本人列，
// 見 15_notification_center.sql）；不用 Realtime，改掛載時查未讀數、
// 開啟下拉時抓最新清單（與本專案「無即時推播依賴」的慣例一致）。

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/components/auth-provider";
import { markNotificationsRead } from "@/lib/actions/notifications";
import { getNotificationDisplay } from "@/lib/notifications";

const DROPDOWN_LIMIT = 10;

const TIME_FORMATTER = new Intl.DateTimeFormat("zh-TW", {
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Asia/Taipei",
  hourCycle: "h23",
});

interface BellItem {
  id: string;
  notification_type: string;
  payload: Record<string, unknown> | null;
  read_at: string | null;
  created_at: string;
}

export function NotificationBell() {
  const [supabase] = useState(() => createClient());
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();

  const [open, setOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [items, setItems] = useState<BellItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const refreshUnreadCount = useCallback(async () => {
    if (!user) return;
    const { count } = await supabase
      .from("notification_outbox")
      .select("id", { count: "exact", head: true })
      .is("read_at", null);
    setUnreadCount(count ?? 0);
  }, [supabase, user]);

  const loadItems = useCallback(async () => {
    setIsLoading(true);
    const { data } = await supabase
      .from("notification_outbox")
      .select("id, notification_type, payload, read_at, created_at")
      .order("created_at", { ascending: false })
      .limit(DROPDOWN_LIMIT);
    setItems((data ?? []) as BellItem[]);
    setIsLoading(false);
  }, [supabase]);

  useEffect(() => {
    if (authLoading || !user) return;
    refreshUnreadCount();
  }, [authLoading, user, refreshUnreadCount]);

  // 外點／Escape 關閉（比照 components/ui/select.tsx 的 pointerdown 慣例）
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  if (authLoading || !user) return null;

  const toggleOpen = () => {
    const next = !open;
    setOpen(next);
    if (next) {
      loadItems();
      refreshUnreadCount();
    }
  };

  const handleItemClick = async (item: BellItem) => {
    setOpen(false);
    if (!item.read_at) {
      // 樂觀更新徽章，背景標記已讀
      setUnreadCount((n) => Math.max(0, n - 1));
      markNotificationsRead([item.id]).then(refreshUnreadCount);
    }
    const { href } = getNotificationDisplay(item.notification_type, item.payload);
    if (href) router.push(href);
  };

  const handleMarkAllRead = async () => {
    setUnreadCount(0);
    setItems((current) =>
      current.map((it) => ({ ...it, read_at: it.read_at ?? new Date().toISOString() }))
    );
    await markNotificationsRead();
    refreshUnreadCount();
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={toggleOpen}
        aria-label={unreadCount > 0 ? `通知（${unreadCount} 則未讀）` : "通知"}
        aria-expanded={open}
        className="relative flex items-center justify-center rounded-full p-1.5 text-slate-600 transition-colors hover:bg-slate-100 hover:text-primary"
      >
        <span className="material-symbols-outlined text-[24px]">notifications</span>
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-40 mt-2 w-80 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5">
            <span className="text-sm font-bold text-slate-900">通知</span>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={handleMarkAllRead}
                className="text-xs font-medium text-primary hover:underline"
              >
                全部標為已讀
              </button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto">
            {isLoading ? (
              <div className="flex justify-center py-8">
                <span className="material-symbols-outlined animate-spin text-2xl text-primary">
                  progress_activity
                </span>
              </div>
            ) : items.length === 0 ? (
              <div className="py-10 text-center text-sm text-slate-400">
                目前沒有任何通知
              </div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {items.map((item) => {
                  const display = getNotificationDisplay(
                    item.notification_type,
                    item.payload
                  );
                  const unread = !item.read_at;
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => handleItemClick(item)}
                        className={`flex w-full items-start gap-2.5 px-4 py-3 text-left transition-colors hover:bg-slate-50 ${
                          unread ? "bg-primary/5" : ""
                        }`}
                      >
                        <span
                          className={`mt-1.5 size-2 shrink-0 rounded-full ${
                            unread ? "bg-primary" : "bg-transparent"
                          }`}
                        />
                        <span className="min-w-0 flex-1">
                          <span
                            className={`block truncate text-sm ${
                              unread ? "font-bold text-slate-900" : "font-medium text-slate-600"
                            }`}
                          >
                            {display.title}
                          </span>
                          <span className="mt-0.5 block truncate text-xs text-slate-500">
                            {display.lines[0]}
                          </span>
                          <span className="mt-1 block text-[11px] text-slate-400">
                            {TIME_FORMATTER.format(new Date(item.created_at))}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <Link
            href="/profile/notifications"
            onClick={() => setOpen(false)}
            className="block border-t border-slate-100 px-4 py-2.5 text-center text-sm font-medium text-primary transition-colors hover:bg-slate-50"
          >
            查看全部通知
          </Link>
        </div>
      )}
    </div>
  );
}
