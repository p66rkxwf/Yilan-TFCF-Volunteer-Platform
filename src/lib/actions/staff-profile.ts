"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/supabase/cached-auth";
import { isValidEmail, isValidTaiwanPhone, isValidUsername } from "@/lib/validation";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { StaffJobTitle } from "@/lib/types/database";

interface ActionResult {
  error?: string;
  success?: boolean;
}

function adminClient(): SupabaseClient {
  return createAdminClient() as unknown as SupabaseClient;
}

// 職員的 Email 同時是 auth 登入信箱（volunteer 才是內部假信箱），
// 變更時必須同步 auth.users。順序：先 Auth 後 RPC —— 最可能的外部失敗
// （auth 信箱撞既有帳號）發生在任何 DB 寫入與稽核落地之前；RPC 失敗再
// 回寫舊值回滾（比照 createStaff 先建 auth、profile 失敗再 deleteUser）。
async function syncStaffAuthIdentity(input: {
  staffId: string;
  oldEmail: string;
  newEmail: string;
  fullName: string;
  oldUsername: string;
  newUsername: string;
}): Promise<{ error?: string; rollback?: () => Promise<boolean> }> {
  const emailChanged = input.newEmail !== input.oldEmail;
  const accountChanged = emailChanged || input.newUsername !== input.oldUsername;
  if (!accountChanged) return {};

  const admin = adminClient();
  // user_metadata 為整包替換，一律帶最終值（照 createStaff 的欄位組成）
  const { error } = await admin.auth.admin.updateUserById(input.staffId, {
    ...(emailChanged ? { email: input.newEmail, email_confirm: true } : {}),
    user_metadata: { full_name: input.fullName, account: input.newUsername },
  });
  if (error) {
    return {
      error: error.message.includes("already")
        ? "此 Email 已被其他帳號註冊"
        : `更新登入資訊失敗：${error.message}`,
    };
  }

  return {
    rollback: async () => {
      const { error: rollbackError } = await admin.auth.admin.updateUserById(input.staffId, {
        ...(emailChanged ? { email: input.oldEmail, email_confirm: true } : {}),
        user_metadata: { full_name: input.fullName, account: input.oldUsername },
      });
      return !rollbackError;
    },
  };
}

function validateEditableFields(input: {
  phone: string;
  email: string;
  username: string;
}): string | null {
  if (!isValidTaiwanPhone(input.phone.trim()))
    return "電話格式不正確（例：0912345678 或 03-1234567）";
  if (!isValidEmail(input.email.trim())) return "Email 格式不正確";
  if (!isValidUsername(input.username.trim())) return "帳號格式不正確（4～30 碼英數與 . _ -）";
  return null;
}

// 帳號唯一性預檢（中文訊息；race 由 DB UNIQUE 與 RPC 內檢查兜底）。
// username 跨兩張互斥表都查（登入以帳號解析，跨表撞名會使其中一方無法登入）。
async function checkUniqueness(input: {
  targetId: string;
  email?: string; // 僅在有變更時傳入
  username?: string; // 僅在有變更時傳入
}): Promise<string | null> {
  const admin = adminClient();
  if (input.email) {
    const { data } = await admin
      .from("staff_profiles")
      .select("id")
      .eq("email", input.email)
      .neq("id", input.targetId)
      .maybeSingle();
    if (data) return "此 Email 已被其他職員使用";
  }
  if (input.username) {
    const [{ data: existingStaff }, { data: existingVolunteer }] = await Promise.all([
      admin
        .from("staff_profiles")
        .select("id")
        .eq("username", input.username)
        .neq("id", input.targetId)
        .maybeSingle(),
      admin.from("volunteer_profiles").select("id").eq("username", input.username).maybeSingle(),
    ]);
    if (existingStaff || existingVolunteer) return "此帳號已被使用";
  }
  return null;
}

