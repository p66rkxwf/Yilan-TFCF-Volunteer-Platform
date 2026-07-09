-- =========================================================
-- 志工管理平台 18_fix_cascade_cancel_attendance.sql（正確性修補 H1）
-- 問題：registrations 有 CHECK reg_attendance_requires_approved
--   （attendance IS NULL OR status = 'approved'）。凡是把「已有出席紀錄
--   （attendance 非 NULL）」的報名 UPDATE 成 status='cancelled' 都會違反
--   此 CHECK，令整個交易 rollback。
--   由於志工可在「場次開始前 N 分鐘」自行簽到（見 11_harden…），未開始或
--   進行中的場次都可能已存在 attendance='attended' 的列，於是：
--     - rpc_cancel_session：進行中場次只要有一人已簽到就整場取消失敗（颱風停辦）。
--     - rpc_cancel_activity：未開始場次若已有人提前簽到 → 整場活動取消失敗。
--     - fn_cascade_cancel_future_registrations：停權/畢業/黑名單/停用核准共用，
--       志工已提前簽到某未開始場次時，這些管理操作全部失敗。
--     - job_attendance_scan：自動黑名單觸發級聯取消時撞到 → 整批掃描 rollback。
-- 修補：三處取消迴圈一律只取 attendance IS NULL 的列。
--   已簽到＝已出席事實，保留 approved 與時數（符合「進行中/已結束保留出席紀錄」原則）。
-- 前置：01 → 02 → 04（本檔以 CREATE OR REPLACE 覆蓋 04 的三支函式）。
-- 冪等：CREATE OR REPLACE 可重複執行；保留既有 GRANT。
-- =========================================================

-- ---------------------------------------------------------
-- (1) 共用級聯取消：只取「尚未開始且無出席紀錄」的有效報名
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_cascade_cancel_future_registrations(
  p_volunteer_id uuid,
  p_reason cancel_reason,
  p_notify_type notification_type
) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  r record;
  v_count integer := 0;
BEGIN
  FOR r IN
    SELECT reg.id, a.title
    FROM public.registrations reg
    JOIN public.activity_sessions s ON s.id = reg.activity_session_id
    JOIN public.activities a ON a.id = s.activity_id
    WHERE reg.volunteer_id = p_volunteer_id
      AND reg.status IN ('pending', 'approved', 'cancel_pending')
      AND reg.attendance IS NULL        -- H1：已簽到者保留，避免撞 CHECK
      AND s.cancelled_at IS NULL
      AND s.start_at > now()            -- #23「尚未發生」＝場次未開始
    FOR UPDATE OF reg
  LOOP
    UPDATE public.registrations
    SET status = 'cancelled', cancel_reason = p_reason, cancelled_at = now()
    WHERE id = r.id;

    PERFORM public.fn_notify(p_volunteer_id, p_notify_type,
      jsonb_build_object('registration_id', r.id, 'activity_title', r.title,
                         'reason', p_reason));
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END $$;

-- ---------------------------------------------------------
-- (2) 整場活動取消：未開始場次的有效報名連動取消（跳過已簽到）
--     其餘邏輯與 04_rpc_functions.sql 完全相同。
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_cancel_activity(p_activity_id uuid)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  r record;
  v_count integer := 0;
BEGIN
  IF NOT public.fn_can_manage_activity(p_activity_id) THEN
    RAISE EXCEPTION '需建立者、主辦人或單位管理員以上權限';
  END IF;

  PERFORM 1 FROM public.activities
   WHERE id = p_activity_id AND status IN ('draft', 'open', 'closed')
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION '活動不存在或目前狀態不可取消'; END IF;

  UPDATE public.activities SET status = 'cancelled' WHERE id = p_activity_id;

  -- 先取消報名（此時仍能以 start_at 判定未開始場次），再標記場次
  FOR r IN
    SELECT reg.id, reg.volunteer_id
    FROM public.registrations reg
    JOIN public.activity_sessions s ON s.id = reg.activity_session_id
    WHERE s.activity_id = p_activity_id
      AND s.start_at > now()
      AND reg.status IN ('pending', 'approved', 'cancel_pending')
      AND reg.attendance IS NULL        -- H1：已提前簽到者保留出席與時數
    FOR UPDATE OF reg
  LOOP
    UPDATE public.registrations
    SET status = 'cancelled', cancel_reason = 'activity_cancelled', cancelled_at = now()
    WHERE id = r.id;
    PERFORM public.fn_notify(r.volunteer_id, 'activity_cancelled',
      jsonb_build_object('registration_id', r.id, 'activity_id', p_activity_id));
    v_count := v_count + 1;
  END LOOP;

  UPDATE public.activity_sessions
  SET cancelled_at = now()
  WHERE activity_id = p_activity_id AND cancelled_at IS NULL AND start_at > now();

  PERFORM public.fn_audit('cancel_activity', 'activities', p_activity_id,
    jsonb_build_object('cascade_cancelled', v_count));
  RETURN v_count;
END $$;

-- ---------------------------------------------------------
-- (3) 單場次取消：該場有效報名連動取消（跳過已簽到）
--     進行中場次（end_at > now()）可能已有人簽到，故必須排除，
--     否則整場取消交易會 rollback。其餘邏輯與 04 完全相同。
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_cancel_session(p_session_id uuid)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_session record;
  r record;
  v_count integer := 0;
BEGIN
  SELECT * INTO v_session FROM public.activity_sessions
   WHERE id = p_session_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION '場次不存在'; END IF;
  IF NOT public.fn_can_manage_activity(v_session.activity_id) THEN
    RAISE EXCEPTION '需建立者、主辦人或單位管理員以上權限';
  END IF;
  IF v_session.cancelled_at IS NOT NULL THEN RAISE EXCEPTION '此場次已取消'; END IF;
  IF v_session.end_at <= now() THEN RAISE EXCEPTION '已結束的場次不可取消（歷史紀錄）'; END IF;

  FOR r IN
    SELECT id, volunteer_id FROM public.registrations
    WHERE activity_session_id = p_session_id
      AND status IN ('pending', 'approved', 'cancel_pending')
      AND attendance IS NULL            -- H1：已簽到者保留出席與時數
    FOR UPDATE
  LOOP
    UPDATE public.registrations
    SET status = 'cancelled', cancel_reason = 'session_cancelled', cancelled_at = now()
    WHERE id = r.id;
    PERFORM public.fn_notify(r.volunteer_id, 'session_cancelled',
      jsonb_build_object('registration_id', r.id, 'session_id', p_session_id));
    v_count := v_count + 1;
  END LOOP;

  UPDATE public.activity_sessions SET cancelled_at = now() WHERE id = p_session_id;

  PERFORM public.fn_audit('cancel_session', 'activity_sessions', p_session_id,
    jsonb_build_object('cascade_cancelled', v_count));
  RETURN v_count;
END $$;

NOTIFY pgrst, 'reload schema';
