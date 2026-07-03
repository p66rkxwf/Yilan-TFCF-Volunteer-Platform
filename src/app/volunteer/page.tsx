"use client";

import Link from "next/link";
import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/toast";
import { useAuth } from "@/components/auth-provider";
import { registerForSession } from "@/lib/actions/registrations";

const DATE_TIME_FORMATTER = new Intl.DateTimeFormat("zh-TW", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Taipei",
});

interface ActivityWithSlots {
  id: string;
  title: string;
  content: string | null;
  location: string;
  status: string;
  cancel_review_window_days: number;
  session_id: string | null;
  start_at: string | null;
  end_at: string | null;
  session_cancelled: boolean;
  capacity: number;
  registered_count: number;
  spots_left: number;
  organizer_name: string;
  organizer_phone: string;
}

function canRegisterFor(event: ActivityWithSlots) {
  return event.status === "open" && !event.session_cancelled && event.spots_left > 0;
}

function FavoriteButton({
  activityId,
  favoriteIds,
  onToggle,
  disabled = false,
}: {
  activityId: string;
  favoriteIds: Set<string>;
  onToggle: (id: string) => void;
  disabled?: boolean;
}) {
  const isFav = favoriteIds.has(activityId);
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onToggle(activityId);
      }}
      disabled={disabled}
      className={`p-1.5 rounded-lg transition-colors ${
        isFav
          ? "text-red-500 hover:text-red-600"
          : "text-slate-300 hover:text-red-400"
      } ${disabled ? "cursor-not-allowed opacity-60" : ""}`}
      title={disabled ? "處理中" : isFav ? "取消收藏" : "加入收藏"}
    >
      <span
        className="material-symbols-outlined text-[22px]"
        style={{ fontVariationSettings: isFav ? "'FILL' 1" : "'FILL' 0" }}
      >
        favorite
      </span>
    </button>
  );
}

function EventDetailModal({
  event,
  onClose,
  onRegister,
  isRegistering,
  favoriteIds,
  onToggleFavorite,
  favoritePendingIds,
}: {
  event: ActivityWithSlots;
  onClose: () => void;
  onRegister: (id: string) => void;
  isRegistering: boolean;
  favoriteIds: Set<string>;
  onToggleFavorite: (id: string) => void;
  favoritePendingIds: Set<string>;
}) {
  const isFavoritePending = favoritePendingIds.has(event.id);
  const registerable = canRegisterFor(event);

  return (
    <div
      className="fixed inset-0 z-[100] overflow-y-auto"
      onClick={onClose}
    >
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" />
      <div className="flex min-h-full items-start justify-center p-4 sm:p-6 md:p-8">
      <div
        className="relative z-10 w-full max-w-4xl overflow-y-auto rounded-lg bg-white shadow-xl max-h-[calc(100dvh-2rem)] sm:max-h-[calc(100dvh-3rem)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-col justify-between gap-4 border-b border-slate-100 p-5 sm:flex-row sm:items-start sm:p-8 md:p-12">
          <div>
            <h1 className="mb-2 text-2xl font-bold text-slate-900 sm:text-3xl">
              {event.title}
            </h1>
            <p className="text-slate-500 flex items-center gap-2">
              <span className="material-symbols-outlined text-sm">person</span>
              活動主辦人：{event.organizer_name || "—"}
              {event.organizer_phone ? `（${event.organizer_phone}）` : ""}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <FavoriteButton
              activityId={event.id}
              favoriteIds={favoriteIds}
              onToggle={onToggleFavorite}
              disabled={isFavoritePending}
            />
            <button
              className="p-2 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors"
              onClick={onClose}
            >
              <span className="material-symbols-outlined">close</span>
            </button>
          </div>
        </div>

        <div className="space-y-8 p-5 sm:p-8 md:p-12">
          <section>
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400 mb-4">
              活動內容
            </h3>
            <p className="text-slate-700 leading-relaxed whitespace-pre-wrap">
              {event.content}
            </p>
          </section>

          <div className="grid grid-cols-1 gap-x-12 gap-y-8 md:grid-cols-2">
            <div>
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400 mb-2">
                活動時間
              </h3>
              <p className="text-lg font-medium">
                {event.start_at ? DATE_TIME_FORMATTER.format(new Date(event.start_at)) : "尚未公告"}
                {event.end_at ? ` - ${new Date(event.end_at).toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Taipei" })}` : ""}
              </p>
            </div>
            <div>
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400 mb-2">
                活動地點
              </h3>
              <p className="text-lg font-medium">{event.location}</p>
            </div>
            <div>
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400 mb-2">
                活動人數
              </h3>
              <p className="text-lg font-medium">
                {event.capacity} 人（尚餘 {event.spots_left} 名額）
              </p>
            </div>
            <div>
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400 mb-2">
                取消審核門檻
              </h3>
              <p className="text-lg font-medium text-red-600">
                {event.cancel_review_window_days === 0
                  ? "任何時候取消皆需審核"
                  : `活動開始前 ${event.cancel_review_window_days} 天內取消需審核`}
              </p>
            </div>
          </div>

          <div className="pt-8 mt-8 border-t border-slate-100">
            <button
              onClick={() => onRegister(event.id)}
              disabled={isRegistering || !registerable}
              className="w-full md:w-auto px-12 py-4 bg-primary text-white font-bold rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {isRegistering ? (
                <span className="material-symbols-outlined animate-spin text-[20px]">
                  progress_activity
                </span>
              ) : !registerable ? (
                event.spots_left <= 0 ? "名額已滿" : "已無法報名"
              ) : (
                "立即報名"
              )}
            </button>
            <p className="text-xs text-slate-400 mt-4 text-center md:text-left">
              報名即表示您同意本平台的{" "}
              <Link href="/terms" className="text-primary hover:underline">
                服務條款
              </Link>
              {" "}與{" "}
              <Link href="/privacy" className="text-primary hover:underline">
                隱私政策
              </Link>
              。
            </p>
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}

