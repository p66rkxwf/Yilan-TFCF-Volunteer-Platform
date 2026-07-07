-- =========================================================
-- 志工管理平台 09_relax_activity_management.sql
-- 用途：將「活動管理權」由（建立者／主辦人／單位管理員以上）放寬為
--       「全體在職職員皆可管理任何活動」。
--       單一小機構實務上每位在職職員都需能管任何活動，原 decision #30
--       的建立者限制造成「看不到編輯鈕／改了存不進去」的困擾。
-- 前置：01 → 02 → 03 → 04（已建立 fn_can_manage_activity 與相關 policy/RPC）
--
-- 設計：只重定義 fn_can_manage_activity 一支函式即可，
--       所有引用它的 policy（activities_update/delete、sessions_*、organizers_*）
--       與 RPC（rpc_cancel_activity、rpc_cancel_session）自動一併放寬，
--       無需逐一改寫。函式維持相同簽名（吃 uuid、忽略之），
--       仍要求呼叫者為在職職員（fn_is_staff）。
--
-- 執行方式：於 Supabase SQL Editor 貼上並執行本檔即可（可重複執行）。
-- =========================================================

CREATE OR REPLACE FUNCTION public.fn_can_manage_activity(p_activity_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  -- 全體在職職員皆可管理任何活動；p_activity_id 保留於簽名以相容既有引用。
  SELECT public.fn_is_staff();
$$;
