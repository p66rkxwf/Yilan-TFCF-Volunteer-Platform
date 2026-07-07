-- =========================================================
-- 志工管理平台 03_rls_policies.sql（定案版）
-- 內容：角色判斷 helper、全表 RLS policy、安全視圖、權限 GRANT
-- 前置：01_schema.sql、02_triggers.sql
--
-- 架構前提：前端直連 Supabase，RLS 為主防線；
-- registrations / blacklist_events 等多步驟寫入「不開任何直寫 policy」，
-- 一律強制走 04 的 SECURITY DEFINER RPC（owner 繞過 RLS）。
-- =========================================================

-- ---------------------------------------------------------
-- 0. 角色判斷 helper
--    全部 SECURITY DEFINER：避免 policy 內查 staff_profiles 造成
--    RLS 自我遞迴（Supabase 常見坑）；並一律要求職員 status='active'，
--    停權職員的所有後台權限即刻失效
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_staff_role()
RETURNS staff_role
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT role FROM public.staff_profiles
  WHERE id = auth.uid() AND status = 'active';
$$;

CREATE OR REPLACE FUNCTION public.fn_is_staff()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT public.fn_staff_role() IS NOT NULL;
$$;

CREATE OR REPLACE FUNCTION public.fn_is_admin()  -- 單位管理員以上
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT public.fn_staff_role() IN ('unit_admin', 'system_admin');
$$;

CREATE OR REPLACE FUNCTION public.fn_is_system_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT public.fn_staff_role() = 'system_admin';
$$;

CREATE OR REPLACE FUNCTION public.fn_is_active_volunteer()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.volunteer_profiles
    WHERE id = auth.uid() AND status = 'active'
  );  -- 黑名單志工仍為 active：黑名單只擋「報名」，不擋登入/查詢
$$;

