-- =========================================================
-- 志工管理平台 26_hard_delete.sql（單筆永久刪除）
-- 需求（2026-07）：後台各列表操作選單提供「永久刪除」（不限已封存）：
--   volunteer_profiles / staff_profiles / activities / announcements。
--   前端一律強確認（輸入對象名稱）；本檔負責 DB 端授權與 FK 連鎖處理。
-- 原則：
--   * 稽核紀錄（audit_logs）永遠保留；被刪帳號的 actor_id 留空（actor_kind 保留身分別）。
--   * 刪職員＝歷史「經手人」欄位留空；CHECK 綁定不可為空者（補登出席、
--     停用審核、客服處理人）改掛執行刪除的系統管理員。
--   * 刪學生＝個資徹底移除：報名／黑名單／停用申請／收藏一併刪除
--     （Auth 帳號由 server action 以 service role 另刪）。
--   * 刪活動＝場次、報名與其觸發的黑名單事件一併刪除（鏡像欄位由 trigger 重算）。
-- 前置：01 → 02 → 07 → 10 → 23 → 24。
-- 冪等：CREATE OR REPLACE / DROP NOT NULL 可重複執行。
-- =========================================================

-- ---------------------------------------------------------
-- 1. 歷史欄位鬆綁：建立者可留空（刪除職員後前端顯示「—」）
-- ---------------------------------------------------------
ALTER TABLE public.activities ALTER COLUMN created_by DROP NOT NULL;
ALTER TABLE public.announcements ALTER COLUMN created_by DROP NOT NULL;

-- ---------------------------------------------------------
-- 2. 活動硬刪防呆放寬：草稿之外，「已封存」或 rpc 內 bypass 亦可刪。
--    （順帶修正：job_purge_expired 清已封存的非草稿活動原本會被此防呆擋下）
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_activity_delete_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF OLD.status <> 'draft'
     AND OLD.deleted_at IS NULL
     AND COALESCE(current_setting('app.bypass_delete_guard', true), '') <> 'on' THEN
    RAISE EXCEPTION '僅草稿或已封存的活動可刪除；已發布活動請改用取消（rpc_cancel_activity）';
  END IF;
  RETURN OLD;
END $$;

