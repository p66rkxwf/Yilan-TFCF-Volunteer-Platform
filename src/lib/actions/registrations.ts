"use server";

import { createClient } from "@/lib/supabase/server";
import { getCachedUser } from "@/lib/supabase/cached-auth";
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

// 志工自行簽到：開放時段（場次開始前 N 分鐘～結束，N 為後台系統參數）、
// 帳號狀態、報名狀態等守衛全在 RPC 內強制（rpc_self_check_in，見 11_harden…）；
// 前端只負責呼叫並原樣顯示中文錯誤訊息。
export async function selfCheckIn(registrationId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const user = await getCachedUser();
  if (!user) return { error: "請先登入。" };

  const { error } = await supabase.rpc("rpc_self_check_in", {
    p_registration_id: registrationId,
  });

  if (error) return { error: error.message };
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
