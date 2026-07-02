"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Notification } from "@/lib/types/database";

// The shared admin client is intentionally untyped (matching the rest of the
// codebase); cast to a permissive client so cross-user inserts type-check.
function adminClient(): SupabaseClient {
  return createAdminClient() as unknown as SupabaseClient;
}

interface ActionResult {
  error?: string;
  success?: boolean;
}

const ADMIN_ROLES = ["system_admin", "unit_admin", "internal_staff"] as const;

async function getCurrentUserId() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, userId: user?.id };
}

async function isAdmin(userId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .single();
  return !!data && ADMIN_ROLES.includes(data.role as (typeof ADMIN_ROLES)[number]);
}

// 取得目前使用者的通知（預設最新 30 筆）
export async function getMyNotifications(limit = 30): Promise<Notification[]> {
  const { supabase, userId } = await getCurrentUserId();
  if (!userId) return [];

  const { data } = await supabase
    .from("notifications")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);

  return data ?? [];
}

// 取得未讀通知數
export async function getUnreadCount(): Promise<number> {
  const { supabase, userId } = await getCurrentUserId();
  if (!userId) return 0;

  const { count } = await supabase
    .from("notifications")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .is("read_at", null);

  return count ?? 0;
}

export async function markRead(notificationId: string): Promise<ActionResult> {
  const { supabase, userId } = await getCurrentUserId();
  if (!userId) return { error: "請先登入。" };

  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", notificationId)
    .eq("user_id", userId)
    .is("read_at", null);

  if (error) return { error: error.message };
  return { success: true };
}

export async function markAllRead(): Promise<ActionResult> {
  const { supabase, userId } = await getCurrentUserId();
  if (!userId) return { error: "請先登入。" };

  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", userId)
    .is("read_at", null);

  if (error) return { error: error.message };
  return { success: true };
}

interface NewNotification {
  user_id: string;
  type: string;
  title: string;
  body?: string | null;
  link?: string | null;
}

// 由管理員為單一使用者建立通知（service role 寫入，跨使用者）
export async function createNotification(
  payload: NewNotification
): Promise<ActionResult> {
  const { userId } = await getCurrentUserId();
  if (!userId) return { error: "請先登入。" };
  if (!(await isAdmin(userId))) return { error: "沒有權限建立通知。" };

  const admin = adminClient();
  const { error } = await admin.from("notifications").insert({
    user_id: payload.user_id,
    type: payload.type,
    title: payload.title,
    body: payload.body ?? null,
    link: payload.link ?? null,
  });

  if (error) return { error: error.message };
  return { success: true };
}

// 由管理員通知某活動所有「待審核 / 已通過」的報名者（例如活動取消、異動）
export async function notifyActivityRegistrants(
  activityId: string,
  payload: { type: string; title: string; body?: string | null; link?: string | null }
): Promise<ActionResult> {
  const { userId } = await getCurrentUserId();
  if (!userId) return { error: "請先登入。" };
  if (!(await isAdmin(userId))) return { error: "沒有權限建立通知。" };

  const admin = adminClient();
  const { data: registrants } = await admin
    .from("registrations")
    .select("volunteer_id")
    .eq("activity_id", activityId)
    .in("status", ["pending", "approved"]);

  if (!registrants || registrants.length === 0) return { success: true };

  const rows = registrants.map((r) => ({
    user_id: r.volunteer_id as string,
    type: payload.type,
    title: payload.title,
    body: payload.body ?? null,
    link: payload.link ?? null,
  }));

  const { error } = await admin.from("notifications").insert(rows);
  if (error) return { error: error.message };
  return { success: true };
}
