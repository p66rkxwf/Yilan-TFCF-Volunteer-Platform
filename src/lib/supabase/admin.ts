// 一旦此模組被 client component 引用即在 build 時報錯，避免 service_role
// 金鑰所在的模組意外被打包進前端 bundle（縱深防禦）。
import "server-only";
import { createClient } from "@supabase/supabase-js";

// 每次呼叫都建新 client，不可快取成 module-scope singleton：Cloudflare Workers 的
// 模組層變數活在 isolate、會被後續所有 request 重用，而 supabase-js 每次查詢都會經
// _getAccessToken() → auth.getSession() → await this.initializePromise，該 promise
// 綁在「建立當下那個 request」的 I/O context，第二個 request 起即拋
// "Cannot perform I/O on behalf of a different request" → Worker 例外 → error 1101。
// 本機 next dev/start（Node）沒有此限制，測不出來，只有 workerd 會炸。
// 建 client 只是建物件、不開連線，每次新建成本可忽略。
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      // service_role client 無使用者 session：關掉持久化與背景 refresh timer，
      // 避免在 Workers 上留下不必要的狀態。
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    }
  );
}
