-- =========================================================
-- 志工管理平台 31_briefing_registration.sql
-- 需求（2026-07）：行前說明會也開放報名
--   先前（30）把行前說明會設為「純資訊、不可報名、不計時數」。現改為：
--   (1) 行前說明會與正式場次一樣可報名（有名額、報名截止、可點名/出席）。
--   (2) 新增 counts_hours 旗標：新增說明會時由職員決定該場出席是否計服務時數
--       （正式場次一律計）。出席帶時數的 trigger 只在 counts_hours = true 時帶入。
-- 前置：01（activity_sessions）→ 02（fn_fill_hours_on_attendance）→ 30（view/rpc）。
-- 單步執行即可。
-- =========================================================

-- ---------------------------------------------------------
-- 1. 新增 counts_hours 旗標（預設 true：正式場次與既有資料皆計時數）
-- ---------------------------------------------------------
ALTER TABLE public.activity_sessions
  ADD COLUMN IF NOT EXISTS counts_hours boolean NOT NULL DEFAULT true;

-- ---------------------------------------------------------
-- 2. v_session_open_slots：不再排除說明會（說明會亦需名額/剩餘計算）
-- ---------------------------------------------------------
CREATE OR REPLACE VIEW public.v_session_open_slots
WITH (security_invoker = off) AS
SELECT
  s.id AS activity_session_id,
  s.activity_id,
  s.start_at,
  s.end_at,
  s.capacity,
  s.registration_deadline_at,
  (s.cancelled_at IS NOT NULL) AS session_cancelled,
  s.capacity - count(r.id) FILTER (
    WHERE r.status IN ('pending', 'approved', 'cancel_pending')
  ) AS open_slots
FROM public.activity_sessions s
JOIN public.activities a ON a.id = s.activity_id
LEFT JOIN public.registrations r ON r.activity_session_id = s.id
WHERE a.status <> 'draft' AND a.deleted_at IS NULL
GROUP BY s.id, s.activity_id, s.start_at, s.end_at, s.capacity,
         s.registration_deadline_at, s.cancelled_at;
REVOKE ALL ON public.v_session_open_slots FROM anon;
GRANT SELECT ON public.v_session_open_slots TO authenticated;

-- ---------------------------------------------------------
-- 3. rpc_register_for_session：移除「拒絕報名說明會」防呆（其餘與 21/30 相同）
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

  -- Email 驗證關卡（未驗證聯絡信箱不得報名）
  PERFORM 1 FROM public.volunteer_profiles
   WHERE id = v_uid AND email_verified_at IS NOT NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION '請先完成 Email 驗證後才能報名（帳號設定 → 驗證 Email）';
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

  SELECT count(*) INTO v_taken FROM public.registrations
   WHERE activity_session_id = p_session_id
     AND status IN ('pending', 'approved', 'cancel_pending');
  IF v_taken >= v_session.capacity THEN RAISE EXCEPTION '此場次名額已滿'; END IF;

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
-- 4. 出席帶時數：僅在該場次 counts_hours = true 時帶入（其餘與 02 相同）
--    不計時數的說明會即使出席，service_hours 仍為 NULL → 不進時數統計/證明/達標。
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_fill_hours_on_attendance()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.attendance IN ('attended', 'makeup_attended') THEN
    IF NEW.service_hours IS NULL THEN
      SELECT CASE
               WHEN s.counts_hours
               THEN round(EXTRACT(EPOCH FROM (s.end_at - s.start_at)) / 3600.0, 2)
               ELSE NULL
             END
        INTO NEW.service_hours
        FROM public.activity_sessions s WHERE s.id = NEW.activity_session_id;
    END IF;
  ELSE
    NEW.service_hours := NULL;  -- absent 或未記錄 → 無時數（與 CHECK 一致）
  END IF;
  RETURN NEW;
END $$;

NOTIFY pgrst, 'reload schema';
