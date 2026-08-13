"use client";

// 個人中心：通知列表頁。顯示自己全部站內通知（RLS 限本人列且未刪除），
// 未讀高亮、可標記已讀、可刪除（單則／批量／清除全部已讀）；
// 點擊單則標記已讀並導向對應頁面。
// 結構比照 /profile/registrations（client component + useAuth + RLS 查詢）。
//
// 篩選（未讀／類型／時間／關鍵字）一律在已載入的清單上做前端過濾：標題與內文是
// 前端由 payload 組出來的（見 lib/notifications.ts），DB 端搜不到，四者統一在前端
// 處理才不會有一半條件即時、一半要重新查詢的落差。

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/components/auth-provider";
import { useToast } from "@/components/ui/toast";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Select } from "@/components/ui/select";
import { deleteNotifications, markNotificationsRead } from "@/lib/actions/notifications";
import { callAction } from "@/lib/ui/toast-actions";
import { NOTIFICATION_META, getNotificationDisplay } from "@/lib/notifications";
import { formatDateTime } from "@/lib/admin/datetime";
import { PageSpinner } from "@/components/ui/spinner";
import type { NotificationType } from "@/lib/types/database";

// 上限而非分頁：定期清除只留 90 天的通知（23_soft_delete_and_purge），
// 500 筆已足以涵蓋，但仍需要一個上限避免極端帳號一次撈爆。
const LOAD_LIMIT = 500;

interface NotificationItem {
  id: string;
  notification_type: string;
  payload: Record<string, unknown> | null;
  read_at: string | null;
  created_at: string;
}

type FilterKey = "all" | "unread";
type RangeKey = "all" | "7" | "30";
type ConfirmKind = "selected" | "allRead";

const RANGE_OPTIONS = [
  { value: "all", label: "不限時間" },
  { value: "30", label: "近 30 天" },
  { value: "7", label: "近 7 天" },
];

