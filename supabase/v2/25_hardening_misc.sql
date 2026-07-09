-- =========================================================
-- 志工管理平台 25_hardening_misc.sql（審查修補 M3 / L2 / L3）
-- 內容：
--   (M3) rpc_submit_support_request：加欄位長度上限＋簡易頻率限制（防 anon 灌爆）。
--   (L2) fn_session_validate：已取消場次不可復原；名額不得低於現有有效報名數。
--   (L3) job_advance_activity_status：所有場次皆取消/結束的活動也能 closed→completed。
-- 前置：01 → 02 → 04 → 05 → 10。
-- 冪等：CREATE OR REPLACE 可重複執行。
-- =========================================================

-- ---------------------------------------------------------
-- (M3) 支援表單：長度上限＋頻率限制
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_submit_support_request(
  p_name text, p_email text, p_topic text, p_message text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_name text := trim(p_name);
  v_email text := trim(p_email);
  v_message text := trim(p_message);
  v_recent integer;
  v_request_id uuid;
BEGIN
  IF v_name = '' OR v_email = '' OR v_message = '' THEN
    RAISE EXCEPTION '姓名、Email 與問題描述為必填欄位';
  END IF;
  IF v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' THEN
    RAISE EXCEPTION 'Email 格式不正確';
  END IF;
  -- 長度上限（防灌爆與超長內容）
  IF length(v_name) > 100 OR length(v_email) > 200
     OR length(v_message) > 2000 OR length(coalesce(trim(p_topic), '')) > 100 THEN
    RAISE EXCEPTION '欄位長度超過限制（姓名≤100、Email≤200、主題≤100、內容≤2000 字）';
  END IF;

  -- 頻率限制：同一 Email 一小時內至多 5 筆（簡易防濫用；非強保證）
  SELECT count(*) INTO v_recent FROM public.support_requests
   WHERE email = v_email AND created_at > now() - interval '1 hour';
  IF v_recent >= 5 THEN
    RAISE EXCEPTION '送出過於頻繁，請稍後再試';
  END IF;

  INSERT INTO public.support_requests (name, email, topic, message, created_by)
  VALUES (v_name, v_email, COALESCE(NULLIF(trim(p_topic), ''), '其他問題'), v_message, auth.uid())
  RETURNING id INTO v_request_id;

  RETURN v_request_id;
END $$;

-- ---------------------------------------------------------
-- (L2) 場次驗證：不可復原已取消場次；名額不得低於現有有效報名數
--     其餘與 02_triggers.sql 完全相同。
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_session_validate()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_activity_status activity_status;
  v_taken integer;
BEGIN
  IF NEW.registration_deadline_at IS NULL THEN
    NEW.registration_deadline_at := NEW.start_at;
  END IF;

  SELECT status INTO v_activity_status FROM public.activities WHERE id = NEW.activity_id;

  IF TG_OP = 'INSERT' AND v_activity_status IN ('completed', 'cancelled') THEN
    RAISE EXCEPTION '已結束或已取消的活動不可新增場次';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    -- L2：已取消場次不可復原（其有效報名早已被連動取消，復原會造成資料不一致）
    IF OLD.cancelled_at IS NOT NULL AND NEW.cancelled_at IS NULL THEN
      RAISE EXCEPTION '已取消的場次不可復原；如需重辦請新增場次';
    END IF;

    -- 已結束場次為歷史事實（時數已據此計算），禁止改起訖
    IF OLD.end_at <= now()
       AND (NEW.start_at IS DISTINCT FROM OLD.start_at
            OR NEW.end_at IS DISTINCT FROM OLD.end_at) THEN
      RAISE EXCEPTION '已結束的場次不可修改起訖時間';
    END IF;

    -- 已取消場次不可再改內容（保持單純）
    IF OLD.cancelled_at IS NOT NULL AND NEW.cancelled_at IS NOT NULL
       AND (NEW.start_at IS DISTINCT FROM OLD.start_at
            OR NEW.end_at IS DISTINCT FROM OLD.end_at
            OR NEW.capacity IS DISTINCT FROM OLD.capacity) THEN
      RAISE EXCEPTION '已取消的場次不可修改內容';
    END IF;

    -- L2：名額不得調降到低於現有有效報名數（否則名額計數與實況矛盾）
    IF NEW.capacity < OLD.capacity THEN
      SELECT count(*) INTO v_taken FROM public.registrations
       WHERE activity_session_id = NEW.id
         AND status IN ('pending', 'approved', 'cancel_pending');
      IF NEW.capacity < v_taken THEN
        RAISE EXCEPTION '名額（%）不可低於目前有效報名數（%）', NEW.capacity, v_taken;
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END $$;

-- ---------------------------------------------------------
-- (L3) 活動推進：closed→completed 條件放寬——只要「沒有仍未結束的有效場次」即可，
--      不再要求「存在有效場次」，使全部場次取消/結束的活動也能正常結案。
--      其餘與 05_scheduled_jobs.sql 完全相同。
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
    AND NOT EXISTS (
      SELECT 1 FROM public.activity_sessions s
      WHERE s.activity_id = a.id AND s.cancelled_at IS NULL
        AND s.end_at > now()
    );
  GET DIAGNOSTICS v_tmp = ROW_COUNT; v_n := v_n + v_tmp;

  RETURN v_n;
END $$;

NOTIFY pgrst, 'reload schema';
