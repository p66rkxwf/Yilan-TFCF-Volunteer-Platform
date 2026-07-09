-- =========================================================
-- 志工管理平台 21_email_verification.sql（志工 Email 驗證）
-- 需求：註冊時先不驗證 Email；登入後需驗證聯絡信箱，驗證通過才能「報名」與
--       「自行簽到」（僅擋這兩項，登入/瀏覽/收藏/通知不擋）。聯絡 Email 變更後
--       需重新驗證。僅志工適用（職員不報名）。
-- 架構：自建 OTP（6 碼）→ 寫 email_verifications（存驗證碼、限次限時、單次使用）
--       ＋ 走 notification_outbox 由 Cloudflare worker 寄到聯絡信箱（子決策：走 outbox，
--       app 不需持有 Resend 金鑰）。驗證碼表無任何 RLS policy，僅 SECURITY DEFINER
--       RPC 與 service_role 可存取（志工讀不到自己的碼）。
-- 前置：01 → 02 → 04 → 11 → 20。
--
-- ⚠️ 分兩步執行（同 07）：ALTER TYPE ADD VALUE 後不可於同一交易立即使用該值。
--   STEP 1：先單獨執行「STEP 1」區塊並確認成功。
--   STEP 2：再執行其餘（STEP 2）。
-- =========================================================

-- ---------------------------------------------------------
-- STEP 1：notification_type 補值（請先單獨執行本區塊）
-- ---------------------------------------------------------
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'email_verification';

-- ---------------------------------------------------------
-- STEP 2：欄位、驗證碼表、RPC、報名/簽到關卡（STEP 1 commit 後才執行）
-- ---------------------------------------------------------

-- 2.1 驗證狀態欄位（NULL＝未驗證）
ALTER TABLE public.volunteer_profiles
  ADD COLUMN IF NOT EXISTS email_verified_at timestamptz;

-- 2.2 驗證碼表（每位志工至多一筆有效碼；upsert 覆蓋）
CREATE TABLE IF NOT EXISTS public.email_verifications (
  volunteer_id uuid NOT NULL,
  code text NOT NULL,
  expires_at timestamptz NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT email_verifications_pkey PRIMARY KEY (volunteer_id),
  CONSTRAINT email_verifications_volunteer_id_fkey
    FOREIGN KEY (volunteer_id) REFERENCES public.volunteer_profiles(id) ON DELETE CASCADE
);

-- 無任何 policy：僅 SECURITY DEFINER RPC（owner 繞過 RLS）與 service_role 可存取。
ALTER TABLE public.email_verifications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.email_verifications FROM anon, authenticated;

-- 2.3 欄位白名單再收斂：志工不得自行改 email_verified_at（否則可自行繞過驗證）
--     （沿用 20 的版本，加入 email_verified_at；bypass/admin client 不受限）
CREATE OR REPLACE FUNCTION public.fn_volunteer_self_update_whitelist()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF current_setting('app.bypass_profile_guard', true) = 'on' THEN
    RETURN NEW;
  END IF;
  IF auth.uid() = OLD.id
     AND NOT EXISTS (SELECT 1 FROM public.staff_profiles WHERE id = auth.uid()) THEN
    IF NEW.status IS DISTINCT FROM OLD.status
       OR NEW.grade IS DISTINCT FROM OLD.grade
       OR NEW.is_blacklisted IS DISTINCT FROM OLD.is_blacklisted
       OR NEW.assigned_worker_id IS DISTINCT FROM OLD.assigned_worker_id
       OR NEW.last_grade_reviewed_at IS DISTINCT FROM OLD.last_grade_reviewed_at
       OR NEW.birth_date IS DISTINCT FROM OLD.birth_date
       OR NEW.username IS DISTINCT FROM OLD.username
       OR NEW.email IS DISTINCT FROM OLD.email
       OR NEW.email_verified_at IS DISTINCT FROM OLD.email_verified_at
       OR NEW.must_change_password IS DISTINCT FROM OLD.must_change_password
       OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION '志工僅能修改姓名、電話、區域；其餘欄位由管理員或系統維護';
    END IF;
  END IF;
  RETURN NEW;
END $$;

