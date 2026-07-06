"use server";

import { createClient } from "@/lib/supabase/server";
import { verifyTurnstile } from "@/lib/turnstile";

export interface SupportActionResult {
  error?: string;
  success?: boolean;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// /support 頁未登入亦可送出，故走 rpc_submit_support_request（anon 可呼叫）
// 而非需要 service-role 的 admin client；欄位驗證與前端重複一份屬刻意設計，
// 避免略過前端直接呼叫時送入空值或不合法格式。
// 防濫用：公開端點易被灌爆，故加 Cloudflare Turnstile 驗證（未設金鑰時自動停用）。
export async function submitSupportRequest(input: {
  name: string;
  email: string;
  topic: string;
  message: string;
  turnstileToken?: string | null;
}): Promise<SupportActionResult> {
  const name = input.name.trim();
  const email = input.email.trim();
  const message = input.message.trim();

  if (!name || !email || !message) {
    return { error: "請先完整填寫姓名、Email 與問題描述。" };
  }
  if (!EMAIL_REGEX.test(email)) {
    return { error: "請輸入有效的 Email 格式。" };
  }

  const humanVerified = await verifyTurnstile(input.turnstileToken ?? null);
  if (!humanVerified) {
    return { error: "人機驗證失敗，請重新完成驗證後再送出。" };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("rpc_submit_support_request", {
    p_name: name,
    p_email: email,
    p_topic: input.topic,
    p_message: message,
  });

  if (error) return { error: `送出失敗：${error.message}` };
  return { success: true };
}
