"use server";

import { createClient } from "@/lib/supabase/server";
import { getCachedUser, requireAdmin } from "@/lib/supabase/cached-auth";
import type { RegistrationStatus } from "@/lib/types/database";

interface ActionResult {
  error?: string;
  success?: boolean;
}

// V2 報名一律走 RPC（registrations 無直寫 policy）；RPC 內含 advisory lock、
// 名額鎖內即時計數、時間衝突檢查、帳號狀態檢查，前端不再重複這些邏輯。
// RPC 用 RAISE EXCEPTION 拋出的中文訊息會透過 error.message 原樣帶回。
export async function registerForSession(sessionId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const user = await getCachedUser();
  if (!user) return { error: "請先登入。" };

  const { error } = await supabase.rpc("rpc_register_for_session", {
    p_session_id: sessionId,
  });

  if (error) return { error: error.message };
  return { success: true };
}

export async function cancelRegistration(
  registrationId: string
): Promise<ActionResult & { status?: RegistrationStatus }> {
  const supabase = await createClient();
  const user = await getCachedUser();
  if (!user) return { error: "請先登入。" };

  const { data, error } = await supabase.rpc("rpc_request_cancel", {
    p_registration_id: registrationId,
  });

  if (error) return { error: error.message };
  return { success: true, status: data as RegistrationStatus };
}

export async function getMyRegistrations() {
  const supabase = await createClient();
  const user = await getCachedUser();
  if (!user) return [];

  const { data } = await supabase
    .from("registrations")
    .select("*, activity_sessions(start_at, end_at, activities(title))")
    .eq("volunteer_id", user.id)
    .order("created_at", { ascending: false });

  return data ?? [];
}

// 報名審核（待審核 → 通過／拒絕）
export async function reviewRegistration(
  registrationId: string,
  approve: boolean
): Promise<ActionResult> {
  const { supabase, error: authError } = await requireAdmin();
  if (authError) return { error: authError };

  const { error } = await supabase.rpc("rpc_review_registration", {
    p_registration_id: registrationId,
    p_approve: approve,
  });

  if (error) return { error: error.message };
  return { success: true };
}

// 標記單筆報名的出席狀態（僅管理員、僅限已通過的報名且在補登寬限期內；
// 服務時數由 DB trigger 依場次時長自動帶入，不再手動輸入）
export async function markAttendance(
  registrationId: string,
  attendance: "attended" | "absent"
): Promise<ActionResult> {
  const { supabase, error: authError } = await requireAdmin();
  if (authError) return { error: authError };

  const { error } = await supabase.rpc("rpc_admin_check_in", {
    p_registration_id: registrationId,
    p_attendance: attendance,
  });

  if (error) return { error: error.message };
  return { success: true };
}

// 寬限期後的缺席改判／補登（#25：無時間上限）
export async function makeupAttendance(registrationId: string): Promise<ActionResult> {
  const { supabase, error: authError } = await requireAdmin();
  if (authError) return { error: authError };

  const { error } = await supabase.rpc("rpc_makeup_attendance", {
    p_registration_id: registrationId,
  });

  if (error) return { error: error.message };
  return { success: true };
}

// 批次將指定報名標記為出席（僅管理員、僅限已通過的報名）；
// 規格書明示批次＝迴圈呼叫同一支簽到 RPC，規模 ≤1000 可接受。
export async function batchCheckIn(registrationIds: string[]): Promise<ActionResult> {
  const { supabase, error: authError } = await requireAdmin();
  if (authError) return { error: authError };

  if (registrationIds.length === 0) return { error: "未選擇任何報名。" };

  for (const id of registrationIds) {
    const { error } = await supabase.rpc("rpc_admin_check_in", {
      p_registration_id: id,
      p_attendance: "attended",
    });
    if (error) return { error: `批次簽到失敗：${error.message}` };
  }

  return { success: true };
}

export interface HoursSummaryEntry {
  registration_id: string;
  activity_title: string;
  session_start_at: string | null;
  hours: number;
}

export interface HoursSummary {
  totalHours: number;
  attendedCount: number;
  entries: HoursSummaryEntry[];
}

// 取得目前使用者的累計服務時數與出席明細（含 attended／makeup_attended）
export async function getMyHoursSummary(): Promise<HoursSummary> {
  const empty: HoursSummary = { totalHours: 0, attendedCount: 0, entries: [] };

  const supabase = await createClient();
  const user = await getCachedUser();

  if (!user) return empty;

  const { data } = await supabase
    .from("registrations")
    .select("id, service_hours, attendance, created_at, activity_sessions(start_at, activities(title))")
    .eq("volunteer_id", user.id)
    .in("attendance", ["attended", "makeup_attended"])
    .order("created_at", { ascending: false });

  if (!data) return empty;

  const entries: HoursSummaryEntry[] = data.map((r) => {
    const session = r.activity_sessions as unknown as {
      start_at: string;
      activities: { title: string } | null;
    } | null;
    return {
      registration_id: r.id,
      activity_title: session?.activities?.title ?? "未知活動",
      session_start_at: session?.start_at ?? null,
      hours: Number(r.service_hours ?? 0),
    };
  });

  const totalHours = entries.reduce((sum, e) => sum + e.hours, 0);

  return {
    totalHours,
    attendedCount: entries.length,
    entries,
  };
}
