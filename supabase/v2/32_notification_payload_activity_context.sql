-- =========================================================
-- 志工管理平台 32_notification_payload_activity_context.sql
-- 目的：讓通知信／站內通知能顯示「是哪一個活動、哪一個場次」。
--   原本 registration_review_result 等通知的 payload 只有內部 id，
--   收件者收到「您的活動報名審核已有結果」卻不知道是哪一場。
-- 作法：所有報名／場次相關的 fn_notify 呼叫，payload 一律補上
--   activity_title / start_at / end_at（另補 activity_id / session_id）。
--
-- 【只增不減】絕不刪除或改名既有 key：
--   - registration_submitted 的 'title' 保留（舊 outbox 列與歷史站內通知仍在讀）
--   - session_time_changed 的 'new_start_at'/'new_end_at' 保留，另加同值的 start_at/end_at
--   新 key 命名統一為 activity_title / start_at / end_at；不用 'title' 當標準，
--   因為 custom_service_* 的 'title' 是「服務紀錄」名稱而非活動名稱。
--
-- 【本檔以 CREATE OR REPLACE 覆蓋既有函式，各函式的來源版本】
--   fn_cascade_cancel_future_registrations ← 18（含 H1：attendance IS NULL）
--   rpc_cancel_activity                    ← 18（含 H1）
--   rpc_cancel_session                     ← 18（含 H1）
--   job_attendance_scan                    ← 19（含 H1＋H2：a.status <> 'cancelled'）
--   rpc_review_registration / rpc_review_cancel / rpc_assign_volunteer ← 04
--   job_send_review_reminders / job_send_activity_reminders            ← 05
--   fn_notify_new_registration                                         ← 27
--   fn_session_time_changed                                            ← 02
--   ※ 切勿改抄 04/05 的舊版 cascade/cancel/scan，會回退 H1、H2 修補。
--
-- 不重建 trigger（trigger 會自動指向新的函式本體），不重複 GRANT
-- （簽章未變，CREATE OR REPLACE 保留既有 ACL）。
-- 前置：01 → 02 → 04 → 05 → 18 → 19 → 27。
-- 冪等：全檔 CREATE OR REPLACE，可重複執行。
-- =========================================================

-- ---------------------------------------------------------
-- (1) 報名審核（來源 04）：payload 補活動名稱與場次時間
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_review_registration(
  p_registration_id uuid, p_approve boolean
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_reg record;
  v_activity_id uuid;
  v_title text;
  v_start_at timestamptz;
  v_end_at timestamptz;
BEGIN
  IF NOT public.fn_is_staff() THEN RAISE EXCEPTION '需職員權限'; END IF;

  SELECT * INTO v_reg FROM public.registrations
   WHERE id = p_registration_id FOR UPDATE;
  IF NOT FOUND OR v_reg.status <> 'pending' THEN
    RAISE EXCEPTION '此報名不存在或非待審核狀態';
  END IF;

  -- 另起一段查詢而非併入上面的 SELECT：避免把 FOR UPDATE 變成 FOR UPDATE OF r
  -- 而改動鎖定語意（只該鎖 registrations 這一列）。
  SELECT a.id, a.title, s.start_at, s.end_at
    INTO v_activity_id, v_title, v_start_at, v_end_at
  FROM public.activity_sessions s
  JOIN public.activities a ON a.id = s.activity_id
  WHERE s.id = v_reg.activity_session_id;

  UPDATE public.registrations
  SET status = CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END::registration_status,
      reviewed_by = auth.uid(), reviewed_at = now()
  WHERE id = p_registration_id;

  PERFORM public.fn_audit(
    CASE WHEN p_approve THEN 'approve_registration' ELSE 'reject_registration' END,
    'registrations', p_registration_id, NULL);

  PERFORM public.fn_notify(v_reg.volunteer_id, 'registration_review_result',
    jsonb_build_object('registration_id', p_registration_id, 'approved', p_approve,
                       'activity_id', v_activity_id,
                       'session_id', v_reg.activity_session_id,
                       'activity_title', v_title,
                       'start_at', v_start_at, 'end_at', v_end_at));
END $$;

-- ---------------------------------------------------------
-- (2) 取消申請審核（來源 04）
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_review_cancel(
  p_registration_id uuid, p_approve boolean
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_reg record;
  v_activity_id uuid;
  v_title text;
  v_start_at timestamptz;
  v_end_at timestamptz;
BEGIN
  IF NOT public.fn_is_staff() THEN RAISE EXCEPTION '需職員權限'; END IF;

  SELECT * INTO v_reg FROM public.registrations
   WHERE id = p_registration_id FOR UPDATE;
  IF NOT FOUND OR v_reg.status <> 'cancel_pending' THEN
    RAISE EXCEPTION '此報名不存在或非取消待審狀態';
  END IF;

  SELECT a.id, a.title, s.start_at, s.end_at
    INTO v_activity_id, v_title, v_start_at, v_end_at
  FROM public.activity_sessions s
  JOIN public.activities a ON a.id = s.activity_id
  WHERE s.id = v_reg.activity_session_id;

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
    jsonb_build_object('registration_id', p_registration_id, 'approved', p_approve,
                       'activity_id', v_activity_id,
                       'session_id', v_reg.activity_session_id,
                       'activity_title', v_title,
                       'start_at', v_start_at, 'end_at', v_end_at));
END $$;

-- ---------------------------------------------------------
-- (3) 管理員直接指派志工（來源 04）：v_session 已有時間，只缺標題
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
   WHERE id = p_volunteer_id AND status = 'active' AND is_blacklisted = false;
  IF NOT FOUND THEN RAISE EXCEPTION '該志工目前狀態無法被指派（含黑名單期間）'; END IF;

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
  IF FOUND THEN RAISE EXCEPTION '時間衝突：該志工已有重疊時段的報名'; END IF;

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

-- ---------------------------------------------------------
-- (4) 共用級聯取消（來源 18，保留 H1：attendance IS NULL）
--     一次涵蓋 blacklist_cascade_cancelled 與 registration_cancelled_by_admin
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
    SELECT reg.id, a.title, a.id AS activity_id,
           s.id AS session_id, s.start_at, s.end_at
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
                         'activity_id', r.activity_id, 'session_id', r.session_id,
                         'start_at', r.start_at, 'end_at', r.end_at,
                         'reason', p_reason));
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END $$;

