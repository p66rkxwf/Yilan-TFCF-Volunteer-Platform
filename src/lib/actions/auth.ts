"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getBirthdayValidationError,
  normalizeBirthdayForSubmit,
} from "@/lib/birthday";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import type { Session, SupabaseClient } from "@supabase/supabase-js";
import type { GradeLevel, YilanRegion } from "@/lib/types/database";

// 還原站台網址（供重設密碼信件的 redirect 連結使用）。
// 安全性：優先採用固定的 NEXT_PUBLIC_SITE_URL，避免攻擊者以偽造的
// Host/Origin 標頭污染重設密碼連結（host header injection → reset token 外洩）。
// 僅在未設定該環境變數時，才回退到請求標頭（本機開發便利）。
// 註：Supabase 端仍會以 Auth Redirect URL allowlist 再把關（見 supabase/README §4）。
async function getSiteOrigin(): Promise<string> {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "");

  const headersList = await headers();
  const origin = headersList.get("origin");
  if (origin) return origin;

  const host = headersList.get("host");
  const proto = headersList.get("x-forwarded-proto") ?? "https";
  return host ? `${proto}://${host}` : "";
}

// admin client 刻意保持 untyped（見專案慣例）；permissive cast 避免
// service-role client 在部分查詢鏈上被推斷成 never。
function adminClient(): SupabaseClient {
  return createAdminClient() as unknown as SupabaseClient;
}

export interface AuthResult {
  error?: string;
  success?: boolean;
}

// 將帳號/Email 輸入解析為實際登入用的 Email（僅供伺服器端 login 使用）。
//
// 安全性（資安審核 Finding 3）：此函式「不」對外匯出、也不把 email 回傳給
// 前端。V2 登入改為在伺服器端完成密碼驗證（見下方 login），前端不再取得
// 任何帳號的 email，避免未登入者以任意帳號查詢 email／列舉帳號。
// 查表沿用 admin client：使用者尚未登入時，anon 受 RLS 限制查不到任何列。
async function resolveEmailInternal(account: string): Promise<string | null> {
  const input = account.trim();
  const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input);
  if (isEmail) return input;

  const admin = adminClient();

  const { data: volunteer } = await admin
    .from("volunteer_profiles")
    .select("email")
    .eq("username", input)
    .maybeSingle();
  if (volunteer) return volunteer.email as string;

  const { data: staff } = await admin
    .from("staff_profiles")
    .select("email")
    .eq("username", input)
    .maybeSingle();
  if (staff) return staff.email as string;

  return null;
}

// 伺服器端登入：以帳號或 Email + 密碼驗證，成功只回傳 session（絕不回 email）。
// 帳號不存在或密碼錯誤一律回同一個錯誤，避免帳號列舉與 email 外洩。
// 前端拿到 session 後呼叫瀏覽器 client 的 setSession()，讓 onAuthStateChange
// 立即通知 Header/AuthProvider，維持免整頁重新整理即可反映登入狀態的體驗。
export async function login(
  account: string,
  password: string
): Promise<{ session?: Session; error?: string }> {
  const generic = { error: "帳號或密碼錯誤，請重新輸入。" };

  const email = await resolveEmailInternal(account);
  if (!email) return generic;

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (error || !data.session) return generic;

  return { session: data.session };
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

  // 帳號唯一性預檢：username 在 volunteer_profiles / staff_profiles 各有獨立
  // unique 約束但不跨表，故兩張表都要查，避免志工註冊到與職員相同的帳號
  // （login 的 resolveEmailInternal 先解析志工，會造成同名歧義）。
  const [{ data: existingVolunteer }, { data: existingStaff }] = await Promise.all([
    admin.from("volunteer_profiles").select("id").eq("username", formData.account).maybeSingle(),
    admin.from("staff_profiles").select("id").eq("username", formData.account).maybeSingle(),
  ]);

  if (existingVolunteer || existingStaff) {
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
    // 回滾：profile 建立失敗時刪除剛建立的 auth 帳號，避免孤兒帳號占用該
    // email／username（否則使用者既無法登入、也因 email 已註冊而無法重註冊）。
    // 比照 admin-volunteers.ts / admin-users.ts 的回滾處理。
    await admin.auth.admin.deleteUser(authData.user.id);
    return { error: `註冊失敗：${profileError.message}` };
  }

  return { success: true };
}

export async function resetPassword(email: string): Promise<AuthResult> {
  const supabase = await createClient();
  const origin = await getSiteOrigin();

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/callback?next=/profile/settings`,
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

