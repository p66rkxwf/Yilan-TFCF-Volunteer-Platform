"use server";

// 後台手動建立學生帳號（伺服器端 Admin API，不經自主註冊審核流程）。
// 直接建為 active，須指定負責社工（DB 約束：active 學生必須有 assigned_worker）。

import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/supabase/cached-auth";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { GradeLevel } from "@/lib/types/database";

function adminClient(): SupabaseClient {
  return createAdminClient() as unknown as SupabaseClient;
}

interface ActionResult {
  error?: string;
  success?: boolean;
  volunteerId?: string;
}

export interface CreateVolunteerInput {
  fullName: string;
  username: string;
  email: string;
  phone: string;
  birthDate: string;
  grade: GradeLevel;
  region?: string;
  assignedWorkerId: string;
}

export async function createVolunteer(input: CreateVolunteerInput): Promise<ActionResult> {
  // 手動建立學生屬管理操作；沿用 requireAdmin（在職職員即可）。
  const { error: authError } = await requireAdmin();
  if (authError) return { error: authError };

  const username = input.username.trim();
  if (!input.fullName.trim()) return { error: "請輸入姓名" };
  if (!username) return { error: "請輸入帳號" };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email)) return { error: "請輸入有效的 Email" };
  if (!input.phone.trim()) return { error: "請輸入電話" };
  if (!input.birthDate) return { error: "請選擇生日" };
  if (!input.assignedWorkerId) return { error: "請指定負責社工" };

  const admin = adminClient();

  // 帳號唯一性預檢：跨兩張互斥表都查（登入以帳號解析，避免與職員帳號衝突）。
  const [{ data: existingVolunteer }, { data: existingStaff }] = await Promise.all([
    admin.from("volunteer_profiles").select("id").eq("username", username).maybeSingle(),
    admin.from("staff_profiles").select("id").eq("username", username).maybeSingle(),
  ]);
  if (existingVolunteer || existingStaff) return { error: "此帳號已被使用" };

  // 後台建立志工：auth 登入身分用系統產生的內部信箱（絕不寄信到此位址），
  // 使用者填的聯絡 Email 存 volunteer_profiles.email（允許重複）。與自主註冊一致，
  // 且避免「聯絡 email 重複時建不了帳號」（原以聯絡 email 當 auth 信箱的問題，資安 M4）。
  // 初始密碼一律＝帳號，並要求首次登入強制改密碼。
  const authEmail = `${crypto.randomUUID()}@users.sekinv.com`;
  const { data: authData, error: createError } = await admin.auth.admin.createUser({
    email: authEmail,
    password: username,
    email_confirm: true,
    user_metadata: { full_name: input.fullName.trim(), account: username },
  });

  if (createError) {
    return { error: `建立帳號失敗：${createError.message}` };
  }
  if (!authData.user) return { error: "建立帳號失敗，請稍後再試" };

  const { error: profileError } = await admin.from("volunteer_profiles").insert({
    id: authData.user.id,
    full_name: input.fullName.trim(),
    birth_date: input.birthDate,
    email: input.email.trim(),
    username,
    phone: input.phone.trim(),
    region: input.region?.trim() || null,
    grade: input.grade,
    status: "active",
    assigned_worker_id: input.assignedWorkerId,
    must_change_password: true,
  });

  if (profileError) {
    // 回滾：profile 建立失敗時刪除剛建立的 auth 帳號，避免孤兒帳號
    await admin.auth.admin.deleteUser(authData.user.id);
    return { error: `建立學生資料失敗：${profileError.message}` };
  }

  return { success: true, volunteerId: authData.user.id };
}

// 後台編輯學生基本資料（姓名/電話/區域/生日）。姓名已鎖定學生自助修改，改由此處維護。
// 聯絡 Email/帳號 兩欄僅系統管理員可代改（email/username 不傳＝不更動；一般職員的 UI 不帶）；
// 代改 Email 會一併重置驗證狀態。權限與欄位驗證由 rpc_admin_update_volunteer_profile
// 內部強制（在職職員；帳號資訊限系統管理員；見 22、28）。
export async function updateVolunteerProfile(input: {
  volunteerId: string;
  fullName: string;
  phone: string;
  region?: string;
  birthDate?: string;
  email?: string;
  username?: string;
}): Promise<ActionResult> {
  const { supabase, error: authError } = await requireAdmin();
  if (authError) return { error: authError };

  // 帳號唯一性預檢（中文訊息；僅在要變更帳號時查，race 由 RPC 內檢查與 UNIQUE 兜底）。
  // 學生聯絡 Email 允許重複（手足共用家長信箱，見 13），不做唯一性檢查。
  const username = input.username?.trim();
  if (username) {
    const admin = adminClient();
    const [{ data: existingStaff }, { data: existingVolunteer }] = await Promise.all([
      admin.from("staff_profiles").select("id").eq("username", username).maybeSingle(),
      admin
        .from("volunteer_profiles")
        .select("id")
        .eq("username", username)
        .neq("id", input.volunteerId)
        .maybeSingle(),
    ]);
    if (existingStaff || existingVolunteer) return { error: "此帳號已被使用" };
  }

  const { error } = await supabase.rpc("rpc_admin_update_volunteer_profile", {
    p_volunteer_id: input.volunteerId,
    p_full_name: input.fullName,
    p_phone: input.phone,
    p_region: input.region?.trim() || null,
    p_birth_date: input.birthDate || null,
    p_email: input.email?.trim() || null,
    p_username: username || null,
  });

  if (error) return { error: error.message };
  return { success: true };
}
