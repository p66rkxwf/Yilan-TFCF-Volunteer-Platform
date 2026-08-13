-- =========================================================
-- 志工管理平台 39_fix_function_regressions.sql（正確性修補：找回被覆蓋掉的守衛）
--
-- 問題：本目錄以「複製整支函式、改其中幾行」的方式做增量修補。當某一檔挑錯了
--   複製來源（挑到舊版而非最新版），該函式在中間版本新增的條件就會整段消失，
--   而 CREATE OR REPLACE 不會有任何警告。以下三支即為此類 regression：
--
--   (1) rpc_register_for_session　覆蓋鏈 04 → 21 → 30 → 31 → 34
--       34 的檔頭寫「兩者自 04 以來未被其他檔覆蓋過（已確認）」，實際上 21／30／31
--       都覆蓋過。34 以 04 為底重寫，21 新增的「未驗證 Email 不得報名」整段消失。
--       34 是最後一版 → 正式庫目前沒有這道關卡，Email 驗證形同虛設。
--
--   (2) fn_fill_hours_on_attendance　覆蓋鏈 02 → 16 → 31
--       31 以 02 為底加上 counts_hours 判斷，掉了 16 設的下限 0.01。
--       場次時長 < 約 18 秒時 round 後為 0.00 → 違反 registrations.service_hours
--       的 CHECK（> 0）→ 簽到／後台記錄出席直接中止。
--
--   (3) rpc_self_check_in　覆蓋鏈 04 → 11 → 21
--       34 修 H3（封存者 status 仍為 'active'）時只補了報名與指派兩條路徑，
--       漏了簽到。已封存帳號若仍持有有效 session 仍可自行簽到並計入時數。
--
-- 修補：以「最後一版 + 遺失的條件」重建三支函式，成為新的 canonical 版本。
--   各支的完整覆蓋鏈與 canonical 出處已登記於 supabase/v2/FUNCTIONS.md，
--   日後要改請先查該表取得來源，不要憑印象從舊檔複製。
--
-- 另補一項同性質的疏漏（授權而非函式本體）：
--   (4) job_purge_rejected_accounts　35 只寫了 REVOKE，漏了 GRANT TO service_role。
--       worker 每晚 19:35 UTC 呼叫它會得到 42501，而 worker 的 catch 會吞掉錯誤，
--       所以「審核未通過帳號保留期後永久刪除」從未真正執行過——帳號一直停在
--       封存狀態，個資也沒清掉。對照 23 的同類排程（23:171）有正確授權。
--
-- 前置：01 → 02 → 04 → 11 → 16 → 21 → 30 → 31 → 34 → 35。
-- 冪等：全為 CREATE OR REPLACE / GRANT，可重複執行；簽章未變，保留既有 GRANT 與 trigger 綁定。
-- =========================================================

-- ---------------------------------------------------------
-- (1) 志工自行報名
--     本體同 34（04 base + deleted_at IS NULL；不含 30 的說明會拒絕，因 31 已刻意
--     開放行前說明會報名），補回 21 的 Email 驗證關卡。
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

  -- Email 驗證關卡（21 新增，34 誤以 04 為來源重寫時遺失，此處補回）
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
-- (2) 出席帶時數
--     本體同 31（counts_hours 為 false 時維持 NULL，不進時數統計），
--     補回 16 的下限 0.01——僅套用在「要計時數」那一支，ELSE 仍為 NULL。
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_fill_hours_on_attendance()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.attendance IN ('attended', 'makeup_attended') THEN
    IF NEW.service_hours IS NULL THEN
      SELECT CASE
               WHEN s.counts_hours
               -- GREATEST 為 16 的極短場次防呆：round 後為 0.00 會違反 CHECK（> 0）
               THEN GREATEST(round(EXTRACT(EPOCH FROM (s.end_at - s.start_at)) / 3600.0, 2), 0.01)
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

-- ---------------------------------------------------------
-- (3) 志工自行簽到
--     本體同 21（11 的時窗修補 + Email 驗證關卡），補上 34 漏掉的 deleted_at，
--     讓報名與簽到兩條路徑對已封存帳號的判斷一致。
-- ---------------------------------------------------------
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
   WHERE id = v_uid AND status = 'active' AND is_blacklisted = false
     AND deleted_at IS NULL;               -- H3：封存者 status 仍為 active，須另擋
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

-- ---------------------------------------------------------
-- (4) 補回 35 漏掉的授權
--     35 寫了 REVOKE ... FROM PUBLIC, anon, authenticated 卻沒有對應的
--     GRANT TO service_role，導致 Cloudflare worker 呼叫時被擋（42501）。
--     比照 23:171（job_purge_expired）的寫法補上。
-- ---------------------------------------------------------
GRANT EXECUTE ON FUNCTION public.job_purge_rejected_accounts() TO service_role;

NOTIFY pgrst, 'reload schema';
