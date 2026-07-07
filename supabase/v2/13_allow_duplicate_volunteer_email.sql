-- =========================================================
-- 志工管理平台 13_allow_duplicate_volunteer_email.sql
-- 目的：允許志工聯絡 Email 重複。
--   志工改以「帳號」登入，volunteer_profiles.email 僅作聯絡用途，不再需要唯一。
--   auth 登入身分改用系統產生的內部信箱（見 src/lib/actions/auth.ts signUp），
--   故移除聯絡 Email 的唯一約束。email 仍維持 NOT NULL（聯絡方式必填）。
-- 冪等：DROP CONSTRAINT IF EXISTS 可重複執行。
-- 前置：01～12 已部署。
--
-- ⚠️ 另需於 Supabase Dashboard → Authentication → Providers → Email
--    「關閉 Confirm email」——因為 auth 信箱是系統產生的內部位址、收不到確認信，
--    不關閉的話新志工會卡在未驗證而無法登入。帳號改由後台審核（pending_review）把關。
-- =========================================================

ALTER TABLE public.volunteer_profiles
  DROP CONSTRAINT IF EXISTS volunteer_profiles_email_key;

-- 驗證：下列查詢應查無 email 的唯一約束（只剩 NOT NULL）：
--   SELECT conname FROM pg_constraint
--   WHERE conrelid = 'public.volunteer_profiles'::regclass AND contype = 'u';
--   （預期只剩 username 的唯一約束 volunteer_profiles_username_key）