-- 2.4 索取驗證碼：產生 6 碼、寫入驗證碼表、走 outbox 寄到聯絡信箱
CREATE OR REPLACE FUNCTION public.rpc_request_email_otp()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_email text;
  v_verified timestamptz;
  v_last timestamptz;
  v_code text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION '未登入'; END IF;

  SELECT email, email_verified_at INTO v_email, v_verified
  FROM public.volunteer_profiles WHERE id = v_uid AND status = 'active';
  IF NOT FOUND THEN RAISE EXCEPTION '僅在職志工可進行 Email 驗證'; END IF;
  IF v_verified IS NOT NULL THEN RAISE EXCEPTION '您的 Email 已完成驗證'; END IF;

  -- 頻率限制：同一使用者 60 秒內不得重複索取
  SELECT created_at INTO v_last FROM public.email_verifications WHERE volunteer_id = v_uid;
  IF v_last IS NOT NULL AND v_last > now() - interval '60 seconds' THEN
    RAISE EXCEPTION '驗證碼剛寄出，請稍候再重新索取';
  END IF;

  v_code := lpad((floor(random() * 1000000))::int::text, 6, '0');

  INSERT INTO public.email_verifications
    (volunteer_id, code, expires_at, attempts, consumed_at, created_at, updated_at)
  VALUES (v_uid, v_code, now() + interval '15 minutes', 0, NULL, now(), now())
  ON CONFLICT (volunteer_id) DO UPDATE
    SET code = EXCLUDED.code, expires_at = EXCLUDED.expires_at,
        attempts = 0, consumed_at = NULL, created_at = now(), updated_at = now();

  -- 走 outbox：worker 依 recipient 的聯絡 email 寄送（payload 帶明碼供寄信，
  -- 該碼 15 分鐘後失效且單次使用）。
  PERFORM public.fn_notify(v_uid, 'email_verification', jsonb_build_object('code', v_code));
END $$;

-- 2.5 驗證：比對驗證碼，通過即標記 email_verified_at
CREATE OR REPLACE FUNCTION public.rpc_verify_email_otp(p_code text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.email_verifications%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION '未登入'; END IF;

  SELECT * INTO v_row FROM public.email_verifications
   WHERE volunteer_id = v_uid FOR UPDATE;
  IF NOT FOUND OR v_row.consumed_at IS NOT NULL THEN
    RAISE EXCEPTION '尚未索取驗證碼，請先點「寄送驗證碼」';
  END IF;
  IF v_row.expires_at <= now() THEN
    RAISE EXCEPTION '驗證碼已過期，請重新索取';
  END IF;
  IF v_row.attempts >= 5 THEN
    RAISE EXCEPTION '嘗試次數過多，請重新索取驗證碼';
  END IF;

  IF trim(p_code) <> v_row.code THEN
    UPDATE public.email_verifications SET attempts = attempts + 1, updated_at = now()
     WHERE volunteer_id = v_uid;
    RAISE EXCEPTION '驗證碼錯誤';
  END IF;

  UPDATE public.email_verifications SET consumed_at = now(), updated_at = now()
   WHERE volunteer_id = v_uid;

  PERFORM set_config('app.bypass_profile_guard', 'on', true);
  UPDATE public.volunteer_profiles SET email_verified_at = now() WHERE id = v_uid;

  PERFORM public.fn_audit('verify_email', 'volunteer_profiles', v_uid, NULL);
END $$;

REVOKE EXECUTE ON FUNCTION
  public.rpc_request_email_otp(), public.rpc_verify_email_otp(text)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION
  public.rpc_request_email_otp(), public.rpc_verify_email_otp(text)
TO authenticated;

-- 2.6 報名關卡：未驗證 Email 不得報名（其餘與 04 完全相同）
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

-- 2.7 自行簽到關卡：未驗證 Email 不得簽到（其餘與 11 之修補版完全相同）
CREATE OR REPLACE FUNCTION public.rpc_self_check_in(p_registration_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_reg record;
  v_open_min integer;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION '未登入'; END IF;

  PERFORM 1 FROM public.volunteer_profiles
   WHERE id = v_uid AND status = 'active' AND is_blacklisted = false;
  IF NOT FOUND THEN
    RAISE EXCEPTION '目前帳號狀態無法簽到（停權或黑名單期間）';
  END IF;

  PERFORM 1 FROM public.volunteer_profiles
   WHERE id = v_uid AND email_verified_at IS NOT NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION '請先完成 Email 驗證後才能簽到（帳號設定 → 驗證 Email）';
  END IF;

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
  SET attendance = 'attended', checked_in_at = now()
  WHERE id = p_registration_id;
END $$;

NOTIFY pgrst, 'reload schema';
