import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Supabase 忘記密碼信件連結導回的頁面：帶 PKCE code，交換成登入 session
// 後導向 next 指定頁（預設帳號設定頁，供使用者當場設定新密碼）。
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/profile/settings";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/forgot-password?error=callback_failed`);
}
