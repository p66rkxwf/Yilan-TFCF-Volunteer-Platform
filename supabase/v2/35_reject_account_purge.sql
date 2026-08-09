-- =========================================================
-- 志工管理平台 35_reject_account_purge.sql（審核未通過帳號的清除）
-- 需求（2026-08）：初始帳號審核「未通過」的學生不該留在學生名冊，應該刪除。
--
-- 為何不是「按下拒絕就直接刪」：
--   「未通過」通知走 notification_outbox，而該表的 recipient_user_id 外鍵
--   指向 auth.users。若在拒絕的當下就把帳號刪掉，那封信會連帶消失，對方
--   永遠不會知道自己沒通過。且「拒絕」的權限是單位管理員（fn_is_admin），
--   「永久刪除」原本限系統管理員（fn_is_system_admin），直接改會擴權。
--
-- 因此拆成兩段：
--   (1) 拒絕當下：status='rejected' ＋ 標記封存（deleted_at）。名冊預設只列
--       deleted_at IS NULL，所以立刻從名冊消失；通知照常入列寄出；誤拒可用
--       既有的 rpc_restore_record 還原。
--   (2) 保留期後：job_purge_rejected_accounts 永久刪除，連個資一併清掉。
--       保留天數沿用既有的 system_settings.purge_archived_retention_days。
--       且必須「該帳號的審核結果通知已離開 pending」才刪，確保信先寄出去。
--
-- 註：23 的 job_purge_expired 明文不硬刪帳號（FK/歷史保護），本檔為「審核
--   未通過」這個特例另開一支排程，不動既有那條原則——一般學生帳號仍只封存。
-- 註：auth.users 由 worker 以 service role 另刪（比照 26 的既有分工），
--   本函式回傳已清除的 id 供 worker 接續刪除 Auth 帳號。
--
-- 僅適用於今後新拒絕的帳號；既有的 rejected 資料維持現狀（未回填 deleted_at）。
-- 前置：01 → 04 → 23 → 26。
-- 冪等：CREATE OR REPLACE 可重複執行。
-- =========================================================

-- ---------------------------------------------------------
-- 1. 帳號審核：未通過時一併標記封存，使其立刻退出學生名冊
--    本體同 04_rpc_functions.sql 的版本，僅在 UPDATE 補 deleted_at。
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_review_volunteer_account(
  p_volunteer_id uuid, p_approve boolean, p_assigned_worker_id uuid DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT public.fn_is_admin() THEN RAISE EXCEPTION '需單位管理員以上權限'; END IF;

  PERFORM 1 FROM public.volunteer_profiles
   WHERE id = p_volunteer_id AND status = 'pending_review' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION '該志工不存在或非待審核狀態'; END IF;

  IF p_approve AND p_assigned_worker_id IS NULL THEN
    RAISE EXCEPTION '審核通過需同時指定負責社工';
  END IF;

  PERFORM set_config('app.bypass_profile_guard', 'on', true);
  UPDATE public.volunteer_profiles
  SET status = CASE WHEN p_approve THEN 'active' ELSE 'rejected' END::volunteer_status,
      assigned_worker_id = CASE WHEN p_approve THEN p_assigned_worker_id ELSE assigned_worker_id END,
      -- 未通過＝立刻封存退出名冊；保留期後由 job_purge_rejected_accounts 永久刪除
      deleted_at = CASE WHEN p_approve THEN deleted_at ELSE now() END,
      deleted_by = CASE WHEN p_approve THEN deleted_by ELSE auth.uid() END
  WHERE id = p_volunteer_id;   -- 社工資格由 02 trigger 驗證

  PERFORM public.fn_audit(
    CASE WHEN p_approve THEN 'approve_volunteer_account' ELSE 'reject_volunteer_account' END,
    'volunteer_profiles', p_volunteer_id, NULL);
  -- 帳號此時仍存在，通知得以正常入列並寄出（刪除要等保留期後）
  PERFORM public.fn_notify(p_volunteer_id, 'account_review_result',
    jsonb_build_object('approved', p_approve));
END $$;

-- ---------------------------------------------------------
-- 2. 排程：永久刪除逾保留期的「審核未通過」帳號
--    回傳已清除的 id 陣列，供 worker 接續刪除 auth.users。
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.job_purge_rejected_accounts()
RETURNS uuid[]
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_days integer;
  v_ids uuid[] := '{}';
  r record;
BEGIN
  SELECT purge_archived_retention_days INTO v_days FROM public.system_settings;

  PERFORM set_config('app.bypass_profile_guard', 'on', true);

  FOR r IN
    SELECT v.id, v.full_name
    FROM public.volunteer_profiles v
    WHERE v.status = 'rejected'
      AND v.deleted_at IS NOT NULL
      AND v.deleted_at < now() - make_interval(days => v_days)
      -- 審核結果通知必須已離開 pending（已寄出／已失敗／因設定跳過），
      -- 否則先刪帳號會讓那封信一起消失，對方永遠不知道自己沒過。
      AND NOT EXISTS (
        SELECT 1 FROM public.notification_outbox n
        WHERE n.recipient_user_id = v.id
          AND n.notification_type = 'account_review_result'
          AND n.status = 'pending'
      )
  LOOP
    -- 連鎖清理與 26 的 rpc_delete_record（volunteer_profiles 分支）一致
    DELETE FROM public.blacklist_events WHERE volunteer_id = r.id;  -- 先於報名（FK）
    DELETE FROM public.registrations WHERE volunteer_id = r.id;
    DELETE FROM public.favorites WHERE volunteer_id = r.id;
    DELETE FROM public.deactivation_requests WHERE volunteer_id = r.id;
    UPDATE public.support_requests SET created_by = NULL WHERE created_by = r.id;
    UPDATE public.audit_logs SET actor_id = NULL WHERE actor_id = r.id;
    DELETE FROM public.notification_outbox WHERE recipient_user_id = r.id;
    DELETE FROM public.volunteer_profiles WHERE id = r.id;  -- email 驗證表 CASCADE

    PERFORM public.fn_audit('purge_rejected_account', 'volunteer_profiles', r.id,
      jsonb_build_object('name', r.full_name));
    v_ids := array_append(v_ids, r.id);
  END LOOP;

  RETURN v_ids;
END $$;

-- ---------------------------------------------------------
-- 3. 權限：排程函式不開放前端呼叫（比照 05 的慣例）
-- ---------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.job_purge_rejected_accounts()
FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';
