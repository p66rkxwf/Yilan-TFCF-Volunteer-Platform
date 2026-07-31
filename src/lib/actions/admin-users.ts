"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/supabase/cached-auth";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { StaffRole, StaffJobTitle } from "@/lib/types/database";

interface ActionResult {
  error?: string;
  success?: boolean;
  staffId?: string;
}

function adminClient(): SupabaseClient {
  return createAdminClient() as unknown as SupabaseClient;
}

// 建立職員帳號（伺服器端 Admin API，前端不開放直接 INSERT）。
// 僅系統管理員可建立；角色與職稱在此設定，故收斂到系統管理員。
export async function createStaff(input: {
  fullName: string;
  username: string;
  email: string;
  phone: string;
  role: StaffRole;
  jobTitle: StaffJobTitle;
  region?: string;
}): Promise<ActionResult> {
  const { supabase, userId, error: authError } = await requireAdmin();
  if (authError) return { error: authError };

  // 收斂：建立職員（含指派角色）限系統管理員，從 DB 重查角色不信任前端。
  const { data: actor } = await supabase
    .from("staff_profiles")
    .select("role")
    .eq("id", userId as string)
    .maybeSingle();
  if (actor?.role !== "system_admin") {
    return { error: "僅系統管理員可建立職員帳號。" };
  }

  const username = input.username.trim();
  if (!input.fullName.trim()) return { error: "請輸入姓名" };
  if (!username) return { error: "請輸入帳號" };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email)) return { error: "請輸入有效的 Email" };
  if (!input.phone.trim()) return { error: "電話為必填（負責人電話會公開於前台）" };

  const admin = adminClient();

  // 帳號唯一性預檢：跨兩張互斥表都查，避免與志工帳號衝突（登入以帳號解析，
  // 志工優先，同名會使職員永遠無法登入）。
  const [{ data: existingStaff }, { data: existingVolunteer }] = await Promise.all([
    admin.from("staff_profiles").select("id").eq("username", username).maybeSingle(),
    admin.from("volunteer_profiles").select("id").eq("username", username).maybeSingle(),
  ]);
  if (existingStaff || existingVolunteer) return { error: "此帳號已被使用" };

  // 初始密碼一律＝帳號，並要求首次登入強制改密碼（must_change_password）。
  const { data: authData, error: createError } = await admin.auth.admin.createUser({
    email: input.email.trim(),
    password: username,
    email_confirm: true,
    user_metadata: { full_name: input.fullName.trim(), account: username },
  });

  if (createError) {
    return {
      error: createError.message.includes("already")
        ? "此 Email 已被註冊"
        : `建立帳號失敗：${createError.message}`,
    };
  }
  if (!authData.user) return { error: "建立帳號失敗，請稍後再試" };

  const { error: profileError } = await admin.from("staff_profiles").insert({
    id: authData.user.id,
    full_name: input.fullName.trim(),
    email: input.email.trim(),
    username,
    phone: input.phone.trim(),
    region: input.region?.trim() || null,
    role: input.role,
    job_title: input.jobTitle,
    status: "active",
    must_change_password: true,
  });

  if (profileError) {
    await admin.auth.admin.deleteUser(authData.user.id);
    return { error: `建立職員資料失敗：${profileError.message}` };
  }

  return { success: true, staffId: authData.user.id };
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

  // 收斂：停權／恢復職員（含底層 Auth ban）限系統管理員。
  // requireAdmin() 只保證「在職職員」；對他人列的 staff_profiles 直寫在非
  // system_admin 時會命中 0 列且「不報錯」（RLS USING 不符只是靜默過濾），
  // 若不在此重查角色，一般職員就能繞過 RLS 用 service-role ban 任一職員帳號。
  // 故從 DB 重查操作者角色，不信任前端（比照 setStaffRole / createStaff）。
  const { data: actor } = await supabase
    .from("staff_profiles")
    .select("role")
    .eq("id", userId as string)
    .maybeSingle();
  if (actor?.role !== "system_admin") {
    return { error: "僅系統管理員可停權或恢復職員帳號。" };
  }

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

  // 角色變更一律限系統管理員（DB fn_staff_update_guard 亦強制）。從 DB 重查角色，
  // 不信任前端：否則非系統管理員呼叫時，RLS 只會靜默過濾 0 列而「不報錯」，
  // 前端會誤判為成功（資安 L1）。
  const { data: actorProfile } = await supabase
    .from("staff_profiles")
    .select("role")
    .eq("id", userId as string)
    .maybeSingle();
  if (actorProfile?.role !== "system_admin") {
    return { error: "僅系統管理員可變更職員角色。" };
  }

  const { error } = await supabase
    .from("staff_profiles")
    .update({ role: newRole })
    .eq("id", targetUserId);

  if (error) return { error: `角色更新失敗：${error.message}` };

  return { success: true };
}

