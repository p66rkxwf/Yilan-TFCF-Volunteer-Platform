import type { NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

export async function middleware(request: NextRequest) {
  // 每次導覽刷新 Supabase session（寫回 cookie），避免 access token 過期後
  // 丟出 "Invalid Refresh Token"；同時處理保護頁/登入頁的導向。
  return await updateSession(request);
}

// 設定哪些路徑要經過中間件處理
export const config = {
  matcher: '/((?!api|_next/static|_next/image|favicon.ico).*)',
};