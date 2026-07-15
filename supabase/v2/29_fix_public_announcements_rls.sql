-- =========================================================
-- 志工管理平台 29_fix_public_announcements_rls.sql
-- 用途：修正「未登入訪客看不到已發布公告」的 RLS bug。
-- 前置：01 → 03 → 08 → 23（announcements 表、anon policy 與軟刪除欄位已建立）
--
-- 根因：announcements_select_published / announcements_select_staff 建立時
-- 未限定角色（預設 TO public），anon 查詢公告時 Postgres 會把同表所有
-- permissive policy OR 起來評估，被迫呼叫 fn_is_staff()——但 03 已刻意
-- REVOKE anon 對該函式的 EXECUTE，整個查詢因此報 42501
-- （permission denied for function fn_is_staff），前台把錯誤當成空清單，
-- 顯示「目前沒有公告」。
--
-- 修法：兩條 policy 改為 TO authenticated，anon 只會評估
-- announcements_select_public（08 建立、23 重建，維持不動）。
-- 寫入類 policy 不動：anon 在 GRANT 層即無寫入權，不會被評估。
--
-- 執行方式：於 Supabase SQL Editor 貼上並執行本檔即可（可重複執行）。
-- =========================================================

-- 1) 登入者（志工/學生）可讀「已發布且未封存」公告
--    原本的 auth.uid() IS NOT NULL 條件已由 TO authenticated 涵蓋。
DROP POLICY IF EXISTS announcements_select_published ON public.announcements;
CREATE POLICY announcements_select_published ON public.announcements
  FOR SELECT TO authenticated
  USING (status = 'published' AND deleted_at IS NULL);

-- 2) 在職職員可讀全部公告（含草稿/下架/封存，供後台管理與還原）
DROP POLICY IF EXISTS announcements_select_staff ON public.announcements;
CREATE POLICY announcements_select_staff ON public.announcements
  FOR SELECT TO authenticated
  USING (public.fn_is_staff());