// 系統管理員編輯任一職員的完整基本資料（6 欄）。
// 欄位驗證與稽核由 rpc_admin_update_staff_profile 強制（見 28）。
export async function updateStaffProfile(input: {
  staffId: string;
  fullName: string;
  phone: string;
  region?: string;
  email: string;
  username: string;
  jobTitle: StaffJobTitle;
}): Promise<ActionResult> {
  const { supabase, userId, error: authError } = await requireAdmin();
  if (authError) return { error: authError };

  // 收斂：編輯職員資料限系統管理員，從 DB 重查角色不信任前端。
  const { data: actor } = await supabase
    .from("staff_profiles")
    .select("role")
    .eq("id", userId as string)
    .maybeSingle();
  if (actor?.role !== "system_admin") {
    return { error: "僅系統管理員可編輯職員資料。" };
  }

  if (!input.fullName.trim()) return { error: "請輸入姓名" };
  const invalid = validateEditableFields(input);
  if (invalid) return { error: invalid };

  const email = input.email.trim();
  const username = input.username.trim();

  // 讀取現行資料：確認對象存在且未封存（也防止拿志工 id 打此端點），
  // 並取得舊值供變更偵測與回滾。
  const admin = adminClient();
  const { data: target } = await admin
    .from("staff_profiles")
    .select("id, full_name, email, username, deleted_at")
    .eq("id", input.staffId)
    .maybeSingle();
  if (!target || target.deleted_at) return { error: "找不到此職員" };

  const uniqueError = await checkUniqueness({
    targetId: input.staffId,
    email: email !== target.email ? email : undefined,
    username: username !== target.username ? username : undefined,
  });
  if (uniqueError) return { error: uniqueError };

  const sync = await syncStaffAuthIdentity({
    staffId: input.staffId,
    oldEmail: target.email as string,
    newEmail: email,
    fullName: input.fullName.trim(),
    oldUsername: target.username as string,
    newUsername: username,
  });
  if (sync.error) return { error: sync.error };

  // 以登入中的 session client 呼叫 RPC，fn_audit 才會記到正確 actor。
  const { error } = await supabase.rpc("rpc_admin_update_staff_profile", {
    p_staff_id: input.staffId,
    p_full_name: input.fullName.trim(),
    p_phone: input.phone.trim(),
    p_email: email,
    p_username: username,
    p_job_title: input.jobTitle,
    p_region: input.region?.trim() || null,
  });

  if (error) {
    const rolledBack = sync.rollback ? await sync.rollback() : true;
    return {
      error: rolledBack
        ? error.message
        : `${error.message}（登入信箱同步狀態可能不一致，請重試或洽系統管理員）`,
    };
  }
  return { success: true };
}

// 職員自改個人資料（電話/地區/Email/帳號；姓名與職稱由系統管理員維護）。
// 對象固定為本人，由 rpc_update_own_staff_profile 以 auth.uid() 強制。
export async function updateOwnStaffProfile(input: {
  phone: string;
  region?: string;
  email: string;
  username: string;
}): Promise<ActionResult> {
  const { supabase, userId, error: authError } = await requireAdmin();
  if (authError) return { error: authError };

  const invalid = validateEditableFields(input);
  if (invalid) return { error: invalid };

  const email = input.email.trim();
  const username = input.username.trim();

  const admin = adminClient();
  const { data: target } = await admin
    .from("staff_profiles")
    .select("id, full_name, email, username, deleted_at")
    .eq("id", userId as string)
    .maybeSingle();
  if (!target || target.deleted_at) return { error: "找不到職員資料" };

  const uniqueError = await checkUniqueness({
    targetId: userId as string,
    email: email !== target.email ? email : undefined,
    username: username !== target.username ? username : undefined,
  });
  if (uniqueError) return { error: uniqueError };

  const sync = await syncStaffAuthIdentity({
    staffId: userId as string,
    oldEmail: target.email as string,
    newEmail: email,
    fullName: target.full_name as string,
    oldUsername: target.username as string,
    newUsername: username,
  });
  if (sync.error) return { error: sync.error };

  const { error } = await supabase.rpc("rpc_update_own_staff_profile", {
    p_phone: input.phone.trim(),
    p_email: email,
    p_username: username,
    p_region: input.region?.trim() || null,
  });

  if (error) {
    const rolledBack = sync.rollback ? await sync.rollback() : true;
    return {
      error: rolledBack
        ? error.message
        : `${error.message}（登入信箱同步狀態可能不一致，請重試或洽系統管理員）`,
    };
  }
  return { success: true };
}
