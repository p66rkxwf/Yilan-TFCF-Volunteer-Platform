-- =========================================================
-- 志工管理平台 22_lock_name_admin_edit.sql（姓名鎖定＋後台編輯）
-- 需求：使用者不得自行修改姓名，改由後台（職員/管理員）維護。
--   - 志工：自助僅能改電話、區域（原本可改姓名，現移除姓名）。
--   - 職員：非系統管理員不得自改姓名（系統管理員可改自己與他人）。
--   - 後台編輯志工基本資料（姓名/電話/區域/生日）：新增 rpc_admin_update_volunteer_profile。
-- 前置：01 → 02 → 20 → 21（覆蓋兩支白名單 trigger 的最新版本）。
-- 冪等：CREATE OR REPLACE 可重複執行。
-- =========================================================

-- ---------------------------------------------------------
-- 1. 志工欄位白名單：多擋 full_name（自助只剩電話/區域）
--    沿用 21 的版本，額外把 full_name 納入禁改欄位。
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_volunteer_self_update_whitelist()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF current_setting('app.bypass_profile_guard', true) = 'on' THEN
    RETURN NEW;
  END IF;
  IF auth.uid() = OLD.id
     AND NOT EXISTS (SELECT 1 FROM public.staff_profiles WHERE id = auth.uid()) THEN
    IF NEW.full_name IS DISTINCT FROM OLD.full_name
       OR NEW.status IS DISTINCT FROM OLD.status
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
      RAISE EXCEPTION '志工僅能修改電話、區域；姓名等其餘欄位請洽管理員';
    END IF;
  END IF;
  RETURN NEW;
END $$;

-- ---------------------------------------------------------
-- 2. 職員更新防護：非系統管理員不得自改姓名
--    （系統管理員可改自己與他人；他人由 staff_update_by_sysadmin policy 放行）。
--    沿用 20 的版本，額外加入 full_name 自改防護。
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_staff_update_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_actor_role staff_role;
BEGIN
  IF current_setting('app.bypass_profile_guard', true) = 'on' THEN
    RETURN NEW;
  END IF;

  -- must_change_password 僅能由改密碼流程（admin client）清除；本人不得自行關閉
  IF auth.uid() = OLD.id
     AND NEW.must_change_password IS DISTINCT FROM OLD.must_change_password THEN
    RAISE EXCEPTION 'must_change_password 不可自行變更，請透過改密碼流程';
  END IF;

  SELECT role INTO v_actor_role FROM public.staff_profiles
   WHERE id = auth.uid() AND status = 'active';

  -- 姓名鎖定：非系統管理員不得改自己的姓名（請洽系統管理員）
  IF v_actor_role IS DISTINCT FROM 'system_admin'
     AND auth.uid() = OLD.id
     AND NEW.full_name IS DISTINCT FROM OLD.full_name THEN
    RAISE EXCEPTION '姓名請洽系統管理員修改';
  END IF;

  IF v_actor_role IS DISTINCT FROM 'system_admin' THEN
    IF NEW.role IS DISTINCT FROM OLD.role
       OR NEW.status IS DISTINCT FROM OLD.status
       OR NEW.job_title IS DISTINCT FROM OLD.job_title
       OR NEW.username IS DISTINCT FROM OLD.username
       OR NEW.email IS DISTINCT FROM OLD.email THEN
      RAISE EXCEPTION '僅系統管理員可變更職員的角色/狀態/職稱/帳號/信箱';
    END IF;
  END IF;

  IF OLD.role = 'system_admin' AND OLD.status = 'active'
     AND (NEW.role <> 'system_admin' OR NEW.status <> 'active') THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.staff_profiles
      WHERE role = 'system_admin' AND status = 'active' AND id <> OLD.id
    ) THEN
      RAISE EXCEPTION '系統至少須保留一位有效的系統管理員';
    END IF;
  END IF;
  RETURN NEW;
END $$;

-- ---------------------------------------------------------
-- 3. 後台編輯志工基本資料（姓名/電話/區域/生日）
--    權限：在職職員（比照帳號審核／指派等日常維護）。學制沿用年度審查 RPC，
--    以維持 last_grade_reviewed_at 語意，不在此更動。
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_admin_update_volunteer_profile(
  p_volunteer_id uuid,
  p_full_name text,
  p_phone text,
  p_region text DEFAULT NULL,
  p_birth_date date DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT public.fn_is_staff() THEN RAISE EXCEPTION '需職員權限'; END IF;
  IF p_full_name IS NULL OR btrim(p_full_name) = '' THEN RAISE EXCEPTION '姓名為必填'; END IF;
  IF p_phone IS NULL OR btrim(p_phone) = '' THEN RAISE EXCEPTION '電話為必填'; END IF;

  PERFORM set_config('app.bypass_profile_guard', 'on', true);
  UPDATE public.volunteer_profiles
  SET full_name = btrim(p_full_name),
      phone = btrim(p_phone),
      region = NULLIF(btrim(p_region), ''),
      birth_date = COALESCE(p_birth_date, birth_date)
  WHERE id = p_volunteer_id;
  IF NOT FOUND THEN RAISE EXCEPTION '找不到此學生'; END IF;

  PERFORM public.fn_audit('admin_update_volunteer_profile', 'volunteer_profiles', p_volunteer_id,
    jsonb_build_object('full_name', btrim(p_full_name), 'phone', btrim(p_phone),
                       'region', NULLIF(btrim(p_region), ''), 'birth_date', p_birth_date));
END $$;

REVOKE EXECUTE ON FUNCTION
  public.rpc_admin_update_volunteer_profile(uuid, text, text, text, date)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION
  public.rpc_admin_update_volunteer_profile(uuid, text, text, text, date)
TO authenticated;

NOTIFY pgrst, 'reload schema';
