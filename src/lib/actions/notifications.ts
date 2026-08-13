"use server";

import { requireUser } from "@/lib/supabase/cached-auth";
import type { ActionResult } from "@/lib/types/action";

// 標記站內通知為已讀。ids 省略＝全部標為已讀；RPC 內僅會更新本人的未讀列
// （見 supabase/v2/15_notification_center.sql）。
export async function markNotificationsRead(ids?: string[]): Promise<ActionResult> {
  const { supabase, error: authError } = await requireUser();
  if (authError) return { error: authError };

  const { error } = await supabase.rpc("rpc_mark_notifications_read", {
    p_ids: ids && ids.length > 0 ? ids : null,
  });

  if (error) return { error: error.message };
  return { success: true };
}

// 刪除站內通知（軟刪，列仍留著供寄信稽核與去重）。ids 省略＝清除全部「已讀」
// ——刻意不是「全部」，未讀不該被一鍵無聲刪掉（見 supabase/v2/38_notification_manage.sql）。
export async function deleteNotifications(ids?: string[]): Promise<ActionResult> {
  const { supabase, error: authError } = await requireUser();
  if (authError) return { error: authError };

  const { error } = await supabase.rpc("rpc_delete_notifications", {
    p_ids: ids && ids.length > 0 ? ids : null,
  });

  if (error) return { error: error.message };
  return { success: true };
}
