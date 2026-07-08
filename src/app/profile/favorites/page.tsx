"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/toast";
import { useAuth } from "@/components/auth-provider";
import { ProfilePageHeader } from "../profile-page-header";

const MD_FORMATTER = new Intl.DateTimeFormat("zh-TW", {
  month: "numeric",
  day: "numeric",
  timeZone: "Asia/Taipei",
});

type Availability = "open" | "full" | "closed" | "cancelled";

interface FavoriteActivity {
  id: string;
  title: string;
  location: string;
  favorite_id: string;
  sessionCount: number;
  firstStart: string | null;
  lastEnd: string | null;
  availability: Availability;
}

const AVAILABILITY_META: Record<Availability, { label: string; className: string }> = {
  open: { label: "可報名", className: "bg-emerald-100 text-emerald-700" },
  full: { label: "已額滿", className: "bg-amber-100 text-amber-700" },
  closed: { label: "已截止", className: "bg-slate-200 text-slate-500" },
  cancelled: { label: "已取消", className: "bg-slate-200 text-slate-600" },
};

function formatRange(firstStart: string | null, lastEnd: string | null): string {
  if (!firstStart) return "時間未定";
  const start = MD_FORMATTER.format(new Date(firstStart));
  if (!lastEnd) return start;
  const end = MD_FORMATTER.format(new Date(lastEnd));
  return start === end ? start : `${start}–${end}`;
}

export default function FavoritesPage() {
  const [supabase] = useState(() => createClient());
  const toast = useToast();
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const [favorites, setFavorites] = useState<FavoriteActivity[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());

  const loadFavorites = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);

    const { data } = await supabase
      .from("favorites")
      .select("id, activity_id, activities(id, title, location, status, activity_sessions(*))")
      .eq("volunteer_id", user.id)
      .order("created_at", { ascending: false });

    if (!data || data.length === 0) {
      setFavorites([]);
      setIsLoading(false);
      return;
    }

    const allSessionIds = data.flatMap((f: any) =>
      (f.activities?.activity_sessions ?? []).map((s: any) => s.id)
    );
    const { data: slots } = allSessionIds.length
      ? await supabase
          .from("v_session_open_slots")
          .select("activity_session_id, open_slots")
          .in("activity_session_id", allSessionIds)
      : { data: [] as any[] };
    const openBySession = new Map<string, number>(
      (slots ?? []).map((s: any) => [s.activity_session_id, s.open_slots])
    );
    const nowIso = new Date().toISOString();

    const mapped: FavoriteActivity[] = data.map((f: any) => {
      const act = f.activities;
      const sessions = (act?.activity_sessions ?? []).filter((s: any) => !s.cancelled_at);
      const registerable = sessions.filter(
        (s: any) =>
          s.registration_deadline_at > nowIso && (openBySession.get(s.id) ?? s.capacity) > 0
      );
      const notPastDeadline = sessions.filter((s: any) => s.registration_deadline_at > nowIso);

      let availability: Availability = "closed";
      if (act?.status === "cancelled") availability = "cancelled";
      else if (registerable.length > 0) availability = "open";
      else if (notPastDeadline.length > 0) availability = "full";

      const starts = sessions.map((s: any) => s.start_at).sort();
      const ends = sessions.map((s: any) => s.end_at).sort();

      return {
        id: act?.id ?? f.activity_id,
        title: act?.title ?? "未知活動",
        location: act?.location ?? "",
        favorite_id: f.id,
        sessionCount: sessions.length,
        firstStart: starts[0] ?? null,
        lastEnd: ends[ends.length - 1] ?? null,
        availability,
      };
    });

    setFavorites(mapped);
    setIsLoading(false);
  }, [supabase, user]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setFavorites([]);
      setIsLoading(false);
      return;
    }
    loadFavorites();
  }, [loadFavorites, authLoading, user]);

  const handleRemove = async (fav: FavoriteActivity) => {
    if (pendingIds.has(fav.favorite_id)) return;
    setPendingIds((prev) => new Set(prev).add(fav.favorite_id));
    try {
      const { error } = await supabase.from("favorites").delete().eq("id", fav.favorite_id);
      if (error) {
        toast.error(`取消收藏失敗：${error.message}`);
        return;
      }
      toast.success(`已取消收藏「${fav.title}」`);
      setFavorites((prev) => prev.filter((f) => f.favorite_id !== fav.favorite_id));
    } finally {
      setPendingIds((prev) => {
        const next = new Set(prev);
        next.delete(fav.favorite_id);
        return next;
      });
    }
  };

  return (
    <>
      <ProfilePageHeader
        title="收藏"
        actions={
          <Link
            href="/volunteer"
            className="flex items-center gap-2 rounded-lg bg-primary/10 px-4 py-2 text-sm font-semibold text-primary transition-colors hover:bg-primary/20"
          >
            <span className="material-symbols-outlined text-[18px]">add</span>
            瀏覽活動
          </Link>
        }
      />

      <div className="flex-1 overflow-y-auto p-5 md:p-8">
        <div className="w-full">
          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <span className="material-symbols-outlined animate-spin text-4xl text-primary">
                progress_activity
              </span>
            </div>
          ) : favorites.length === 0 ? (
            <div className="py-16 text-center">
              <span className="material-symbols-outlined mb-3 block text-5xl text-slate-300">
                bookmark_border
              </span>
              <p className="mb-4 text-sm text-slate-500">還沒有收藏任何活動</p>
              <Link
                href="/volunteer"
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary/90"
              >
                前往志工專區
              </Link>
            </div>
          ) : (
            <div className="border-t border-slate-100">
              <ul className="divide-y divide-slate-100">
                {favorites.map((fav) => {
                  const meta = AVAILABILITY_META[fav.availability];
                  return (
                    <li key={fav.favorite_id} className="flex items-center gap-3 py-3">
                      <button
                        type="button"
                        onClick={() => router.push(`/volunteer/${fav.id}`)}
                        className="group flex min-w-0 flex-1 items-center gap-3 text-left"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <h3 className="truncate font-semibold text-slate-900 group-hover:text-primary">
                              {fav.title}
                            </h3>
                            <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${meta.className}`}>
                              {meta.label}
                            </span>
                          </div>
                          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-slate-500">
                            <span className="inline-flex items-center gap-1">
                              <span className="material-symbols-outlined text-[14px]">calendar_today</span>
                              {formatRange(fav.firstStart, fav.lastEnd)}
                              {fav.sessionCount > 0 && ` · ${fav.sessionCount} 場次`}
                            </span>
                            {fav.location && (
                              <span className="inline-flex items-center gap-1">
                                <span className="material-symbols-outlined text-[14px]">location_on</span>
                                {fav.location}
                              </span>
                            )}
                          </div>
                        </div>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRemove(fav)}
                        disabled={pendingIds.has(fav.favorite_id)}
                        title="取消收藏"
                        className="shrink-0 p-1 text-primary transition-colors hover:text-primary/70 disabled:opacity-60"
                      >
                        <span
                          className="material-symbols-outlined text-[22px]"
                          style={{ fontVariationSettings: "'FILL' 1" }}
                        >
                          favorite
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
