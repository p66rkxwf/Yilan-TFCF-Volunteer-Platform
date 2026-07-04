-- =========================================================
-- 志工管理平台 02_triggers.sql（定案版）
-- 內容：共用 helper（audit/outbox）、updated_at、一致性同步、
--       狀態機防護、欄位白名單、#25/#26b 連動邏輯、auth email 同步
-- 前置：01_schema.sql
-- =========================================================

-- ---------------------------------------------------------
-- 0. 共用 helper：稽核與通知（供 trigger / RPC / 排程共用）
-- ---------------------------------------------------------

-- 寫入操作紀錄；actor 自動取 auth.uid()，非職員（志工/系統）時為 NULL
CREATE OR REPLACE FUNCTION public.fn_audit(
  p_action text, p_table text, p_id uuid, p_detail jsonb DEFAULT NULL
) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  INSERT INTO public.audit_logs (actor_id, action, target_table, target_id, detail)
  VALUES (
    (SELECT id FROM public.staff_profiles WHERE id = auth.uid()),
    p_action, p_table, p_id, p_detail
  );
$$;

-- 寫入通知佇列（Transactional Outbox）；dedup_key 相同者只寫一次（#28）
CREATE OR REPLACE FUNCTION public.fn_notify(
  p_recipient uuid, p_type notification_type,
  p_payload jsonb DEFAULT '{}'::jsonb, p_dedup text DEFAULT NULL
) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  INSERT INTO public.notification_outbox (recipient_user_id, notification_type, payload, dedup_key)
  VALUES (p_recipient, p_type, p_payload, p_dedup)
  ON CONFLICT (dedup_key) WHERE dedup_key IS NOT NULL DO NOTHING;
$$;

-- ---------------------------------------------------------
-- 1. updated_at 自動維護（自寫函式而非 moddatetime extension，
--    降低對 Supabase 的依賴，利於日後遷移）
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_set_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.staff_profiles
  FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.volunteer_profiles
  FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.activities
  FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.activity_sessions
  FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.registrations
  FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.announcements
  FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.system_settings
  FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.grade_hour_thresholds
  FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.grade_reference_ages
  FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.periods
  FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.blacklist_events
  FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.notification_outbox
  FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();

-- ---------------------------------------------------------
-- 2. 職員 / 志工 同帳號互斥
--    （SECURITY DEFINER：否則 RLS 會讓對方表的列「看不見」而誤放行）
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_check_staff_volunteer_exclusive()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_TABLE_NAME = 'staff_profiles' THEN
    IF EXISTS (SELECT 1 FROM public.volunteer_profiles WHERE id = NEW.id) THEN
      RAISE EXCEPTION '此帳號已是志工，同一帳號不可同時為職員與志工';
    END IF;
  ELSE
    IF EXISTS (SELECT 1 FROM public.staff_profiles WHERE id = NEW.id) THEN
      RAISE EXCEPTION '此帳號已是職員，同一帳號不可同時為職員與志工';
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER staff_volunteer_exclusive BEFORE INSERT ON public.staff_profiles
  FOR EACH ROW EXECUTE FUNCTION public.fn_check_staff_volunteer_exclusive();
CREATE TRIGGER staff_volunteer_exclusive BEFORE INSERT ON public.volunteer_profiles
  FOR EACH ROW EXECUTE FUNCTION public.fn_check_staff_volunteer_exclusive();

-- ---------------------------------------------------------
-- 3. 負責社工檢查：assigned_worker 必須為「在職」且職稱 social_worker
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_check_assigned_worker()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.assigned_worker_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.staff_profiles
    WHERE id = NEW.assigned_worker_id
      AND job_title = 'social_worker'
      AND status = 'active'
  ) THEN
    RAISE EXCEPTION '負責社工必須為在職且職稱為 social_worker 的職員';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER check_assigned_worker
  BEFORE INSERT OR UPDATE OF assigned_worker_id ON public.volunteer_profiles
  FOR EACH ROW EXECUTE FUNCTION public.fn_check_assigned_worker();

