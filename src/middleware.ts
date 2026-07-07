import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

// 為什麼是 middleware.ts 而非 Next 16 的 proxy.ts：
//   Next 16 的 proxy.ts 一律跑在 Node.js runtime 且無法改成 edge，而部署目標
//   OpenNext Cloudflare 目前「不支援 Node.js middleware（15.2 起）」，只支援 edge
//   middleware。middleware.ts 在 Next 16 仍受支援（僅標記 deprecated）且預設跑在
//   edge runtime，故沿用它才能通過 Cloudflare 建置。待 OpenNext 支援 Node proxy 後
//   可再改回 proxy.ts。（updateSession 為標準 Supabase SSR 模式，edge 相容。）
export async function middleware(request: NextRequest) {
  // 每次導覽刷新 Supabase session（寫回 cookie），避免 access token 過期後
  // 丟出 "Invalid Refresh Token"；同時處理保護頁/登入頁的導向。
  return await updateSession(request);
}

// 排除 api、Next 靜態資源與圖片副檔名，其餘路徑皆刷新 session。
export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
