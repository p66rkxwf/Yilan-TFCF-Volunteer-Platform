-- =========================================================
-- 志工管理平台 28_profile_edit.sql（個人資料編輯強化）
-- 需求：
--   - 職員：系統管理員可編輯任一職員之姓名/電話/地區/Email/帳號/職稱（6 欄）；
--     每位職員可於後台「帳號設定」自改電話/地區/Email/帳號（4 欄，姓名/職稱仍鎖定）。
--     職員 Email 同時是 auth 登入信箱，auth.users 同步由 server action 以 admin client
--     處理（先 Auth 後 RPC，RPC 失敗回滾 Auth）；本檔僅負責 profiles 寫入與稽核。
--   - 學生：後台編輯擴充 聯絡Email/帳號 兩欄（僅系統管理員；既有 姓名/電話/區域/生日
--     維持在職職員即可）。管理員代改聯絡 Email 一併清除驗證狀態（與自改邏輯一致，
--     需重新 OTP 驗證才能報名/簽到）。學生聯絡 Email 允許重複（見 13），僅驗格式。
--   - 學生：前台帳號設定可自改登入帳號（rpc_update_own_volunteer_username）。
--   - 全部寫入以 RPC 記 audit_logs（fn_audit 自動判斷 actor_kind，見 24）；
--     欄位白名單 trigger（20/21/22）不放寬，僅在 RPC 內以 bypass 繞過，
--     前端直寫敏感欄位仍會被擋。
-- 前置：01 → 02 → 03 → 13 → 21 → 22 → 24。
-- 冪等：CREATE OR REPLACE ＋ DROP IF EXISTS 舊簽名，可重複執行。
-- =========================================================

