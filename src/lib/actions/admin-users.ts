"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/supabase/cached-auth";
import type { StaffRole } from "@/lib/types/database";

interface ActionResult {
  error?: string;
  success?: boolean;
}

// 停權 / 恢復「職員」帳號（僅系統管理員）。
// 注意：staff_profiles 的寫入必須以登入中的 system_admin 身分呼叫
// （regular client，走 staff_update_by_sysadmin RLS）——V2 的
// fn_staff_update_guard trigger 會檢查 auth.uid() 是否為 system_admin，
// 沒有像 V1 那樣的 service_role 例外，用 admin client 直寫會被 trigger 擋下。
// Auth 端的立即停權（ban）則仍需 admin client，兩者責任分開。
export async function setStaffStatus(
  targetUserId: string,
  newStatus: "active" | "suspended"
): Promise<ActionResult> {
  const { supabase, userId, error: authError } = await requireAdmin();
  if (authError) return { error: authError };

  if (targetUserId === userId) {
    return { error: "不可停權目前登入的管理員帳號。" };
  }

  const { error } = await supabase
    .from("staff_profiles")
    .update({ status: newStatus })
    .eq("id", targetUserId);

  if (error) return { error: `操作失敗：${error.message}` };

  const admin = createAdminClient();
  const { error: banError } = await admin.auth.admin.updateUserById(targetUserId, {
    ban_duration: newStatus === "suspended" ? "876000h" : "none",
  });

  if (banError) {
    return {
      success: true,
      error: `帳號狀態已更新，但同步 Auth 停權狀態時發生問題：${banError.message}`,
    };
  }

  return { success: true };
}

// 設定職員角色（僅系統管理員；升級為 system_admin 需操作者本身已是
// system_admin，從資料庫重新查詢操作者角色，不信任前端傳入的角色資訊）
export async function setStaffRole(
  targetUserId: string,
  newRole: StaffRole
): Promise<ActionResult> {
  const { supabase, userId, error: authError } = await requireAdmin();
  if (authError) return { error: authError };

  if (targetUserId === userId) {
    return { error: "不可修改自己目前的角色。" };
  }

  if (newRole === "system_admin") {
    const { data: actorProfile } = await supabase
      .from("staff_profiles")
      .select("role")
      .eq("id", userId as string)
      .maybeSingle();

    if (actorProfile?.role !== "system_admin") {
      return { error: "僅系統管理員可將使用者設為系統管理員。" };
    }
  }

  const { error } = await supabase
    .from("staff_profiles")
    .update({ role: newRole })
    .eq("id", targetUserId);

  if (error) return { error: `角色更新失敗：${error.message}` };

  return { success: true };
}

// 志工帳號審核（pending_review → active／rejected）；核准需同時指定負責社工
export async function reviewVolunteerAccount(
  targetUserId: string,
  approve: boolean,
  assignedWorkerId?: string
): Promise<ActionResult> {
  const { supabase, error: authError } = await requireAdmin();
  if (authError) return { error: authError };

  const { error } = await supabase.rpc("rpc_review_volunteer_account", {
    p_volunteer_id: targetUserId,
    p_approve: approve,
    p_assigned_worker_id: assignedWorkerId ?? null,
  });

  if (error) return { error: error.message };
  return { success: true };
}

// 志工狀態變更（active／suspended／graduated；pending_review／rejected
// 只能透過 reviewVolunteerAccount 進出，符合 V2 狀態機設計）
export async function setVolunteerStatus(
  targetUserId: string,
  newStatus: "active" | "suspended" | "graduated"
): Promise<ActionResult> {
  const { supabase, error: authError } = await requireAdmin();
  if (authError) return { error: authError };

  const { error } = await supabase.rpc("rpc_update_volunteer_status", {
    p_volunteer_id: targetUserId,
    p_status: newStatus,
  });

  if (error) return { error: error.message };

  const admin = createAdminClient();
  await admin.auth.admin.updateUserById(targetUserId, {
    ban_duration: newStatus === "suspended" ? "876000h" : "none",
  });

  return { success: true };
}
