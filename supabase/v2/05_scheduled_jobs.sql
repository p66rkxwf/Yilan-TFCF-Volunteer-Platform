-- =========================================================
-- 志工管理平台 05_scheduled_jobs.sql（定案版）
-- 內容：排程工作函式（觸發不在 SQL 層：由 Cloudflare Cron Worker 執行，見 §G）
-- 前置：01 → 02 → 03 → 04；不需 pg_cron extension
--
-- 冪等設計：所有 job 可安全重跑 ——
-- - 黑名單觸發由 (registration_id) 部分唯一索引擋重複
-- - absent 標記以 attendance IS NULL 為前提
-- - 通知以 dedup_key 去重（#28）
-- =========================================================

-- ---------------------------------------------------------
-- A. 活動狀態推進
--    open → closed：所有有效場次的報名截止皆已過（#16A 自動關閉）
--    closed → completed：所有有效場次皆已結束
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.job_advance_activity_status()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_n integer := 0; v_tmp integer;
BEGIN
  UPDATE public.activities a
  SET status = 'closed'
  WHERE a.status = 'open'
    AND NOT EXISTS (
      SELECT 1 FROM public.activity_sessions s
      WHERE s.activity_id = a.id AND s.cancelled_at IS NULL
        AND s.registration_deadline_at > now()
    );
  GET DIAGNOSTICS v_tmp = ROW_COUNT; v_n := v_n + v_tmp;

  UPDATE public.activities a
  SET status = 'completed'
  WHERE a.status = 'closed'
    AND EXISTS (SELECT 1 FROM public.activity_sessions s
                WHERE s.activity_id = a.id AND s.cancelled_at IS NULL)
    AND NOT EXISTS (
      SELECT 1 FROM public.activity_sessions s
      WHERE s.activity_id = a.id AND s.cancelled_at IS NULL
        AND s.end_at > now()
    );
  GET DIAGNOSTICS v_tmp = ROW_COUNT; v_n := v_n + v_tmp;

  RETURN v_n;
END $$;

-- ---------------------------------------------------------
-- B. 出席掃描 ＋ 黑名單觸發（核心排程）
--    對象：已結束且超過補登寬限期、未取消的場次
--    B1. 仍 pending 的報名 → expired（#21）
--    B2. approved 且無出席紀錄 → absent ＋ 黑名單事件 ＋ 級聯取消 ＋ 通知
--        cancel_pending 排除（#20b，由 v_overdue_cancel_reviews 供人工處理）
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
    SELECT id FROM public.activity_sessions
    WHERE cancelled_at IS NULL
      AND end_at + make_interval(days => v_grace) < now()
      AND end_at > now() - interval '90 days'   -- 掃描視窗上限；冪等靠條件與唯一索引
  LOOP
    -- B1
    UPDATE public.registrations
    SET status = 'expired'
    WHERE activity_session_id = s.id AND status = 'pending';

    -- B2
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
                             'expected_release_at', v_release));
        PERFORM public.fn_cascade_cancel_future_registrations(
          r.volunteer_id, 'blacklist_cascade', 'blacklist_cascade_cancelled');
        PERFORM public.fn_audit('auto_blacklist', 'blacklist_events', v_event_id,
          jsonb_build_object('registration_id', r.id));
      END IF;
    END LOOP;
  END LOOP;
END $$;

-- ---------------------------------------------------------
-- C. 黑名單自動解除（released_by NULL = 系統；sync trigger 更新鏡像欄位）
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.job_release_blacklists()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_n integer;
BEGIN
  WITH released AS (
    UPDATE public.blacklist_events
    SET released_at = now()
    WHERE released_at IS NULL AND expected_release_at <= now()
    RETURNING id
  )
  INSERT INTO public.audit_logs (actor_id, action, target_table, target_id)
  SELECT NULL, 'auto_release_blacklist', 'blacklist_events', id FROM released;

  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END $$;

-- ---------------------------------------------------------
-- D. 報名審核提醒（每日；發給該活動所有主辦人）
--    對象：N 天內開始、未取消、仍有 pending 報名的場次
--    dedup_key 含 staff＋日期 → 每人每場每日至多一則（#28）
--    逾期不自動處理，僅持續提醒（既定決策）
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
                            'start_at', s.start_at,
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
-- E. 活動開始前提醒（發給已核准志工；24 小時內開始的場次，每筆報名一次）
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.job_send_activity_reminders()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_n integer;
BEGIN
  INSERT INTO public.notification_outbox (recipient_user_id, notification_type, payload, dedup_key)
  SELECT r.volunteer_id, 'activity_reminder',
         jsonb_build_object('registration_id', r.id, 'session_id', s.id,
                            'activity_id', s.activity_id, 'start_at', s.start_at),
         'activity_reminder:' || r.id
  FROM public.registrations r
  JOIN public.activity_sessions s ON s.id = r.activity_session_id
  WHERE r.status = 'approved'
    AND s.cancelled_at IS NULL
    AND s.start_at > now()
    AND s.start_at <= now() + interval '24 hours'
  ON CONFLICT (dedup_key) WHERE dedup_key IS NOT NULL DO NOTHING;

  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END $$;

-- ---------------------------------------------------------
-- F. 權限：排程函式不開放前端呼叫
-- ---------------------------------------------------------
REVOKE EXECUTE ON FUNCTION
  public.job_advance_activity_status(),
  public.job_attendance_scan(),
  public.job_release_blacklists(),
  public.job_send_review_reminders(),
  public.job_send_activity_reminders()
FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------
-- G. 排程觸發（不在 SQL 層｜Cloudflare-first）
-- 本專案不使用 pg_cron。上述 5 支 job_* 改由 Cloudflare Cron Worker
-- （workers/orchestrator/）以 service_role RPC 觸發，時程如下（UTC；台灣 = UTC+8）：
--   */15 * * * *  job_advance_activity_status  （每 15 分）
--   10 19 * * *   job_attendance_scan          （每日 03:10 台灣）
--   20 19 * * *   job_release_blacklists        （每日 03:20 台灣）
--   0 1 * * *     job_send_review_reminders     （每日 09:00 台灣）
--   0 10 * * *    job_send_activity_reminders   （每日 18:00 台灣）
-- 授權（GRANT EXECUTE ... TO service_role）見 12_enable_scheduled_jobs.sql。

-- ---------------------------------------------------------
-- H. 發信 worker（不在 SQL 層）
-- 以 Cloudflare Cron Worker（workers/orchestrator/，service_role）每分鐘執行：
--   1. SELECT * FROM notification_outbox WHERE status='pending'
--      ORDER BY created_at LIMIT 50
--   2. 依 notification_type/payload 組信，透過 Resend HTTPS API 寄出
--   3. 成功 → status='sent', sent_at=now()；失敗 → status='failed', error=...
-- 交易內只寫 outbox、發信永遠在交易外 —— 這是黑名單多步驟流程
-- 交易邊界問題的最終解（transactional outbox pattern）。
-- （批量小、單一每分鐘排程，故以 .eq('status','pending') 樂觀防護取代佇列鎖。）
-- ---------------------------------------------------------
