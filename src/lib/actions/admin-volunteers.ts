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
  password: string;
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

  if (!input.fullName.trim()) return { error: "請輸入姓名" };
  if (!input.username.trim()) return { error: "請輸入帳號" };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email)) return { error: "請輸入有效的 Email" };
  if (input.password.length < 8) return { error: "密碼至少需 8 個字元" };
  if (!input.phone.trim()) return { error: "請輸入電話" };
  if (!input.birthDate) return { error: "請選擇生日" };
  if (!input.assignedWorkerId) return { error: "請指定負責社工" };

  const admin = adminClient();

  // 帳號唯一性預檢（friendlier error；DB 亦有 unique 約束）
  const { data: existing } = await admin
    .from("volunteer_profiles")
    .select("id")
    .eq("username", input.username.trim())
    .maybeSingle();
  if (existing) return { error: "此帳號已被使用" };

  const { data: authData, error: createError } = await admin.auth.admin.createUser({
    email: input.email.trim(),
    password: input.password,
    email_confirm: true,
    user_metadata: { full_name: input.fullName.trim(), account: input.username.trim() },
  });

  if (createError) {
    return {
      error: createError.message.includes("already")
        ? "此 Email 已被註冊"
        : `建立帳號失敗：${createError.message}`,
    };
  }
  if (!authData.user) return { error: "建立帳號失敗，請稍後再試" };

  const { error: profileError } = await admin.from("volunteer_profiles").insert({
    id: authData.user.id,
    full_name: input.fullName.trim(),
    birth_date: input.birthDate,
    email: input.email.trim(),
    username: input.username.trim(),
    phone: input.phone.trim(),
    region: input.region?.trim() || null,
    grade: input.grade,
    status: "active",
    assigned_worker_id: input.assignedWorkerId,
  });

  if (profileError) {
    // 回滾：profile 建立失敗時刪除剛建立的 auth 帳號，避免孤兒帳號
    await admin.auth.admin.deleteUser(authData.user.id);
    return { error: `建立學生資料失敗：${profileError.message}` };
  }

  return { success: true, volunteerId: authData.user.id };
}