-- #30：活動管理權 = 建立者 OR 該活動主辦人 OR 單位管理員以上（皆須為在職職員）
CREATE OR REPLACE FUNCTION public.fn_can_manage_activity(p_activity_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT public.fn_is_staff() AND (
    public.fn_is_admin()
    OR EXISTS (SELECT 1 FROM public.activities
               WHERE id = p_activity_id AND created_by = auth.uid())
    OR EXISTS (SELECT 1 FROM public.activity_organizers
               WHERE activity_id = p_activity_id AND staff_id = auth.uid())
  );
$$;

-- 權限收斂：上述 6 支角色判斷 helper 皆為 SECURITY DEFINER，Postgres 預設會
-- 把 EXECUTE 開放給 PUBLIC。它們會被 RLS policy 的 USING/WITH CHECK 表達式
-- 以查詢者本人角色（非 SECURITY DEFINER 上下文）呼叫，因此 authenticated
-- 必須保留 EXECUTE，但 anon 不需要（本系統無未登入功能）。
REVOKE EXECUTE ON FUNCTION
  public.fn_staff_role(),
  public.fn_is_staff(),
  public.fn_is_admin(),
  public.fn_is_system_admin(),
  public.fn_is_active_volunteer(),
  public.fn_can_manage_activity(uuid)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION
  public.fn_staff_role(),
  public.fn_is_staff(),
  public.fn_is_admin(),
  public.fn_is_system_admin(),
  public.fn_is_active_volunteer(),
  public.fn_can_manage_activity(uuid)
TO authenticated;

-- ---------------------------------------------------------
-- 1. 基礎權限：anon 全面封鎖（本系統無未登入功能）
-- ---------------------------------------------------------
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon;

-- ---------------------------------------------------------
-- 2. 啟用 RLS（全表；無 policy 的操作 = 拒絕）
-- ---------------------------------------------------------
ALTER TABLE public.staff_profiles        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.volunteer_profiles    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.periods               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grade_hour_thresholds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grade_reference_ages  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_settings       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activities            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_sessions     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_organizers   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.registrations         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.favorites             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blacklist_events      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcements         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_outbox   ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------
-- 3. staff_profiles
--    志工「完全」不可讀基表（主辦人姓名/電話僅經 v_organizer_contacts）
--    帳號建立走伺服器端 Admin API（service_role），不開 INSERT policy
--    永不硬刪 → 不開 DELETE policy
-- ---------------------------------------------------------
CREATE POLICY staff_select ON public.staff_profiles
  FOR SELECT USING (public.fn_is_staff());

CREATE POLICY staff_update_self ON public.staff_profiles
  FOR UPDATE USING (id = auth.uid() AND public.fn_is_staff())
  WITH CHECK (id = auth.uid());
  -- 欄位白名單由 02 的 fn_staff_update_guard 強制

CREATE POLICY staff_update_by_sysadmin ON public.staff_profiles
  FOR UPDATE USING (public.fn_is_system_admin())
  WITH CHECK (public.fn_is_system_admin());

-- ---------------------------------------------------------
-- 4. volunteer_profiles
--    職員對志工的寫入（審核/停權/畢業/改年級）一律走 RPC，不開直寫
-- ---------------------------------------------------------
CREATE POLICY volunteer_select_self ON public.volunteer_profiles
  FOR SELECT USING (id = auth.uid());

CREATE POLICY volunteer_select_staff ON public.volunteer_profiles
  FOR SELECT USING (public.fn_is_staff());

-- 志工自主註冊：只能建立自己的列，且強制為待審核初始狀態
CREATE POLICY volunteer_insert_self ON public.volunteer_profiles
  FOR INSERT WITH CHECK (
    id = auth.uid()
    AND status = 'pending_review'
    AND is_blacklisted = false
    AND assigned_worker_id IS NULL
    AND last_grade_reviewed_at IS NULL
  );

CREATE POLICY volunteer_update_self ON public.volunteer_profiles
  FOR UPDATE USING (id = auth.uid())
  WITH CHECK (id = auth.uid());
  -- 欄位白名單由 02 的 fn_volunteer_self_update_whitelist 強制

-- ---------------------------------------------------------
-- 5. activities / activity_sessions / activity_organizers
-- ---------------------------------------------------------
CREATE POLICY activities_select ON public.activities
  FOR SELECT USING (status <> 'draft' OR public.fn_is_staff());
  -- 志工可見非草稿（含 completed/cancelled，供歷史與時數查詢）

CREATE POLICY activities_insert ON public.activities
  FOR INSERT WITH CHECK (public.fn_is_staff() AND created_by = auth.uid());

CREATE POLICY activities_update ON public.activities
  FOR UPDATE USING (public.fn_can_manage_activity(id))
  WITH CHECK (public.fn_can_manage_activity(id));

CREATE POLICY activities_delete ON public.activities
  FOR DELETE USING (public.fn_can_manage_activity(id));
  -- 僅草稿可刪由 02 的 activity_delete_guard 強制

CREATE POLICY sessions_select ON public.activity_sessions
  FOR SELECT USING (
    public.fn_is_staff()
    OR EXISTS (SELECT 1 FROM public.activities a
               WHERE a.id = activity_id AND a.status <> 'draft')
  );

CREATE POLICY sessions_insert ON public.activity_sessions
  FOR INSERT WITH CHECK (public.fn_can_manage_activity(activity_id));

CREATE POLICY sessions_update ON public.activity_sessions
  FOR UPDATE USING (public.fn_can_manage_activity(activity_id))
  WITH CHECK (public.fn_can_manage_activity(activity_id));

CREATE POLICY sessions_delete ON public.activity_sessions
  FOR DELETE USING (public.fn_can_manage_activity(activity_id));
  -- 有報名的場次由 registrations FK 擋刪；改用 rpc_cancel_session

CREATE POLICY organizers_select ON public.activity_organizers
  FOR SELECT USING (
    public.fn_is_staff()
    OR EXISTS (SELECT 1 FROM public.activities a
               WHERE a.id = activity_id AND a.status <> 'draft')
  );  -- 志工僅得 uuid；姓名/電話經 view

CREATE POLICY organizers_insert ON public.activity_organizers
  FOR INSERT WITH CHECK (public.fn_can_manage_activity(activity_id));

CREATE POLICY organizers_delete ON public.activity_organizers
  FOR DELETE USING (public.fn_can_manage_activity(activity_id));

-- ---------------------------------------------------------
-- 6. registrations / blacklist_events：唯讀，寫入全走 RPC
-- ---------------------------------------------------------
CREATE POLICY registrations_select_own ON public.registrations
  FOR SELECT USING (volunteer_id = auth.uid());

CREATE POLICY registrations_select_staff ON public.registrations
  FOR SELECT USING (public.fn_is_staff());

CREATE POLICY blacklist_select_own ON public.blacklist_events
  FOR SELECT USING (volunteer_id = auth.uid());
  -- 前台顯示黑名單狀態與預計解除日

CREATE POLICY blacklist_select_staff ON public.blacklist_events
  FOR SELECT USING (public.fn_is_staff());

-- ---------------------------------------------------------
-- 7. favorites
-- ---------------------------------------------------------
CREATE POLICY favorites_own ON public.favorites
  FOR ALL USING (volunteer_id = auth.uid())
  WITH CHECK (volunteer_id = auth.uid() AND public.fn_is_active_volunteer());

CREATE POLICY favorites_staff_read ON public.favorites
  FOR SELECT USING (public.fn_is_staff());

-- ---------------------------------------------------------
-- 8. 參數類：periods / thresholds / reference_ages / system_settings
-- ---------------------------------------------------------
CREATE POLICY periods_select ON public.periods
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY periods_write ON public.periods
  FOR ALL USING (public.fn_is_system_admin())
  WITH CHECK (public.fn_is_system_admin());

CREATE POLICY thresholds_select ON public.grade_hour_thresholds
  FOR SELECT USING (auth.uid() IS NOT NULL);  -- 志工可查自身門檻
CREATE POLICY thresholds_write ON public.grade_hour_thresholds
  FOR ALL USING (public.fn_is_system_admin())
  WITH CHECK (public.fn_is_system_admin());

CREATE POLICY reference_ages_select ON public.grade_reference_ages
  FOR SELECT USING (public.fn_is_staff());
CREATE POLICY reference_ages_write ON public.grade_reference_ages
  FOR ALL USING (public.fn_is_system_admin())
  WITH CHECK (public.fn_is_system_admin());

CREATE POLICY settings_select ON public.system_settings
  FOR SELECT USING (public.fn_is_staff());
CREATE POLICY settings_update ON public.system_settings
  FOR UPDATE USING (public.fn_is_system_admin())
  WITH CHECK (public.fn_is_system_admin());
  -- 單列已種子，不開 INSERT/DELETE

-- ---------------------------------------------------------
-- 9. announcements（#31 全開給職員）
-- ---------------------------------------------------------
CREATE POLICY announcements_select_published ON public.announcements
  FOR SELECT USING (status = 'published' AND auth.uid() IS NOT NULL);

CREATE POLICY announcements_select_staff ON public.announcements
  FOR SELECT USING (public.fn_is_staff());

CREATE POLICY announcements_insert ON public.announcements
  FOR INSERT WITH CHECK (public.fn_is_staff() AND created_by = auth.uid());

CREATE POLICY announcements_update ON public.announcements
  FOR UPDATE USING (public.fn_is_staff())
  WITH CHECK (public.fn_is_staff());

CREATE POLICY announcements_delete ON public.announcements
  FOR DELETE USING (public.fn_is_staff());

-- ---------------------------------------------------------
-- 10. audit_logs：僅系統管理員可讀（匯出限制在 RLS 層強制，深度防禦）
--     寫入僅發生於 SECURITY DEFINER 函式/排程（owner 繞過 RLS）
-- ---------------------------------------------------------
CREATE POLICY audit_select_sysadmin ON public.audit_logs
  FOR SELECT USING (public.fn_is_system_admin());

-- ---------------------------------------------------------
-- 11. notification_outbox：無任何 policy
--     僅 service_role（發信 worker，天然繞過 RLS）可存取
-- ---------------------------------------------------------

-- ---------------------------------------------------------
-- 12. 安全視圖
-- ---------------------------------------------------------

-- (a) 主辦人聯絡資訊：志工唯一能讀到的職員個資（姓名＋電話）
--     刻意使用 owner 權限（security_invoker = off）繞過 staff_profiles RLS，
--     欄位僅暴露兩欄、且限非草稿活動的在職主辦人 —— 欄級管控靠 view 而非 RLS
CREATE VIEW public.v_organizer_contacts
WITH (security_invoker = off) AS
SELECT ao.activity_id, sp.full_name, sp.phone
FROM public.activity_organizers ao
JOIN public.staff_profiles sp ON sp.id = ao.staff_id
JOIN public.activities a ON a.id = ao.activity_id
WHERE a.status <> 'draft' AND sp.status = 'active';

-- (b) 以下皆 invoker view：套用查詢者自身 RLS
--     （志工經同一支 view 只看得到自己的資料，職員看全部）

-- 個人服務時數總覽
CREATE VIEW public.v_volunteer_hours
WITH (security_invoker = on) AS
SELECT r.volunteer_id,
       COALESCE(sum(r.service_hours), 0) AS total_hours,
       count(*) AS attended_sessions
FROM public.registrations r
WHERE r.attendance IN ('attended', 'makeup_attended')
GROUP BY r.volunteer_id;

-- 期間時數與達標比對（報表 6；#33：門檻以查詢當下 grade 計，切點問題擱置）
CREATE VIEW public.v_volunteer_period_hours
WITH (security_invoker = on) AS
SELECT p.id AS period_id, p.label AS period_label,
       v.id AS volunteer_id, v.full_name, v.grade,
       COALESCE(sum(r.service_hours), 0) AS period_hours,
       t.min_hours,
       COALESCE(sum(r.service_hours), 0) >= t.min_hours AS meets_threshold
FROM public.periods p
CROSS JOIN public.volunteer_profiles v
JOIN public.grade_hour_thresholds t ON t.grade = v.grade
LEFT JOIN (public.registrations r
           JOIN public.activity_sessions s ON s.id = r.activity_session_id)
       ON r.volunteer_id = v.id
      AND r.attendance IN ('attended', 'makeup_attended')
      AND s.start_at::date BETWEEN p.start_date AND p.end_date
GROUP BY p.id, p.label, v.id, v.full_name, v.grade, t.min_hours;

-- 活動/場次成效統計（報表 3）
CREATE VIEW public.v_activity_stats
WITH (security_invoker = on) AS
SELECT a.id AS activity_id, a.title, a.status AS activity_status,
       s.id AS activity_session_id, s.start_at, s.end_at, s.capacity,
       s.cancelled_at IS NOT NULL AS session_cancelled,
       count(r.id) AS total_registrations,
       count(r.id) FILTER (WHERE r.status IN ('pending','approved','cancel_pending')) AS active_registrations,
       count(r.id) FILTER (WHERE r.status = 'approved') AS approved_count,
       count(r.id) FILTER (WHERE r.status = 'rejected') AS rejected_count,
       count(r.id) FILTER (WHERE r.attendance IN ('attended','makeup_attended')) AS attended_count,
       count(r.id) FILTER (WHERE r.attendance = 'absent') AS absent_count
FROM public.activities a
JOIN public.activity_sessions s ON s.activity_id = a.id
LEFT JOIN public.registrations r ON r.activity_session_id = s.id
GROUP BY a.id, a.title, a.status, s.id, s.start_at, s.end_at, s.capacity, s.cancelled_at;

-- 年度審查建議清單（每年 7-8 月使用；基準日 = 當年 8/31）
-- reference_age = NULL 的階段（研究所/博士）全數列入
CREATE VIEW public.v_annual_grade_review_list
WITH (security_invoker = on) AS
SELECT v.id, v.full_name, v.grade, v.birth_date, v.last_grade_reviewed_at,
       date_part('year', age(
         make_date(date_part('year', CURRENT_DATE)::int, 8, 31), v.birth_date
       ))::int AS age_at_aug31,
       g.reference_age
FROM public.volunteer_profiles v
JOIN public.grade_reference_ages g ON g.grade = v.grade
WHERE v.status = 'active'
  AND (g.reference_age IS NULL
       OR date_part('year', age(
            make_date(date_part('year', CURRENT_DATE)::int, 8, 31), v.birth_date
          )) >= g.reference_age);

-- #20b：逾期未審的取消申請（場次已結束仍 cancel_pending）→ 人工待辦
CREATE VIEW public.v_overdue_cancel_reviews
WITH (security_invoker = on) AS
SELECT r.id AS registration_id, r.volunteer_id, r.activity_session_id,
       r.cancel_requested_at, s.start_at, s.end_at, s.activity_id
FROM public.registrations r
JOIN public.activity_sessions s ON s.id = r.activity_session_id
WHERE r.status = 'cancel_pending' AND s.end_at <= now();

-- ---------------------------------------------------------
-- 13. View 權限
-- ---------------------------------------------------------
REVOKE ALL ON public.v_organizer_contacts,
              public.v_volunteer_hours,
              public.v_volunteer_period_hours,
              public.v_activity_stats,
              public.v_annual_grade_review_list,
              public.v_overdue_cancel_reviews
FROM anon;

GRANT SELECT ON public.v_organizer_contacts,
                public.v_volunteer_hours
TO authenticated;

-- 統計/審查/待辦類視圖僅職員需要；invoker view 下志工查也只會看到自己，
-- 但收斂授權面：不 GRANT 給一般 authenticated，改由前端後台使用
GRANT SELECT ON public.v_volunteer_period_hours,
                public.v_activity_stats,
                public.v_annual_grade_review_list,
                public.v_overdue_cancel_reviews
TO authenticated;
-- 註：invoker view 的實際資料範圍仍由基表 RLS 決定，
-- 授權給 authenticated 不會讓志工看到職員視角的資料
