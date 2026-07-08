-- =========================================================
-- 志工管理平台 17_reassign_worker.sql（負責社工批量移轉）
-- 用途：社工輪換／離職時，把某位社工名下「所有學生」一次改派給另一位社工。
--   V2 原本只在帳號審核（rpc_review_volunteer_account）時指定一次負責社工，
--   之後無任何改派路徑；本檔補上批量移轉 RPC。
-- 前置：01（volunteer_profiles.assigned_worker_id）→ 02（fn_check_assigned_worker
--   trigger 逐列驗證新社工資格）→ 03（fn_is_admin）→ 04（fn_audit）。
--
-- 設計：
-- - 權限：單位管理員以上（fn_is_admin），與「審核時指派社工」相同權限。
-- - 目標社工須為在職且職稱 social_worker（trigger 亦逐列強制；此處提早給明確錯誤）。
--   來源不限（輪換情境常是已停權/離職社工，故不檢查來源資格）。
-- - 移轉來源社工名下「全部」學生列（含已畢業/停權），使來源社工不再有殘留指派。
-- - 走 SECURITY DEFINER 並比照其他改寫 volunteer_profiles 的 RPC 設 bypass 旗標。
-- 冪等：CREATE OR REPLACE 可重複執行。
-- =========================================================

CREATE OR REPLACE FUNCTION public.rpc_reassign_worker(
  p_from_worker_id uuid, p_to_worker_id uuid
) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_count integer;
BEGIN
  IF NOT public.fn_is_admin() THEN RAISE EXCEPTION '需單位管理員以上權限'; END IF;
  IF p_from_worker_id = p_to_worker_id THEN
    RAISE EXCEPTION '來源與目標社工不可相同';
  END IF;

  -- 目標須為在職社工（fn_check_assigned_worker trigger 亦會逐列驗證）
  IF NOT EXISTS (
    SELECT 1 FROM public.staff_profiles
    WHERE id = p_to_worker_id AND job_title = 'social_worker' AND status = 'active'
  ) THEN
    RAISE EXCEPTION '目標社工必須為在職且職稱為社工的職員';
  END IF;

  PERFORM set_config('app.bypass_profile_guard', 'on', true);
  UPDATE public.volunteer_profiles
  SET assigned_worker_id = p_to_worker_id
  WHERE assigned_worker_id = p_from_worker_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;

  IF v_count > 0 THEN
    PERFORM public.fn_audit('reassign_worker', 'staff_profiles', p_from_worker_id,
      jsonb_build_object('to_worker_id', p_to_worker_id, 'moved_count', v_count));
  END IF;

  RETURN v_count;
END $$;

REVOKE EXECUTE ON FUNCTION public.rpc_reassign_worker(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_reassign_worker(uuid, uuid) TO authenticated;

-- ---------------------------------------------------------
-- 單一學生改派：學生詳情頁用（改個別學生的負責社工）。
-- 權限與目標社工資格同上；僅改指定學生一列。
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_set_volunteer_worker(
  p_volunteer_id uuid, p_worker_id uuid
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT public.fn_is_admin() THEN RAISE EXCEPTION '需單位管理員以上權限'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.staff_profiles
    WHERE id = p_worker_id AND job_title = 'social_worker' AND status = 'active'
  ) THEN
    RAISE EXCEPTION '負責社工必須為在職且職稱為社工的職員';
  END IF;

  PERFORM set_config('app.bypass_profile_guard', 'on', true);
  UPDATE public.volunteer_profiles
  SET assigned_worker_id = p_worker_id
  WHERE id = p_volunteer_id;
  IF NOT FOUND THEN RAISE EXCEPTION '找不到此學生'; END IF;

  PERFORM public.fn_audit('set_volunteer_worker', 'volunteer_profiles', p_volunteer_id,
    jsonb_build_object('worker_id', p_worker_id));
END $$;

REVOKE EXECUTE ON FUNCTION public.rpc_set_volunteer_worker(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_set_volunteer_worker(uuid, uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
