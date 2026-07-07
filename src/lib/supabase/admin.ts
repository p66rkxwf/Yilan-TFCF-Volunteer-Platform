// 一旦此模組被 client component 引用即在 build 時報錯，避免 service_role
// 金鑰所在的模組意外被打包進前端 bundle（縱深防禦）。
import "server-only";
import { createClient } from "@supabase/supabase-js";

let adminClient: ReturnType<typeof createClient> | undefined;

export function createAdminClient() {
  if (!adminClient) {
    adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
  }

  return adminClient;
}
