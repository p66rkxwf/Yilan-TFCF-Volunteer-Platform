"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getBirthdayValidationError,
  normalizeBirthdayForSubmit,
} from "@/lib/birthday";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { GradeLevel, YilanRegion } from "@/lib/types/database";

// admin client 刻意保持 untyped（見專案慣例）；permissive cast 避免
// service-role client 在部分查詢鏈上被推斷成 never。
function adminClient(): SupabaseClient {
  return createAdminClient() as unknown as SupabaseClient;
}

export interface AuthResult {
  error?: string;
  success?: boolean;
}

// 將帳號/Email 輸入解析為實際登入用的 Email。
// 實際的 signInWithPassword 呼叫刻意留給前端用瀏覽器端的 Supabase client
// 執行（見 src/app/login/page.tsx），這樣登入後 onAuthStateChange 才會
// 立即通知同一個 client 實例（例如 Header），不需要整頁重新整理才會反映
// 登入狀態——透過 Server Action 登入的話，瀏覽器端的 client 完全不會知道。
//
// 這裡查表發生在使用者「尚未登入」的當下：V2 的 staff_profiles /
// volunteer_profiles RLS 只允許本人或在職職員讀取，anon 一律查不到任何
// 列，所以帳號→Email 的查詢改用 admin client（僅讀取 email 欄位，
// 不外洩其他個資，暴露面等同登入功能本身）。
export async function resolveLoginEmail(
  account: string
): Promise<{ email?: string; error?: string }> {
  const input = account.trim();
  const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input);

  if (isEmail) {
    return { email: input };
  }

  const admin = adminClient();

  const { data: volunteer } = await admin
    .from("volunteer_profiles")
    .select("email")
    .eq("username", input)
    .maybeSingle();

  if (volunteer) return { email: volunteer.email };

  const { data: staff } = await admin
    .from("staff_profiles")
    .select("email")
    .eq("username", input)
    .maybeSingle();

  if (staff) return { email: staff.email };

  return { error: "帳號不存在，請確認後再試。" };
}

export async function signUp(formData: {
  account: string;
  password: string;
  name: string;
  email: string;
  phone: string;
  grade: GradeLevel;
  region?: YilanRegion | "";
  birthday: string;
}): Promise<AuthResult> {
  const supabase = await createClient();
  const normalizedBirthday = normalizeBirthdayForSubmit(formData.birthday);
  const birthdayError = getBirthdayValidationError(normalizedBirthday, {
    required: true,
  });

  if (birthdayError) {
    return { error: birthdayError };
  }

  if (!formData.phone.trim()) {
    return { error: "電話為必填欄位" };
  }

  const admin = adminClient();

  const { data: existing } = await admin
    .from("volunteer_profiles")
    .select("id")
    .eq("username", formData.account)
    .maybeSingle();

  if (existing) {
    return { error: "此帳號已被使用，請選擇其他帳號。" };
  }

  const { data: authData, error: authError } = await supabase.auth.signUp({
    email: formData.email,
    password: formData.password,
    options: {
      data: {
        account: formData.account,
        full_name: formData.name,
      },
    },
  });

  if (authError) {
    if (authError.message.includes("already registered")) {
      return { error: "此 Email 已被註冊。" };
    }
    return { error: `註冊失敗：${authError.message}` };
  }

  if (!authData.user) {
    return { error: "註冊失敗，請稍後再試。" };
  }

  // V2 沒有 handle_new_user trigger 自動建立 profile，signUp 成功後
  // 需自行寫入 volunteer_profiles。若 Supabase 專案開啟 Email 驗證，
  // 此時使用者尚無 session，一般 RLS client 無法通過
  // volunteer_insert_self policy 的 auth.uid() 檢查，故改用 admin client；
  // 欄位仍照該 policy 的約束帶入（pending_review／未指派社工）——
  // 負責社工改為帳號審核通過時才由管理員指定（見 rpc_review_volunteer_account）。
  const { error: profileError } = await admin.from("volunteer_profiles").insert({
    id: authData.user.id,
    full_name: formData.name,
    birth_date: normalizedBirthday,
    email: formData.email,
    username: formData.account,
    phone: formData.phone,
    region: formData.region || null,
    grade: formData.grade,
    status: "pending_review",
  });

  if (profileError) {
    return { error: `註冊失敗：${profileError.message}` };
  }

  return { success: true };
}

export async function resetPassword(email: string): Promise<AuthResult> {
  const supabase = await createClient();

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_SUPABASE_URL ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).origin : ""}/auth/callback?next=/profile`,
  });

  if (error) {
    return { error: `發送失敗：${error.message}` };
  }

  return { success: true };
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export async function getUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

export async function updatePassword(newPassword: string): Promise<AuthResult> {
  if (newPassword.length < 8) {
    return { error: "密碼至少需要 8 個字元。" };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: newPassword });

  if (error) return { error: `密碼更新失敗：${error.message}` };
  return { success: true };
}

export async function updateEmail(newEmail: string): Promise<AuthResult> {
  if (!newEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
    return { error: "請輸入有效的 Email 地址。" };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ email: newEmail });

  if (error) return { error: `Email 更新失敗：${error.message}` };
  return { success: true };
}

// V2 沒有志工自助停用/刪除帳號的路徑：帳號狀態變更一律由管理員
// 經 rpc_update_volunteer_status 執行（需 unit_admin 以上權限），
// 且該 RPC 不接受志工本人呼叫。這裡只登出，實際停用需請使用者
// 聯絡管理員辦理（呼叫端文案已同步調整，見 settings/page.tsx）。
export async function deleteAccount(): Promise<AuthResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "尚未登入。" };

  await supabase.auth.signOut();
  return { success: true };
}
