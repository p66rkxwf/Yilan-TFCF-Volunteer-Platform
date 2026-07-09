-- =========================================================
-- 志工管理平台 20_must_change_password.sql（首次登入強制改密碼）
-- 用途：批量建立 / 管理員建立 / 管理員重置密碼（密碼＝帳號）後，強制該使用者
--       首次登入必須改密碼才能使用平台其他功能。
-- 機制：profiles 加 must_change_password 旗標；前端 middleware 於登入後查
--       fn_must_change_password()，為 true 時一律導向 /change-password。
--       旗標「清除」只在改密碼流程以 admin client（service_role，auth.uid()=NULL）
--       更新，使用者不得以自己的 session 自行關閉（下方 trigger 強制）。
-- 前置：01 → 02（覆蓋兩支欄位白名單 trigger 函式）。
-- 冪等：ADD COLUMN IF NOT EXISTS ／ CREATE OR REPLACE 可重複執行。
-- =========================================================

-- ---------------------------------------------------------
-- 1. 旗標欄位（既有列預設 false）
-- ---------------------------------------------------------
ALTER TABLE public.staff_profiles
  ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT false;
ALTER TABLE public.volunteer_profiles
  ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT false;

-- ---------------------------------------------------------
-- 2. 查詢目前登入者是否需強制改密碼（middleware 用）
--    兩張互斥表任一為 true 即 true；未登入/查無 → false
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_must_change_password()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT COALESCE(
    (SELECT must_change_password FROM public.staff_profiles WHERE id = auth.uid()),
    (SELECT must_change_password FROM public.volunteer_profiles WHERE id = auth.uid()),
    false
  );
$$;

REVOKE EXECUTE ON FUNCTION public.fn_must_change_password() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_must_change_password() TO authenticated;

-- ---------------------------------------------------------
-- 3. 志工欄位白名單：多擋 must_change_password（本人不得自行變更）
--    其餘與 02_triggers.sql 完全相同。
-- ---------------------------------------------------------
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
       OR NEW.must_change_password IS DISTINCT FROM OLD.must_change_password
       OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION '志工僅能修改姓名、電話、區域；其餘欄位由管理員或系統維護';
    END IF;
  END IF;
  RETURN NEW;
END $$;

-- ---------------------------------------------------------
-- 4. 職員更新防護：多擋「本人自改 must_change_password」
--    （admin client / bypass 旗標下的系統流程不受限）。其餘與 02 相同。
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

NOTIFY pgrst, 'reload schema';
