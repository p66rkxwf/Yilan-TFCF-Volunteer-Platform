-- =========================================================
-- 志工管理平台 24_audit_expansion.sql（稽核強化：志工操作＋職員直寫）
-- 需求：
--   (A) 補上「志工端」操作日誌（原本 fn_audit 只認職員，志工動作 actor 為 NULL，
--       且 registrations 的報名/取消/自行簽到根本沒寫 audit）。
--   (B)「職員端」直寫操作（活動發布/截止、場次增修刪、公告增修刪、系統參數/期間）
--       原本無 audit，改以 AFTER trigger 補記。
-- 作法：
--   1. audit_logs.actor_id 外鍵由 staff_profiles 放寬到 auth.users，並加 actor_kind
--      （staff/volunteer/system），fn_audit 一律記 auth.uid() 與其身分別。
--   2. registrations 加志工自助動作的 audit trigger（只記志工本人；職員/系統走既有 RPC）。
--   3. 各直寫表加 audit trigger（只記職員 actor，避免重複記錄排程/RPC 已記的動作）。
-- 前置：01 → 02 → 04。
-- 冪等：CREATE OR REPLACE / DROP..IF EXISTS 可重複執行。
-- =========================================================

-- ---------------------------------------------------------
-- 1. actor 欄位：放寬外鍵到 auth.users、加 actor_kind
-- ---------------------------------------------------------
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS actor_kind text;
ALTER TABLE public.audit_logs DROP CONSTRAINT IF EXISTS audit_logs_actor_id_fkey;
ALTER TABLE public.audit_logs
  ADD CONSTRAINT audit_logs_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES auth.users(id);

-- 既有列回填 actor_kind：舊版 fn_audit 只記職員 → actor_id 有值即職員，NULL 即系統。
UPDATE public.audit_logs SET actor_kind = 'staff'
  WHERE actor_kind IS NULL AND actor_id IS NOT NULL;
UPDATE public.audit_logs SET actor_kind = 'system'
  WHERE actor_kind IS NULL AND actor_id IS NULL;

-- ---------------------------------------------------------
-- 2. fn_audit 重寫：記 auth.uid() 與身分別（原為 sql，改 plpgsql）
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_audit(
  p_action text, p_table text, p_id uuid, p_detail jsonb DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_kind text;
BEGIN
  IF v_uid IS NULL THEN
    v_kind := 'system';
  ELSIF EXISTS (SELECT 1 FROM public.staff_profiles WHERE id = v_uid) THEN
    v_kind := 'staff';
  ELSIF EXISTS (SELECT 1 FROM public.volunteer_profiles WHERE id = v_uid) THEN
    v_kind := 'volunteer';
  ELSE
    v_kind := 'system';
  END IF;

  INSERT INTO public.audit_logs (actor_id, actor_kind, action, target_table, target_id, detail)
  VALUES (v_uid, v_kind, p_action, p_table, p_id, p_detail);
END $$;

-- ---------------------------------------------------------
-- 3. 志工自助動作 audit（報名 / 取消 / 自行簽到）
--    只記「志工本人」發起者；職員代操作與排程各自於 RPC/job 記錄，避免重複。
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_audit_volunteer_registration()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> COALESCE(NEW.volunteer_id, OLD.volunteer_id) THEN
    RETURN NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM public.staff_profiles WHERE id = auth.uid()) THEN
    RETURN NULL;
  END IF;

  IF TG_OP = 'INSERT' THEN
    PERFORM public.fn_audit('volunteer_register', 'registrations', NEW.id,
      jsonb_build_object('session_id', NEW.activity_session_id));
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('cancelled', 'cancel_pending') THEN
      PERFORM public.fn_audit('volunteer_cancel', 'registrations', NEW.id,
        jsonb_build_object('status', NEW.status));
    END IF;
    IF NEW.attendance IS DISTINCT FROM OLD.attendance
       AND NEW.attendance = 'attended' AND NEW.attendance_recorded_by IS NULL THEN
      PERFORM public.fn_audit('volunteer_self_checkin', 'registrations', NEW.id, NULL);
    END IF;
  END IF;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS audit_volunteer_registration ON public.registrations;
CREATE TRIGGER audit_volunteer_registration
  AFTER INSERT OR UPDATE ON public.registrations
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_volunteer_registration();

-- ---------------------------------------------------------
-- 4. 職員直寫 audit（只記職員 actor）
-- ---------------------------------------------------------

