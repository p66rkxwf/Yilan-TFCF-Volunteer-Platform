import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeInternalPath } from "@/lib/url";

// Supabase 忘記密碼信件連結導回的頁面：帶 PKCE code，交換成登入 session
// 後導向 next 指定頁（預設帳號設定頁，供使用者當場設定新密碼）。
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  // 僅允許站內相對路徑，避免 next 被塞入 @evil.com / .evil.com 造成開放重導。
  const next = safeInternalPath(searchParams.get("next") ?? "/profile/settings");

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/forgot-password?error=callback_failed`);
}
