"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/supabase/cached-auth";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AccountStatus, UserRole } from "@/lib/types/database";

function adminClient(): SupabaseClient {
  return createAdminClient() as unknown as SupabaseClient;
}

interface ActionResult {
  error?: string;
  success?: boolean;
}

// 停權 / 恢復使用者帳號（僅管理員）。停權時同時透過 Supabase Auth Admin API
// 將該使用者標記為封鎖，讓其既有 session 在下次 token 需要刷新時立即失效，
// 而不是只改 profiles.status 卻讓已登入的使用者繼續正常使用。
export async function setUserStatus(
  targetUserId: string,
  newStatus: AccountStatus
): Promise<ActionResult> {
  const { userId, error: authError } = await requireAdmin();
  if (authError) return { error: authError };

  if (targetUserId === userId) {
    return { error: "不可停權目前登入的管理員帳號。" };
  }

  const admin = adminClient();

  const { error } = await admin
    .from("profiles")
    .update({ status: newStatus })
    .eq("id", targetUserId);

  if (error) return { error: `操作失敗：${error.message}` };

  const { error: banError } = await admin.auth.admin.updateUserById(
    targetUserId,
    { ban_duration: newStatus === "blacklisted" ? "876000h" : "none" }
  );

  if (banError) {
    return {
      success: true,
      error: `帳號狀態已更新，但同步 Auth 停權狀態時發生問題：${banError.message}`,
    };
  }

  return { success: true };
}

// 設定使用者角色（僅管理員；升級為 system_admin 需操作者本身已是 system_admin，
// 從資料庫重新查詢操作者角色，不信任前端傳入的角色資訊）
export async function setUserRole(
  targetUserId: string,
  newRole: UserRole
): Promise<ActionResult> {
  const { supabase, userId, error: authError } = await requireAdmin();
  if (authError) return { error: authError };

  if (targetUserId === userId) {
    return { error: "不可修改自己目前的角色。" };
  }

  if (newRole === "system_admin") {
    const { data: actorProfile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", userId as string)
      .single();

    if (actorProfile?.role !== "system_admin") {
      return { error: "僅系統管理員可將使用者設為系統管理員。" };
    }
  }

  const admin = adminClient();
  const { error } = await admin
    .from("profiles")
    .update({ role: newRole })
    .eq("id", targetUserId);

  if (error) return { error: `角色更新失敗：${error.message}` };

  return { success: true };
}