// 學生帳號審核（pending_review → active／rejected）；核准需同時指定負責社工
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

// 學生狀態變更（active／suspended／graduated；pending_review／rejected
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

// 批量移轉負責社工：把 fromWorkerId 名下所有學生一次改派給 toWorkerId。
// 社工輪換／離職時使用。權限（單位管理員以上）與目標社工資格由
// rpc_reassign_worker 內部強制（見 17_reassign_worker.sql）。
export async function reassignWorker(
  fromWorkerId: string,
  toWorkerId: string
): Promise<ActionResult & { movedCount?: number }> {
  const { supabase, error: authError } = await requireAdmin();
  if (authError) return { error: authError };

  const { data, error } = await supabase.rpc("rpc_reassign_worker", {
    p_from_worker_id: fromWorkerId,
    p_to_worker_id: toWorkerId,
  });

  if (error) return { error: error.message };
  return { success: true, movedCount: (data as number) ?? 0 };
}

// 改派單一學生的負責社工（學生詳情頁用）。權限與目標社工資格由
// rpc_set_volunteer_worker 內部強制（單位管理員以上）。
export async function setVolunteerWorker(
  volunteerId: string,
  workerId: string
): Promise<ActionResult> {
  const { supabase, error: authError } = await requireAdmin();
  if (authError) return { error: authError };

  const { error } = await supabase.rpc("rpc_set_volunteer_worker", {
    p_volunteer_id: volunteerId,
    p_worker_id: workerId,
  });

  if (error) return { error: error.message };
  return { success: true };
}

// 管理員代重設「志工」密碼＝把密碼重置為該帳號的 username，並要求對方首次登入
// 強制改密碼。志工以帳號登入、無法自助以 email 重設，故由管理員代設。
// 限系統管理員／單位管理員；且僅能重設志工帳號（不可經此端點重設職員/管理員密碼）。
export async function resetVolunteerPassword(
  targetUserId: string
): Promise<ActionResult & { username?: string }> {
  const { supabase, userId, error: authError } = await requireAdmin();
  if (authError) return { error: authError };

  const { data: actor } = await supabase
    .from("staff_profiles")
    .select("role")
    .eq("id", userId as string)
    .maybeSingle();
  if (actor?.role !== "system_admin" && actor?.role !== "unit_admin") {
    return { error: "僅管理員可重設密碼。" };
  }

  const admin = adminClient();
  // 僅允許重設「志工」帳號，避免經此端點重設職員/管理員密碼（權限升級防護）。
  const { data: target } = await admin
    .from("volunteer_profiles")
    .select("id, username")
    .eq("id", targetUserId)
    .maybeSingle();
  if (!target) return { error: "找不到該志工帳號。" };

  const username = (target as { username: string }).username;
  const { error } = await admin.auth.admin.updateUserById(targetUserId, {
    password: username,
  });
  if (error) return { error: `重設密碼失敗：${error.message}` };

  await admin
    .from("volunteer_profiles")
    .update({ must_change_password: true })
    .eq("id", targetUserId);

  return { success: true, username };
}

// 管理員代重設「職員」密碼＝重置為帳號＝username，並要求首次登入強制改。
// 限系統管理員（職員帳號較敏感，且不得經此提權/改動比自己更高權限者的密碼）。
export async function resetStaffPassword(
  targetUserId: string
): Promise<ActionResult & { username?: string }> {
  const { supabase, userId, error: authError } = await requireAdmin();
  if (authError) return { error: authError };

  const { data: actor } = await supabase
    .from("staff_profiles")
    .select("role")
    .eq("id", userId as string)
    .maybeSingle();
  if (actor?.role !== "system_admin") {
    return { error: "僅系統管理員可重設職員密碼。" };
  }

  const admin = adminClient();
  const { data: target } = await admin
    .from("staff_profiles")
    .select("id, username")
    .eq("id", targetUserId)
    .maybeSingle();
  if (!target) return { error: "找不到該職員帳號。" };

  const username = (target as { username: string }).username;
  const { error } = await admin.auth.admin.updateUserById(targetUserId, {
    password: username,
  });
  if (error) return { error: `重設密碼失敗：${error.message}` };

  await admin
    .from("staff_profiles")
    .update({ must_change_password: true })
    .eq("id", targetUserId);

  return { success: true, username };
}