-- ---------------------------------------------------------
-- 3. 單筆永久刪除（限系統管理員；白名單資料表）
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_delete_record(p_table text, p_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_name text;
  v_role staff_role;
BEGIN
  IF NOT public.fn_is_system_admin() THEN RAISE EXCEPTION '需系統管理員權限'; END IF;
  IF p_table NOT IN ('volunteer_profiles', 'staff_profiles', 'activities', 'announcements') THEN
    RAISE EXCEPTION '不支援刪除的資料表：%', p_table;
  END IF;

  PERFORM set_config('app.bypass_profile_guard', 'on', true);

  IF p_table = 'staff_profiles' THEN
    IF p_id = auth.uid() THEN RAISE EXCEPTION '不可刪除自己的帳號'; END IF;
    SELECT full_name, role INTO v_name, v_role FROM public.staff_profiles WHERE id = p_id;
    IF v_name IS NULL THEN RAISE EXCEPTION '找不到該職員'; END IF;
    IF EXISTS (SELECT 1 FROM public.volunteer_profiles WHERE assigned_worker_id = p_id) THEN
      RAISE EXCEPTION '該職員名下仍有負責學生，請先移轉再刪除';
    END IF;
    IF v_role = 'system_admin' AND NOT EXISTS (
      SELECT 1 FROM public.staff_profiles
      WHERE role = 'system_admin' AND status = 'active' AND deleted_at IS NULL AND id <> p_id
    ) THEN
      RAISE EXCEPTION '系統至少須保留一位有效的系統管理員';
    END IF;

    -- 歷史經手欄位留空；CHECK 要求必有操作人者改掛執行刪除的管理員
    UPDATE public.activities SET created_by = NULL WHERE created_by = p_id;
    UPDATE public.announcements SET created_by = NULL WHERE created_by = p_id;
    DELETE FROM public.activity_organizers WHERE staff_id = p_id;
    UPDATE public.registrations SET reviewed_by = NULL WHERE reviewed_by = p_id;
    UPDATE public.registrations SET cancel_reviewed_by = NULL WHERE cancel_reviewed_by = p_id;
    UPDATE public.registrations SET attendance_recorded_by = NULL
      WHERE attendance_recorded_by = p_id AND attendance IS DISTINCT FROM 'makeup_attended';
    UPDATE public.registrations SET attendance_recorded_by = auth.uid()
      WHERE attendance_recorded_by = p_id; -- 剩餘＝補登列（reg_makeup_requires_operator）
    UPDATE public.blacklist_events SET released_by = NULL WHERE released_by = p_id;
    UPDATE public.deactivation_requests SET reviewed_by = auth.uid() WHERE reviewed_by = p_id;
    UPDATE public.support_requests SET resolved_by = auth.uid() WHERE resolved_by = p_id;
    UPDATE public.support_requests SET created_by = NULL WHERE created_by = p_id;
    UPDATE public.volunteer_profiles SET deleted_by = NULL WHERE deleted_by = p_id;
    UPDATE public.staff_profiles SET deleted_by = NULL WHERE deleted_by = p_id;
    UPDATE public.activities SET deleted_by = NULL WHERE deleted_by = p_id;
    UPDATE public.announcements SET deleted_by = NULL WHERE deleted_by = p_id;
    UPDATE public.audit_logs SET actor_id = NULL WHERE actor_id = p_id;
    DELETE FROM public.notification_outbox WHERE recipient_user_id = p_id;
    DELETE FROM public.staff_profiles WHERE id = p_id;

  ELSIF p_table = 'volunteer_profiles' THEN
    SELECT full_name INTO v_name FROM public.volunteer_profiles WHERE id = p_id;
    IF v_name IS NULL THEN RAISE EXCEPTION '找不到該學生'; END IF;

    DELETE FROM public.blacklist_events WHERE volunteer_id = p_id; -- 先於報名（registration_id FK）
    DELETE FROM public.registrations WHERE volunteer_id = p_id;
    DELETE FROM public.favorites WHERE volunteer_id = p_id;
    DELETE FROM public.deactivation_requests WHERE volunteer_id = p_id;
    UPDATE public.support_requests SET created_by = NULL WHERE created_by = p_id;
    UPDATE public.audit_logs SET actor_id = NULL WHERE actor_id = p_id;
    DELETE FROM public.notification_outbox WHERE recipient_user_id = p_id;
    DELETE FROM public.volunteer_profiles WHERE id = p_id; -- email 驗證表 CASCADE

  ELSIF p_table = 'activities' THEN
    SELECT title INTO v_name FROM public.activities WHERE id = p_id;
    IF v_name IS NULL THEN RAISE EXCEPTION '找不到該活動'; END IF;

    -- 此活動報名觸發的黑名單事件一併刪除（is_blacklisted 鏡像由 trigger 重算）
    DELETE FROM public.blacklist_events b
      USING public.registrations r, public.activity_sessions s
      WHERE b.registration_id = r.id AND r.activity_session_id = s.id AND s.activity_id = p_id;
    DELETE FROM public.registrations r
      USING public.activity_sessions s
      WHERE r.activity_session_id = s.id AND s.activity_id = p_id;
    PERFORM set_config('app.bypass_delete_guard', 'on', true);
    DELETE FROM public.activities WHERE id = p_id; -- 場次／收藏／主辦人 CASCADE

  ELSE -- announcements
    SELECT title INTO v_name FROM public.announcements WHERE id = p_id;
    IF v_name IS NULL THEN RAISE EXCEPTION '找不到該公告'; END IF;
    DELETE FROM public.announcements WHERE id = p_id;
  END IF;

  PERFORM public.fn_audit('delete_record', p_table, p_id, jsonb_build_object('name', v_name));
END $$;

REVOKE EXECUTE ON FUNCTION public.rpc_delete_record(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_delete_record(text, uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
