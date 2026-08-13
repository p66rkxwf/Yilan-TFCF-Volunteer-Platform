-- =========================================================
-- 志工管理平台 43_schema_version.sql（部署漂移偵測）
--
-- 問題：這個專案實際上是三套獨立部署的東西——
--     ① Next.js app（GitHub Actions 自動部署）
--     ② Supabase DB（SQL Editor 手動貼上）
--     ③ orchestrator worker（wrangler 手動部署）
--   三者版本可以各自落後，而且沒有任何地方看得出來。前端呼叫了還沒建立的 RPC 會
--   直接報錯（至少看得見），但更糟的情況是「看起來能跑，只是少了一段安全限制」——
--   例如 39 尚未套用時，未驗證 Email 的志工照樣能報名，畫面上完全正常。
--
-- 修補：DB 記一個 schema_version，app 端記一個「我期望的版本」，
--   /api/health 把兩者一起吐出來並標示是否漂移。
--
-- 【規約】從本檔起，每支新增的 SQL patch 都要在檔尾更新這個值為自己的編號：
--     UPDATE public.system_settings SET schema_version = 'NN';
--   並同步更新 src/app/api/health/route.ts 的 EXPECTED_DB_SCHEMA。
--
-- 前置：01（system_settings）。
-- 冪等：ADD COLUMN IF NOT EXISTS + UPDATE，可重複執行。
-- =========================================================

ALTER TABLE public.system_settings
  ADD COLUMN IF NOT EXISTS schema_version text NOT NULL DEFAULT '43';

-- system_settings 只有單列（01 種好），直接更新。
UPDATE public.system_settings SET schema_version = '43';

NOTIFY pgrst, 'reload schema';
