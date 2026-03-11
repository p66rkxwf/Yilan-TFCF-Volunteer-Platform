"use server";

import { createClient } from "@/lib/supabase/server";
import type { Activity } from "@/lib/types/database";

interface ActionResult {
  error?: string;
  success?: boolean;
  favorited?: boolean;
}

export async function toggleFavorite(activityId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "請先登入。" };

  const { data: existing } = await supabase
    .from("favorites")
    .select("id")
    .eq("user_id", user.id)
    .eq("activity_id", activityId)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from("favorites")
      .delete()
      .eq("id", existing.id);
    if (error) return { error: `取消收藏失敗：${error.message}` };
    return { success: true, favorited: false };
  } else {
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
    if (error) return { error: `收藏失敗：${error.message}` };
    return { success: true, favorited: true };
  }
}

export async function getFavorites(): Promise<
  (Activity & { favorite_id: string; favorite_created_at: string })[]
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return [];

  const { data } = await supabase
    .from("favorites")
    .select("id, created_at, activity_id, activities(*)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  return (
    data?.map((f: any) => ({
      ...f.activities,
      favorite_id: f.id,
      favorite_created_at: f.created_at,
    })) ?? []
  );
}

export async function getMyFavoriteIds(): Promise<string[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return [];

  const { data } = await supabase
    .from("favorites")
    .select("activity_id")
    .eq("user_id", user.id);

  return data?.map((f) => f.activity_id) ?? [];
}
