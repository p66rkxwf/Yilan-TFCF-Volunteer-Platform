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

// 未登入／無權限的統一文案，全站以此處為準，不要另造措辭。
const NOT_SIGNED_IN = "請先登入。";
const NO_PERMISSION = "沒有權限執行此操作。";

// requireUser／requireAdmin 共用的回傳形狀。刻意寫成可辨識聯集：呼叫端
// `if (error) return { error }` 之後 userId 會自動收窄成 string，不需要
// 再寫 `userId as string`。
type AuthGuardResult =
  | { supabase: Awaited<ReturnType<typeof createClient>>; userId: string; error?: undefined }
  | { supabase: Awaited<ReturnType<typeof createClient>>; userId: null; error: string };

// 集中的「已登入」檢查：需要登入但不限職員的 action 一律由此開頭，
// 不要自行拼 createClient ＋ getCachedUser ＋ 錯誤訊息。
export async function requireUser(): Promise<AuthGuardResult> {
  const supabase = await createClient();
  const user = await getCachedUser();

  if (!user) return { supabase, userId: null, error: NOT_SIGNED_IN };

  return { supabase, userId: user.id };
}

// 名稱易誤導：本函式檢查的是「在職職員」，不是「管理員」——沿用 V1 命名，
// 而 V1 的 ADMIN_ROLES 涵蓋所有職員角色。system_admin / unit_admin 專屬的操作
// 必須另外自行檢查角色，或交由 RPC / RLS 把關。
export async function requireAdmin(): Promise<AuthGuardResult> {
  const { supabase, userId, error } = await requireUser();
  if (error) return { supabase, userId: null, error };

  const identity = await getCachedIdentity(userId);
  if (identity?.kind !== "staff" || identity.status !== "active") {
    return { supabase, userId: null, error: NO_PERMISSION };
  }

  return { supabase, userId };
}
