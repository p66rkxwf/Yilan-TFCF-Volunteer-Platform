-- =========================================================
-- 志工管理平台 23_soft_delete_and_purge.sql（軟刪/封存＋定期清除）
-- 需求：
--   (A) 系統管理員可「封存」資料（軟刪、可復原）：volunteer_profiles /
--       staff_profiles / activities / announcements。各列表預設隱藏已封存。
--   (B) 定期清除（避免 DB 過大，保留期後台可設定）自動硬清：
--       1. 已封存超保留期的內容（announcements；activities 僅無報名者）
--       2. 已寄送/已讀且逾期的通知（notification_outbox）
--       3. 逾期的稽核日誌（audit_logs，建議先匯出）
--       4. 無出席的終態報名（cancelled/expired/rejected 且 attendance IS NULL）
--       —— 帳號（志工/職員）即使封存也不自動硬刪（會破壞歷史/FK），僅隱藏＋可復原。
--   觸發：自動排程（Cloudflare worker 呼叫 job_purge_expired）＋人工（rpc_purge_now）。
-- 前置：01 → 02 → 03 → 04 → 05。
-- 冪等：ADD COLUMN IF NOT EXISTS / CREATE OR REPLACE 可重複執行。
-- =========================================================

-- ---------------------------------------------------------
-- 1. 封存欄位（deleted_at NULL＝未封存）
-- ---------------------------------------------------------
ALTER TABLE public.volunteer_profiles
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by uuid REFERENCES public.staff_profiles(id);
ALTER TABLE public.staff_profiles
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by uuid REFERENCES public.staff_profiles(id);
ALTER TABLE public.activities
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by uuid REFERENCES public.staff_profiles(id);
ALTER TABLE public.announcements
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by uuid REFERENCES public.staff_profiles(id);

CREATE INDEX IF NOT EXISTS volunteer_profiles_deleted_idx ON public.volunteer_profiles (deleted_at);
CREATE INDEX IF NOT EXISTS staff_profiles_deleted_idx ON public.staff_profiles (deleted_at);
CREATE INDEX IF NOT EXISTS activities_deleted_idx ON public.activities (deleted_at);
CREATE INDEX IF NOT EXISTS announcements_deleted_idx ON public.announcements (deleted_at);

-- ---------------------------------------------------------
-- 2. 保留期設定（後台可調；單位：天）
-- ---------------------------------------------------------
ALTER TABLE public.system_settings
  ADD COLUMN IF NOT EXISTS purge_archived_retention_days integer NOT NULL DEFAULT 30
    CHECK (purge_archived_retention_days > 0),
  ADD COLUMN IF NOT EXISTS purge_notification_retention_days integer NOT NULL DEFAULT 90
    CHECK (purge_notification_retention_days > 0),
  ADD COLUMN IF NOT EXISTS purge_audit_retention_days integer NOT NULL DEFAULT 365
    CHECK (purge_audit_retention_days > 0),
  ADD COLUMN IF NOT EXISTS purge_registration_retention_days integer NOT NULL DEFAULT 365
    CHECK (purge_registration_retention_days > 0);

