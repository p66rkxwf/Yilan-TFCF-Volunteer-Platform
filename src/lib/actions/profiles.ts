"use server";

import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types/database";

export async function getProfile(): Promise<Profile | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  return data;
}

export async function updateProfile(
  updates: Partial<Pick<Profile, "full_name" | "email" | "birthday" | "region">>
): Promise<{ error?: string; success?: boolean }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "尚未登入。" };

  const { error } = await supabase
    .from("profiles")
    .update(updates)
    .eq("id", user.id);

  if (error) return { error: `更新失敗：${error.message}` };

  return { success: true };
}

export async function getSocialWorkers(): Promise<
  Pick<Profile, "id" | "full_name">[]
> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("profiles")
    .select("id, full_name")
    .eq("role", "internal_staff")
    .eq("position", "social_worker")
    .order("full_name", { ascending: true });

  return data ?? [];
}
