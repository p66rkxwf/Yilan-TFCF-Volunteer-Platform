import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { StaffRole, StaffAccountStatus, VolunteerStatus } from "@/lib/types/database";

// React cache(): 在同一次 RSC render / Server Action 執行內，
// 多處呼叫 getCachedUser() 只會真的打一次 Supabase Auth 網路請求。
export const getCachedUser = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});

export type Identity =
  | { kind: "staff"; role: StaffRole; status: StaffAccountStatus }
  | { kind: "volunteer"; status: VolunteerStatus };

// V2 沒有單一 profiles.role 欄位：職員／志工分成兩張互斥的表，
// 依序查 staff_profiles 再查 volunteer_profiles 判斷身分。
export const getCachedIdentity = cache(
  async (userId: string): Promise<Identity | null> => {
    const supabase = await createClient();

    const { data: staff } = await supabase
      .from("staff_profiles")
      .select("role, status")
      .eq("id", userId)
      .maybeSingle();
    if (staff) return { kind: "staff", role: staff.role, status: staff.status };

    const { data: volunteer } = await supabase
      .from("volunteer_profiles")
      .select("status")
      .eq("id", userId)
      .maybeSingle();
    if (volunteer) return { kind: "volunteer", status: volunteer.status };

    return null;
  }
);

// 未登入／無權限的統一文案。auth.ts 過去另寫「尚未登入。」，同一個狀況兩種
// 說法，一律以此處為準。
const NOT_SIGNED_IN = "請先登入。";
const NO_PERMISSION = "沒有權限執行此操作。";

// requireUser／requireAdmin 共用的回傳形狀。刻意寫成可辨識聯集：呼叫端
// `if (error) return { error }` 之後 userId 會自動收窄成 string，不需要
// 再寫 `userId as string`。
type AuthGuardResult =
  | { supabase: Awaited<ReturnType<typeof createClient>>; userId: string; error?: undefined }
  | { supabase: Awaited<ReturnType<typeof createClient>>; userId: null; error: string };

// 集中的「已登入」檢查，取代先前 registrations / notifications / deactivation /
// email-verify / custom-service 各自重複的「createClient ＋ getCachedUser ＋
// 中文錯誤訊息」三行樣板。
export async function requireUser(): Promise<AuthGuardResult> {
  const supabase = await createClient();
  const user = await getCachedUser();

  if (!user) return { supabase, userId: null, error: NOT_SIGNED_IN };

  return { supabase, userId: user.id };
}

// 集中的「在職職員」權限檢查，取代先前 registrations.ts / notifications.ts
// 各自重複的實作。V1 的 requireAdmin 語意其實是「是否為職員」（V1 的
// ADMIN_ROLES 涵蓋所有職員角色），非僅限系統/單位管理員；更細緻的權限
// （system_admin / unit_admin 專屬操作）交由 RPC / RLS 內部再檢查。
export async function requireAdmin(): Promise<AuthGuardResult> {
  const { supabase, userId, error } = await requireUser();
  if (error) return { supabase, userId: null, error };

  const identity = await getCachedIdentity(userId);
  if (identity?.kind !== "staff" || identity.status !== "active") {
    return { supabase, userId: null, error: NO_PERMISSION };
  }

  return { supabase, userId };
}
