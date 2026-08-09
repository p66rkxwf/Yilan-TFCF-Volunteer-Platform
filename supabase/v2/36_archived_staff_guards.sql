-- =========================================================
-- 志工管理平台 36_archived_staff_guards.sql（正確性修補 H4）
-- 問題：與 34 完全同一類的漏洞，只是這次在「職員」這一側。
--   23 的封存（rpc_archive_record）只寫 deleted_at，不動 status，於是
--   「已封存」的職員其 status 仍為 'active'。而負責社工的資格檢查一律只看
--   status = 'active' AND job_title = 'social_worker'，完全沒有看 deleted_at，
--   造成已封存（且已被 admin client ban、根本登不進來）的社工仍可被指派：
--     - fn_check_assigned_worker（02）：帳號審核指派、任何 assigned_worker_id
--       的寫入都放行。
--     - rpc_reassign_worker / rpc_set_volunteer_worker（17）：批量移轉與單筆改派
--       的目標社工預檢同樣放行。
--   後果是學生被指派給一個永遠不會登入的社工，該生的所有社工通知
--   （停用申請、自訂服務送審…）等同丟進黑洞，且移轉時無從察覺。
-- 修補：三處資格檢查一律加上 deleted_at IS NULL。
--
-- 註：活動負責人（activity_organizers）沒有對應的 DB 約束（自始即為自由關聯表），
--   且前台 v_organizer_contacts（23 節 5.4）本來就已濾掉 deleted_at；該側只需
--   前端候選清單一併過濾，故本檔不動。
--
-- 前置：01 → 02 → 17 → 23。本檔以 CREATE OR REPLACE 覆蓋 02 的 trigger 函式與
--   17 的兩支 RPC；三者自各自來源檔以來未被其他檔覆蓋過（已確認）。
-- 冪等：CREATE OR REPLACE 可重複執行；簽章未變，保留既有 GRANT 與 trigger 綁定。
-- =========================================================

-- ---------------------------------------------------------
-- (1) 負責社工 trigger：資格檢查加上「未封存」
--     本體同 02_triggers.sql 的版本，僅補一個條件與錯誤訊息。
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_check_assigned_worker()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.assigned_worker_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.staff_profiles
    WHERE id = NEW.assigned_worker_id
      AND job_title = 'social_worker'
      AND status = 'active'
      AND deleted_at IS NULL   -- H4：封存者 status 仍為 active，須另擋
  ) THEN
    RAISE EXCEPTION '負責社工必須為在職、未封存且職稱為 social_worker 的職員';
  END IF;
  RETURN NEW;
END $$;

-- ---------------------------------------------------------
-- (2) 批量移轉：目標社工預檢加上「未封存」
--     本體同 17_reassign_worker.sql 的版本。
-- ---------------------------------------------------------
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

  -- 目標須為在職且未封存的社工（fn_check_assigned_worker trigger 亦會逐列驗證）。
  -- 來源不限（輪換情境常是已停權/離職/已封存社工，故不檢查來源資格）。
  IF NOT EXISTS (
    SELECT 1 FROM public.staff_profiles
    WHERE id = p_to_worker_id AND job_title = 'social_worker'
      AND status = 'active' AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION '目標社工必須為在職、未封存且職稱為社工的職員';
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

-- ---------------------------------------------------------
-- (3) 單一學生改派：目標社工預檢加上「未封存」
--     本體同 17_reassign_worker.sql 的版本。
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_set_volunteer_worker(
  p_volunteer_id uuid, p_worker_id uuid
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT public.fn_is_admin() THEN RAISE EXCEPTION '需單位管理員以上權限'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.staff_profiles
    WHERE id = p_worker_id AND job_title = 'social_worker'
      AND status = 'active' AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION '負責社工必須為在職、未封存且職稱為社工的職員';
  END IF;

  PERFORM set_config('app.bypass_profile_guard', 'on', true);
  UPDATE public.volunteer_profiles
  SET assigned_worker_id = p_worker_id
  WHERE id = p_volunteer_id;
  IF NOT FOUND THEN RAISE EXCEPTION '找不到此學生'; END IF;

  PERFORM public.fn_audit('set_volunteer_worker', 'volunteer_profiles', p_volunteer_id,
    jsonb_build_object('worker_id', p_worker_id));
END $$;

NOTIFY pgrst, 'reload schema';
