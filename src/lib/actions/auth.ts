"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getBirthdayValidationError,
  normalizeBirthdayForSubmit,
} from "@/lib/birthday";
import { verifyTurnstile } from "@/lib/turnstile";
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

  // 正式環境「只」信任 NEXT_PUBLIC_SITE_URL：Host / Origin 標頭皆可由發起請求者
  // 偽造，若拿來組重設密碼連結，攻擊者能把寄給受害者的連結指向自己的網域，
  // 竊取 reset code（host header injection）。故正式環境不回退到任何請求標頭——
  // 未設定即回傳空字串，讓 Supabase 以其 Site URL allowlist 兜底（連結會失效而非被劫持）。
  // 僅本機開發為便利才回退到請求標頭。
  if (process.env.NODE_ENV === "production") return "";

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

// 將「帳號」解析為該使用者實際的登入 Email（僅供伺服器端 login 使用）。
//
// 志工以「帳號」登入：其 auth 登入 Email 為系統產生的內部信箱，與使用者填寫的
// 聯絡 email（volunteer_profiles.email，允許重複）不同，故不能用 profile.email
// 登入；一律以「帳號 → profile.id → auth.users 的實際 email」解析。職員為真實
// email，同樣以 id 反查即可，兩者統一。
//
// 安全性（資安審核 Finding 3）：此函式「不」對外匯出、也不把 email 回傳給前端；
// 查表沿用 admin client（未登入者 anon 受 RLS 限制查不到任何列），避免帳號列舉。
async function resolveAuthEmailInternal(account: string): Promise<string | null> {
  const input = account.trim();
  if (!input) return null;

  const admin = adminClient();

  let id: string | null = null;
  const { data: volunteer } = await admin
    .from("volunteer_profiles")
    .select("id")
    .eq("username", input)
    .maybeSingle();
  if (volunteer) id = volunteer.id as string;

  if (!id) {
    const { data: staff } = await admin
      .from("staff_profiles")
      .select("id")
      .eq("username", input)
      .maybeSingle();
    if (staff) id = staff.id as string;
  }

  if (!id) return null;

  const { data } = await admin.auth.admin.getUserById(id);
  return data?.user?.email ?? null;
}

// 伺服器端登入：以「帳號」+ 密碼驗證，成功只回傳 session（絕不回 email）。
// 帳號不存在或密碼錯誤一律回同一個錯誤，避免帳號列舉與 email 外洩。
// 前端拿到 session 後呼叫瀏覽器 client 的 setSession()，讓 onAuthStateChange
// 立即通知 Header/AuthProvider，維持免整頁重新整理即可反映登入狀態的體驗。
export async function login(
  account: string,
  password: string
): Promise<{ session?: Session; error?: string }> {
  const generic = { error: "帳號或密碼錯誤，請重新輸入。" };

  const email = await resolveAuthEmailInternal(account);
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
  turnstileToken?: string | null;
}): Promise<AuthResult> {
  // 防濫用：公開註冊端點易被機器人灌爆，先過 Turnstile（未設金鑰時自動放行）。
  const humanVerified = await verifyTurnstile(formData.turnstileToken ?? null);
  if (!humanVerified) {
    return { error: "人機驗證失敗，請重新完成驗證後再送出。" };
  }

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

  if (!formData.region) {
    return { error: "區域為必填欄位" };
  }

  // 聯絡 Email 伺服器端格式驗證（與 updateEmail / createStaff 等其他入口一致；
  // 前端亦有驗證，此處防繞過前端直呼 action 寫入不合法格式）。
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email.trim())) {
    return { error: "請輸入有效的 Email 地址。" };
  }

  const admin = adminClient();

  // 帳號唯一性預檢：username 是登入身分，在 volunteer_profiles / staff_profiles
  // 各有獨立 unique 約束但不跨表，故兩張表都要查，避免志工註冊到與職員相同的帳號
  // （login 以帳號解析，同名會造成歧義）。
  const [{ data: existingVolunteer }, { data: existingStaff }] = await Promise.all([
    admin.from("volunteer_profiles").select("id").eq("username", formData.account).maybeSingle(),
    admin.from("staff_profiles").select("id").eq("username", formData.account).maybeSingle(),
  ]);

  if (existingVolunteer || existingStaff) {
    return { error: "此帳號已被使用，請選擇其他帳號。" };
  }

  // 志工以「帳號」登入，Email 僅作聯絡用途且允許重複；auth 身分改用系統產生的
  // 唯一內部信箱（絕不寄信到此位址），使用者填的聯絡 Email 存 volunteer_profiles.email。
  const authEmail = `${crypto.randomUUID()}@users.sekinv.com`;

  const { data: authData, error: authError } = await supabase.auth.signUp({
    email: authEmail,
    password: formData.password,
    options: {
      data: {
        account: formData.account,
        full_name: formData.name,
      },
    },
  });

  if (authError) {
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

export async function resetPassword(
  email: string,
  turnstileToken?: string | null
): Promise<AuthResult> {
  // 防濫用：公開重設端點易被機器人灌爆，先過 Turnstile（未設金鑰時自動放行）。
  const humanVerified = await verifyTurnstile(turnstileToken ?? null);
  if (!humanVerified) {
    return { error: "人機驗證失敗，請重新完成驗證後再送出。" };
  }

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

// 更新「聯絡用」Email（volunteer_profiles.email，允許重複）。志工登入身分是帳號，
// 此處不動 auth 登入信箱。志工本人直接改 email 會被欄位白名單 trigger 擋下（僅允許
// 姓名/電話/區域），故以 admin client（service_role；auth.uid() 為 NULL 會略過白名單）
// 更新，並限定為目前登入者自己的那一列。
export async function updateEmail(newEmail: string): Promise<AuthResult> {
  const email = newEmail.trim();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: "請輸入有效的 Email 地址。" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "尚未登入。" };

  const admin = adminClient();
  const { error } = await admin
    .from("volunteer_profiles")
    .update({ email })
    .eq("id", user.id);

  if (error) return { error: `Email 更新失敗：${error.message}` };
  return { success: true };
}