-- ---------------------------------------------------------
-- (5) 整場活動取消（來源 18，保留 H1）
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_cancel_activity(p_activity_id uuid)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  r record;
  v_title text;
  v_count integer := 0;
BEGIN
  IF NOT public.fn_can_manage_activity(p_activity_id) THEN
    RAISE EXCEPTION '需建立者、主辦人或單位管理員以上權限';
  END IF;

  PERFORM 1 FROM public.activities
   WHERE id = p_activity_id AND status IN ('draft', 'open', 'closed')
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION '活動不存在或目前狀態不可取消'; END IF;

  SELECT title INTO v_title FROM public.activities WHERE id = p_activity_id;

  UPDATE public.activities SET status = 'cancelled' WHERE id = p_activity_id;

  -- 先取消報名（此時仍能以 start_at 判定未開始場次），再標記場次
  FOR r IN
    SELECT reg.id, reg.volunteer_id, reg.activity_session_id, s.start_at, s.end_at
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
      jsonb_build_object('registration_id', r.id, 'activity_id', p_activity_id,
                         'session_id', r.activity_session_id,
                         'activity_title', v_title,
                         'start_at', r.start_at, 'end_at', r.end_at));
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
-- (6) 單場次取消（來源 18，保留 H1）
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_cancel_session(p_session_id uuid)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_session record;
  v_title text;
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

  SELECT title INTO v_title FROM public.activities WHERE id = v_session.activity_id;

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
      jsonb_build_object('registration_id', r.id, 'session_id', p_session_id,
                         'activity_id', v_session.activity_id,
                         'activity_title', v_title,
                         'start_at', v_session.start_at, 'end_at', v_session.end_at));
    v_count := v_count + 1;
  END LOOP;

  UPDATE public.activity_sessions SET cancelled_at = now() WHERE id = p_session_id;

  PERFORM public.fn_audit('cancel_session', 'activity_sessions', p_session_id,
    jsonb_build_object('cascade_cancelled', v_count));
  RETURN v_count;
END $$;

-- ---------------------------------------------------------
-- (7) 自動出席掃描／黑名單（來源 19，保留 H1＋H2）
--     blacklist_added 補上「是哪一場缺席」
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.job_attendance_scan()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_grace integer;
  v_release_days integer;
  s record;
  r record;
  v_event_id uuid;
  v_release timestamptz;
