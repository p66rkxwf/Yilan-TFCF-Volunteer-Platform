# volunteer-orchestrator（Cloudflare Cron Worker）

志工平台的背景編排器。單一 worker 以多個 cron trigger 統包所有排程，取代原本的
Supabase Edge Function（`send-notifications`）＋ pg_cron/pg_net。

## 職責

於 `scheduled(controller)` 內以 `controller.cron` 分流：

| cron（UTC） | 台灣時間 | 動作 |
|---|---|---|
| `* * * * *` | 每分鐘 | 消化 `notification_outbox`（pending）→ Resend 寄出 |
| `*/15 * * * *` | 每 15 分 | `rpc job_advance_activity_status` |
| `10 19 * * *` | 03:10 | `rpc job_attendance_scan` |
| `20 19 * * *` | 03:20 | `rpc job_release_blacklists` |
| `0 1 * * *` | 09:00 | `rpc job_send_review_reminders` |
| `0 10 * * *` | 18:00 | `rpc job_send_activity_reminders` |

`job_*` 是 Postgres 端可攜的 plpgsql（見 `supabase/v2/05_scheduled_jobs.sql`），
本 worker 以 service_role 透過 PostgREST RPC 觸發；需先執行
`supabase/v2/12_enable_scheduled_jobs.sql` 將這些函式 `GRANT EXECUTE` 給 `service_role`。

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

部署後：`wrangler tail` 可看排程 log；outbox 消化情形可查
`SELECT status, count(*) FROM public.notification_outbox GROUP BY status;`。

> `RESEND_API_KEY` 未設定時 outbox 消化會略過（不寄、佇列持續累積），
> 其餘 job 仍會照常執行。
