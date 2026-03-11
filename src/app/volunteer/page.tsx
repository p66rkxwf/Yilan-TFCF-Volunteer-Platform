"use client";

import Link from "next/link";
import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Activity } from "@/lib/types/database";
import { useToast } from "@/components/ui/toast";

interface ActivityWithSlots extends Activity {
  registered_count: number;
  spots_left: number;
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

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" />
      <div
        className="relative bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto z-10"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-8 md:p-12 border-b border-slate-100 flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 mb-2">
              {event.title}
            </h1>
            <p className="text-slate-500 flex items-center gap-2">
              <span className="material-symbols-outlined text-sm">person</span>
              活動負責人：{event.manager_name}
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

        <div className="p-8 md:p-12 space-y-8">
          <section>
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400 mb-4">
              活動內容
            </h3>
            <p className="text-slate-700 leading-relaxed whitespace-pre-wrap">
              {event.content}
            </p>
          </section>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-y-8 gap-x-12">
            <div>
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400 mb-2">
                活動日期
              </h3>
              <p className="text-lg font-medium">{event.activity_date}</p>
            </div>
            <div>
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400 mb-2">
                活動時間
              </h3>
              <p className="text-lg font-medium">{event.activity_time}</p>
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
                活動負責人
              </h3>
              <p className="text-lg font-medium">{event.manager_name}</p>
            </div>
            <div>
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400 mb-2">
                最晚取消日
              </h3>
              <p className="text-lg font-medium text-red-600">
                {event.cancel_deadline}
              </p>
            </div>
          </div>

          <div className="pt-8 mt-8 border-t border-slate-100">
            <button
              onClick={() => onRegister(event.id)}
              disabled={isRegistering || event.spots_left <= 0}
              className="w-full md:w-auto px-12 py-4 bg-primary text-white font-bold rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {isRegistering ? (
                <span className="material-symbols-outlined animate-spin text-[20px]">
                  progress_activity
                </span>
              ) : event.spots_left <= 0 ? (
                "名額已滿"
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
                活動日期：
                <span className="font-semibold text-slate-900">
                  {event.activity_date}
                </span>
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-slate-400">
                schedule
              </span>
              <span>
                時間：
                <span className="font-semibold text-slate-900">
                  {event.activity_time}
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
            disabled={isRegistering || event.spots_left <= 0}
            className="bg-primary hover:bg-primary/90 text-white px-8 py-2 rounded-lg text-sm font-bold transition-colors disabled:opacity-60"
          >
            {event.spots_left <= 0 ? "額滿" : "立即報名"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function VolunteerPage() {
  const [supabase] = useState(() => createClient());
  const toast = useToast();
  const [activities, setActivities] = useState<ActivityWithSlots[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedEvent, setSelectedEvent] = useState<ActivityWithSlots | null>(null);
  const [isRegistering, setIsRegistering] = useState(false);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [favoritePendingIds, setFavoritePendingIds] = useState<Set<string>>(new Set());

  const [fetchError, setFetchError] = useState<string | null>(null);

  useEffect(() => {
    async function loadFavorites() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setFavoriteIds(new Set());
        return;
      }
      const { data } = await supabase
        .from("favorites")
        .select("activity_id")
        .eq("user_id", user.id);
      if (data) setFavoriteIds(new Set(data.map((f) => f.activity_id)));
    }
    loadFavorites();
  }, [supabase]);

  useEffect(() => {
    if (fetchError) {
      toast.error(fetchError, "活動載入失敗");
    }
  }, [fetchError, toast]);

  const handleToggleFavorite = async (activityId: string) => {
    if (favoritePendingIds.has(activityId)) return;

    const { data: { user } } = await supabase.auth.getUser();
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
          .eq("user_id", user.id)
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

      const { error } = await supabase.from("favorites").upsert(
        {
          user_id: user.id,
          activity_id: activityId,
        },
        {
          onConflict: "user_id,activity_id",
          ignoreDuplicates: true,
        }
      );

      if (error) {
        toast.error(`加入收藏失敗：${error.message}`);
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

    const { data: acts, error } = await supabase
      .from("activities")
      .select("*")
      .or("is_cancelled.eq.false,is_cancelled.is.null")
      .order("activity_date", { ascending: true });

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

    const withSlots: ActivityWithSlots[] = await Promise.all(
      acts.map(async (a) => {
        const { count } = await supabase
          .from("registrations")
          .select("*", { count: "exact", head: true })
          .eq("activity_id", a.id)
          .in("status", ["pending", "approved"]);

        const registered_count = count ?? 0;
        return {
          ...a,
          registered_count,
          spots_left: a.capacity - registered_count,
        };
      })
    );

    setActivities(withSlots);
    setIsLoading(false);
  }, [supabase]);

  useEffect(() => {
    loadActivities();
  }, [loadActivities]);

  const handleRegister = async (activityId: string) => {
    setIsRegistering(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      toast.error("請先登入再進行報名。");
      setIsRegistering(false);
      return;
    }

    const { data: existing } = await supabase
      .from("registrations")
      .select("id")
      .eq("activity_id", activityId)
      .eq("volunteer_id", user.id)
      .in("status", ["pending", "approved"])
      .single();

    if (existing) {
      toast.info("您已報名此活動。");
      setIsRegistering(false);
      return;
    }

    const { error } = await supabase.from("registrations").insert({
      activity_id: activityId,
      volunteer_id: user.id,
      status: "pending",
    });

    if (error) {
      toast.error(`報名失敗：${error.message}`);
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
      a.content.toLowerCase().includes(q) ||
      a.location.toLowerCase().includes(q) ||
      a.manager_name.toLowerCase().includes(q)
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