function EventCard({
  event,
  onViewDetail,
  onRegister,
  isRegistering,
  favoriteIds,
  onToggleFavorite,
  favoritePendingIds,
}: {
  event: ActivityWithSlots;
  onViewDetail: () => void;
  onRegister: (id: string) => void;
  isRegistering: boolean;
  favoriteIds: Set<string>;
  onToggleFavorite: (id: string) => void;
  favoritePendingIds: Set<string>;
}) {
  const isFavoritePending = favoritePendingIds.has(event.id);
  const registerable = canRegisterFor(event);

  return (
    <div className="flex flex-col md:flex-row items-stretch bg-white border border-slate-200 rounded-lg overflow-hidden hover:shadow-md transition-shadow">
      <div className="w-full md:w-48 bg-slate-100 flex items-center justify-center p-6">
        <span className="material-symbols-outlined text-5xl text-slate-300">
          volunteer_activism
        </span>
      </div>
      <div className="flex flex-1 flex-col justify-between p-6">
        <div className="mb-4">
          <div className="flex justify-between items-start mb-2">
            <h3 className="text-xl font-bold text-slate-900 tracking-tight">
              {event.title}
            </h3>
            <div className="flex items-center gap-1 shrink-0 ml-3">
              <FavoriteButton
                activityId={event.id}
                favoriteIds={favoriteIds}
                onToggle={onToggleFavorite}
                disabled={isFavoritePending}
              />
              {event.spots_left <= 0 && (
                <span className="px-2 py-1 bg-red-100 text-[10px] font-bold uppercase tracking-widest text-red-600 rounded">
                  額滿
                </span>
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-y-2 gap-x-6 text-sm text-slate-600 mt-3">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-slate-400">
                calendar_today
              </span>
              <span>
                活動時間：
                <span className="font-semibold text-slate-900">
                  {event.start_at ? DATE_TIME_FORMATTER.format(new Date(event.start_at)) : "尚未公告"}
                </span>
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-slate-400">
                location_on
              </span>
              <span>
                地點：
                <span className="font-semibold text-slate-900">
                  {event.location}
                </span>
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-slate-400">
                group
              </span>
              <span>
                剩餘名額：
                <span className="font-semibold text-slate-900">
                  {event.spots_left} / {event.capacity}
                </span>
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center justify-end gap-3 border-t border-slate-100 pt-4">
          <button
            onClick={onViewDetail}
            className="border border-slate-200 text-slate-700 px-6 py-2 rounded-lg text-sm font-bold hover:bg-slate-50 transition-colors"
          >
            查看詳情
          </button>
          <button
            onClick={() => onRegister(event.id)}
            disabled={isRegistering || !registerable}
            className="bg-primary hover:bg-primary/90 text-white px-8 py-2 rounded-lg text-sm font-bold transition-colors disabled:opacity-60"
          >
            {registerable ? "立即報名" : event.spots_left <= 0 ? "額滿" : "已截止"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function VolunteerPage() {
  const [supabase] = useState(() => createClient());
  const toast = useToast();
  const { user, isLoading: authLoading } = useAuth();
  const [activities, setActivities] = useState<ActivityWithSlots[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedEvent, setSelectedEvent] = useState<ActivityWithSlots | null>(null);
  const [isRegistering, setIsRegistering] = useState(false);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [favoritePendingIds, setFavoritePendingIds] = useState<Set<string>>(new Set());

  const [fetchError, setFetchError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setFavoriteIds(new Set());
      return;
    }
    async function loadFavorites(userId: string) {
      const { data } = await supabase
        .from("favorites")
        .select("activity_id")
        .eq("volunteer_id", userId);
      if (data) setFavoriteIds(new Set(data.map((f) => f.activity_id)));
    }
    loadFavorites(user.id);
  }, [supabase, user, authLoading]);

  useEffect(() => {
    if (fetchError) {
      toast.error(fetchError, "活動載入失敗");
    }
  }, [fetchError, toast]);

  const handleToggleFavorite = async (activityId: string) => {
    if (favoritePendingIds.has(activityId)) return;

    if (!user) {
      toast.info("請先登入後再使用收藏功能。");
      return;
    }

    const isFav = favoriteIds.has(activityId);
    setFavoritePendingIds((prev) => new Set(prev).add(activityId));

    try {
      if (isFav) {
        const { error } = await supabase
          .from("favorites")
          .delete()
          .eq("volunteer_id", user.id)
          .eq("activity_id", activityId);

        if (error) {
          toast.error(`取消收藏失敗：${error.message}`);
          return;
        }

        setFavoriteIds((prev) => {
          const next = new Set(prev);
          next.delete(activityId);
          return next;
        });
        toast.success("已取消收藏活動。");
        return;
      }

      // V2 的 favorites 新增需帳號狀態為 active（待審核/停權志工無法收藏）
      const { error } = await supabase.from("favorites").upsert(
        {
          volunteer_id: user.id,
          activity_id: activityId,
        },
        {
          onConflict: "volunteer_id,activity_id",
          ignoreDuplicates: true,
        }
      );

      if (error) {
        toast.error("收藏失敗：帳號審核通過後才能收藏活動。");
        return;
      }

      setFavoriteIds((prev) => new Set(prev).add(activityId));
      toast.success("活動已加入收藏。");
    } finally {
      setFavoritePendingIds((prev) => {
        const next = new Set(prev);
        next.delete(activityId);
        return next;
      });
    }
  };

  const loadActivities = useCallback(async () => {
    setFetchError(null);

    // V1 的活動瀏覽只顯示未取消活動；V2 的 activities 不再直接帶場次
    // 時間/名額，改由 join activity_sessions（本次「一活動一場次」簡化）
    // 與 v_session_open_slots（剩餘名額）、v_organizer_contacts（主辦人聯絡）補齊。
    const [{ data: acts, error }, { data: slots }, { data: organizers }] = await Promise.all([
      supabase
        .from("activities")
        .select("*, activity_sessions(*)")
        .neq("status", "draft")
        .neq("status", "cancelled")
        .order("created_at", { ascending: false }),
      supabase.from("v_session_open_slots").select("*"),
      supabase.from("v_organizer_contacts").select("activity_id, full_name, phone"),
    ]);

    if (error) {
      setFetchError(`活動載入失敗：${error.message}（${error.code}）`);
      setIsLoading(false);
      return;
    }

    if (!acts || acts.length === 0) {
      setActivities([]);
      setIsLoading(false);
      return;
    }

    const slotBySessionId = new Map<string, any>((slots ?? []).map((s: any) => [s.activity_session_id, s]));
    const organizerByActivityId = new Map<string, any>(
      (organizers ?? []).map((o: any) => [o.activity_id, o])
    );

    const withSlots: ActivityWithSlots[] = acts.map((a: any) => {
      const session = a.activity_sessions?.[0] ?? null;
      const slot = session ? slotBySessionId.get(session.id) : undefined;
      const capacity = session?.capacity ?? 0;
      const openSlots = slot?.open_slots ?? capacity;
      const organizer = organizerByActivityId.get(a.id);

      return {
        id: a.id,
        title: a.title,
        content: a.content,
        location: a.location,
        status: a.status,
        cancel_review_window_days: a.cancel_review_window_days,
        session_id: session?.id ?? null,
        start_at: session?.start_at ?? null,
        end_at: session?.end_at ?? null,
        session_cancelled: !!session?.cancelled_at,
        capacity,
        registered_count: capacity - openSlots,
        spots_left: openSlots,
        organizer_name: organizer?.full_name ?? "",
        organizer_phone: organizer?.phone ?? "",
      };
    });

    withSlots.sort((a, b) => (a.start_at ?? "").localeCompare(b.start_at ?? ""));

    setActivities(withSlots);
    setIsLoading(false);
  }, [supabase]);

  useEffect(() => {
    loadActivities();
  }, [loadActivities]);

  const handleRegister = async (activityId: string) => {
    if (!user) {
      toast.error("請先登入再進行報名。");
      return;
    }

    const event = activities.find((a) => a.id === activityId);
    if (!event?.session_id) {
      toast.error("此活動尚未設定場次，無法報名。");
      return;
    }

    setIsRegistering(true);

    const { error } = await registerForSession(event.session_id);

    if (error) {
      toast.error(error);
    } else {
      toast.success("報名成功！請等待審核。");
      await loadActivities();
    }

    setIsRegistering(false);
  };

  const filtered = activities.filter((a) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      a.title.toLowerCase().includes(q) ||
      (a.content ?? "").toLowerCase().includes(q) ||
      a.location.toLowerCase().includes(q) ||
      a.organizer_name.toLowerCase().includes(q)
    );
  });

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
    <>
      <main className="flex flex-1 justify-center py-10 px-6 md:px-20">
        <div className="flex flex-col max-w-5xl flex-1">
          <div className="flex flex-wrap justify-between gap-3 mb-8">
            <div className="flex flex-col gap-2">
              <h1 className="text-slate-900 text-4xl font-black leading-tight tracking-tight uppercase">
                Volunteer Events
              </h1>
              <p className="text-slate-500 text-base font-normal">
                探索志工服務機會，加入我們的行列，用行動為社區帶來正向改變。
              </p>
            </div>
          </div>

          {fetchError && (
            <div className="mb-6 px-4 py-3 rounded-lg text-sm bg-red-50 border border-red-200 text-red-700">
              {fetchError}
            </div>
          )}

          <div className="flex flex-col gap-6 mb-10">
            <div className="flex w-full items-stretch rounded-lg h-14 bg-white border border-slate-200 shadow-sm">
              <div className="text-slate-400 flex items-center justify-center pl-4">
                <span className="material-symbols-outlined">search</span>
              </div>
              <input
                className="w-full min-w-0 flex-1 border-none bg-transparent focus:ring-0 text-slate-900 px-4 text-base placeholder:text-slate-400"
                placeholder="以活動名稱、地點搜尋..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4">
            {filtered.length > 0 ? (
              filtered.map((a) => (
                <EventCard
                  key={a.id}
                  event={a}
                  onViewDetail={() => {
                    setSelectedEvent(a);
                  }}
                  onRegister={handleRegister}
                  isRegistering={isRegistering}
                  favoriteIds={favoriteIds}
                  onToggleFavorite={handleToggleFavorite}
                  favoritePendingIds={favoritePendingIds}
                />
              ))
            ) : (
              <div className="text-center py-16 text-slate-400">
                <span className="material-symbols-outlined text-5xl mb-4 block">
                  search_off
                </span>
                <p className="text-lg">
                  {activities.length === 0
                    ? "目前沒有任何志工活動"
                    : "找不到符合條件的志工活動"}
                </p>
              </div>
            )}
          </div>
        </div>
      </main>

      {selectedEvent && (
        <EventDetailModal
          event={selectedEvent}
          onClose={() => setSelectedEvent(null)}
          onRegister={handleRegister}
          isRegistering={isRegistering}
          favoriteIds={favoriteIds}
          onToggleFavorite={handleToggleFavorite}
          favoritePendingIds={favoritePendingIds}
        />
      )}
    </>
  );
}
