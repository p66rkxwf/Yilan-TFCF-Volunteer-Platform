-- =========================================================
-- 志工管理平台 14_harden_views.sql（資安／正確性修補）
-- 內容：
--   (1) v_session_open_slots：加入活動狀態過濾，草稿活動的場次不外洩給志工
--       —— 修補「owner 權限視圖繞過 sessions_select / activities_select RLS，
--       任何登入者（含 pending_review）可列舉草稿活動場次時間/名額」的資訊揭露。
--   (9) v_volunteer_period_hours：期間切分改以台灣時區判定日期
--       —— 修補「s.start_at::date 以伺服器時區（UTC）切分，跨午夜場次可能被
--       歸入相鄰期間」的統計誤差。
-- 前置：01 → 06（v_session_open_slots）、01 → 03（v_volunteer_period_hours）已建立。
-- 冪等：CREATE OR REPLACE VIEW 可重複執行；輸出欄位不變，故 REPLACE 合法。
--       CREATE OR REPLACE 會保留既有 GRANT；此處仍再明確授權一次以利全新環境。
-- =========================================================

-- ---------------------------------------------------------
-- (1) 場次剩餘名額視圖：僅暴露「非草稿」活動的場次
--     欄位與 06_frontend_support.sql 完全一致，僅新增 activities JOIN 與 WHERE。
--     activities.id 為 PK，與場次 1:1，不會造成 fan-out；GROUP BY 維持不變。
-- ---------------------------------------------------------
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
WHERE a.status <> 'draft'   -- 草稿活動的場次不對志工揭露（對齊 sessions_select RLS）
GROUP BY s.id, s.activity_id, s.start_at, s.end_at, s.capacity,
         s.registration_deadline_at, s.cancelled_at;

REVOKE ALL ON public.v_session_open_slots FROM anon;
GRANT SELECT ON public.v_session_open_slots TO authenticated;

-- ---------------------------------------------------------
-- (9) 期間時數視圖：以台灣時區（Asia/Taipei）判定場次所屬日期
--     start_at 為 timestamptz；AT TIME ZONE 'Asia/Taipei' 轉為當地牆鐘時間後
--     再 ::date，得到台灣行事曆日期，避免以 UTC 切分造成跨午夜歸期錯誤。
--     欄位與 03_rls_policies.sql 完全一致，僅改 JOIN 條件的日期運算。
-- ---------------------------------------------------------
CREATE OR REPLACE VIEW public.v_volunteer_period_hours
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
      AND (s.start_at AT TIME ZONE 'Asia/Taipei')::date BETWEEN p.start_date AND p.end_date
GROUP BY p.id, p.label, v.id, v.full_name, v.grade, t.min_hours;

GRANT SELECT ON public.v_volunteer_period_hours TO authenticated;

-- 讓 PostgREST 立即看見視圖定義更新。
NOTIFY pgrst, 'reload schema';
