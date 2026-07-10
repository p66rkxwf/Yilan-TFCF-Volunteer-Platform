-- =========================================================
-- 志工管理平台 27_custom_service_and_notifications.sql
-- 需求（2026-07）：
--   (A) 自訂服務登錄（記錄「已完成的私下服務」計時數）：志工可登錄自己的、
--       職員可代任一志工登錄；兩者皆需審核。上傳者填起訖時間，系統算時長。
--       送審通知「該生負責社工」（活動負責人為自由文字、無法通知）；任何在職
--       職員都能審核，其他人不收通知。核可後時數併入既有時數統計/證明/期間達標。
--   (B) 報名即時通知：一般活動有人報名（pending）→ 通知主辦人＋該生負責社工；
--       新帳號待審（pending_review）→ 通知單位管理員以上。其他人可審不收通知。
-- 前置：01 → 02 → 03 → 04 →（14 期間視圖）→（21 報名 RPC）。
--
-- ⚠️ 分兩步執行（同 07/21）：ALTER TYPE ADD VALUE 後不可於同一交易立即使用。
--   STEP 1：先單獨執行「STEP 1」區塊並確認成功。
--   STEP 2：再執行其餘（STEP 2）。
-- =========================================================

-- ---------------------------------------------------------
-- STEP 1：notification_type 補值（請先單獨執行本區塊）
-- ---------------------------------------------------------
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'custom_service_submitted';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'custom_service_result';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'registration_submitted';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'account_review_pending';

-- ---------------------------------------------------------
-- STEP 2：資料表、RLS、RPC、視圖、觸發器（STEP 1 commit 後才執行）
-- ---------------------------------------------------------

