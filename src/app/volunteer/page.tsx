"use client";

// 志工活動列表（精簡列表）：一列一活動，顯示場次日期區間、地點、場次數、
// 名額狀態，整列連到活動詳情頁逐場次報名。可報名/截止以「場次截止時間」
// 即時計算，不依賴活動 status 欄位（排程推進由 Cloudflare Cron Worker
// 每 15 分執行一次，可能延遲）。

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/toast";
import { useAuth } from "@/components/auth-provider";
import { Select } from "@/components/ui/select";
import type { VolunteerStatus } from "@/lib/types/database";

const MD_FORMATTER = new Intl.DateTimeFormat("zh-TW", {
  month: "2-digit",
  day: "2-digit",
  timeZone: "Asia/Taipei",
});

const ACCOUNT_STATUS_BANNER: Partial<Record<VolunteerStatus, { label: string; color: string }>> = {
  suspended: { label: "帳號已停權，暫無法報名或收藏活動", color: "bg-amber-100 text-amber-700" },
  graduated: { label: "帳號已結案，暫無法報名或收藏活動", color: "bg-slate-200 text-slate-600" },
};

type Availability = "open" | "full" | "closed";

interface ActivityListItem {
  id: string;
  title: string;
  location: string;
  sessionCount: number;
  firstStart: string | null;
  lastEnd: string | null;
  availability: Availability;
  openSlots: number;
  totalSlots: number;
}

const AVAILABILITY_META: Record<Availability, { label: string; className: string }> = {
  open: { label: "可報名", className: "bg-emerald-100 text-emerald-700" },
  full: { label: "已額滿", className: "bg-amber-100 text-amber-700" },
  closed: { label: "已截止", className: "bg-slate-200 text-slate-500" },
};

type SortKey = "date_asc" | "date_desc" | "slots_desc";

const SORT_OPTIONS = [
  { value: "date_asc", label: "日期（近→遠）" },
  { value: "date_desc", label: "日期（遠→近）" },
  { value: "slots_desc", label: "剩餘名額（多→少）" },
];

// 共通規則：無場次者（firstStart 為 null）一律殿後。
const SORT_COMPARATORS: Record<SortKey, (a: ActivityListItem, b: ActivityListItem) => number> = {
  date_asc: (a, b) => (a.firstStart ?? "~").localeCompare(b.firstStart ?? "~"),
  date_desc: (a, b) => {
    if (!a.firstStart) return b.firstStart ? 1 : 0;
    if (!b.firstStart) return -1;
    return b.firstStart.localeCompare(a.firstStart);
  },
  slots_desc: (a, b) =>
    b.openSlots - a.openSlots || (a.firstStart ?? "~").localeCompare(b.firstStart ?? "~"),
};

function formatRange(firstStart: string | null, lastEnd: string | null): string {
  if (!firstStart) return "時間未定";
  const start = MD_FORMATTER.format(new Date(firstStart));
  if (!lastEnd) return start;
  const end = MD_FORMATTER.format(new Date(lastEnd));
  return start === end ? start : `${start}–${end}`;
}