BEGIN
  SELECT makeup_attendance_grace_days, blacklist_auto_release_days
    INTO v_grace, v_release_days
  FROM public.system_settings;

  FOR s IN
    SELECT sess.id, sess.activity_id, sess.start_at, sess.end_at, a.title
    FROM public.activity_sessions sess
    JOIN public.activities a ON a.id = sess.activity_id
    WHERE sess.cancelled_at IS NULL
      AND a.status <> 'cancelled'                         -- H2：已取消活動的殘留進行中場次不計缺席
      AND sess.end_at + make_interval(days => v_grace) < now()
      AND sess.end_at > now() - interval '90 days'        -- 掃描視窗上限；冪等靠條件與唯一索引
  LOOP
    -- B1：仍 pending 的報名 → expired（#21）
    UPDATE public.registrations
    SET status = 'expired'
    WHERE activity_session_id = s.id AND status = 'pending';

    -- B2：approved 且無出席紀錄 → absent ＋ 黑名單事件 ＋ 級聯取消 ＋ 通知
    FOR r IN
      SELECT id, volunteer_id FROM public.registrations
      WHERE activity_session_id = s.id AND status = 'approved' AND attendance IS NULL
      FOR UPDATE
    LOOP
      UPDATE public.registrations SET attendance = 'absent' WHERE id = r.id;

      v_release := now() + make_interval(days => v_release_days);
      v_event_id := NULL;

      INSERT INTO public.blacklist_events
        (volunteer_id, registration_id, expected_release_at)
      VALUES (r.volunteer_id, r.id, v_release)
      ON CONFLICT (registration_id) WHERE registration_id IS NOT NULL DO NOTHING
      RETURNING id INTO v_event_id;   -- 同一筆報名最多觸發一次

      IF v_event_id IS NOT NULL THEN
        PERFORM public.fn_notify(r.volunteer_id, 'blacklist_added',
          jsonb_build_object('registration_id', r.id,
                             'expected_release_at', v_release,
                             'activity_id', s.activity_id, 'session_id', s.id,
                             'activity_title', s.title,
                             'start_at', s.start_at, 'end_at', s.end_at));
        PERFORM public.fn_cascade_cancel_future_registrations(
          r.volunteer_id, 'blacklist_cascade', 'blacklist_cascade_cancelled');
        PERFORM public.fn_audit('auto_blacklist', 'blacklist_events', v_event_id,
          jsonb_build_object('registration_id', r.id));
      END IF;
    END LOOP;
  END LOOP;
END $$;

-- ---------------------------------------------------------
-- (8) 報名審核提醒（來源 05）：查詢已 join activities，只需擴充 payload
--     dedup_key 不可更動，改了會重寄今日提醒。
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.job_send_review_reminders()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_days integer; v_n integer;
BEGIN
  SELECT review_reminder_days_before INTO v_days FROM public.system_settings;

  INSERT INTO public.notification_outbox (recipient_user_id, notification_type, payload, dedup_key)
  SELECT ao.staff_id, 'review_reminder',
         jsonb_build_object('session_id', s.id, 'activity_id', s.activity_id,
                            'activity_title', a.title,
                            'start_at', s.start_at, 'end_at', s.end_at,
                            'pending_count', p.pending_count),
         'review_reminder:' || s.id || ':' || ao.staff_id || ':' || CURRENT_DATE
  FROM public.activity_sessions s
  JOIN public.activities a ON a.id = s.activity_id
  JOIN LATERAL (
    SELECT count(*) AS pending_count FROM public.registrations r
    WHERE r.activity_session_id = s.id AND r.status = 'pending'
  ) p ON p.pending_count > 0
  JOIN public.activity_organizers ao ON ao.activity_id = s.activity_id
  WHERE s.cancelled_at IS NULL
    AND a.status IN ('open', 'closed')
    AND s.start_at > now()
    AND s.start_at <= now() + make_interval(days => v_days)
  ON CONFLICT (dedup_key) WHERE dedup_key IS NOT NULL DO NOTHING;

  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END $$;

-- ---------------------------------------------------------
-- (9) 活動開始前提醒（來源 05）：新增 activities join 取標題
--     inner join 打在 NOT NULL FK 上，不會改變結果列。dedup_key 不可動。
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.job_send_activity_reminders()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_n integer;
BEGIN
  INSERT INTO public.notification_outbox (recipient_user_id, notification_type, payload, dedup_key)
  SELECT r.volunteer_id, 'activity_reminder',
         jsonb_build_object('registration_id', r.id, 'session_id', s.id,
                            'activity_id', s.activity_id, 'activity_title', a.title,
                            'start_at', s.start_at, 'end_at', s.end_at),
         'activity_reminder:' || r.id
  FROM public.registrations r
  JOIN public.activity_sessions s ON s.id = r.activity_session_id
  JOIN public.activities a ON a.id = s.activity_id
  WHERE r.status = 'approved'
    AND s.cancelled_at IS NULL
    AND s.start_at > now()
    AND s.start_at <= now() + interval '24 hours'
  ON CONFLICT (dedup_key) WHERE dedup_key IS NOT NULL DO NOTHING;

  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END $$;

-- ---------------------------------------------------------
-- (10) 報名即時通知（來源 27）：保留舊 key 'title'，另加 activity_title
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_notify_new_registration()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_activity uuid;
  v_title text;
  v_vol_name text;
  v_worker uuid;
  v_start_at timestamptz;
  v_end_at timestamptz;
