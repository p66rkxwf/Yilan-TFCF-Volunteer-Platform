"use server";

// 自訂服務登錄（記錄已完成的私下服務、計時數）：送審與審核。
// 權限、時數換算、通知（該生負責社工）皆在 rpc_submit_custom_service /
// rpc_review_custom_service 內強制（見 27_custom_service_and_notifications.sql）。

import { createClient } from "@/lib/supabase/server";
import { getCachedUser } from "@/lib/supabase/cached-auth";

interface ActionResult {
  error?: string;
  success?: boolean;
  id?: string;
}

export async function submitCustomService(input: {
  volunteerId: string;
  title: string;
  leaderName: string;
  description: string;
  startIso: string;
  endIso: string;
}): Promise<ActionResult> {
  const supabase = await createClient();
  const user = await getCachedUser();
  if (!user) return { error: "請先登入。" };

  const { data, error } = await supabase.rpc("rpc_submit_custom_service", {
    p_volunteer_id: input.volunteerId,
    p_title: input.title,
    p_leader: input.leaderName,
    p_description: input.description,
    p_start: input.startIso,
    p_end: input.endIso,
  });
  if (error) return { error: error.message };
  return { success: true, id: data as string };
}

export async function reviewCustomService(
  id: string,
  approve: boolean,
  note?: string
): Promise<ActionResult> {
  const supabase = await createClient();
  const user = await getCachedUser();
  if (!user) return { error: "請先登入。" };

  const { error } = await supabase.rpc("rpc_review_custom_service", {
    p_id: id,
    p_approve: approve,
    p_note: note ?? null,
  });
  if (error) return { error: error.message };
  return { success: true };
}