export default function VolunteerPage() {
  const [supabase] = useState(() => createClient());
  const toast = useToast();
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();

  const [activities, setActivities] = useState<ActivityListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [hideFull, setHideFull] = useState(false);
  const [showClosed, setShowClosed] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("date_asc");
  const [volunteerStatus, setVolunteerStatus] = useState<VolunteerStatus | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading || !user) return;
    supabase
      .from("volunteer_profiles")
      .select("status")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => setVolunteerStatus(data?.status ?? null));
  }, [supabase, user, authLoading]);

  const loadActivities = useCallback(async () => {
    setFetchError(null);
    const [{ data: acts, error }, { data: slots }] = await Promise.all([
      supabase
        .from("activities")
        .select("id, title, location, status, activity_sessions(*)")
        .neq("status", "draft")
        .neq("status", "cancelled")
        .order("created_at", { ascending: false }),
      supabase.from("v_session_open_slots").select("activity_session_id, open_slots"),
    ]);

    if (error) {
      setFetchError(`活動載入失敗：${error.message}`);
      setIsLoading(false);
      return;
    }

    const openBySession = new Map<string, number>(
      (slots ?? []).map((s: any) => [s.activity_session_id, s.open_slots])
    );
    const nowIso = new Date().toISOString();

    const items: ActivityListItem[] = (acts ?? []).map((a: any) => {
      // 行前說明會為純資訊場次，不列入報名狀態、名額與場次數計算。
      const sessions = (a.activity_sessions ?? []).filter(
        (s: any) => !s.cancelled_at && s.session_type !== "briefing"
      );
      const registerable = sessions.filter(
        (s: any) =>
          s.registration_deadline_at > nowIso && (openBySession.get(s.id) ?? s.capacity) > 0
      );
      const notPastDeadline = sessions.filter((s: any) => s.registration_deadline_at > nowIso);

      let availability: Availability = "closed";
      if (registerable.length > 0) availability = "open";
      else if (notPastDeadline.length > 0) availability = "full";

      const openSlots = registerable.reduce(
        (sum: number, s: any) => sum + (openBySession.get(s.id) ?? 0),
        0
      );
      // 進度條分母：仍在報名期間（未過截止）場次的總容量，剩餘＝openSlots。
      const totalSlots = notPastDeadline.reduce(
        (sum: number, s: any) => sum + (s.capacity ?? 0),
        0
      );
      const starts = sessions.map((s: any) => s.start_at).sort();
      const ends = sessions.map((s: any) => s.end_at).sort();

      return {
        id: a.id,
        title: a.title,
        location: a.location,
        sessionCount: sessions.length,
        firstStart: starts[0] ?? null,
        lastEnd: ends[ends.length - 1] ?? null,
        availability,
        openSlots,
        totalSlots,
      };
    });

    setActivities(items);
    setIsLoading(false);
  }, [supabase]);

  useEffect(() => {
    loadActivities();
  }, [loadActivities]);

  useEffect(() => {
    if (fetchError) toast.error(fetchError, "活動載入失敗");
  }, [fetchError, toast]);

  const filtered = activities
    .filter((a) => {
      if (hideFull && a.availability !== "open") return false;
      if (!showClosed && a.availability === "closed") return false;
      if (!searchQuery) return true;
      const q = searchQuery.toLowerCase();
      return a.title.toLowerCase().includes(q) || a.location.toLowerCase().includes(q);
    })
    .sort(SORT_COMPARATORS[sortKey]);

  const statusBanner = volunteerStatus ? ACCOUNT_STATUS_BANNER[volunteerStatus] : null;

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center py-20">
        <span aria-hidden="true" className="material-symbols-outlined animate-spin text-4xl text-primary">
          progress_activity
        </span>
      </div>
    );
  }

  return (
    <main className="flex flex-1 flex-col bg-white px-4 py-6 sm:px-6">
      <div className="flex w-full flex-col">
        <div className="mb-6">
          <h1 className="text-xl font-bold leading-tight tracking-tight text-slate-900">
            志工活動
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            點選活動可查看各梯次時間，選擇適合的場次報名。
          </p>
        </div>

        {statusBanner && (
          <div className={`mb-6 rounded-lg px-4 py-3 text-sm font-semibold ${statusBanner.color}`}>
            {statusBanner.label}
          </div>
        )}

        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="flex h-12 flex-1 items-stretch rounded-lg border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-center pl-4 text-slate-400">
              <span aria-hidden="true" className="material-symbols-outlined">search</span>
            </div>
            <input
              className="w-full min-w-0 flex-1 border-none bg-transparent px-4 text-slate-900 placeholder:text-slate-400 focus:ring-0"
              placeholder="以活動名稱、地點搜尋…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <Select
            value={sortKey}
            onValueChange={(v) => setSortKey(v as SortKey)}
            options={SORT_OPTIONS}
            ariaLabel="排序方式"
            className="w-full sm:w-44"
            triggerClassName="h-12"
          />
          <button
            type="button"
            onClick={() => setHideFull((v) => !v)}
            aria-pressed={hideFull}
            className={`inline-flex w-fit shrink-0 items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
              hideFull ? "bg-primary text-white" : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            <span aria-hidden="true" className="material-symbols-outlined text-[18px]">
              {hideFull ? "check_circle" : "filter_alt"}
            </span>
            只看可報名
          </button>
          <button
            type="button"
            onClick={() => setShowClosed((v) => !v)}
            aria-pressed={showClosed}
            className={`inline-flex w-fit shrink-0 items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
              showClosed ? "bg-primary text-white" : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            <span aria-hidden="true" className="material-symbols-outlined text-[18px]">
              {showClosed ? "visibility" : "visibility_off"}
            </span>
            顯示已截止
          </button>
        </div>

        {filtered.length > 0 ? (
          <ul className="space-y-3">
            {filtered.map((a) => {
              const meta = AVAILABILITY_META[a.availability];
              const canRegister = a.availability === "open";
              const goDetail = () => router.push(`/volunteer/${a.id}`);
              const filledPct =
                a.totalSlots > 0
                  ? Math.round(((a.totalSlots - a.openSlots) / a.totalSlots) * 100)
                  : 0;
              return (
                <li key={a.id}>
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={goDetail}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        goDetail();
                      }
                    }}
                    className="group cursor-pointer rounded-md border border-slate-200 bg-white p-5 transition-all hover:border-slate-300 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-primary/30"
                  >
                    {/* 上排：標題（放大）＋狀態徽章 */}
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="text-lg font-bold leading-snug text-slate-900 group-hover:text-primary">
                        {a.title}
                      </h3>
                      <span
                        className={`mt-0.5 shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold ${meta.className}`}
                      >
                        {meta.label}
                      </span>
                    </div>

                    {/* 中排：帶標籤橫向排列（日期／場次／地點），窄螢幕自動換行 */}
                    <div className="mt-3 flex flex-wrap items-center gap-x-8 gap-y-2 text-sm text-slate-700">
                      <span className="inline-flex items-center gap-1.5">
                        <span aria-hidden="true" className="material-symbols-outlined text-[18px] text-slate-400">
                          calendar_today
                        </span>
                        <span>
                          <span className="font-medium text-slate-500">日期：</span>
                          {formatRange(a.firstStart, a.lastEnd)}
                        </span>
                      </span>
                      {a.sessionCount > 0 && (
                        <span className="inline-flex items-center gap-1.5">
                          <span aria-hidden="true" className="material-symbols-outlined text-[18px] text-slate-400">
                            event_repeat
                          </span>
                          <span>
                            <span className="font-medium text-slate-500">場次：</span>
                            {a.sessionCount} 場
                          </span>
                        </span>
                      )}
                      <span className="inline-flex items-center gap-1.5">
                        <span aria-hidden="true" className="material-symbols-outlined text-[18px] text-slate-400">
                          location_on
                        </span>
                        <span>
                          <span className="font-medium text-slate-500">地點：</span>
                          {a.location}
                        </span>
                      </span>
                    </div>

                    <div className="my-4 border-t border-slate-100" />

                    {/* 底排：名額進度條 ＋ 報名鈕 */}
                    <div className="flex items-center gap-5">
                      <div className="min-w-0 flex-1">
                        {a.totalSlots > 0 ? (
                          <>
                            <div className="mb-1.5 flex items-center justify-between text-xs font-medium">
                              <span className="text-slate-400">名額</span>
                              <span className={canRegister ? "text-slate-600" : "text-amber-600"}>
                                {canRegister ? `剩餘 ${a.openSlots} / ${a.totalSlots} 名` : "已額滿"}
                              </span>
                            </div>
                            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                              <div
                                className={`h-full rounded-full transition-all ${
                                  canRegister ? "bg-primary" : "bg-amber-400"
                                }`}
                                style={{ width: `${filledPct}%` }}
                              />
                            </div>
                          </>
                        ) : (
                          <span className="text-xs font-medium text-slate-400">報名已截止</span>
                        )}
                      </div>
                      <button
                        type="button"
                        disabled={!canRegister}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (canRegister) goDetail();
                        }}
                        className={`shrink-0 rounded-md px-5 py-2.5 text-sm font-semibold transition-colors ${
                          canRegister
                            ? "bg-primary text-white hover:bg-primary/90"
                            : "cursor-not-allowed bg-slate-100 text-slate-400"
                        }`}
                      >
                        {a.availability === "open"
                          ? "報名"
                          : a.availability === "full"
                            ? "已額滿"
                            : "已截止"}
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="py-16 text-center text-slate-400">
            <span aria-hidden="true" className="material-symbols-outlined mb-3 block text-5xl">search_off</span>
            <p className="text-sm">
              {activities.length === 0 ? "目前沒有任何志工活動" : "找不到符合條件的志工活動"}
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
