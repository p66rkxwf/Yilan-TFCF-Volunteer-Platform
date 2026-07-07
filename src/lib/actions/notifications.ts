"use server";

import { createClient } from "@/lib/supabase/server";
import { getCachedUser } from "@/lib/supabase/cached-auth";

interface ActionResult {
  error?: string;
  success?: boolean;
}

// 標記站內通知為已讀。ids 省略＝全部標為已讀；RPC 內僅會更新本人的未讀列
// （見 supabase/v2/15_notification_center.sql）。
export async function markNotificationsRead(ids?: string[]): Promise<ActionResult> {
  const supabase = await createClient();
  const user = await getCachedUser();
  if (!user) return { error: "請先登入。" };

  const { error } = await supabase.rpc("rpc_mark_notifications_read", {
    p_ids: ids && ids.length > 0 ? ids : null,
  });

  if (error) return { error: error.message };
  return { success: true };
}
