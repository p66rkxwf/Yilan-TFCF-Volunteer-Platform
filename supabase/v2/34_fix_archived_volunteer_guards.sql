-- =========================================================
-- 志工管理平台 34_fix_archived_volunteer_guards.sql（正確性修補 H3）
-- 問題：23 的封存（rpc_archive_record）只寫 deleted_at，不動 status，
--   於是「已封存」的志工其 status 仍為 'active'。而報名／指派的資格檢查
--   一律只看 status = 'active' AND is_blacklisted = false，完全沒有看
--   deleted_at（全庫僅有一個 deleted_at 索引，無任何 guard），造成：
--     - rpc_assign_volunteer：已封存的志工仍可被職員指派進場次。
--     - rpc_register_for_session：已封存帳號若仍持有有效 session，
--       仍可自行報名（縱深防禦，非主要路徑）。
--   後果是已封存者重新進入名單、佔用名額、收到通知並計入時數統計。
-- 修補：兩支函式的志工資格檢查一律加上 deleted_at IS NULL。
--
-- 前置：01 → 04 → 23。本檔以 CREATE OR REPLACE 覆蓋 04 的兩支函式；
--   兩者自 04 以來未被其他檔覆蓋過（已確認），故以 04 為來源版本。
-- 冪等：CREATE OR REPLACE 可重複執行；簽章未變，保留既有 GRANT。
-- =========================================================

-- ---------------------------------------------------------
-- (1) 志工自行報名：資格檢查加上「未封存」
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
   WHERE id = v_uid AND status = 'active' AND is_blacklisted = false
     AND deleted_at IS NULL;               -- H3：封存者 status 仍為 active，須另擋
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
-- (2) 管理員直接指派：資格檢查加上「未封存」
--     本體同 32 的版本（payload 已帶 activity_title），僅補 deleted_at。
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_assign_volunteer(
  p_session_id uuid, p_volunteer_id uuid
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_session public.activity_sessions%ROWTYPE;
  v_activity_status activity_status;
  v_title text;
  v_taken integer;
  v_reg_id uuid;
BEGIN
  IF NOT public.fn_is_staff() THEN RAISE EXCEPTION '需職員權限'; END IF;

  PERFORM 1 FROM public.volunteer_profiles
   WHERE id = p_volunteer_id AND status = 'active' AND is_blacklisted = false
     AND deleted_at IS NULL;               -- H3：封存者 status 仍為 active，須另擋
  IF NOT FOUND THEN
    RAISE EXCEPTION '該學生目前狀態無法被指派（已封存、停權或黑名單期間）';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_volunteer_id::text, 0));

  SELECT * INTO v_session FROM public.activity_sessions
   WHERE id = p_session_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION '場次不存在'; END IF;
  IF v_session.cancelled_at IS NOT NULL THEN RAISE EXCEPTION '此場次已取消'; END IF;
  IF v_session.end_at <= now() THEN RAISE EXCEPTION '此場次已結束'; END IF;

  SELECT status, title INTO v_activity_status, v_title FROM public.activities
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
  IF FOUND THEN RAISE EXCEPTION '時間衝突：該學生已有重疊時段的報名'; END IF;

  INSERT INTO public.registrations (activity_session_id, volunteer_id, status, reviewed_by, reviewed_at)
  VALUES (p_session_id, p_volunteer_id, 'approved', auth.uid(), now())
  RETURNING id INTO v_reg_id;

  PERFORM public.fn_audit('assign_volunteer', 'registrations', v_reg_id,
    jsonb_build_object('session_id', p_session_id));
  PERFORM public.fn_notify(p_volunteer_id, 'registration_review_result',
    jsonb_build_object('registration_id', v_reg_id, 'approved', true, 'assigned', true,
                       'activity_id', v_session.activity_id,
                       'session_id', p_session_id,
                       'activity_title', v_title,
                       'start_at', v_session.start_at, 'end_at', v_session.end_at));

  RETURN v_reg_id;
END $$;

NOTIFY pgrst, 'reload schema';
