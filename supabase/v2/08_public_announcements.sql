-- =========================================================
-- 志工管理平台 08_public_announcements.sql
-- 用途：讓「已發布公告」對未登入訪客（anon）可見，以便顯示於首頁與最新消息頁。
-- 前置：01 → 02 → 03（announcements 表與 RLS 已建立）
--
-- 設計原則（最小揭露）：
-- - 只開放 status = 'published' 的列給 anon
-- - 欄位級 GRANT 只給前台需要的欄位，不含 created_by（不外洩建立者身分）
-- - 職員／登入者的既有 policy（03_rls_policies.sql）不受影響
--
-- 執行方式：於 Supabase SQL Editor 貼上並執行本檔即可（可重複執行）。
-- =========================================================

-- 1) 未登入訪客可讀「已發布」公告
DROP POLICY IF EXISTS announcements_select_public ON public.announcements;
CREATE POLICY announcements_select_public ON public.announcements
  FOR SELECT
  TO anon
  USING (status = 'published');

-- 2) 欄位級授權：anon 僅能讀前台需要的欄位（不含 created_by）
--    先撤銷可能存在的整表 SELECT，再逐欄授權，確保最小揭露。
REVOKE SELECT ON public.announcements FROM anon;
GRANT SELECT (id, title, content, is_pinned, status, published_at, created_at)
  ON public.announcements TO anon;
