"use server";

import { createClient } from "@/lib/supabase/server";
import { getCachedUser } from "@/lib/supabase/cached-auth";
import type { VolunteerProfile } from "@/lib/types/database";

export async function getProfile(): Promise<VolunteerProfile | null> {
  const supabase = await createClient();
  const user = await getCachedUser();

  if (!user) return null;

  const { data } = await supabase
    .from("volunteer_profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  return data;
}

// V2 的欄位白名單 trigger（fn_volunteer_self_update_whitelist）僅允許志工
// 本人修改 full_name / phone / region；email 改走 updateEmail()（auth.ts，
// 會先驗證新信箱），birth_date 由管理員維護。
export async function updateProfile(
  updates: Partial<Pick<VolunteerProfile, "full_name" | "phone" | "region">>
): Promise<{ error?: string; success?: boolean }> {
  const supabase = await createClient();
  const user = await getCachedUser();

  if (!user) return { error: "尚未登入。" };

  const { error } = await supabase
    .from("volunteer_profiles")
    .update(updates)
    .eq("id", user.id);

  if (error) return { error: `更新失敗：${error.message}` };

  return { success: true };
}

export async function getSocialWorkers(): Promise<
  { id: string; full_name: string }[]
> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("staff_profiles")
    .select("id, full_name")
    .eq("job_title", "social_worker")
    .eq("status", "active")
    .order("full_name", { ascending: true });

  return data ?? [];
}
