"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCachedUser, requireAdmin } from "@/lib/supabase/cached-auth";

interface ActionResult {
  error?: string;
  success?: boolean;
}

// 志工提出停用申請（原因選填）
export async function requestDeactivation(reason?: string): Promise<ActionResult> {
  const supabase = await createClient();
  const user = await getCachedUser();
  if (!user) return { error: "請先登入。" };

  const { error } = await supabase.rpc("rpc_request_deactivation", {
    p_reason: reason || null,
  });

  if (error) return { error: error.message };
  return { success: true };
}

// 志工撤回自己待處理中的停用申請
export async function withdrawDeactivationRequest(): Promise<ActionResult> {
  const supabase = await createClient();
  const user = await getCachedUser();
  if (!user) return { error: "請先登入。" };

  const { error } = await supabase.rpc("rpc_withdraw_deactivation_request");

  if (error) return { error: error.message };
  return { success: true };
}

// 管理員審核停用申請（核准會將志工狀態轉為停權，並級聯取消未來報名）
export async function reviewDeactivationRequest(
  requestId: string,
  approve: boolean,
  note?: string
): Promise<ActionResult> {
  const { supabase, error: authError } = await requireAdmin();
  if (authError) return { error: authError };

  const { error } = await supabase.rpc("rpc_review_deactivation_request", {
    p_request_id: requestId,
    p_approve: approve,
    p_note: note || null,
  });

  if (error) return { error: error.message };

  // 核准停用＝將志工轉為停權。比照 setVolunteerStatus，一併撤銷其 Auth session，
  // 避免既有 token 在自然過期前仍可讀取自身資料（資安審核 hardening H3）。
  if (approve) {
    const { data: req } = await supabase
      .from("deactivation_requests")
      .select("volunteer_id")
      .eq("id", requestId)
      .maybeSingle();
    const volunteerId = (req as { volunteer_id?: string } | null)?.volunteer_id;
    if (volunteerId) {
      const admin = createAdminClient();
      await admin.auth.admin.updateUserById(volunteerId, {
        ban_duration: "876000h",
      });
    }
  }

  return { success: true };
}
