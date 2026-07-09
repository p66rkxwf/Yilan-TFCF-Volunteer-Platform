"use server";

// 批量建立職員帳號（限系統管理員）。密碼一律＝帳號，並要求首次登入強制改密碼。
// 前端解析 CSV 後傳入結構化列；本檔逐列建立 auth 帳號＋staff_profiles，回報逐列成敗。

import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/supabase/cached-auth";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { StaffRole, StaffJobTitle } from "@/lib/types/database";

function adminClient(): SupabaseClient {
  return createAdminClient() as unknown as SupabaseClient;
}

export interface BulkStaffRow {
  fullName: string;
  username: string;
  email: string;
  phone: string;
  role: StaffRole;
  jobTitle: StaffJobTitle;
  region?: string;
}

export interface BulkStaffResult {
  index: number;
  username: string;
  ok: boolean;
  error?: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_ROWS = 200;

export async function bulkCreateStaff(
  rows: BulkStaffRow[]
): Promise<{ error?: string; results?: BulkStaffResult[] }> {
  const { supabase, userId, error: authError } = await requireAdmin();
  if (authError) return { error: authError };

  // 收斂：批量建立職員限系統管理員（從 DB 重查角色，不信任前端）。
  const { data: actor } = await supabase
    .from("staff_profiles")
    .select("role")
    .eq("id", userId as string)
    .maybeSingle();
  if (actor?.role !== "system_admin") {
    return { error: "僅系統管理員可批量建立職員帳號。" };
  }

  if (!rows || rows.length === 0) return { error: "沒有可建立的資料列。" };
  if (rows.length > MAX_ROWS) return { error: `單次最多 ${MAX_ROWS} 筆，請分批匯入。` };

  const admin = adminClient();
  const results: BulkStaffResult[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const username = (row.username ?? "").trim();
    const fullName = (row.fullName ?? "").trim();
    const email = (row.email ?? "").trim();
    const phone = (row.phone ?? "").trim();
    const push = (ok: boolean, error?: string) =>
      results.push({ index: i, username, ok, error });

    if (!fullName) { push(false, "缺少姓名"); continue; }
    if (!username) { push(false, "缺少帳號"); continue; }
    if (seen.has(username.toLowerCase())) { push(false, "CSV 內帳號重複"); continue; }
    if (!EMAIL_RE.test(email)) { push(false, "Email 格式不正確"); continue; }
    if (!phone) { push(false, "缺少電話"); continue; }
    if (row.role !== "system_admin" && row.role !== "unit_admin" && row.role !== "staff") {
      push(false, "角色無效"); continue;
    }
    if (row.jobTitle !== "social_worker" && row.jobTitle !== "other") {
      push(false, "職稱無效"); continue;
    }
    seen.add(username.toLowerCase());

    // 跨兩張互斥表檢查帳號唯一性（避免與志工帳號衝突）。
    const [{ data: exStaff }, { data: exVol }] = await Promise.all([
      admin.from("staff_profiles").select("id").eq("username", username).maybeSingle(),
      admin.from("volunteer_profiles").select("id").eq("username", username).maybeSingle(),
    ]);
    if (exStaff || exVol) { push(false, "帳號已被使用"); continue; }

    const { data: authData, error: createError } = await admin.auth.admin.createUser({
      email,
      password: username,
      email_confirm: true,
      user_metadata: { full_name: fullName, account: username },
    });
    if (createError || !authData?.user) {
      push(
        false,
        createError?.message.includes("already")
          ? "此 Email 已被註冊"
          : `建立帳號失敗：${createError?.message ?? "未知錯誤"}`
      );
      continue;
    }

    const { error: profileError } = await admin.from("staff_profiles").insert({
      id: authData.user.id,
      full_name: fullName,
      email,
      username,
      phone,
      region: row.region?.trim() || null,
      role: row.role,
      job_title: row.jobTitle,
      status: "active",
      must_change_password: true,
    });
    if (profileError) {
      // 回滾剛建立的 auth 帳號，避免孤兒帳號占用 email/username。
      await admin.auth.admin.deleteUser(authData.user.id);
      push(false, `建立資料失敗：${profileError.message}`);
      continue;
    }
    push(true);
  }

  return { results };
}
