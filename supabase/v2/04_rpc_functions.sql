-- =========================================================
-- 志工管理平台 04_rpc_functions.sql（定案版）
-- 內容：所有交易性寫入路徑（SECURITY DEFINER RPC）
-- 前置：01 → 02 → 03
--
-- 設計原則：
-- - registrations / blacklist_events / 志工狀態變更 無直寫 policy，
--   前端一律呼叫本檔 RPC（supabase.rpc(...)），交易邊界明確
-- - 鎖序固定：先「志工 advisory lock」、後「場次列鎖」，避免死鎖
-- - 名額採鎖內即時計數（規模 ≤1000，正確性優先，無漂移欄位）
-- - 通知一律寫 outbox（fn_notify），不在交易內發信
-- =========================================================

-- ---------------------------------------------------------
-- 0. 共用：級聯取消志工名下「場次尚未開始」的有效報名
--    （黑名單 #22/#23、停權/畢業 #24a 共用；進行中場次不動）
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
      AND s.cancelled_at IS NULL
      AND s.start_at > now()          -- #23「尚未發生」＝場次未開始
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
-- 1. 志工報名（競態核心：advisory lock ＋ 場次列鎖 ＋ 鎖內計數）
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_register_for_session(p_session_id uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_session public.activity_sessions%ROWTYPE;
  v_activity_status activity_status;
  v_taken integer;
  v_reg_id uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION '未登入'; END IF;

  PERFORM 1 FROM public.volunteer_profiles
   WHERE id = v_uid AND status = 'active' AND is_blacklisted = false;
  IF NOT FOUND THEN
    RAISE EXCEPTION '目前帳號狀態無法報名（待審核、停權或黑名單期間）';
  END IF;

  -- 鎖 1：序列化同一志工的所有報名 → 保護時間衝突檢查
  PERFORM pg_advisory_xact_lock(hashtextextended(v_uid::text, 0));

  -- 鎖 2：序列化同一場次的名額判斷
  SELECT * INTO v_session FROM public.activity_sessions
   WHERE id = p_session_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION '場次不存在'; END IF;
  IF v_session.cancelled_at IS NOT NULL THEN RAISE EXCEPTION '此場次已取消'; END IF;
  IF now() > v_session.registration_deadline_at THEN RAISE EXCEPTION '已超過報名截止時間'; END IF;

  SELECT status INTO v_activity_status FROM public.activities
   WHERE id = v_session.activity_id;
  IF v_activity_status <> 'open' THEN RAISE EXCEPTION '活動未開放報名'; END IF;

  -- 名額：待審核即佔額（pending/approved/cancel_pending 皆計）
  SELECT count(*) INTO v_taken FROM public.registrations
   WHERE activity_session_id = p_session_id
     AND status IN ('pending', 'approved', 'cancel_pending');
  IF v_taken >= v_session.capacity THEN RAISE EXCEPTION '此場次名額已滿'; END IF;

  -- 時間衝突：與名下其他有效報名之場次比對（含同活動其他場次）
  PERFORM 1
  FROM public.registrations r
  JOIN public.activity_sessions s2 ON s2.id = r.activity_session_id
  WHERE r.volunteer_id = v_uid
    AND r.status IN ('pending', 'approved', 'cancel_pending')
    AND s2.cancelled_at IS NULL
    AND tstzrange(s2.start_at, s2.end_at) && tstzrange(v_session.start_at, v_session.end_at);
  IF FOUND THEN RAISE EXCEPTION '時間衝突：您已報名重疊時段的其他場次'; END IF;

  INSERT INTO public.registrations (activity_session_id, volunteer_id, status)
  VALUES (p_session_id, v_uid, 'pending')
  RETURNING id INTO v_reg_id;

  RETURN v_reg_id;
END $$;

-- ---------------------------------------------------------
-- 2. 志工申請取消
--    pending → 直接取消（尚未核准，無審核必要）
--    approved → 依 cancel_review_window_days 判定：
--      免審門檻外 → 立即取消並釋出名額；門檻內（或 N=0）→ cancel_pending
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_request_cancel(p_registration_id uuid)
RETURNS registration_status
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_reg record;
  v_need_review boolean;
BEGIN
  SELECT r.*, s.start_at, a.cancel_review_window_days
    INTO v_reg
  FROM public.registrations r
  JOIN public.activity_sessions s ON s.id = r.activity_session_id
  JOIN public.activities a ON a.id = s.activity_id
  WHERE r.id = p_registration_id AND r.volunteer_id = v_uid
  FOR UPDATE OF r;

  IF NOT FOUND THEN RAISE EXCEPTION '找不到您的這筆報名'; END IF;

  IF v_reg.status = 'pending' THEN
    UPDATE public.registrations
    SET status = 'cancelled', cancel_reason = 'volunteer_self',
        cancel_requested_at = now(), cancelled_at = now()
    WHERE id = p_registration_id;
    RETURN 'cancelled';
  END IF;

  IF v_reg.status <> 'approved' THEN
    RAISE EXCEPTION '此報名目前狀態（%）無法申請取消', v_reg.status;
  END IF;

  -- N=0：任何時候取消都需審核；否則場次開始前 N 天內需審核
  v_need_review := (v_reg.cancel_review_window_days = 0)
    OR (now() >= v_reg.start_at - make_interval(days => v_reg.cancel_review_window_days));

  IF v_need_review THEN
    UPDATE public.registrations
    SET status = 'cancel_pending', cancel_requested_at = now()
    WHERE id = p_registration_id;
    RETURN 'cancel_pending';
  ELSE
    UPDATE public.registrations
    SET status = 'cancelled', cancel_reason = 'volunteer_self',
        cancel_requested_at = now(), cancelled_at = now()
    WHERE id = p_registration_id;   -- 名額為計數式，立即自然釋出
    RETURN 'cancelled';
  END IF;
END $$;

-- ---------------------------------------------------------
-- 3. 報名審核（拒絕 → 名額計數自然釋出）
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_review_registration(
  p_registration_id uuid, p_approve boolean
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_reg record;
BEGIN
  IF NOT public.fn_is_staff() THEN RAISE EXCEPTION '需職員權限'; END IF;

  SELECT * INTO v_reg FROM public.registrations
   WHERE id = p_registration_id FOR UPDATE;
  IF NOT FOUND OR v_reg.status <> 'pending' THEN
    RAISE EXCEPTION '此報名不存在或非待審核狀態';
  END IF;

  UPDATE public.registrations
  SET status = CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END::registration_status,
      reviewed_by = auth.uid(), reviewed_at = now()
  WHERE id = p_registration_id;

  PERFORM public.fn_audit(
    CASE WHEN p_approve THEN 'approve_registration' ELSE 'reject_registration' END,
    'registrations', p_registration_id, NULL);

  PERFORM public.fn_notify(v_reg.volunteer_id, 'registration_review_result',
    jsonb_build_object('registration_id', p_registration_id, 'approved', p_approve));
END $$;

-- ---------------------------------------------------------
-- 4. 取消申請審核（核准 → 取消並釋出名額；駁回 → 回到 approved）
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_review_cancel(
  p_registration_id uuid, p_approve boolean
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_reg record;
BEGIN
  IF NOT public.fn_is_staff() THEN RAISE EXCEPTION '需職員權限'; END IF;

  SELECT * INTO v_reg FROM public.registrations
   WHERE id = p_registration_id FOR UPDATE;
  IF NOT FOUND OR v_reg.status <> 'cancel_pending' THEN
    RAISE EXCEPTION '此報名不存在或非取消待審狀態';
  END IF;

  IF p_approve THEN
    UPDATE public.registrations
    SET status = 'cancelled', cancel_reason = 'volunteer_self',
        cancelled_at = now(),
        cancel_reviewed_by = auth.uid(), cancel_reviewed_at = now()
    WHERE id = p_registration_id;
  ELSE
    UPDATE public.registrations
    SET status = 'approved',
        cancel_reviewed_by = auth.uid(), cancel_reviewed_at = now()
    WHERE id = p_registration_id;   -- cancel_requested_at 保留作紀錄
  END IF;

  PERFORM public.fn_audit(
    CASE WHEN p_approve THEN 'approve_cancel' ELSE 'reject_cancel' END,
    'registrations', p_registration_id, NULL);

  PERFORM public.fn_notify(v_reg.volunteer_id, 'cancel_review_result',
    jsonb_build_object('registration_id', p_registration_id, 'approved', p_approve));
END $$;

-- ---------------------------------------------------------
-- 5. 志工自行簽到（#27：開始前 X 分鐘 ～ 結束時刻；X 為系統參數）
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_self_check_in(p_registration_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_reg record;
  v_open_min integer;
BEGIN
  SELECT self_checkin_open_minutes_before INTO v_open_min FROM public.system_settings;

  SELECT r.*, s.start_at, s.end_at, s.cancelled_at AS session_cancelled_at
    INTO v_reg
  FROM public.registrations r
  JOIN public.activity_sessions s ON s.id = r.activity_session_id
  WHERE r.id = p_registration_id AND r.volunteer_id = v_uid
  FOR UPDATE OF r;

  IF NOT FOUND THEN RAISE EXCEPTION '找不到您的這筆報名'; END IF;
  IF v_reg.status <> 'approved' THEN RAISE EXCEPTION '僅核准的報名可簽到'; END IF;
  IF v_reg.session_cancelled_at IS NOT NULL THEN RAISE EXCEPTION '此場次已取消'; END IF;
  IF v_reg.attendance IS NOT NULL THEN RAISE EXCEPTION '出席狀態已登記'; END IF;
  IF now() < v_reg.start_at - make_interval(mins => v_open_min)
     OR now() > v_reg.end_at THEN
    RAISE EXCEPTION '不在簽到時間內（場次開始前 % 分鐘至結束）', v_open_min;
  END IF;

  UPDATE public.registrations
  SET attendance = 'attended', checked_in_at = now()   -- attendance_recorded_by 留 NULL＝本人
  WHERE id = p_registration_id;                        -- service_hours 由 trigger 帶入
END $$;

-- ---------------------------------------------------------
-- 6. 管理員代登 / 標記缺席（寬限期內可修正；寬限期後改判走 RPC 7）
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_admin_check_in(
  p_registration_id uuid, p_attendance attendance_status
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_reg record;
  v_grace integer;
BEGIN
  IF NOT public.fn_is_staff() THEN RAISE EXCEPTION '需職員權限'; END IF;
  IF p_attendance NOT IN ('attended', 'absent') THEN
    RAISE EXCEPTION '本操作僅接受 attended / absent；補登請用 rpc_makeup_attendance';
  END IF;

  SELECT makeup_attendance_grace_days INTO v_grace FROM public.system_settings;

  SELECT r.*, s.end_at INTO v_reg
  FROM public.registrations r
  JOIN public.activity_sessions s ON s.id = r.activity_session_id
  WHERE r.id = p_registration_id
  FOR UPDATE OF r;

  IF NOT FOUND THEN RAISE EXCEPTION '報名不存在'; END IF;
  IF v_reg.status <> 'approved' THEN RAISE EXCEPTION '僅核准的報名可登記出席'; END IF;
  IF now() > v_reg.end_at + make_interval(days => v_grace) THEN
    RAISE EXCEPTION '已超過補登寬限期；缺席改判請用 rpc_makeup_attendance';
  END IF;

  UPDATE public.registrations
  SET attendance = p_attendance,
      checked_in_at = CASE WHEN p_attendance = 'attended' THEN now() ELSE NULL END,
      attendance_recorded_by = auth.uid(),
      service_hours = NULL                       -- 交由 trigger 依新狀態重算/清空
  WHERE id = p_registration_id;

  PERFORM public.fn_audit(
    CASE WHEN p_attendance = 'attended' THEN 'manual_checkin' ELSE 'mark_absent' END,
    'registrations', p_registration_id, NULL);
END $$;

-- ---------------------------------------------------------
-- 7. #25 補登出席（含缺席改判）：無時間上限
--    absent → makeup_attended 時，02 trigger 自動解除對應黑名單＋回補時數
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_makeup_attendance(p_registration_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_reg record;
BEGIN
  IF NOT public.fn_is_staff() THEN RAISE EXCEPTION '需職員權限'; END IF;

  SELECT * INTO v_reg FROM public.registrations
   WHERE id = p_registration_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION '報名不存在'; END IF;
  IF v_reg.status <> 'approved' THEN RAISE EXCEPTION '僅核准的報名可補登'; END IF;
  IF v_reg.attendance = 'attended' OR v_reg.attendance = 'makeup_attended' THEN
    RAISE EXCEPTION '此報名已有出席紀錄';
  END IF;

  UPDATE public.registrations
  SET attendance = 'makeup_attended',
      checked_in_at = COALESCE(checked_in_at, now()),
      attendance_recorded_by = auth.uid(),
      service_hours = NULL                       -- trigger 重算
  WHERE id = p_registration_id;

  PERFORM public.fn_audit('makeup_attendance', 'registrations', p_registration_id, NULL);
END $$;

-- ---------------------------------------------------------
-- 8. #29 管理員直接指派志工：走與報名相同的檢查（黑名單/名額/衝突照擋）
--    差異：跳過 pending 直接 approved；不受截止時間限制；closed 活動仍可補人
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_assign_volunteer(
  p_session_id uuid, p_volunteer_id uuid
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_session public.activity_sessions%ROWTYPE;
  v_activity_status activity_status;
  v_taken integer;
  v_reg_id uuid;
BEGIN
  IF NOT public.fn_is_staff() THEN RAISE EXCEPTION '需職員權限'; END IF;

  PERFORM 1 FROM public.volunteer_profiles
   WHERE id = p_volunteer_id AND status = 'active' AND is_blacklisted = false;
  IF NOT FOUND THEN RAISE EXCEPTION '該志工目前狀態無法被指派（含黑名單期間）'; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_volunteer_id::text, 0));

  SELECT * INTO v_session FROM public.activity_sessions
   WHERE id = p_session_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION '場次不存在'; END IF;
  IF v_session.cancelled_at IS NOT NULL THEN RAISE EXCEPTION '此場次已取消'; END IF;
  IF v_session.end_at <= now() THEN RAISE EXCEPTION '此場次已結束'; END IF;

  SELECT status INTO v_activity_status FROM public.activities
   WHERE id = v_session.activity_id;
  IF v_activity_status NOT IN ('open', 'closed') THEN
    RAISE EXCEPTION '活動目前狀態（%）不可指派', v_activity_status;
  END IF;

  SELECT count(*) INTO v_taken FROM public.registrations
   WHERE activity_session_id = p_session_id
     AND status IN ('pending', 'approved', 'cancel_pending');
  IF v_taken >= v_session.capacity THEN RAISE EXCEPTION '此場次名額已滿'; END IF;

  PERFORM 1
  FROM public.registrations r
  JOIN public.activity_sessions s2 ON s2.id = r.activity_session_id
  WHERE r.volunteer_id = p_volunteer_id
    AND r.status IN ('pending', 'approved', 'cancel_pending')
    AND s2.cancelled_at IS NULL
    AND tstzrange(s2.start_at, s2.end_at) && tstzrange(v_session.start_at, v_session.end_at);
  IF FOUND THEN RAISE EXCEPTION '時間衝突：該志工已有重疊時段的報名'; END IF;

  INSERT INTO public.registrations (activity_session_id, volunteer_id, status, reviewed_by, reviewed_at)
  VALUES (p_session_id, p_volunteer_id, 'approved', auth.uid(), now())
  RETURNING id INTO v_reg_id;

  PERFORM public.fn_audit('assign_volunteer', 'registrations', v_reg_id,
    jsonb_build_object('session_id', p_session_id));
  PERFORM public.fn_notify(p_volunteer_id, 'registration_review_result',
    jsonb_build_object('registration_id', v_reg_id, 'approved', true, 'assigned', true));

  RETURN v_reg_id;
END $$;

-- ---------------------------------------------------------
-- 9. 志工帳號審核（pending_review → active / rejected）
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
      assigned_worker_id = CASE WHEN p_approve THEN p_assigned_worker_id ELSE assigned_worker_id END
  WHERE id = p_volunteer_id;   -- 社工資格由 02 trigger 驗證

  PERFORM public.fn_audit(
    CASE WHEN p_approve THEN 'approve_volunteer_account' ELSE 'reject_volunteer_account' END,
    'volunteer_profiles', p_volunteer_id, NULL);
  PERFORM public.fn_notify(p_volunteer_id, 'account_review_result',
    jsonb_build_object('approved', p_approve));
END $$;

-- ---------------------------------------------------------
-- 10. #24a 志工狀態變更（停權/復職/畢業）
--     停權或畢業 → 級聯取消未來報名＋通知
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_update_volunteer_status(
  p_volunteer_id uuid, p_status volunteer_status
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_cancelled integer;
BEGIN
  IF NOT public.fn_is_admin() THEN RAISE EXCEPTION '需單位管理員以上權限'; END IF;
  IF p_status NOT IN ('active', 'suspended', 'graduated') THEN
    RAISE EXCEPTION '本操作僅接受 active / suspended / graduated';
  END IF;

  PERFORM 1 FROM public.volunteer_profiles
   WHERE id = p_volunteer_id AND status IN ('active', 'suspended', 'graduated')
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION '該志工不存在或尚未通過帳號審核'; END IF;

  PERFORM set_config('app.bypass_profile_guard', 'on', true);
  UPDATE public.volunteer_profiles
  SET status = p_status,
      last_grade_reviewed_at = CASE WHEN p_status = 'graduated'
                                    THEN now() ELSE last_grade_reviewed_at END
  WHERE id = p_volunteer_id;

  IF p_status IN ('suspended', 'graduated') THEN
    v_cancelled := public.fn_cascade_cancel_future_registrations(
      p_volunteer_id, 'admin_removed', 'registration_cancelled_by_admin');
  END IF;

  PERFORM public.fn_audit('update_volunteer_status', 'volunteer_profiles', p_volunteer_id,
    jsonb_build_object('new_status', p_status, 'cascade_cancelled', COALESCE(v_cancelled, 0)));
END $$;

-- ---------------------------------------------------------
-- 11. 手動列入黑名單（申訴/特殊情況）＋ 級聯取消
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_manual_blacklist(
  p_volunteer_id uuid, p_days integer DEFAULT NULL, p_note text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_days integer;
  v_event_id uuid;
  v_release timestamptz;
BEGIN
  IF NOT public.fn_is_admin() THEN RAISE EXCEPTION '需單位管理員以上權限'; END IF;

  SELECT COALESCE(p_days, blacklist_auto_release_days) INTO v_days
  FROM public.system_settings;
  IF v_days <= 0 THEN RAISE EXCEPTION '天數需大於 0'; END IF;

  v_release := now() + make_interval(days => v_days);

  INSERT INTO public.blacklist_events
    (volunteer_id, expected_release_at, is_manual, note)
  VALUES (p_volunteer_id, v_release, true, p_note)
  RETURNING id INTO v_event_id;   -- sync trigger 更新 is_blacklisted

  PERFORM public.fn_cascade_cancel_future_registrations(
    p_volunteer_id, 'blacklist_cascade', 'blacklist_cascade_cancelled');

  PERFORM public.fn_audit('manual_blacklist', 'blacklist_events', v_event_id,
    jsonb_build_object('expected_release_at', v_release));
  PERFORM public.fn_notify(p_volunteer_id, 'blacklist_added',
    jsonb_build_object('expected_release_at', v_release, 'manual', true));

  RETURN v_event_id;
END $$;

-- ---------------------------------------------------------
-- 12. 調整黑名單（提前解除 / 延長）
--     p_new_release_at <= now() → 立即解除；否則改預計解除日
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_adjust_blacklist(
  p_event_id uuid, p_new_release_at timestamptz
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT public.fn_is_admin() THEN RAISE EXCEPTION '需單位管理員以上權限'; END IF;

  PERFORM 1 FROM public.blacklist_events
   WHERE id = p_event_id AND released_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION '事件不存在或已解除'; END IF;

  IF p_new_release_at <= now() THEN
    UPDATE public.blacklist_events
    SET released_at = now(), released_by = auth.uid()
    WHERE id = p_event_id;
  ELSE
    UPDATE public.blacklist_events
    SET expected_release_at = p_new_release_at
    WHERE id = p_event_id;
  END IF;

  PERFORM public.fn_audit('adjust_blacklist', 'blacklist_events', p_event_id,
    jsonb_build_object('new_release_at', p_new_release_at));
END $$;

-- ---------------------------------------------------------
-- 13. 整場活動取消：狀態→cancelled、未開始場次標記取消、
--     級聯取消其有效報名＋通知（進行中/已結束場次的出席紀錄保留）
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
-- 14. 單場次取消（颱風等）：僅該場報名連動取消
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

-- ---------------------------------------------------------
-- 15. 年度審查：更新階段或僅標記已審查（p_new_grade = NULL）
--     畢業/結案改走 rpc_update_volunteer_status(id, 'graduated')
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_update_volunteer_grade(
  p_volunteer_id uuid, p_new_grade grade_level DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT public.fn_is_admin() THEN RAISE EXCEPTION '需單位管理員以上權限'; END IF;

  PERFORM set_config('app.bypass_profile_guard', 'on', true);
  UPDATE public.volunteer_profiles
  SET grade = COALESCE(p_new_grade, grade),
      last_grade_reviewed_at = now()
  WHERE id = p_volunteer_id AND status = 'active';
  IF NOT FOUND THEN RAISE EXCEPTION '該志工不存在或非在職狀態'; END IF;

  PERFORM public.fn_audit('annual_grade_review', 'volunteer_profiles', p_volunteer_id,
    jsonb_build_object('new_grade', p_new_grade));
END $$;

-- ---------------------------------------------------------
-- 16. 權限收斂：撤銷預設 EXECUTE，逐一授權
-- ---------------------------------------------------------
-- 內部函式：不開放前端直接呼叫
REVOKE EXECUTE ON FUNCTION
  public.fn_audit(text, text, uuid, jsonb),
  public.fn_notify(uuid, notification_type, jsonb, text),
  public.fn_cascade_cancel_future_registrations(uuid, cancel_reason, notification_type)
FROM PUBLIC, anon, authenticated;

-- 對外 RPC：撤 anon、授 authenticated（各函式內部再做角色檢查）
DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'rpc_register_for_session(uuid)',
    'rpc_request_cancel(uuid)',
    'rpc_review_registration(uuid, boolean)',
    'rpc_review_cancel(uuid, boolean)',
    'rpc_self_check_in(uuid)',
    'rpc_admin_check_in(uuid, attendance_status)',
    'rpc_makeup_attendance(uuid)',
    'rpc_assign_volunteer(uuid, uuid)',
    'rpc_review_volunteer_account(uuid, boolean, uuid)',
    'rpc_update_volunteer_status(uuid, volunteer_status)',
    'rpc_manual_blacklist(uuid, integer, text)',
    'rpc_adjust_blacklist(uuid, timestamptz)',
    'rpc_cancel_activity(uuid)',
    'rpc_cancel_session(uuid)',
    'rpc_update_volunteer_grade(uuid, grade_level)'
  ] LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO authenticated', f);
  END LOOP;
END $$;
