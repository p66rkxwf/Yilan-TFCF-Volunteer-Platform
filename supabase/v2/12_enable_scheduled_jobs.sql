-- =========================================================
-- 志工管理平台 12_enable_scheduled_jobs.sql（部署啟用檔｜Cloudflare-first）
-- 目的：授權背景排程函式給 service_role，供 Cloudflare Cron Worker 以 RPC 觸發。
-- 前置：01～11 已部署；05_scheduled_jobs.sql 的 5 支 job_* 函式已存在。
-- 冪等：GRANT 可重複執行，安全。
--
-- 設計沿革：本檔原以 pg_cron + pg_net 在資料庫端排程並每分鐘 HTTP 觸發發信
--   Edge Function。為「以 Cloudflare 為中心、避免綁定 Supabase 專屬擴充」，
--   排程與發信已全數移至 Cloudflare Cron Worker（見 workers/orchestrator/）：
--     - pg_cron / pg_net：不再使用（不需 CREATE EXTENSION，不註冊 cron.job）。
--     - 5 支 job_*：仍是 Postgres 端可攜 plpgsql，改由 Worker 以 service_role RPC 觸發。
--     - 發信 worker：改為 Cloudflare Cron Worker 每分鐘消化 notification_outbox。
-- =========================================================

-- ---------------------------------------------------------
-- STEP 1. 授權 5 支排程函式給 service_role
--   05_scheduled_jobs.sql 已 REVOKE EXECUTE FROM PUBLIC/anon/authenticated；
--   Cloudflare Worker 以 service_role 金鑰經 PostgREST 呼叫 rpc(...)，
--   故 service_role 需明確被授權，否則 RPC 會回 42501（權限不足）。
--
--   缺少任一支的後果：
--   - job_advance_activity_status：活動不會自動 open→closed→completed
--   - job_attendance_scan：缺席不會自動判定、黑名單不會自動觸發、級聯取消不生效
--   - job_release_blacklists：黑名單到期不會自動解除
--   - job_send_review_reminders / job_send_activity_reminders：主辦/志工提醒不會產生
-- ---------------------------------------------------------
GRANT EXECUTE ON FUNCTION
  public.job_advance_activity_status(),
  public.job_attendance_scan(),
  public.job_release_blacklists(),
  public.job_send_review_reminders(),
  public.job_send_activity_reminders()
TO service_role;

-- 讓 PostgREST 立即看見新授權（Supabase 上 schema cache 生效較快，仍建議送一次）。
NOTIFY pgrst, 'reload schema';

-- ---------------------------------------------------------
-- STEP 2. 部署 Cloudflare Cron Worker（不在 SQL 層）
--   見 workers/orchestrator/README.md：
--     1. 設定 secrets：SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / RESEND_API_KEY /
--        MAIL_FROM / SITE_URL（`wrangler secret put`）。
--     2. `wrangler deploy`（單一每分鐘 cron，各排程於 worker 內依 UTC 時間分派）。
--   發信一律先寫入 notification_outbox（Transactional Outbox），由 Worker 每分鐘消化。
-- ---------------------------------------------------------

-- ---------------------------------------------------------
-- STEP 3. 驗證（部署後手動執行檢查）
-- ---------------------------------------------------------
-- 3a. 確認 service_role 可執行（應回傳整數/void 而非權限錯誤）：
--   SET ROLE service_role;
--   SELECT public.job_advance_activity_status();
--   RESET ROLE;
--
-- 3b. 檢視發信佇列消化情形（由 Cloudflare Worker 每分鐘推進）：
--   SELECT status, count(*) FROM public.notification_outbox GROUP BY status;
--
-- 3c. 端到端測試發信（塞一筆給某位使用者，等 1 分鐘後應 status='sent'）：
--   INSERT INTO public.notification_outbox (recipient_user_id, notification_type, payload)
--   VALUES ('<某 auth 使用者 id>', 'account_review_result', '{}'::jsonb);
--
-- 3d. Worker 端排程/寄信 log 以 `wrangler tail`（於 workers/orchestrator/）檢視。
--
-- 註：若曾在舊版以 pg_cron 註冊過排程，改用本方案後可清掉殘留：
--   SELECT cron.unschedule(jobname) FROM cron.job
--   WHERE jobname IN ('advance-activity-status','attendance-scan','blacklist-release',
--                     'review-reminders','activity-reminders','send-notifications');
