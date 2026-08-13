-- 測試用：在乾淨的 Postgres 上補出 supabase/v2/*.sql 依賴的 Supabase 平台物件。
--
-- 這些東西在正式環境由 Supabase 平台提供，不在本專案的 SQL 檔裡，但少了它們
-- 01_schema.sql 第一句就會失敗。刻意只補「SQL 檔真正用到的部分」——
-- 全庫掃過只有三類：auth.users（外鍵目標 + email 同步 trigger）、auth.uid()、
-- 以及 anon／authenticated／service_role 三個角色。GoTrue 其餘的欄位與表都用不到。
--
-- 用 plain postgres 而非 `supabase start` 的理由：後者要拉數 GB 的完整 stack
-- （studio/realtime/storage/edge-runtime…），而我們一個都用不到。

-- ---------------------------------------------------------
-- 1. 角色（03_rls_policies.sql 起的 GRANT/REVOKE 都指名這三個）
-- ---------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS;
  END IF;
END $$;

-- 測試以 postgres 連線後用 SET ROLE 切換身分，需先被授予這些角色
GRANT anon, authenticated, service_role TO postgres;

-- ---------------------------------------------------------
-- 2. extensions schema
--    01_schema.sql 的 `CREATE EXTENSION btree_gist WITH SCHEMA extensions`
--    需要它存在；且 activity_sessions 的 EXCLUDE USING gist 在建表當下就要能
--    解析到 gist 的 uuid operator class，故 search_path 必須含 extensions
--    （Supabase 的預設 search_path 本來就含，這裡照做）。
-- ---------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS extensions;
ALTER DATABASE postgres SET search_path TO "$user", public, extensions;

-- ---------------------------------------------------------
-- 3. auth schema：只需 users 表與 uid()
-- ---------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS auth;

CREATE TABLE IF NOT EXISTS auth.users (
  id uuid PRIMARY KEY,
  instance_id uuid,
  aud varchar(255),
  role varchar(255),
  email varchar(255),
  encrypted_password varchar(255),
  email_confirmed_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 與 Supabase 的實作等價：讀 PostgREST 每請求設定的 GUC。
-- STABLE 而非 IMMUTABLE——同一交易內值不變，但跨請求會變。
--
-- 注意內層那個 nullif 必須在 ::jsonb 之前：交易內用 set_config(..., true) 設過之後，
-- 該 GUC 在交易結束時不會回到「未定義」，而是變成空字串，而 ''::jsonb 會直接拋
-- invalid input syntax for type json。Supabase 官方實作同樣先 nullif 再轉型。
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT nullif(
           nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub',
           ''
         )::uuid
$$;

GRANT USAGE ON SCHEMA auth, extensions TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role;