BEGIN
  IF NEW.status <> 'pending' THEN RETURN NEW; END IF;

  SELECT s.activity_id, s.start_at, s.end_at INTO v_activity, v_start_at, v_end_at
  FROM public.activity_sessions s WHERE s.id = NEW.activity_session_id;
  SELECT title INTO v_title FROM public.activities WHERE id = v_activity;
  SELECT full_name, assigned_worker_id INTO v_vol_name, v_worker
  FROM public.volunteer_profiles WHERE id = NEW.volunteer_id;

  -- 主辦人
  INSERT INTO public.notification_outbox (recipient_user_id, notification_type, payload, dedup_key)
  SELECT ao.staff_id, 'registration_submitted',
         jsonb_build_object('title', v_title, 'activity_title', v_title,
                            'volunteer', v_vol_name,
                            'activity_id', v_activity,
                            'session_id', NEW.activity_session_id,
                            'start_at', v_start_at, 'end_at', v_end_at),
         'registration_submitted:' || NEW.id || ':' || ao.staff_id
  FROM public.activity_organizers ao
  WHERE ao.activity_id = v_activity
  ON CONFLICT (dedup_key) WHERE dedup_key IS NOT NULL DO NOTHING;

  -- 該生負責社工（若非主辦人本人，dedup 會擋掉重複）
  IF v_worker IS NOT NULL THEN
    INSERT INTO public.notification_outbox (recipient_user_id, notification_type, payload, dedup_key)
    VALUES (v_worker, 'registration_submitted',
            jsonb_build_object('title', v_title, 'activity_title', v_title,
                               'volunteer', v_vol_name,
                               'activity_id', v_activity,
                               'session_id', NEW.activity_session_id,
                               'start_at', v_start_at, 'end_at', v_end_at),
            'registration_submitted:' || NEW.id || ':' || v_worker)
    ON CONFLICT (dedup_key) WHERE dedup_key IS NOT NULL DO NOTHING;
  END IF;

  RETURN NEW;
END $$;

-- ---------------------------------------------------------
-- (11) 場次時間異動（來源 02）：保留 new_start_at/new_end_at，另加同值的
--      start_at/end_at，讓通用樣板不必為此型別開特例。
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_session_time_changed()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  r record;
  v_conflict boolean;
  v_title text;
BEGIN
  IF NEW.start_at = OLD.start_at AND NEW.end_at = OLD.end_at THEN
    RETURN NULL;
  END IF;
  SELECT title INTO v_title FROM public.activities WHERE id = NEW.activity_id;

  FOR r IN
    SELECT id, volunteer_id FROM public.registrations
    WHERE activity_session_id = NEW.id
      AND status IN ('pending', 'approved', 'cancel_pending')
  LOOP
    PERFORM public.fn_notify(r.volunteer_id, 'session_time_changed',
      jsonb_build_object('session_id', NEW.id, 'activity_id', NEW.activity_id,
                         'activity_title', v_title,
                         'start_at', NEW.start_at, 'end_at', NEW.end_at,
                         'new_start_at', NEW.start_at, 'new_end_at', NEW.end_at));

    SELECT EXISTS (
      SELECT 1
      FROM public.registrations r2
      JOIN public.activity_sessions s2 ON s2.id = r2.activity_session_id
      WHERE r2.volunteer_id = r.volunteer_id
        AND r2.id <> r.id
        AND r2.status IN ('pending', 'approved', 'cancel_pending')
        AND s2.cancelled_at IS NULL
        AND tstzrange(s2.start_at, s2.end_at) && tstzrange(NEW.start_at, NEW.end_at)
    ) INTO v_conflict;

    IF v_conflict THEN
      PERFORM public.fn_notify(r.volunteer_id, 'schedule_conflict_alert',
        jsonb_build_object('session_id', NEW.id, 'registration_id', r.id,
                           'activity_id', NEW.activity_id,
                           'activity_title', v_title,
                           'start_at', NEW.start_at, 'end_at', NEW.end_at));
      INSERT INTO public.notification_outbox (recipient_user_id, notification_type, payload)
      SELECT ao.staff_id, 'schedule_conflict_alert',
             jsonb_build_object('session_id', NEW.id, 'registration_id', r.id,
                                'volunteer_id', r.volunteer_id,
                                'activity_id', NEW.activity_id,
                                'activity_title', v_title,
                                'start_at', NEW.start_at, 'end_at', NEW.end_at)
      FROM public.activity_organizers ao
      WHERE ao.activity_id = NEW.activity_id;

      PERFORM public.fn_audit('session_time_conflict_detected', 'registrations', r.id,
        jsonb_build_object('session_id', NEW.id));
    END IF;
  END LOOP;
  RETURN NULL;
END $$;

NOTIFY pgrst, 'reload schema';
