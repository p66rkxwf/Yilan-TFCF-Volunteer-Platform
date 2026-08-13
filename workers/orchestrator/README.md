# volunteer-orchestrator（Cloudflare Cron Worker）

志工平台的背景編排器。單一 worker 以多個 cron trigger 統包所有排程，取代原本的
Supabase Edge Function（`send-notifications`）＋ pg_cron/pg_net。

## 職責

只註冊**單一「每分鐘」cron**（Cloudflare Free 方案每個 Worker 最多 3 個 cron trigger），
於 `scheduled()` 的 `runScheduled()` 內依觸發時間（UTC）分派：

| 時機（UTC） | 台灣時間 | 動作 |
|---|---|---|
| 每分鐘 | 每分鐘 | 回收卡住的通知 → 佔用並消化 `notification_outbox` → Resend 寄出 |
| 每 15 分 | 每 15 分 | `rpc job_advance_activity_status`；查 app worker 例外，超標即寄告警信 |
| 19:10 | 03:10 | `rpc job_attendance_scan` |
| 19:20 | 03:20 | `rpc job_release_blacklists` |
| 19:30 | 03:30 | `rpc job_purge_expired`（定期清除） |
| 19:35 | 03:35 | `rpc job_purge_rejected_accounts`（清除逾期的未通過帳號） |
| 01:00 | 09:00 | `rpc job_send_review_reminders` |
| 10:00 | 18:00 | `rpc job_send_activity_reminders` |

`job_*` 是 Postgres 端可攜的 plpgsql（見 `supabase/v2/05_scheduled_jobs.sql`、`23`、`35`、`42`），
本 worker 以 service_role 透過 PostgREST RPC 觸發；需先執行
`supabase/v2/12_enable_scheduled_jobs.sql` 將 `05` 的 5 支函式 `GRANT EXECUTE` 給 `service_role`
（其餘各自在所屬 SQL 檔內授權）。

## 寄信佇列

每分鐘的 outbox 消化走 claim/complete，不是「讀 pending → 寄 → 回寫」：

1. `job_requeue_stuck_notifications` — 收回卡在 `processing` 超過 5 分鐘的列（worker 中途被中斷）
2. `rpc_claim_notifications` — 以 `FOR UPDATE SKIP LOCKED` 原子佔用（`pending` → `processing`）
3. 寄信
4. `rpc_complete_notification` — 回報 `sent`／`failed`／`skipped`，或 `retry`（由 DB 算退避時間）

之所以要在「取件」而非「回寫」擋重複，是因為回寫時信已經送到 Resend 了——
`WHERE status='pending'` 保護得了資料庫，保護不了已經寄出的信。
暫時性失敗依 30s → 2m → 10m → 1h → 6h 退避，第 6 次仍失敗即進 dead letter（`failed`）。
定義見 `supabase/v2/42_notification_queue_hardening.sql`。

## 本機開發

```bash
cd workers/orchestrator
npm install
cp .dev.vars.example .dev.vars   # 填入真值
npm run dev                      # wrangler dev --test-scheduled
```

`--test-scheduled` 會開一個 `/__scheduled` 端點手動觸發，例如：

```bash
# 消化 outbox（每分鐘那支）
curl "http://localhost:8787/__scheduled?cron=*+*+*+*+*"
# 觸發某支 job
curl "http://localhost:8787/__scheduled?cron=10+19+*+*+*"
```

（或設 `MANUAL_TRIGGER_SECRET` 後打本 worker 自帶的 `fetch` 入口：
`curl -H "x-trigger-secret: <secret>" "http://localhost:8787/?cron=* * * * *"`。）

## 部署

```bash
cd workers/orchestrator
# 一次性設定機密（每個環境各一次）
wrangler secret put SUPABASE_URL
wrangler secret put SUPABASE_SERVICE_ROLE_KEY
wrangler secret put RESEND_API_KEY
wrangler secret put MAIL_FROM
wrangler secret put SITE_URL
# 可選：wrangler secret put MANUAL_TRIGGER_SECRET

npm run deploy   # wrangler deploy
```

### 例外告警（可選）

Cloudflare 沒有原生的 Workers 錯誤通知，故由本 worker 每 15 分鐘查一次 GraphQL
Analytics：統計 app worker 各 invocation status 的次數，出現非成功狀態就寄信。

```bash
wrangler secret put CF_ACCOUNT_ID        # Cloudflare 帳號 ID
wrangler secret put CF_ANALYTICS_TOKEN   # API token，權限：Account Analytics: Read
wrangler secret put ALERT_EMAIL_TO       # 告警信收件者
# 可選：ALERT_MIN_ERRORS（預設 1 次即告警）、ALERT_WORKER_NAME（預設 volunteer）
```

三者任一未設定即自動停用，不會報錯。信中會列出各 status 次數與中文說明
（`scriptThrewException` = 使用者看到的 Error 1101、`exceededCpu` = 1102）。
查詢區間會往前推 1 分鐘以避開 Analytics 的資料延遲，相鄰兩次首尾相接不重疊。

部署後：`wrangler tail` 可看排程 log；outbox 消化情形可查
`SELECT status, count(*) FROM public.notification_outbox GROUP BY status;`。

> `RESEND_API_KEY` 未設定時 outbox 消化會略過（不寄、佇列持續累積），
> 其餘 job 仍會照常執行。