-- ---------------------------------------------------------
-- 4. is_blacklisted 鏡像同步（唯一事實來源 = blacklist_events）
--    多筆事件重疊時自然正確：全部 released 才歸 false
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_sync_is_blacklisted()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_volunteer uuid := COALESCE(NEW.volunteer_id, OLD.volunteer_id);
BEGIN
  PERFORM set_config('app.bypass_profile_guard', 'on', true);
  UPDATE public.volunteer_profiles
  SET is_blacklisted = EXISTS (
    SELECT 1 FROM public.blacklist_events
    WHERE volunteer_id = v_volunteer AND released_at IS NULL
  )
  WHERE id = v_volunteer;
  RETURN NULL;
END $$;

CREATE TRIGGER sync_is_blacklisted
  AFTER INSERT OR UPDATE OR DELETE ON public.blacklist_events
  FOR EACH ROW EXECUTE FUNCTION public.fn_sync_is_blacklisted();

-- ---------------------------------------------------------
-- 5. 出席確定時自動帶入時數（依場次時長；歷史紀錄，場次改時間不回溯）
--    僅在 service_hours 為 NULL 時帶入 → 自訂活動若需覆寫時數，RPC 可先給值
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_fill_hours_on_attendance()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.attendance IN ('attended', 'makeup_attended') THEN
    IF NEW.service_hours IS NULL THEN
      SELECT round(EXTRACT(EPOCH FROM (end_at - start_at)) / 3600.0, 2)
        INTO NEW.service_hours
        FROM public.activity_sessions WHERE id = NEW.activity_session_id;
    END IF;
  ELSE
    NEW.service_hours := NULL;  -- absent 或未記錄 → 無時數（與 CHECK 一致）
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER fill_hours BEFORE INSERT OR UPDATE OF attendance ON public.registrations
  FOR EACH ROW EXECUTE FUNCTION public.fn_fill_hours_on_attendance();

-- ---------------------------------------------------------
-- 6. 志工本人直接 UPDATE 的欄位白名單（僅姓名/電話/區域）
--    其餘欄位由管理員 RPC 或系統維護；definer 流程以 bypass 旗標放行
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
       OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION '志工僅能修改姓名、電話、區域；其餘欄位由管理員或系統維護';
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER volunteer_self_update_whitelist BEFORE UPDATE ON public.volunteer_profiles
  FOR EACH ROW EXECUTE FUNCTION public.fn_volunteer_self_update_whitelist();

-- ---------------------------------------------------------
-- 7. 職員表更新防護：
--    (a) 非系統管理員不得變更 role/status/job_title/username/email
--    (b) 防鎖死：不得移除最後一位有效系統管理員
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_staff_update_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_actor_role staff_role;
BEGIN
  IF current_setting('app.bypass_profile_guard', true) = 'on' THEN
    RETURN NEW;
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

CREATE TRIGGER staff_update_guard BEFORE UPDATE ON public.staff_profiles
  FOR EACH ROW EXECUTE FUNCTION public.fn_staff_update_guard();

-- ---------------------------------------------------------
-- 8. 報名狀態機（defense-in-depth；正常寫入僅經 RPC）
--    pending → approved | rejected | cancelled | expired
--    approved → cancel_pending | cancelled
--    cancel_pending → approved(駁回取消) | cancelled
--    rejected / cancelled / expired 為終態
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_registration_transition_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE ok boolean;
BEGIN
  IF NEW.status = OLD.status THEN RETURN NEW; END IF;
  ok := CASE OLD.status
    WHEN 'pending'        THEN NEW.status IN ('approved','rejected','cancelled','expired')
    WHEN 'approved'       THEN NEW.status IN ('cancel_pending','cancelled')
    WHEN 'cancel_pending' THEN NEW.status IN ('approved','cancelled')
    ELSE false
  END;
  IF NOT ok THEN
    RAISE EXCEPTION '不合法的報名狀態轉換：% → %', OLD.status, NEW.status;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER registration_transition BEFORE UPDATE OF status ON public.registrations
  FOR EACH ROW EXECUTE FUNCTION public.fn_registration_transition_guard();

