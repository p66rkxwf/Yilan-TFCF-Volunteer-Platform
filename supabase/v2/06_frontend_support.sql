-- =========================================================
-- 志工管理平台 06_frontend_support.sql
-- 用途：本次「V1→V2 最小可行前端改寫」新增的補充物件，
--       非 v2 定案版規格書本體，僅為前端可用性所需。
-- 前置：00 → 01 → 02 → 03 → 04 → 05
-- =========================================================

-- ---------------------------------------------------------
-- 1. 場次剩餘名額（志工前台用；取代 V1 的 activity_registration_counts）
--    刻意使用 owner 權限（security_invoker = off）繞過 registrations RLS，
--    只暴露聚合後的剩餘名額數字，不暴露個別報名/志工資料。
--    不用 03 的 v_activity_stats：那是後台統計視圖，
--    含 rejected_count/attended_count 等不該讓志工看到的欄位。
-- ---------------------------------------------------------
CREATE VIEW public.v_session_open_slots
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
LEFT JOIN public.registrations r ON r.activity_session_id = s.id
GROUP BY s.id, s.activity_id, s.start_at, s.end_at, s.capacity,
         s.registration_deadline_at, s.cancelled_at;

REVOKE ALL ON public.v_session_open_slots FROM anon;
GRANT SELECT ON public.v_session_open_slots TO authenticated;
