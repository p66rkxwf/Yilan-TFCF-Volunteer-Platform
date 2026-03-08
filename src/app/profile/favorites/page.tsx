"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

interface FavoriteActivity {
  id: string;
  title: string;
  activity_date: string;
  activity_time: string;
  location: string;
  capacity: number;
  manager_name: string;
  is_cancelled: boolean | null;
  favorite_id: string;
  registered_count: number;
  spots_left: number;
}

export default function FavoritesPage() {
  const supabase = createClient();
  const [favorites, setFavorites] = useState<FavoriteActivity[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [actionMsg, setActionMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const loadFavorites = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data } = await supabase
      .from("favorites")
      .select("id, activity_id, activities(*)")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (!data || data.length === 0) {
      setFavorites([]);
      setIsLoading(false);
      return;
    }

    const mapped: FavoriteActivity[] = await Promise.all(
      data.map(async (f: any) => {
        const act = f.activities;
        const { count } = await supabase
          .from("registrations")
          .select("*", { count: "exact", head: true })
          .eq("activity_id", f.activity_id)
          .in("status", ["pending", "approved"]);

        const registered_count = count ?? 0;
        return {
          ...act,
          favorite_id: f.id,
          registered_count,
          spots_left: (act?.capacity ?? 0) - registered_count,
        };
      })
    );

    setFavorites(mapped);
    setIsLoading(false);
  }, [supabase]);

  useEffect(() => {
    loadFavorites();
  }, [loadFavorites]);

  useEffect(() => {
    if (actionMsg) {
      const t = setTimeout(() => setActionMsg(null), 3000);
      return () => clearTimeout(t);
    }
  }, [actionMsg]);

  const handleRemoveFavorite = async (fav: FavoriteActivity) => {
    const { error } = await supabase
      .from("favorites")
      .delete()
      .eq("id", fav.favorite_id);

    if (error) {
      setActionMsg({ type: "error", text: `取消收藏失敗：${error.message}` });
    } else {
      setActionMsg({ type: "success", text: `已取消收藏「${fav.title}」` });
      setFavorites((prev) => prev.filter((f) => f.favorite_id !== fav.favorite_id));
    }
  };

  return (
    <>
      <header className="h-16 border-b border-slate-200 bg-white flex items-center justify-between px-6 md:px-8 shrink-0">
        <h1 className="text-lg font-bold">收藏項目</h1>
        <Link
          href="/volunteer"
          className="flex items-center gap-2 bg-primary/10 text-primary px-4 py-2 rounded-lg font-semibold text-sm hover:bg-primary/20 transition-colors"
        >
          <span className="material-symbols-outlined text-[18px]">add</span>
          瀏覽活動
        </Link>
      </header>

      <div className="flex-1 overflow-y-auto p-6 md:p-8">
        <div className="max-w-4xl mx-auto space-y-6">
          {actionMsg && (
            <div
              className={`px-4 py-3 rounded-lg text-sm font-medium border ${
                actionMsg.type === "success"
                  ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                  : "bg-red-50 border-red-200 text-red-700"
              }`}
            >
              {actionMsg.text}
            </div>
          )}

          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <span className="material-symbols-outlined animate-spin text-4xl text-primary">
                progress_activity
              </span>
            </div>
          ) : favorites.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-xl border border-slate-200">
              <span className="material-symbols-outlined text-5xl text-slate-300 block mb-3">
                bookmark_border
              </span>
              <p className="text-slate-500 mb-4">還沒有收藏任何活動</p>
              <Link
                href="/volunteer"
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary text-white rounded-lg font-semibold text-sm hover:bg-primary/90 transition-colors"
              >
                前往志工專區
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {favorites.map((fav) => {
                const isCancelled = fav.is_cancelled === true;

                return (
                  <div
                    key={fav.favorite_id}
                    className={`bg-white rounded-xl border border-slate-200 p-5 flex flex-col hover:shadow-sm transition-shadow ${
                      isCancelled ? "opacity-60" : ""
                    }`}
                  >
                    <div className="flex justify-between items-start mb-3">
                      <h3 className="font-bold text-slate-900">{fav.title}</h3>
                      <button
                        onClick={() => handleRemoveFavorite(fav)}
                        className="p-1 text-red-400 hover:text-red-600 transition-colors shrink-0"
                        title="取消收藏"
                      >
                        <span className="material-symbols-outlined text-[22px]" style={{ fontVariationSettings: "'FILL' 1" }}>
                          favorite
                        </span>
                      </button>
                    </div>

                    <div className="space-y-1.5 text-sm text-slate-500 mb-4 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-[14px]">calendar_today</span>
                        {fav.activity_date}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-[14px]">location_on</span>
                        {fav.location}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-[14px]">group</span>
                        剩餘 {fav.spots_left} / {fav.capacity} 名額
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                      {isCancelled ? (
                        <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700">
                          已取消
                        </span>
                      ) : fav.spots_left <= 0 ? (
                        <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-600">
                          額滿
                        </span>
                      ) : (
                        <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700">
                          可報名
                        </span>
                      )}
                      <Link
                        href="/volunteer"
                        className="text-xs font-bold text-primary hover:underline"
                      >
                        查看詳情
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