-- ---------------------------------------------------------
-- 9. 活動狀態機（#32）＋「開放報名需至少一個有效場次」
--    draft → open → closed → completed；cancelled 可自 draft/open/closed 進入
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_activity_transition_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE ok boolean;
BEGIN
  IF NEW.status = OLD.status THEN RETURN NEW; END IF;
  ok := CASE OLD.status
    WHEN 'draft'  THEN NEW.status IN ('open','cancelled')
    WHEN 'open'   THEN NEW.status IN ('closed','cancelled')
    WHEN 'closed' THEN NEW.status IN ('completed','cancelled')
    ELSE false
  END;
  IF NOT ok THEN
    RAISE EXCEPTION '不合法的活動狀態轉換：% → %', OLD.status, NEW.status;
  END IF;
  IF NEW.status = 'open' AND NOT EXISTS (
    SELECT 1 FROM public.activity_sessions
    WHERE activity_id = NEW.id AND cancelled_at IS NULL
  ) THEN
    RAISE EXCEPTION '活動至少需有一個有效場次才能開放報名';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER activity_transition BEFORE UPDATE OF status ON public.activities
  FOR EACH ROW EXECUTE FUNCTION public.fn_activity_transition_guard();

-- ---------------------------------------------------------
-- 10. 場次驗證：截止預設值、歷史保護
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_session_validate()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_activity_status activity_status;
BEGIN
  -- 未給截止時間 → 預設可報名至該場開始（BEFORE trigger 可在 NOT NULL 檢查前補值）
  IF NEW.registration_deadline_at IS NULL THEN
    NEW.registration_deadline_at := NEW.start_at;
  END IF;

  SELECT status INTO v_activity_status FROM public.activities WHERE id = NEW.activity_id;

  IF TG_OP = 'INSERT' AND v_activity_status IN ('completed', 'cancelled') THEN
    RAISE EXCEPTION '已結束或已取消的活動不可新增場次';
  END IF;

  IF TG_OP = 'UPDATE' THEN
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
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER session_validate BEFORE INSERT OR UPDATE ON public.activity_sessions
  FOR EACH ROW EXECUTE FUNCTION public.fn_session_validate();

-- ---------------------------------------------------------
-- 11. 活動硬刪防呆：僅草稿可刪；已發布請走 rpc_cancel_activity
--     （場次/收藏由 FK CASCADE 清除；有報名的場次會被 registrations FK 擋下）
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_activity_delete_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF OLD.status <> 'draft' THEN
    RAISE EXCEPTION '僅草稿活動可刪除；已發布活動請改用取消（rpc_cancel_activity）';
  END IF;
  RETURN OLD;
END $$;

CREATE TRIGGER activity_delete_guard BEFORE DELETE ON public.activities
  FOR EACH ROW EXECUTE FUNCTION public.fn_activity_delete_guard();

-- ---------------------------------------------------------
-- 12. #26b 場次時間異動：通知所有有效報名者＋重跑衝突檢查
--     偵測到衝突 → 只通知志工與主辦人、寫稽核，不自動取消（既定原則）
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_session_time_changed()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  r record;
  v_conflict boolean;
  v_title text;
BEGIN
  IF NEW.start_at = OLD.start_at AND NEW.end_at = OLD.end_at THEN
    RETURN NULL;
  END IF;
  SELECT title INTO v_title FROM public.activities WHERE id = NEW.activity_id;

  FOR r IN
    SELECT id, volunteer_id FROM public.registrations
    WHERE activity_session_id = NEW.id
      AND status IN ('pending', 'approved', 'cancel_pending')
  LOOP
    PERFORM public.fn_notify(r.volunteer_id, 'session_time_changed',
      jsonb_build_object('session_id', NEW.id, 'activity_title', v_title,
                         'new_start_at', NEW.start_at, 'new_end_at', NEW.end_at));

    SELECT EXISTS (
      SELECT 1
      FROM public.registrations r2
      JOIN public.activity_sessions s2 ON s2.id = r2.activity_session_id
      WHERE r2.volunteer_id = r.volunteer_id
        AND r2.id <> r.id
        AND r2.status IN ('pending', 'approved', 'cancel_pending')
        AND s2.cancelled_at IS NULL
        AND tstzrange(s2.start_at, s2.end_at) && tstzrange(NEW.start_at, NEW.end_at)
    ) INTO v_conflict;

    IF v_conflict THEN
      PERFORM public.fn_notify(r.volunteer_id, 'schedule_conflict_alert',
        jsonb_build_object('session_id', NEW.id, 'registration_id', r.id,
                           'activity_title', v_title));
      INSERT INTO public.notification_outbox (recipient_user_id, notification_type, payload)
      SELECT ao.staff_id, 'schedule_conflict_alert',
             jsonb_build_object('session_id', NEW.id, 'registration_id', r.id,
                                'volunteer_id', r.volunteer_id, 'activity_title', v_title)
      FROM public.activity_organizers ao
      WHERE ao.activity_id = NEW.activity_id;

      PERFORM public.fn_audit('session_time_conflict_detected', 'registrations', r.id,
        jsonb_build_object('session_id', NEW.id));
    END IF;
  END LOOP;
  RETURN NULL;
