-- =========================================================
-- 志工管理平台 12_enable_scheduled_jobs.sql（部署啟用檔）
-- 目的：一次啟用所有背景處理 —— (F2) 5 支 pg_cron 排程 + (F1) 發信 worker 觸發。
-- 前置：01～11 已部署；05_scheduled_jobs.sql 的 5 支 job_* 函式已存在。
-- 冪等：cron.schedule 以「工作名稱」註冊，重跑會覆蓋同名工作，可安全重複執行。
-- 時區：pg_cron 以 UTC 計算；台灣時間 = UTC+8（下列註解已換算）。
-- =========================================================

-- ---------------------------------------------------------
-- STEP 0. 啟用 extensions
-- （亦可於 Supabase Dashboard → Database → Extensions 開啟 pg_cron / pg_net）
-- ---------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- ---------------------------------------------------------
-- STEP 1 (F2). 5 支核心排程
--   缺少任一支的後果：
--   - advance-activity-status：活動不會自動 open→closed→completed
--   - attendance-scan：缺席不會自動判定、黑名單不會自動觸發、級聯取消不生效
--   - blacklist-release：黑名單到期不會自動解除
--   - review-reminders / activity-reminders：主辦/志工提醒不會產生
-- ---------------------------------------------------------
SELECT cron.schedule('advance-activity-status', '*/15 * * * *',
  $$SELECT public.job_advance_activity_status()$$);

SELECT cron.schedule('attendance-scan', '10 19 * * *',   -- 每日 03:10 台灣時間
  $$SELECT public.job_attendance_scan()$$);

SELECT cron.schedule('blacklist-release', '20 19 * * *',  -- 每日 03:20 台灣時間
  $$SELECT public.job_release_blacklists()$$);

SELECT cron.schedule('review-reminders', '0 1 * * *',     -- 每日 09:00 台灣時間
  $$SELECT public.job_send_review_reminders()$$);

SELECT cron.schedule('activity-reminders', '0 10 * * *',  -- 每日 18:00 台灣時間
  $$SELECT public.job_send_activity_reminders()$$);

-- ---------------------------------------------------------
-- STEP 2 (F1). 發信 worker 觸發（每分鐘呼叫 send-notifications Edge Function）
--
-- 前置：先部署 Edge Function 並設定 secrets（見 supabase/functions/send-notifications）。
--
-- 安全性：不要把 service_role key 明文寫進 cron 指令（會存在 cron.job 表）。
-- 建議用 Supabase Vault 保存後於指令內解出。以下提供 Vault 版本；若暫時以明文
-- placeholder 測試，務必於正式環境改用 Vault 並輪替金鑰。
--
-- 2a. 於 Vault 存入專案 ref 與 service role key（僅需一次）：
--   select vault.create_secret('<PROJECT_REF>',      'project_ref');
--   select vault.create_secret('<SERVICE_ROLE_KEY>', 'service_role_key');
--
-- 2b. 註冊每分鐘觸發：
SELECT cron.schedule('send-notifications', '* * * * *', $$
  SELECT net.http_post(
    url := 'https://' ||
      (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'project_ref') ||
      '.functions.supabase.co/send-notifications',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' ||
        (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 20000
  );
$$);

-- ---------------------------------------------------------
-- STEP 3. 驗證（部署後手動執行檢查）
-- ---------------------------------------------------------
-- 3a. 確認 6 支排程都存在且啟用：
--   SELECT jobname, schedule, active FROM cron.job ORDER BY jobname;
--   （預期 6 列：上述 5 支 + send-notifications）
--
-- 3b. 檢視最近執行結果（成功/失敗）：
--   SELECT j.jobname, r.status, r.return_message, r.start_time
--   FROM cron.job_run_details r JOIN cron.job j USING (jobid)
--   ORDER BY r.start_time DESC LIMIT 20;
--
-- 3c. 檢視發信佇列消化情形：
--   SELECT status, count(*) FROM public.notification_outbox GROUP BY status;
--
-- 3d. 端到端測試發信（塞一筆給某位使用者，等 1 分鐘後應 status='sent'）：
--   INSERT INTO public.notification_outbox (recipient_user_id, notification_type, payload)
--   VALUES ('<某 auth 使用者 id>', 'account_review_result', '{}'::jsonb);
--
-- 停用某支：SELECT cron.unschedule('<jobname>');