-- 4.1 公告：新增 / 內容或狀態變更 / 刪除（封存 deleted_at-only 變更由 archive RPC 記，此處略）
CREATE OR REPLACE FUNCTION public.fn_audit_announcement()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.staff_profiles WHERE id = auth.uid()) THEN RETURN NULL; END IF;
  IF TG_OP = 'INSERT' THEN
    PERFORM public.fn_audit('create_announcement', 'announcements', NEW.id,
      jsonb_build_object('title', NEW.title, 'status', NEW.status));
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM public.fn_audit('delete_announcement', 'announcements', OLD.id,
      jsonb_build_object('title', OLD.title));
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.status IS DISTINCT FROM OLD.status OR NEW.is_pinned IS DISTINCT FROM OLD.is_pinned
       OR NEW.title IS DISTINCT FROM OLD.title OR NEW.content IS DISTINCT FROM OLD.content THEN
      PERFORM public.fn_audit('update_announcement', 'announcements', NEW.id,
        jsonb_build_object('status', NEW.status, 'is_pinned', NEW.is_pinned));
    END IF;
  END IF;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS audit_announcement ON public.announcements;
CREATE TRIGGER audit_announcement AFTER INSERT OR UPDATE OR DELETE ON public.announcements
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_announcement();

-- 4.2 活動：手動發布(open)/截止(closed)（cancelled/completed 由 RPC/排程記）
CREATE OR REPLACE FUNCTION public.fn_audit_activity_status()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.staff_profiles WHERE id = auth.uid()) THEN RETURN NULL; END IF;
  IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('open', 'closed') THEN
    PERFORM public.fn_audit('activity_' || NEW.status, 'activities', NEW.id,
      jsonb_build_object('from', OLD.status, 'to', NEW.status));
  END IF;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS audit_activity_status ON public.activities;
CREATE TRIGGER audit_activity_status AFTER UPDATE OF status ON public.activities
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_activity_status();

-- 4.3 場次：新增 / 內容變更（起訖/名額/截止）/ 刪除（取消由 rpc_cancel_session 記）
CREATE OR REPLACE FUNCTION public.fn_audit_session()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.staff_profiles WHERE id = auth.uid()) THEN RETURN NULL; END IF;
  IF TG_OP = 'INSERT' THEN
    PERFORM public.fn_audit('create_session', 'activity_sessions', NEW.id,
      jsonb_build_object('activity_id', NEW.activity_id, 'start_at', NEW.start_at));
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM public.fn_audit('delete_session', 'activity_sessions', OLD.id,
      jsonb_build_object('activity_id', OLD.activity_id));
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.start_at IS DISTINCT FROM OLD.start_at OR NEW.end_at IS DISTINCT FROM OLD.end_at
       OR NEW.capacity IS DISTINCT FROM OLD.capacity
       OR NEW.registration_deadline_at IS DISTINCT FROM OLD.registration_deadline_at THEN
      PERFORM public.fn_audit('update_session', 'activity_sessions', NEW.id,
        jsonb_build_object('activity_id', NEW.activity_id));
    END IF;
  END IF;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS audit_session ON public.activity_sessions;
CREATE TRIGGER audit_session AFTER INSERT OR UPDATE OR DELETE ON public.activity_sessions
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_session();

-- 4.4 系統參數（單列）更新
CREATE OR REPLACE FUNCTION public.fn_audit_settings()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.staff_profiles WHERE id = auth.uid()) THEN RETURN NULL; END IF;
  PERFORM public.fn_audit('update_system_settings', 'system_settings',
    '00000000-0000-0000-0000-000000000001'::uuid, NULL);
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS audit_settings ON public.system_settings;
CREATE TRIGGER audit_settings AFTER UPDATE ON public.system_settings
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_settings();

-- 4.5 期間：新增 / 刪除
CREATE OR REPLACE FUNCTION public.fn_audit_period()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.staff_profiles WHERE id = auth.uid()) THEN RETURN NULL; END IF;
  IF TG_OP = 'INSERT' THEN
    PERFORM public.fn_audit('create_period', 'periods', NEW.id,
      jsonb_build_object('label', NEW.label));
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM public.fn_audit('delete_period', 'periods', OLD.id,
      jsonb_build_object('label', OLD.label));
  END IF;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS audit_period ON public.periods;
CREATE TRIGGER audit_period AFTER INSERT OR DELETE ON public.periods
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_period();

-- ---------------------------------------------------------
-- 5. 權限收斂：本檔 audit trigger 函式僅供觸發機制呼叫
-- ---------------------------------------------------------
REVOKE EXECUTE ON FUNCTION
  public.fn_audit_volunteer_registration(),
  public.fn_audit_announcement(),
  public.fn_audit_activity_status(),
  public.fn_audit_session(),
  public.fn_audit_settings(),
  public.fn_audit_period()
FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';