-- ---------------------------------------------------------
-- 1. 系統管理員編輯任一職員（6 欄）
--    username 於職員/學生兩表全域唯一（登入解析依 username，跨表撞名會互蓋）；
--    staff_profiles 內的 email/username 撞號由 UNIQUE 約束兜底轉中文。
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_admin_update_staff_profile(
  p_staff_id uuid,
  p_full_name text,
  p_phone text,
  p_email text,
  p_username text,
  p_job_title staff_job_title,
  p_region text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_old public.staff_profiles%ROWTYPE;
BEGIN
  IF NOT public.fn_is_system_admin() THEN RAISE EXCEPTION '需系統管理員權限'; END IF;
  IF p_full_name IS NULL OR btrim(p_full_name) = '' THEN RAISE EXCEPTION '姓名為必填'; END IF;
  IF p_phone IS NULL OR btrim(p_phone) = '' THEN RAISE EXCEPTION '電話為必填'; END IF;
  IF p_username IS NULL OR btrim(p_username) !~ '^[A-Za-z0-9._-]{4,30}$' THEN
    RAISE EXCEPTION '帳號格式不正確（4～30 碼英數與 . _ -）';
  END IF;
  IF p_email IS NULL OR btrim(p_email) !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' THEN
    RAISE EXCEPTION 'Email 格式不正確';
  END IF;

  SELECT * INTO v_old FROM public.staff_profiles
   WHERE id = p_staff_id AND deleted_at IS NULL
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION '找不到此職員'; END IF;

  IF btrim(p_username) <> v_old.username AND EXISTS (
    SELECT 1 FROM public.volunteer_profiles WHERE username = btrim(p_username)
  ) THEN
    RAISE EXCEPTION '此帳號已被使用';
  END IF;

  PERFORM set_config('app.bypass_profile_guard', 'on', true);
  UPDATE public.staff_profiles
  SET full_name = btrim(p_full_name),
      phone     = btrim(p_phone),
      region    = NULLIF(btrim(p_region), ''),
      email     = btrim(p_email),
      username  = btrim(p_username),
      job_title = p_job_title
  WHERE id = p_staff_id;

  PERFORM public.fn_audit('admin_update_staff_profile', 'staff_profiles', p_staff_id,
    jsonb_build_object('full_name', btrim(p_full_name), 'phone', btrim(p_phone),
                       'region', NULLIF(btrim(p_region), ''), 'job_title', p_job_title,
                       'email', btrim(p_email), 'username', btrim(p_username),
                       'old_email', v_old.email, 'old_username', v_old.username));
EXCEPTION
  WHEN unique_violation THEN
    IF SQLERRM LIKE '%username%' THEN RAISE EXCEPTION '此帳號已被使用';
    ELSE RAISE EXCEPTION '此 Email 已被其他職員使用';
    END IF;
END $$;

-- ---------------------------------------------------------
-- 2. 職員自改個人資料（4 欄；對象固定本人，姓名/職稱不在參數內）
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_update_own_staff_profile(
  p_phone text,
  p_email text,
  p_username text,
  p_region text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_old public.staff_profiles%ROWTYPE;
BEGIN
  IF NOT public.fn_is_staff() THEN RAISE EXCEPTION '需職員權限'; END IF;
  IF p_phone IS NULL OR btrim(p_phone) = '' THEN RAISE EXCEPTION '電話為必填'; END IF;
  IF p_username IS NULL OR btrim(p_username) !~ '^[A-Za-z0-9._-]{4,30}$' THEN
    RAISE EXCEPTION '帳號格式不正確（4～30 碼英數與 . _ -）';
  END IF;
  IF p_email IS NULL OR btrim(p_email) !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' THEN
    RAISE EXCEPTION 'Email 格式不正確';
  END IF;

  SELECT * INTO v_old FROM public.staff_profiles
   WHERE id = auth.uid() AND deleted_at IS NULL
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION '找不到職員資料'; END IF;

  IF btrim(p_username) <> v_old.username AND EXISTS (
    SELECT 1 FROM public.volunteer_profiles WHERE username = btrim(p_username)
  ) THEN
    RAISE EXCEPTION '此帳號已被使用';
  END IF;

  PERFORM set_config('app.bypass_profile_guard', 'on', true);
  UPDATE public.staff_profiles
  SET phone    = btrim(p_phone),
      region   = NULLIF(btrim(p_region), ''),
      email    = btrim(p_email),
      username = btrim(p_username)
  WHERE id = auth.uid();

  PERFORM public.fn_audit('update_own_staff_profile', 'staff_profiles', auth.uid(),
    jsonb_build_object('phone', btrim(p_phone), 'region', NULLIF(btrim(p_region), ''),
                       'email', btrim(p_email), 'username', btrim(p_username),
                       'old_email', v_old.email, 'old_username', v_old.username));
EXCEPTION
  WHEN unique_violation THEN
    IF SQLERRM LIKE '%username%' THEN RAISE EXCEPTION '此帳號已被使用';
    ELSE RAISE EXCEPTION '此 Email 已被其他職員使用';
    END IF;
END $$;

-- ---------------------------------------------------------
-- 3. 後台編輯學生基本資料：擴充 聯絡Email/帳號 兩欄（僅系統管理員）
--    既有 4 欄（姓名/電話/區域/生日）維持在職職員權限；p_email/p_username
--    傳 NULL 代表不更動帳號資訊（一般職員的 UI 不會帶這兩個參數）。
--    代改聯絡 Email 一併清除 email_verified_at（需重新驗證才能報名/簽到）。
--    先移除舊簽名，避免 PostgREST 對 overload 解析歧義。
-- ---------------------------------------------------------
DROP FUNCTION IF EXISTS public.rpc_admin_update_volunteer_profile(uuid, text, text, text, date);

CREATE OR REPLACE FUNCTION public.rpc_admin_update_volunteer_profile(
  p_volunteer_id uuid,
  p_full_name text,
  p_phone text,
  p_region text DEFAULT NULL,
  p_birth_date date DEFAULT NULL,
  p_email text DEFAULT NULL,
  p_username text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_old public.volunteer_profiles%ROWTYPE;
  v_email_changed boolean := false;
BEGIN
  IF NOT public.fn_is_staff() THEN RAISE EXCEPTION '需職員權限'; END IF;
  IF p_full_name IS NULL OR btrim(p_full_name) = '' THEN RAISE EXCEPTION '姓名為必填'; END IF;
  IF p_phone IS NULL OR btrim(p_phone) = '' THEN RAISE EXCEPTION '電話為必填'; END IF;

  -- 帳號資訊（Email/帳號）僅系統管理員可代改
  IF (p_email IS NOT NULL OR p_username IS NOT NULL)
     AND NOT public.fn_is_system_admin() THEN
    RAISE EXCEPTION '僅系統管理員可變更學生的 Email 與帳號';
  END IF;
  IF p_username IS NOT NULL AND btrim(p_username) !~ '^[A-Za-z0-9._-]{4,30}$' THEN
    RAISE EXCEPTION '帳號格式不正確（4～30 碼英數與 . _ -）';
  END IF;
  -- 學生聯絡 Email 允許重複（手足共用家長信箱，見 13），僅驗格式
  IF p_email IS NOT NULL AND btrim(p_email) !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' THEN
    RAISE EXCEPTION 'Email 格式不正確';
  END IF;

  SELECT * INTO v_old FROM public.volunteer_profiles
   WHERE id = p_volunteer_id
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION '找不到此學生'; END IF;

  IF p_username IS NOT NULL AND btrim(p_username) <> v_old.username AND EXISTS (
    SELECT 1 FROM public.staff_profiles WHERE username = btrim(p_username)
  ) THEN
    RAISE EXCEPTION '此帳號已被使用';
  END IF;

  v_email_changed := p_email IS NOT NULL AND btrim(p_email) IS DISTINCT FROM v_old.email;

  PERFORM set_config('app.bypass_profile_guard', 'on', true);
  UPDATE public.volunteer_profiles
  SET full_name  = btrim(p_full_name),
      phone      = btrim(p_phone),
      region     = NULLIF(btrim(p_region), ''),
      birth_date = COALESCE(p_birth_date, birth_date),
      email      = COALESCE(btrim(p_email), email),
      username   = COALESCE(btrim(p_username), username),
      email_verified_at = CASE WHEN v_email_changed THEN NULL ELSE email_verified_at END
  WHERE id = p_volunteer_id;

  PERFORM public.fn_audit('admin_update_volunteer_profile', 'volunteer_profiles', p_volunteer_id,
    jsonb_build_object('full_name', btrim(p_full_name), 'phone', btrim(p_phone),
                       'region', NULLIF(btrim(p_region), ''), 'birth_date', p_birth_date)
    || CASE WHEN p_email IS NULL THEN '{}'::jsonb
            ELSE jsonb_build_object('email', btrim(p_email), 'old_email', v_old.email,
                                    'email_verification_reset', v_email_changed) END
    || CASE WHEN p_username IS NULL THEN '{}'::jsonb
            ELSE jsonb_build_object('username', btrim(p_username), 'old_username', v_old.username) END);
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION '此帳號已被使用';
END $$;

-- ---------------------------------------------------------
-- 4. 學生前台自改登入帳號
--    白名單 trigger（22）擋 username 自改，僅此 RPC 以 bypass 放行；
--    密碼不受影響，現有 session 不中斷（session 綁 user id）。
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_update_own_volunteer_username(
  p_username text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_old public.volunteer_profiles%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION '尚未登入'; END IF;
  IF EXISTS (SELECT 1 FROM public.staff_profiles WHERE id = auth.uid()) THEN
    RAISE EXCEPTION '職員請於後台「帳號設定」修改帳號';
  END IF;
  IF p_username IS NULL OR btrim(p_username) !~ '^[A-Za-z0-9._-]{4,30}$' THEN
    RAISE EXCEPTION '帳號格式不正確（4～30 碼英數與 . _ -）';
  END IF;

  SELECT * INTO v_old FROM public.volunteer_profiles
   WHERE id = auth.uid()
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION '找不到帳號資料'; END IF;

  IF btrim(p_username) = v_old.username THEN RETURN; END IF;

  IF EXISTS (SELECT 1 FROM public.staff_profiles WHERE username = btrim(p_username)) THEN
    RAISE EXCEPTION '此帳號已被使用';
  END IF;

  PERFORM set_config('app.bypass_profile_guard', 'on', true);
  UPDATE public.volunteer_profiles
  SET username = btrim(p_username)
  WHERE id = auth.uid();

  PERFORM public.fn_audit('update_own_volunteer_username', 'volunteer_profiles', auth.uid(),
    jsonb_build_object('username', btrim(p_username), 'old_username', v_old.username));
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION '此帳號已被使用';
END $$;

-- ---------------------------------------------------------
-- 5. 權限收斂
-- ---------------------------------------------------------
REVOKE EXECUTE ON FUNCTION
  public.rpc_admin_update_staff_profile(uuid, text, text, text, text, staff_job_title, text),
  public.rpc_update_own_staff_profile(text, text, text, text),
  public.rpc_admin_update_volunteer_profile(uuid, text, text, text, date, text, text),
  public.rpc_update_own_volunteer_username(text)
FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION
  public.rpc_admin_update_staff_profile(uuid, text, text, text, text, staff_job_title, text),
  public.rpc_update_own_staff_profile(text, text, text, text),
  public.rpc_admin_update_volunteer_profile(uuid, text, text, text, date, text, text),
  public.rpc_update_own_volunteer_username(text)
TO authenticated;

NOTIFY pgrst, 'reload schema';
