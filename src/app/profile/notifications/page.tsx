"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  getMyNotifications,
  markAllRead,
  markRead,
} from "@/lib/actions/notifications";
import { useToast } from "@/components/ui/toast";
import type { Notification } from "@/lib/types/database";

const TYPE_ICON: Record<string, { icon: string; color: string }> = {
  registration_approved: { icon: "check_circle", color: "text-emerald-500" },
  registration_rejected: { icon: "cancel", color: "text-rose-500" },
  activity_cancelled: { icon: "event_busy", color: "text-amber-500" },
};

const DEFAULT_ICON = { icon: "notifications", color: "text-primary" };

export default function NotificationsPage() {
  const router = useRouter();
  const toast = useToast();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isMarkingAll, setIsMarkingAll] = useState(false);

  const load = useCallback(async () => {
    const data = await getMyNotifications();
    setNotifications(data);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const unreadCount = notifications.filter((n) => !n.read_at).length;

  const handleClick = async (notification: Notification) => {
    if (!notification.read_at) {
      await markRead(notification.id);
      setNotifications((prev) =>
        prev.map((n) =>
          n.id === notification.id
            ? { ...n, read_at: new Date().toISOString() }
            : n
        )
      );
    }
    if (notification.link) router.push(notification.link);
  };

  const handleMarkAll = async () => {
    setIsMarkingAll(true);
    const result = await markAllRead();
    setIsMarkingAll(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    const now = new Date().toISOString();
    setNotifications((prev) =>
      prev.map((n) => (n.read_at ? n : { ...n, read_at: now }))
    );
    toast.success("已將所有通知標為已讀");
  };

  return (
    <>
      <header className="h-16 border-b border-slate-200 bg-white flex items-center justify-between px-6 md:px-8 shrink-0">
        <h1 className="text-lg font-bold">
          通知
          {unreadCount > 0 ? (
            <span className="ml-2 rounded-full bg-primary px-2 py-0.5 text-xs font-bold text-white">
              {unreadCount}
            </span>
          ) : null}
        </h1>
        {unreadCount > 0 ? (
          <button
            onClick={handleMarkAll}
            disabled={isMarkingAll}
            className="flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-60"
          >
            <span className="material-symbols-outlined text-[18px]">done_all</span>
            全部標為已讀
          </button>
        ) : null}
      </header>

      <div className="flex-1 overflow-y-auto p-6 md:p-8">
        <div className="max-w-3xl mx-auto space-y-3">
          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <span className="material-symbols-outlined animate-spin text-4xl text-primary">
                progress_activity
              </span>
            </div>
          ) : notifications.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-xl border border-slate-200">
              <span className="material-symbols-outlined text-5xl text-slate-300 block mb-3">
                notifications_off
              </span>
              <p className="text-slate-500">目前沒有任何通知</p>
            </div>
          ) : (
            notifications.map((notification) => {
              const meta = TYPE_ICON[notification.type] ?? DEFAULT_ICON;
              const isUnread = !notification.read_at;

              return (
                <button
                  key={notification.id}
                  onClick={() => handleClick(notification)}
                  className={`w-full text-left flex gap-4 rounded-xl border p-4 transition-colors ${
                    isUnread
                      ? "border-primary/20 bg-primary/5 hover:bg-primary/10"
                      : "border-slate-200 bg-white hover:bg-slate-50"
                  }`}
                >
                  <span className={`material-symbols-outlined ${meta.color}`}>
                    {meta.icon}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-bold text-slate-900">{notification.title}</p>
                      {isUnread ? (
                        <span className="h-2 w-2 shrink-0 rounded-full bg-primary" />
                      ) : null}
                    </div>
                    {notification.body ? (
                      <p className="mt-0.5 text-sm text-slate-600">{notification.body}</p>
                    ) : null}
                    <p className="mt-1 text-xs text-slate-400">
                      {new Date(notification.created_at).toLocaleString("zh-TW")}
                    </p>
                  </div>
                  {notification.link ? (
                    <span className="material-symbols-outlined self-center text-slate-300">
                      chevron_right
                    </span>
                  ) : null}
                </button>
              );
            })
          )}
        </div>
      </div>
    </>
  );
}