END $$;

CREATE TRIGGER session_time_changed
  AFTER UPDATE OF start_at, end_at ON public.activity_sessions
  FOR EACH ROW EXECUTE FUNCTION public.fn_session_time_changed();

-- ---------------------------------------------------------
-- 13. #25 缺席改判補登 → 自動解除對應黑名單事件
--     （released_at 變動會連動 trigger 4 重算 is_blacklisted）
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_makeup_release_blacklist()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF OLD.attendance = 'absent' AND NEW.attendance = 'makeup_attended' THEN
    UPDATE public.blacklist_events
    SET released_at = now(),
        released_by = NEW.attendance_recorded_by,
        note = COALESCE(note || E'\n', '') || '補登出席自動解除'
    WHERE registration_id = NEW.id AND released_at IS NULL;

    IF FOUND THEN
      PERFORM public.fn_audit('blacklist_released_by_makeup', 'registrations', NEW.id, NULL);
    END IF;
  END IF;
  RETURN NULL;
END $$;

CREATE TRIGGER makeup_release_blacklist
  AFTER UPDATE OF attendance ON public.registrations
  FOR EACH ROW EXECUTE FUNCTION public.fn_makeup_release_blacklist();

-- ---------------------------------------------------------
-- 14. auth.users email 變更 → 單向同步至 profile（需求文件 5-3）
--     一份事實（auth.users）＋一份鏡像（profiles.email）
--     註：於 auth.users 建 trigger 需 postgres 權限；Supabase SQL Editor 可執行
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_sync_auth_email()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.email IS DISTINCT FROM OLD.email THEN
    PERFORM set_config('app.bypass_profile_guard', 'on', true);
    UPDATE public.staff_profiles     SET email = NEW.email WHERE id = NEW.id;
    UPDATE public.volunteer_profiles SET email = NEW.email WHERE id = NEW.id;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER sync_auth_email AFTER UPDATE OF email ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.fn_sync_auth_email();

-- ---------------------------------------------------------
-- 15. 權限收斂：本檔函式皆為 trigger 專用（RETURNS trigger），
--     只應由觸發機制呼叫，不開放前端經 /rest/v1/rpc 直接呼叫
--     （Postgres 本就會拒絕非 trigger 情境直接呼叫 trigger 函式，
--     這裡的 REVOKE 屬縱深防禦，同時滿足 Supabase linter 的
--     anon/authenticated_security_definer_function_executable 檢查）。
--     fn_audit / fn_notify 已於 04_rpc_functions.sql 收斂，不重複列出。
-- ---------------------------------------------------------
REVOKE EXECUTE ON FUNCTION
  public.fn_set_updated_at(),
  public.fn_check_staff_volunteer_exclusive(),
  public.fn_check_assigned_worker(),
  public.fn_sync_is_blacklisted(),
  public.fn_fill_hours_on_attendance(),
  public.fn_volunteer_self_update_whitelist(),
  public.fn_staff_update_guard(),
  public.fn_registration_transition_guard(),
  public.fn_activity_transition_guard(),
  public.fn_session_validate(),
  public.fn_activity_delete_guard(),
  public.fn_session_time_changed(),
  public.fn_makeup_release_blacklist(),
  public.fn_sync_auth_email()
FROM PUBLIC, anon, authenticated;