export default function NotificationsPage() {
  const [supabase] = useState(() => createClient());
  const router = useRouter();
  const toast = useToast();
  const { user, isLoading: authLoading } = useAuth();

  const [items, setItems] = useState<NotificationItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [rangeFilter, setRangeFilter] = useState<RangeKey>("all");
  const [keyword, setKeyword] = useState("");
  // 時間範圍篩選的基準點。取載入當下而非每次 render 現算：render 期間呼叫
  // Date.now() 不是純函式（react-hooks/purity），基準點也不該隨重繪飄移。
  const [loadedAtMs, setLoadedAtMs] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState<ConfirmKind | null>(null);
  const [marking, setMarking] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("v_my_notifications")
      .select("id, notification_type, payload, read_at, created_at")
      .order("created_at", { ascending: false })
      .limit(LOAD_LIMIT);

    if (error) {
      toast.error(`通知載入失敗：${error.message}`);
    } else {
      setItems((data ?? []) as NotificationItem[]);
    }
    setLoadedAtMs(Date.now());
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

  // 標題／內文是由 payload 組出來的，關鍵字搜尋與渲染都要用，先算一次
  const enriched = useMemo(
    () =>
      items.map((item) => ({
        item,
        display: getNotificationDisplay(item.notification_type, item.payload),
      })),
    [items]
  );

  const unreadCount = items.filter((it) => !it.read_at).length;
  const readCount = items.length - unreadCount;

  // 只列出使用者真的收過的類型：全部 18 種硬列會有一整排永遠沒東西的選項
  const typeOptions = useMemo(() => {
    const present = [...new Set(items.map((it) => it.notification_type))];
    return [
      { value: "all", label: "全部類型" },
      ...present.map((type) => ({
        value: type,
        label: NOTIFICATION_META[type as NotificationType]?.title ?? type,
      })),
    ];
  }, [items]);

  const filtered = useMemo(() => {
    const q = keyword.trim();
    const cutoff =
      rangeFilter === "all" || loadedAtMs === 0
        ? null
        : loadedAtMs - Number(rangeFilter) * 24 * 60 * 60 * 1000;
    return enriched.filter(({ item, display }) => {
      if (filter === "unread" && item.read_at) return false;
      if (typeFilter !== "all" && item.notification_type !== typeFilter) return false;
      if (cutoff !== null && new Date(item.created_at).getTime() < cutoff) return false;
      if (q && !`${display.title}${display.lines.join("")}`.includes(q)) return false;
      return true;
    });
  }, [enriched, filter, typeFilter, rangeFilter, keyword, loadedAtMs]);

  // 批量刪除一律只作用在「目前看得到的」勾選項：改了篩選後不該連畫面外的也一起刪。
  // 用推導值而非在 effect 裡修剪 selected——同樣的保證，但不會有額外一輪 render。
  const visibleSelected = useMemo(() => {
    if (selected.size === 0) return [] as string[];
    return filtered.map((row) => row.item.id).filter((id) => selected.has(id));
  }, [filtered, selected]);

  const allVisibleSelected = filtered.length > 0 && visibleSelected.length === filtered.length;
  const hasActiveFilter =
    filter !== "all" || typeFilter !== "all" || rangeFilter !== "all" || keyword.trim() !== "";

  const toggleSelected = (id: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    setSelected((current) => {
      const next = new Set(current);
      for (const row of filtered) {
        if (allVisibleSelected) next.delete(row.item.id);
        else next.add(row.item.id);
      }
      return next;
    });
  };

  const handleMarkAllRead = async () => {
    if (marking || unreadCount === 0) return;
    setMarking(true);
    const result = await callAction(() => markNotificationsRead());
    setMarking(false);
    if (result.error) {
      toast.error(result.error, "操作失敗");
      return;
    }
    const now = new Date().toISOString();
    setItems((current) => current.map((it) => ({ ...it, read_at: it.read_at ?? now })));
    toast.success("已將全部通知標為已讀。");
  };

  // 樂觀移除，失敗才重新載入把列取回來
  const removeLocally = (ids: Set<string>) => {
    setItems((current) => current.filter((it) => !ids.has(it.id)));
    setSelected((current) => {
      if (current.size === 0) return current;
      const next = new Set([...current].filter((id) => !ids.has(id)));
      return next.size === current.size ? current : next;
    });
  };

  // 單則刪除不跳確認框：一次要清十幾則時，每則都彈 modal 太難用（且為軟刪除）
  const handleDeleteOne = async (id: string) => {
    removeLocally(new Set([id]));
    const result = await callAction(() => deleteNotifications([id]));
    if (result.error) {
      toast.error(result.error, "刪除失敗");
      load();
    }
  };

  const handleConfirmDelete = async () => {
    if (!confirm) return;
    const kind = confirm;
    const ids =
      kind === "selected"
        ? visibleSelected
        : items.filter((it) => it.read_at).map((it) => it.id);
    if (ids.length === 0) {
      setConfirm(null);
      return;
    }

    setDeleting(true);
    // 清除全部已讀走「不帶 ids」的 RPC 語意，由 DB 端決定範圍
    const result = await callAction(() =>
      kind === "selected" ? deleteNotifications(ids) : deleteNotifications()
    );
    setDeleting(false);
    setConfirm(null);

    if (result.error) {
      toast.error(result.error, "刪除失敗");
      return;
    }
    removeLocally(new Set(ids));
    // 「清除全部已讀」的實際筆數由 DB 決定（可能多於本頁載入的 500 筆），不報數字
    toast.success(
      kind === "allRead" ? "已清除全部已讀通知。" : `已刪除 ${ids.length} 則通知。`
    );
  };

  const handleItemClick = async (item: NotificationItem) => {
    if (!item.read_at) {
      setItems((current) =>
        current.map((it) =>
          it.id === item.id ? { ...it, read_at: new Date().toISOString() } : it
        )
      );
      // 背景動作，失敗不打擾使用者；但沒有 catch 就是一個 unhandled rejection
      markNotificationsRead([item.id]).catch(() => {});
    }
    const { href } = getNotificationDisplay(item.notification_type, item.payload);
    if (href) router.push(href);
  };

  if (isLoading) {
    return (
      <PageSpinner className="flex-1 py-20" />
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
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleMarkAllRead}
            disabled={marking || unreadCount === 0}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span translate="no" aria-hidden="true" className="material-symbols-outlined notranslate text-[18px]">done_all</span>
            全部標為已讀
          </button>
          <button
            type="button"
            onClick={() => setConfirm("allRead")}
            disabled={deleting || readCount === 0}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span translate="no" aria-hidden="true" className="material-symbols-outlined notranslate text-[18px]">delete_sweep</span>
            清除全部已讀
          </button>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
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

        <div className="w-44">
          <Select
            value={typeFilter}
            onValueChange={setTypeFilter}
            options={typeOptions}
            ariaLabel="依通知類型篩選"
          />
        </div>
        <div className="w-32">
          <Select
            value={rangeFilter}
            onValueChange={(v) => setRangeFilter(v as RangeKey)}
            options={RANGE_OPTIONS}
            ariaLabel="依時間範圍篩選"
          />
        </div>
        <input
          type="search"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="搜尋通知內容…"
          aria-label="搜尋通知內容"
          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20 sm:w-52"
        />

        {filtered.length > 0 && (
          <label className="ml-auto flex cursor-pointer items-center gap-2 text-sm text-slate-500">
            <input
              type="checkbox"
              checked={allVisibleSelected}
              onChange={toggleSelectAll}
              className="h-4 w-4 cursor-pointer rounded border-slate-300 accent-primary"
            />
            全選（{filtered.length}）
          </label>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="py-16 text-center text-slate-400">
          <span translate="no" aria-hidden="true" className="material-symbols-outlined notranslate mb-3 block text-5xl">
            notifications_off
          </span>
          <p className="text-sm">
            {hasActiveFilter ? "沒有符合條件的通知" : "目前沒有任何通知"}
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {filtered.map(({ item, display }) => {
            const unread = !item.read_at;
            return (
              <li
                key={item.id}
                className={`group flex items-start gap-3 rounded-md border p-4 transition-all hover:shadow-md ${
                  unread
                    ? "border-primary/30 bg-primary/5"
                    : "border-slate-200 bg-white hover:border-slate-300"
                }`}
              >
                <input
                  type="checkbox"
                  checked={selected.has(item.id)}
                  onChange={() => toggleSelected(item.id)}
                  aria-label={`選取「${display.title}」`}
                  className="mt-1 h-4 w-4 shrink-0 cursor-pointer rounded border-slate-300 accent-primary"
                />
                {/* 整列曾是一顆 button，塞不下第二顆（巢狀 button 是無效 HTML）；
                    改為列＝flex 容器，主要內容與刪除鈕各自是獨立按鈕 */}
                <button
                  type="button"
                  onClick={() => handleItemClick(item)}
                  className="flex min-w-0 flex-1 items-start gap-3 text-left"
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
                      {formatDateTime(item.created_at)}
                    </span>
                  </span>
                  {display.href && (
                    <span translate="no" aria-hidden="true" className="material-symbols-outlined notranslate mt-1 shrink-0 text-[18px] text-slate-300">
                      arrow_forward
                    </span>
                  )}
                </button>
                {/* 觸控裝置沒有 hover，故 max-md 一律顯示 */}
                <button
                  type="button"
                  onClick={() => handleDeleteOne(item.id)}
                  aria-label={`刪除「${display.title}」`}
                  className="shrink-0 rounded-lg p-1.5 text-slate-300 opacity-100 transition-colors hover:bg-slate-100 hover:text-slate-600 md:opacity-0 md:focus-visible:opacity-100 md:group-hover:opacity-100"
                >
                  <span translate="no" aria-hidden="true" className="material-symbols-outlined notranslate text-[18px]">
                    delete
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {visibleSelected.length > 0 && (
        <div className="sticky bottom-4 z-20 mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-white shadow-lg">
          <div className="flex items-center gap-2 text-sm">
            <span className="font-bold">已選 {visibleSelected.length} 筆</span>
            <button
              type="button"
              onClick={() => setSelected(new Set())}
              className="text-xs text-slate-300 underline-offset-2 hover:underline"
            >
              清除
            </button>
          </div>
          <button
            type="button"
            onClick={() => setConfirm("selected")}
            disabled={deleting}
            className="rounded-lg bg-white/10 px-3 py-1.5 text-sm font-semibold transition-colors hover:bg-white/20 disabled:opacity-60"
          >
            刪除所選
          </button>
        </div>
      )}

      <ConfirmDialog
        open={confirm !== null}
        title={confirm === "allRead" ? "確定要清除全部已讀通知嗎？" : "確定要刪除所選通知嗎？"}
        description={
          confirm === "allRead"
            ? `將刪除 ${readCount} 則已讀通知（未讀不受影響）。刪除後無法自行復原。`
            : `將刪除 ${visibleSelected.length} 則通知。刪除後無法自行復原。`
        }
        confirmText="刪除"
        isConfirmDanger
        isLoading={deleting}
        onConfirm={handleConfirmDelete}
        onClose={() => setConfirm(null)}
      />
    </main>
  );
}
