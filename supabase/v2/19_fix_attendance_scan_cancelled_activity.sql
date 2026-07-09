-- =========================================================
-- 志工管理平台 19_fix_attendance_scan_cancelled_activity.sql（正確性修補 H2）
-- 問題：rpc_cancel_activity 只把「未開始」場次標記 cancelled_at；活動整場
--   取消時，正在進行中的場次仍保持 cancelled_at IS NULL。job_attendance_scan
--   的掃描條件只看 cancelled_at IS NULL、不看活動狀態，於是活動中途取消
--   （颱風等）後，該進行中場次 approved 但未簽到者，數日後會被判 absent
--   ＋觸發自動黑名單，為一場「已取消的活動」受罰。
-- 修補：掃描時 JOIN activities，排除 status='cancelled' 的活動。
-- 前置：01 → 02 → 04 → 05（本檔以 CREATE OR REPLACE 覆蓋 05 的 job_attendance_scan）。
-- 冪等：CREATE OR REPLACE 可重複執行；保留既有 GRANT（service_role）。
-- =========================================================

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
    SELECT sess.id
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
                             'expected_release_at', v_release));
        PERFORM public.fn_cascade_cancel_future_registrations(
          r.volunteer_id, 'blacklist_cascade', 'blacklist_cascade_cancelled');
        PERFORM public.fn_audit('auto_blacklist', 'blacklist_events', v_event_id,
          jsonb_build_object('registration_id', r.id));
      END IF;
    END LOOP;
  END LOOP;
END $$;
