"use server";

// 志工 Email 驗證：索取驗證碼（寄到聯絡信箱，走 outbox）與輸入驗證碼。
// 守衛（在職志工、頻率限制、限時限次、驗證後標記 email_verified_at）皆在
// rpc_request_email_otp / rpc_verify_email_otp 內強制（見 21_email_verification.sql）。

import { createClient } from "@/lib/supabase/server";
import { getCachedUser } from "@/lib/supabase/cached-auth";

interface ActionResult {
  error?: string;
  success?: boolean;
}

export async function requestEmailOtp(): Promise<ActionResult> {
  const supabase = await createClient();
  const user = await getCachedUser();
  if (!user) return { error: "請先登入。" };

  const { error } = await supabase.rpc("rpc_request_email_otp");
  if (error) return { error: error.message };
  return { success: true };
}

export async function verifyEmailOtp(code: string): Promise<ActionResult> {
  const trimmed = code.trim();
  if (!/^\d{6}$/.test(trimmed)) return { error: "請輸入 6 位數字驗證碼。" };

  const supabase = await createClient();
  const user = await getCachedUser();
  if (!user) return { error: "請先登入。" };

  const { error } = await supabase.rpc("rpc_verify_email_otp", { p_code: trimmed });
  if (error) return { error: error.message };
  return { success: true };
}