-- 2.1 自訂服務紀錄表
CREATE TABLE IF NOT EXISTS public.custom_service_records (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  volunteer_id uuid NOT NULL,
  title text NOT NULL,
  leader_name text,                         -- 活動負責人：自由填文字（不通知）
  description text,
  start_at timestamptz NOT NULL,
  end_at timestamptz NOT NULL,
  service_hours numeric NOT NULL CHECK (service_hours > 0), -- 由起訖時間換算
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  submitted_by uuid,                        -- 提交者（志工本人或代登錄的職員；皆為 auth.users）
  reviewed_by uuid,
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT custom_service_records_pkey PRIMARY KEY (id),
  CONSTRAINT custom_service_records_volunteer_id_fkey
    FOREIGN KEY (volunteer_id) REFERENCES public.volunteer_profiles(id) ON DELETE CASCADE,
  -- 提交者/審核者被硬刪（見 26）時留空，不阻擋刪除
  CONSTRAINT custom_service_records_submitted_by_fkey
    FOREIGN KEY (submitted_by) REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT custom_service_records_reviewed_by_fkey
    FOREIGN KEY (reviewed_by) REFERENCES public.staff_profiles(id) ON DELETE SET NULL,
  CONSTRAINT custom_service_time_check CHECK (end_at > start_at),
  -- 審核結果與審核人/時間一對一綁定
  CONSTRAINT custom_service_review_consistency
    CHECK ((status IN ('approved', 'rejected')) = (reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS custom_service_volunteer_idx ON public.custom_service_records (volunteer_id);
CREATE INDEX IF NOT EXISTS custom_service_status_idx ON public.custom_service_records (status);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.custom_service_records
  FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();

-- 2.2 RLS：本人可讀自己的、職員可讀全部；寫入一律走 SECURITY DEFINER RPC。
ALTER TABLE public.custom_service_records ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.custom_service_records FROM anon, authenticated;
GRANT SELECT ON public.custom_service_records TO authenticated;

DROP POLICY IF EXISTS custom_service_select_own ON public.custom_service_records;
CREATE POLICY custom_service_select_own ON public.custom_service_records
  FOR SELECT USING (volunteer_id = auth.uid() OR public.fn_is_staff());

-- 2.3 送審：志工登錄自己的／職員代任一在職志工登錄
CREATE OR REPLACE FUNCTION public.rpc_submit_custom_service(
  p_volunteer_id uuid,
  p_title text,
  p_leader text,
  p_description text,
  p_start timestamptz,
  p_end timestamptz
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_hours numeric;
  v_worker uuid;
  v_vol_name text;
  v_id uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION '未登入'; END IF;
  IF NOT public.fn_is_staff() AND p_volunteer_id <> v_uid THEN
    RAISE EXCEPTION '只能登錄自己的服務紀錄';
  END IF;

  SELECT full_name, assigned_worker_id INTO v_vol_name, v_worker
  FROM public.volunteer_profiles WHERE id = p_volunteer_id AND status = 'active';
  IF NOT FOUND THEN RAISE EXCEPTION '對象志工不存在或非在職'; END IF;

  IF COALESCE(btrim(p_title), '') = '' THEN RAISE EXCEPTION '請填寫活動名稱'; END IF;
  IF p_start IS NULL OR p_end IS NULL THEN RAISE EXCEPTION '請填寫起訖時間'; END IF;
  IF p_end <= p_start THEN RAISE EXCEPTION '結束時間需晚於開始時間'; END IF;
  v_hours := round((extract(epoch FROM (p_end - p_start)) / 3600.0)::numeric, 1);
  IF v_hours <= 0 THEN RAISE EXCEPTION '服務時數需大於 0'; END IF;

  INSERT INTO public.custom_service_records
    (volunteer_id, title, leader_name, description, start_at, end_at, service_hours, status, submitted_by)
  VALUES
    (p_volunteer_id, btrim(p_title), NULLIF(btrim(p_leader), ''), NULLIF(btrim(p_description), ''),
     p_start, p_end, v_hours, 'pending', v_uid)
  RETURNING id INTO v_id;

  -- 通知該生負責社工（若有）；活動負責人為自由文字不通知。
  IF v_worker IS NOT NULL THEN
    PERFORM public.fn_notify(v_worker, 'custom_service_submitted',
      jsonb_build_object('title', btrim(p_title), 'volunteer', v_vol_name));
  END IF;

  PERFORM public.fn_audit('submit_custom_service', 'custom_service_records', v_id,
    jsonb_build_object('volunteer_id', p_volunteer_id, 'hours', v_hours));
  RETURN v_id;
END $$;

-- 2.4 審核：任何在職職員可核可／退回
CREATE OR REPLACE FUNCTION public.rpc_review_custom_service(
  p_id uuid, p_approve boolean, p_note text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_rec public.custom_service_records%ROWTYPE;
BEGIN
  IF NOT public.fn_is_staff() THEN RAISE EXCEPTION '需在職職員權限'; END IF;

  SELECT * INTO v_rec FROM public.custom_service_records WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION '找不到此紀錄'; END IF;
  IF v_rec.status <> 'pending' THEN RAISE EXCEPTION '此紀錄已審核'; END IF;

  UPDATE public.custom_service_records
     SET status = CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END,
         reviewed_by = auth.uid(),
         reviewed_at = now(),
         review_note = NULLIF(btrim(p_note), ''),
         updated_at = now()
   WHERE id = p_id;

  PERFORM public.fn_notify(v_rec.volunteer_id, 'custom_service_result',
    jsonb_build_object('title', v_rec.title, 'approved', p_approve));

  PERFORM public.fn_audit(
    CASE WHEN p_approve THEN 'approve_custom_service' ELSE 'reject_custom_service' END,
    'custom_service_records', p_id, NULL);
END $$;

REVOKE EXECUTE ON FUNCTION
  public.rpc_submit_custom_service(uuid, text, text, text, timestamptz, timestamptz),
  public.rpc_review_custom_service(uuid, boolean, text)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION
  public.rpc_submit_custom_service(uuid, text, text, text, timestamptz, timestamptz),
  public.rpc_review_custom_service(uuid, boolean, text)
TO authenticated;

-- 2.5 時數視圖併入「已核可的自訂服務」
--     v_volunteer_hours：總時數與筆數皆納入。
CREATE OR REPLACE VIEW public.v_volunteer_hours
WITH (security_invoker = on) AS
SELECT x.volunteer_id,
       COALESCE(sum(x.hours), 0) AS total_hours,
       count(*) AS attended_sessions
FROM (
  SELECT r.volunteer_id, r.service_hours AS hours
  FROM public.registrations r
  WHERE r.attendance IN ('attended', 'makeup_attended')
  UNION ALL
  SELECT c.volunteer_id, c.service_hours
  FROM public.custom_service_records c
  WHERE c.status = 'approved'
) x
GROUP BY x.volunteer_id;
GRANT SELECT ON public.v_volunteer_hours TO authenticated;

-- v_volunteer_period_hours：期間時數＋達標；自訂服務依其 start_at（台灣時區）歸期。
CREATE OR REPLACE VIEW public.v_volunteer_period_hours
WITH (security_invoker = on) AS
SELECT p.id AS period_id, p.label AS period_label,
       v.id AS volunteer_id, v.full_name, v.grade,
       COALESCE(sum(rs.hours), 0) AS period_hours,
       t.min_hours,
       COALESCE(sum(rs.hours), 0) >= t.min_hours AS meets_threshold
FROM public.periods p
CROSS JOIN public.volunteer_profiles v
JOIN public.grade_hour_thresholds t ON t.grade = v.grade
LEFT JOIN (
  SELECT r.volunteer_id, r.service_hours AS hours,
         (s.start_at AT TIME ZONE 'Asia/Taipei')::date AS svc_date
  FROM public.registrations r
  JOIN public.activity_sessions s ON s.id = r.activity_session_id
  WHERE r.attendance IN ('attended', 'makeup_attended')
  UNION ALL
  SELECT c.volunteer_id, c.service_hours,
         (c.start_at AT TIME ZONE 'Asia/Taipei')::date
  FROM public.custom_service_records c
  WHERE c.status = 'approved'
) rs ON rs.volunteer_id = v.id
    AND rs.svc_date BETWEEN p.start_date AND p.end_date
GROUP BY p.id, p.label, v.id, v.full_name, v.grade, t.min_hours;
GRANT SELECT ON public.v_volunteer_period_hours TO authenticated;

-- 2.6 報名即時通知：pending 報名 → 主辦人＋該生負責社工（dedup 去重同一人）
CREATE OR REPLACE FUNCTION public.fn_notify_new_registration()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_activity uuid;
  v_title text;
  v_vol_name text;
  v_worker uuid;
BEGIN
  IF NEW.status <> 'pending' THEN RETURN NEW; END IF;

  SELECT s.activity_id INTO v_activity
  FROM public.activity_sessions s WHERE s.id = NEW.activity_session_id;
  SELECT title INTO v_title FROM public.activities WHERE id = v_activity;
  SELECT full_name, assigned_worker_id INTO v_vol_name, v_worker
  FROM public.volunteer_profiles WHERE id = NEW.volunteer_id;

  -- 主辦人
  INSERT INTO public.notification_outbox (recipient_user_id, notification_type, payload, dedup_key)
  SELECT ao.staff_id, 'registration_submitted',
         jsonb_build_object('title', v_title, 'volunteer', v_vol_name),
         'registration_submitted:' || NEW.id || ':' || ao.staff_id
  FROM public.activity_organizers ao
  WHERE ao.activity_id = v_activity
  ON CONFLICT (dedup_key) WHERE dedup_key IS NOT NULL DO NOTHING;

  -- 該生負責社工（若非主辦人本人，dedup 會擋掉重複）
  IF v_worker IS NOT NULL THEN
    INSERT INTO public.notification_outbox (recipient_user_id, notification_type, payload, dedup_key)
    VALUES (v_worker, 'registration_submitted',
            jsonb_build_object('title', v_title, 'volunteer', v_vol_name),
            'registration_submitted:' || NEW.id || ':' || v_worker)
    ON CONFLICT (dedup_key) WHERE dedup_key IS NOT NULL DO NOTHING;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS notify_new_registration ON public.registrations;
CREATE TRIGGER notify_new_registration
  AFTER INSERT ON public.registrations
  FOR EACH ROW EXECUTE FUNCTION public.fn_notify_new_registration();

-- 2.7 新帳號待審通知：pending_review → 單位管理員以上
CREATE OR REPLACE FUNCTION public.fn_notify_new_account()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.status <> 'pending_review' THEN RETURN NEW; END IF;

  INSERT INTO public.notification_outbox (recipient_user_id, notification_type, payload, dedup_key)
  SELECT sp.id, 'account_review_pending',
         jsonb_build_object('name', NEW.full_name),
         'account_review_pending:' || NEW.id || ':' || sp.id
  FROM public.staff_profiles sp
  WHERE sp.role IN ('system_admin', 'unit_admin')
    AND sp.status = 'active' AND sp.deleted_at IS NULL
  ON CONFLICT (dedup_key) WHERE dedup_key IS NOT NULL DO NOTHING;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS notify_new_account ON public.volunteer_profiles;
CREATE TRIGGER notify_new_account
  AFTER INSERT ON public.volunteer_profiles
  FOR EACH ROW EXECUTE FUNCTION public.fn_notify_new_account();

REVOKE EXECUTE ON FUNCTION
  public.fn_notify_new_registration(), public.fn_notify_new_account()
FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';