-- ---------------------------------------------------------
-- 3. 封存 / 還原（系統管理員；限白名單資料表）
--    帳號封存的「停用登入（ban）」由前端 admin client 另做（SQL 無法動 auth ban）。
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_archive_record(p_table text, p_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT public.fn_is_system_admin() THEN RAISE EXCEPTION '需系統管理員權限'; END IF;
  IF p_table NOT IN ('volunteer_profiles', 'staff_profiles', 'activities', 'announcements') THEN
    RAISE EXCEPTION '不支援封存的資料表：%', p_table;
  END IF;
  IF p_table = 'staff_profiles' AND p_id = auth.uid() THEN
    RAISE EXCEPTION '不可封存自己的帳號';
  END IF;

  PERFORM set_config('app.bypass_profile_guard', 'on', true);
  EXECUTE format(
    'UPDATE public.%I SET deleted_at = now(), deleted_by = $1 WHERE id = $2 AND deleted_at IS NULL',
    p_table
  ) USING auth.uid(), p_id;

  PERFORM public.fn_audit('archive_record', p_table, p_id, NULL);
END $$;

CREATE OR REPLACE FUNCTION public.rpc_restore_record(p_table text, p_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT public.fn_is_system_admin() THEN RAISE EXCEPTION '需系統管理員權限'; END IF;
  IF p_table NOT IN ('volunteer_profiles', 'staff_profiles', 'activities', 'announcements') THEN
    RAISE EXCEPTION '不支援還原的資料表：%', p_table;
  END IF;

  PERFORM set_config('app.bypass_profile_guard', 'on', true);
  EXECUTE format(
    'UPDATE public.%I SET deleted_at = NULL, deleted_by = NULL WHERE id = $1',
    p_table
  ) USING p_id;

  PERFORM public.fn_audit('restore_record', p_table, p_id, NULL);
END $$;

REVOKE EXECUTE ON FUNCTION
  public.rpc_archive_record(text, uuid), public.rpc_restore_record(text, uuid)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION
  public.rpc_archive_record(text, uuid), public.rpc_restore_record(text, uuid)
TO authenticated;

-- ---------------------------------------------------------
-- 4. 定期清除（回傳各類清除筆數）。所有 DELETE 皆 FK 安全：
--    只刪無被其他表參照的列（終態報名再以 NOT EXISTS 排除被黑名單事件參照者）。
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.job_purge_expired()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  s record;
  v_arch integer := 0; v_tmp integer;
  v_notif integer := 0;
  v_audit integer := 0;
  v_reg integer := 0;
BEGIN
  SELECT purge_archived_retention_days, purge_notification_retention_days,
         purge_audit_retention_days, purge_registration_retention_days
    INTO s
  FROM public.system_settings;

  -- 4.1 已封存超保留期的內容（announcements 一律可刪；activities 僅無場次者）
  DELETE FROM public.announcements
   WHERE deleted_at IS NOT NULL
     AND deleted_at < now() - make_interval(days => s.purge_archived_retention_days);
  GET DIAGNOSTICS v_tmp = ROW_COUNT; v_arch := v_arch + v_tmp;

  DELETE FROM public.activities a
   WHERE a.deleted_at IS NOT NULL
     AND a.deleted_at < now() - make_interval(days => s.purge_archived_retention_days)
     AND NOT EXISTS (SELECT 1 FROM public.activity_sessions x WHERE x.activity_id = a.id);
  GET DIAGNOSTICS v_tmp = ROW_COUNT; v_arch := v_arch + v_tmp;
  -- 註：帳號（志工/職員）即使封存也不硬刪（FK/歷史保護），僅維持隱藏。

  -- 4.2 已寄送/已讀且逾期的通知（pending 一律保留）
  DELETE FROM public.notification_outbox
   WHERE status <> 'pending'
     AND created_at < now() - make_interval(days => s.purge_notification_retention_days);
  GET DIAGNOSTICS v_notif = ROW_COUNT;

  -- 4.3 逾期稽核日誌
  DELETE FROM public.audit_logs
   WHERE created_at < now() - make_interval(days => s.purge_audit_retention_days);
  GET DIAGNOSTICS v_audit = ROW_COUNT;

  -- 4.4 無出席的終態報名（保住已出席＝時數歷史；排除被黑名單事件參照者）
  DELETE FROM public.registrations r
   WHERE r.status IN ('cancelled', 'expired', 'rejected')
     AND r.attendance IS NULL
     AND r.updated_at < now() - make_interval(days => s.purge_registration_retention_days)
     AND NOT EXISTS (SELECT 1 FROM public.blacklist_events b WHERE b.registration_id = r.id);
  GET DIAGNOSTICS v_reg = ROW_COUNT;

  RETURN jsonb_build_object(
    'archived', v_arch, 'notifications', v_notif,
    'audit_logs', v_audit, 'registrations', v_reg);
END $$;

-- 人工立即清除（系統管理員；內部呼叫 job_purge_expired，以 definer 權限執行）
CREATE OR REPLACE FUNCTION public.rpc_purge_now()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_result jsonb;
BEGIN
  IF NOT public.fn_is_system_admin() THEN RAISE EXCEPTION '需系統管理員權限'; END IF;
  v_result := public.job_purge_expired();
  PERFORM public.fn_audit('manual_purge', 'system_settings', '00000000-0000-0000-0000-000000000001'::uuid, v_result);
  RETURN v_result;
END $$;

-- 排程函式不開放前端；service_role（Cloudflare worker）觸發。人工 RPC 授 authenticated。
REVOKE EXECUTE ON FUNCTION public.job_purge_expired() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.job_purge_expired() TO service_role;

REVOKE EXECUTE ON FUNCTION public.rpc_purge_now() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_purge_now() TO authenticated;

-- ---------------------------------------------------------
-- 5. RLS / 視圖：已封存的活動與公告不對前台（志工/anon）揭露。
--    職員仍看得到（後台「顯示已封存」用），以便還原。
-- ---------------------------------------------------------

-- 5.1 公告：已發布但已封存者，前台與 anon 皆不可見
DROP POLICY IF EXISTS announcements_select_published ON public.announcements;
CREATE POLICY announcements_select_published ON public.announcements
  FOR SELECT USING (status = 'published' AND deleted_at IS NULL AND auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS announcements_select_public ON public.announcements;
CREATE POLICY announcements_select_public ON public.announcements
  FOR SELECT TO anon USING (status = 'published' AND deleted_at IS NULL);

-- 5.2 活動：非草稿但已封存者，志工不可見（職員仍可見）
DROP POLICY IF EXISTS activities_select ON public.activities;
CREATE POLICY activities_select ON public.activities
  FOR SELECT USING ((status <> 'draft' AND deleted_at IS NULL) OR public.fn_is_staff());

-- 5.3 場次：所屬活動已封存者，志工不可見（職員仍可見）
DROP POLICY IF EXISTS sessions_select ON public.activity_sessions;
CREATE POLICY sessions_select ON public.activity_sessions
  FOR SELECT USING (
    public.fn_is_staff()
    OR EXISTS (SELECT 1 FROM public.activities a
               WHERE a.id = activity_id AND a.status <> 'draft' AND a.deleted_at IS NULL)
  );

-- 5.4 owner 視圖：剩餘名額與主辦人聯絡，排除已封存活動
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

CREATE OR REPLACE VIEW public.v_organizer_contacts
WITH (security_invoker = off) AS
SELECT ao.activity_id, sp.full_name, sp.phone
FROM public.activity_organizers ao
JOIN public.staff_profiles sp ON sp.id = ao.staff_id
JOIN public.activities a ON a.id = ao.activity_id
WHERE a.status <> 'draft' AND a.deleted_at IS NULL
  AND sp.status = 'active' AND sp.deleted_at IS NULL;

NOTIFY pgrst, 'reload schema';
