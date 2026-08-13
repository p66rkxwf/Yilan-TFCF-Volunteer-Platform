"use server";

// 志工 Email 驗證：索取驗證碼（寄到聯絡信箱，走 outbox）與輸入驗證碼。
// 守衛（在職志工、頻率限制、限時限次、驗證後標記 email_verified_at）皆在
// rpc_request_email_otp / rpc_verify_email_otp 內強制（見 21_email_verification.sql）。
// 驗證碼明碼不進 outbox payload，由 worker 另查 email_verifications（見 40_otp_leak_fix.sql）。

import { requireUser } from "@/lib/supabase/cached-auth";
import { verifyTurnstile } from "@/lib/turnstile";
import type { ActionResult } from "@/lib/types/action";

export async function requestEmailOtp(
  turnstileToken?: string | null
): Promise<ActionResult> {
  // 索取驗證碼會觸發寄信，是可被拿來灌信箱的端點。DB 端已有 60 秒節流，
  // 這裡再加人機驗證擋自動化（未設金鑰時自動放行）。
  const humanVerified = await verifyTurnstile(turnstileToken ?? null);
  if (!humanVerified) {
    return { error: "人機驗證失敗，請重新完成驗證後再送出。" };
  }

  const { supabase, error: authError } = await requireUser();
  if (authError) return { error: authError };

  const { error } = await supabase.rpc("rpc_request_email_otp");
  if (error) return { error: error.message };
  return { success: true };
}

export async function verifyEmailOtp(code: string): Promise<ActionResult> {
  const trimmed = code.trim();
  if (!/^\d{6}$/.test(trimmed)) return { error: "請輸入 6 位數字驗證碼。" };

  const { supabase, error: authError } = await requireUser();
  if (authError) return { error: authError };

  const { error } = await supabase.rpc("rpc_verify_email_otp", { p_code: trimmed });
  if (error) return { error: error.message };
  return { success: true };
}
