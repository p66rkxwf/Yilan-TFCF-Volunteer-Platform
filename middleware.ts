import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server'; // 注意：這裡應改為 next/server

export function middleware(request: NextRequest) {
  // 目前僅做轉發，不執行任何邏輯，確保編譯通過
  return NextResponse.next();
}

// 設定哪些路徑要經過中間件處理
export const config = {
  matcher: '/((?!api|_next/static|_next/image|favicon.ico).*)',
};