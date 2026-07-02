import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { UserRole } from "@/lib/types/database";

const ADMIN_ROLES: UserRole[] = ["system_admin", "unit_admin", "internal_staff"];

// React cache(): 在同一次 RSC render / Server Action 執行內，
// 多處呼叫 getCachedUser() 只會真的打一次 Supabase Auth 網路請求。
export const getCachedUser = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});

export const getCachedUserRole = cache(async (userId: string) => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .single();
  return data?.role ?? null;
});

interface RequireAdminResult {
  supabase: Awaited<ReturnType<typeof createClient>>;
  userId: string | null;
  error?: "請先登入。" | "沒有權限執行此操作。";
}

// 集中的管理員權限檢查，取代先前 registrations.ts / notifications.ts
// 各自重複的 requireAdmin / getCurrentUserId+isAdmin 實作。
export async function requireAdmin(): Promise<RequireAdminResult> {
  const supabase = await createClient();
  const user = await getCachedUser();

  if (!user) return { supabase, userId: null, error: "請先登入。" };

  const role = await getCachedUserRole(user.id);
  if (!role || !ADMIN_ROLES.includes(role as UserRole)) {
    return { supabase, userId: user.id, error: "沒有權限執行此操作。" };
  }

  return { supabase, userId: user.id, error: undefined };
}
