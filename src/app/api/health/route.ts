// 部署健康檢查：回報 app 與 DB schema 的版本，並標示是否漂移。
//
// 存在理由見 supabase/v2/43_schema_version.sql：app／DB／worker 是三套獨立部署，
// DB 落後時最危險的不是「RPC 不存在」這種看得見的錯，而是「畫面正常但少了一段
// 安全限制」——例如 39 未套用時未驗證 Email 的志工照樣能報名。
//
// 這支刻意公開（middleware matcher 排除 /api，不套 CSP 與 session 更新），
// 只回版本字串與布林值，不吐任何設定內容或錯誤細節。
//
// 【維護】新增 SQL patch 時，同步更新下方 EXPECTED_DB_SCHEMA 與該檔檔尾的
//   UPDATE public.system_settings SET schema_version = 'NN';

import { createAdminClient } from "@/lib/supabase/admin";

// 這份程式碼期望的 DB schema 版本（= supabase/v2/ 最新一支 patch 的編號）
const EXPECTED_DB_SCHEMA = "43";

export const dynamic = "force-dynamic";

export async function GET() {
  let dbSchema: string | null = null;
  let dbReachable = true;

  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("system_settings")
      .select("schema_version")
      .maybeSingle();

    if (error) {
      dbReachable = false;
    } else {
      // 欄位不存在（43 尚未套用）時 supabase-js 會回錯誤而非 null，
      // 走上面那條；這裡的 null 代表查到列但值為空。
      dbSchema = (data?.schema_version as string | null) ?? null;
    }
  } catch {
    dbReachable = false;
  }

  const drift = dbReachable && dbSchema !== EXPECTED_DB_SCHEMA;
  const status = !dbReachable || drift ? "degraded" : "ok";

  return Response.json(
    {
      status,
      app: {
        expectedDbSchema: EXPECTED_DB_SCHEMA,
      },
      db: {
        reachable: dbReachable,
        schemaVersion: dbSchema,
      },
      drift,
    },
    {
      status: status === "ok" ? 200 : 503,
      headers: { "Cache-Control": "no-store" },
    }
  );
}
