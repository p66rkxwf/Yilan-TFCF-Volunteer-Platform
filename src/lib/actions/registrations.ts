"use server";

import { createClient } from "@/lib/supabase/server";
import type { AttendanceStatus, Registration } from "@/lib/types/database";

interface ActionResult {
  error?: string;
  success?: boolean;
}

export async function registerForActivity(
  activityId: string
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "請先登入。" };

  const { data: existing } = await supabase
    .from("registrations")
    .select("id, status")
    .eq("activity_id", activityId)
    .eq("volunteer_id", user.id)
    .in("status", ["pending", "approved"])
    .single();

  if (existing) return { error: "您已報名此活動。" };

  const { count } = await supabase
    .from("registrations")
    .select("*", { count: "exact", head: true })
    .eq("activity_id", activityId)
    .in("status", ["pending", "approved"]);

  const { data: activity } = await supabase
    .from("activities")
    .select("capacity, is_cancelled")
    .eq("id", activityId)
    .single();

  if (!activity) return { error: "活動不存在。" };
  if (activity.is_cancelled) return { error: "此活動已取消。" };
  if ((count ?? 0) >= activity.capacity) return { error: "名額已滿。" };

  const { error } = await supabase.from("registrations").insert({
    activity_id: activityId,
    volunteer_id: user.id,
    status: "pending",
  });

  if (error) return { error: `報名失敗：${error.message}` };

  return { success: true };
}

export async function cancelRegistration(
  activityId: string
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "請先登入。" };

  const { error } = await supabase
    .from("registrations")
    .update({ status: "cancelled" })
    .eq("activity_id", activityId)
    .eq("volunteer_id", user.id)
    .in("status", ["pending", "approved"]);

  if (error) return { error: `取消失敗：${error.message}` };

  return { success: true };
}

export async function getMyRegistrations(): Promise<
  (Registration & { activity_title?: string })[]
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return [];

  const { data } = await supabase
    .from("registrations")
    .select("*, activities(title)")
    .eq("volunteer_id", user.id)
    .order("created_at", { ascending: false });

  return (
    data?.map((r) => ({
      ...r,
      activity_title: (r.activities as unknown as { title: string })?.title,
    })) ?? []
  );
}

const ADMIN_ROLES = ["system_admin", "unit_admin", "internal_staff"] as const;

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { supabase, error: "請先登入。" as const };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile || !ADMIN_ROLES.includes(profile.role as (typeof ADMIN_ROLES)[number])) {
    return { supabase, error: "沒有權限執行此操作。" as const };
  }

  return { supabase, error: undefined };
}

// 標記單筆報名的出席狀態與服務時數（僅管理員、僅限已通過的報名）
export async function markAttendance(
  registrationId: string,
  attendance: AttendanceStatus | null,
  hours: number | null
): Promise<ActionResult> {
  const { supabase, error: authError } = await requireAdmin();
  if (authError) return { error: authError };

  if (hours != null && (Number.isNaN(hours) || hours < 0)) {
    return { error: "服務時數需為 0 以上的數字。" };
  }

  const { data: registration } = await supabase
    .from("registrations")
    .select("status")
    .eq("id", registrationId)
    .single();

  if (!registration) return { error: "找不到此報名紀錄。" };
  if (registration.status !== "approved") {
    return { error: "僅能為「已通過」的報名標記出席。" };
  }

  const isPresent = attendance === "present";
  const { error } = await supabase
    .from("registrations")
    .update({
      attendance,
      hours: attendance == null ? null : hours,
      checked_in_at: isPresent ? new Date().toISOString() : null,
    })
    .eq("id", registrationId);

  if (error) return { error: `更新失敗：${error.message}` };

  return { success: true };
}

// 批次將指定報名標記為出席（僅管理員、僅限已通過的報名）
export async function batchCheckIn(
  activityId: string,
  registrationIds: string[]
): Promise<ActionResult> {
  const { supabase, error: authError } = await requireAdmin();
  if (authError) return { error: authError };

  if (registrationIds.length === 0) return { error: "未選擇任何報名。" };

  const { error } = await supabase
    .from("registrations")
    .update({
      attendance: "present",
      checked_in_at: new Date().toISOString(),
    })
    .eq("activity_id", activityId)
    .eq("status", "approved")
    .in("id", registrationIds);

  if (error) return { error: `批次簽到失敗：${error.message}` };

  return { success: true };
}

export interface HoursSummaryEntry {
  registration_id: string;
  activity_title: string;
  activity_date: string | null;
  hours: number;
}

export interface HoursSummary {
  totalHours: number;
  attendedCount: number;
  entries: HoursSummaryEntry[];
}

// 取得目前使用者的累計服務時數與出席明細（僅計入 present）
export async function getMyHoursSummary(): Promise<HoursSummary> {
  const empty: HoursSummary = { totalHours: 0, attendedCount: 0, entries: [] };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return empty;

  const { data } = await supabase
    .from("registrations")
    .select("id, hours, attendance, activities(title, activity_date)")
    .eq("volunteer_id", user.id)
    .eq("attendance", "present")
    .order("created_at", { ascending: false });

  if (!data) return empty;

  const entries: HoursSummaryEntry[] = data.map((r) => {
    const activity = r.activities as unknown as {
      title: string;
      activity_date: string | null;
    } | null;
    return {
      registration_id: r.id,
      activity_title: activity?.title ?? "未知活動",
      activity_date: activity?.activity_date ?? null,
      hours: Number(r.hours ?? 0),
    };
  });

  const totalHours = entries.reduce((sum, e) => sum + e.hours, 0);

  return {
    totalHours,
    attendedCount: entries.length,
    entries,
  };
}
