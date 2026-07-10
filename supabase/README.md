## Supabase SQL（V2，手動執行順序）

本資料夾對應資料庫的 **V2** 版本（活動→場次→報名三層模型、職員/志工分表、交易性寫入一律走 RPC）。
資料夾內的 `.sql` 檔本身就是可直接執行的原始檔（依編號代表部署順序）；`files/` 目錄僅存放業務規格文件
（`志工管理平台_功能需求文件_v2.md`），不含任何 SQL。V1（舊版單一 `profiles` 表、無場次層）已自
repo 移除，如需查閱歷史結構請翻 Git 紀錄。

### 部署順序（Supabase SQL Editor 依序貼上執行）

**A. 定案版（01～06，僅供全新專案一次性建置，非 idempotent）**

1. `01_schema.sql` — extensions、ENUM、15 張資料表、約束、索引
2. `02_triggers.sql` — 稽核/通知 helper、鏡像同步、時數帶入、欄位白名單、狀態機
3. `03_rls_policies.sql` — 角色 helper、全表 RLS policy、6 個安全視圖
4. `04_rpc_functions.sql` — 15 支交易性 RPC＋級聯共用函式
5. `05_scheduled_jobs.sql` — 5 支排程函式（不用 pg_cron；由 Cloudflare Cron Worker 觸發，見下與 `12`）
6. `06_frontend_support.sql` — 前端改寫新增的輕量視圖（`v_session_open_slots`，志工前台剩餘名額用）

**B. 增量 patch（07 起，可重複執行，依序疊加在 01～06 之上）**

7. `07_deactivation_requests.sql` — 志工帳號停用申請（志工發起→管理員審核）。**需分兩步驟執行**：
   檔案內以 `STEP 1` / `STEP 2` 註解分隔，因 Postgres 不允許在同一交易內新增 enum 值後立即使用，
   須先單獨執行 STEP 1（新增 `deactivation_request_status` 與 `notification_type` 列舉值）並確認成功，
   再執行 STEP 2（資料表、RLS、RPC）。
8. `08_public_announcements.sql` — 開放未登入訪客（anon）讀取「已發布」公告，供首頁與最新消息頁顯示。
   **會覆寫既有規則**：原規格公告僅職員可讀，本檔改為欄位級授權給 anon（不含 `created_by`）。
9. `09_relax_activity_management.sql` — 將活動管理權由「建立者／主辦人／單位管理員以上」放寬為
   「全體在職職員皆可管理任何活動」。**會覆寫既有規則**：原規格（decision #30）僅限建立者/主辦人/
   單位管理員可編輯，本檔重新定義 `fn_can_manage_activity()` 後，所有引用它的 policy 與 RPC
   （`rpc_cancel_activity`、`rpc_cancel_session` 等）自動一併放寬，無需逐一改寫。
10. `10_support_requests.sql` — `/support` 頁支援表單改為真送出（原僅前端假延遲，未落地）。新增
    `support_requests` 資料表與 `rpc_submit_support_request`（開放 anon＋authenticated）／
    `rpc_resolve_support_request`（僅在職職員）兩支 RPC，並於後台新增「支援需求」收件匣頁面。
11. `11_harden_cancel_and_checkin.sql` — 資安補強：禁止場次開始後才申請取消（規避黑名單）、
    自助簽到前重驗志工在職且未在黑名單。
12. `12_enable_scheduled_jobs.sql` — 部署啟用檔（Cloudflare-first）：把 5 支排程函式 `GRANT
    EXECUTE` 給 `service_role`，供 Cloudflare Cron Worker 以 RPC 觸發。**不使用 pg_cron/pg_net**，
    排程與發信全在 Cloudflare（`workers/orchestrator/`）；可重複執行（見下方「部署後手動步驟」1、5）。
13. `13_allow_duplicate_volunteer_email.sql` — 志工改以「帳號」登入後，聯絡 Email 允許重複
    （移除唯一約束）。**另需在 Supabase Dashboard 關閉 Email 的 Confirm email**（見檔內說明）。
14. `14_harden_views.sql` — 資安／正確性修補：`v_session_open_slots` 過濾草稿活動（不外洩給志工）；
    `v_volunteer_period_hours` 改以台灣時區切分期間日期。
15. `15_notification_center.sql` — 站內通知中心：`notification_outbox` 新增 `read_at` 已讀欄位、
    開放本人 SELECT 的 RLS policy、`rpc_mark_notifications_read` 標記已讀 RPC。**未執行本檔前，
    前台 header 鈴鐺與 `/profile/notifications` 頁會查無資料（RLS 拒讀）**。
16. `16_min_service_hours.sql` — 自動帶入服務時數時設下限 0.01，避免極短場次違反
    `service_hours > 0` CHECK。
17. `17_reassign_worker.sql` — 負責社工批量移轉：新增 `rpc_reassign_worker`（單位管理員以上），
    把某社工名下所有學生一次改派給另一位在職社工（社工輪換／離職用），並寫稽核紀錄。
    **未執行本檔前，職員管理頁的「移轉學生」按鈕會回錯（RPC 不存在）**。
18. `18_fix_cascade_cancel_attendance.sql` ～ `25_hardening_misc.sql` — 依編號順序執行；
    各檔開頭皆有完整需求與前置說明（含 `20` 強制改密碼、`21` 志工 Email 驗證、
    `23` 軟刪封存＋定期清除、`24` 稽核擴充等）。
19. `26_hard_delete.sql` — 單筆永久刪除（後台操作選單「刪除」）：新增 `rpc_delete_record`
    （限系統管理員，白名單四表）。刪職員＝歷史經手欄位留空（CHECK 綁定者改掛執行刪除的管理員）；
    刪學生＝報名／黑名單／申請一併刪除；刪活動＝場次與報名一併刪除。並放寬活動硬刪防呆
    （已封存亦可刪，修正定期清除被防呆擋下的問題）、活動/公告 `created_by` 改可為空。
    **未執行本檔前，各列表的「刪除」會回錯（RPC 不存在）**。
20. `27_custom_service_and_notifications.sql` — (A) 自訂服務登錄（記錄已完成的私下服務計時數）：
    新表 `custom_service_records`＋送審/審核 RPC（`rpc_submit_custom_service`／`rpc_review_custom_service`）；
    志工可登錄自己的、職員可代任一志工登錄，皆需審核；核可時數併入 `v_volunteer_hours`／
    `v_volunteer_period_hours`。(B) 報名即時通知（pending 報名→主辦人＋該生負責社工）與新帳號待審
    通知（→單位管理員以上）兩個 AFTER INSERT 觸發器。**分兩步執行**（STEP1 ALTER TYPE 加 4 個
    通知型別→STEP2 其餘）。**未執行前，志工/後台的自訂服務頁會查無資料、送審/審核 RPC 不存在。**
    另需 `wrangler deploy` 更新 orchestrator worker（新增 4 個型別信件模板）。

### 部署後手動步驟

1. **授權排程函式（供 Cloudflare Cron Worker 觸發）**：於 SQL Editor 執行
   `12_enable_scheduled_jobs.sql`（`GRANT EXECUTE` 5 支 `job_*` 給 `service_role`；可重複執行）。
   **不使用 pg_cron**——實際排程由 Cloudflare Cron Worker（`workers/orchestrator/`）負責。未完成此步
   （或未部署 Worker）的後果：活動不會自動 open→closed→completed、缺席不會自動判定/加黑名單、
   黑名單不會自動解除、提醒不會產生。驗證：`SET ROLE service_role; SELECT
   public.job_advance_activity_status(); RESET ROLE;` 應回整數而非權限錯誤。
2. **種第一位系統管理員**：先在 Dashboard → Authentication 建立一個 auth 使用者，取得其 `id`，
   再於 SQL Editor 執行：
   ```sql
   insert into public.staff_profiles (id, full_name, email, username, phone, role, job_title)
   values ('<auth-user-id>', '系統管理員', '<email>', '<username>', '<phone>',
           'system_admin', 'social_worker');
   ```
   沒有這一步後台無法登入使用（無人有權限審核其他職員/志工帳號）。
3. `system_settings`、`grade_reference_ages` 已由 `01_schema.sql` 種好預設值，不需額外動作。
4. **設定 Auth Redirect URLs**：忘記密碼信件連結（`resetPassword` → `/auth/callback`）需要 Supabase
   Dashboard → Authentication → URL Configuration 的 Redirect URLs 加入站台網址
   （例如 `https://<你的網域>/auth/callback`），流程才會生效；本機開發請加入
   `http://localhost:3000/auth/callback`。
5. **部署寄信 worker（Cloudflare Cron Worker）**：通知一律先寫入 `notification_outbox` 佇列，需由
   worker 消費才會實際寄出。worker 位於 `workers/orchestrator/`（Cloudflare Cron Worker，Resend 寄送，
   並一併觸發第 1 點的 5 支 `job_*`）。部署步驟（於 `workers/orchestrator/`）：
   1. `npm install`
   2. 設定 secrets：`wrangler secret put` 依序設定 `SUPABASE_URL`、`SUPABASE_SERVICE_ROLE_KEY`、
      `RESEND_API_KEY`、`MAIL_FROM`（例：`宜蘭家扶志工平台 <noreply@你的網域>`）、`SITE_URL`
      （寄件網域需先在 Resend 驗證）。
   3. `wrangler deploy`（`wrangler.jsonc` 已含 6 個 cron trigger）。細節見
      `workers/orchestrator/README.md`。
   > `supabase/functions/send-notifications/` 為舊版 Supabase Edge Function 實作，已 deprecated，僅留參考。
   未設定 `RESEND_API_KEY` 時 worker 會略過 outbox 消化而不寄出（等同暫時停用，佇列仍會累積）。

### 常見注意事項

- `01`～`06` 使用純 `CREATE TABLE`/`CREATE TYPE`（非 idempotent），設計為在乾淨 schema 上執行一次；
  若需要重跑，請整個重建 Supabase 專案（V1 的一次性重置腳本已隨 legacy 目錄一併移除）。
- `07`～`10` 皆可重複執行；`07` 例外——其 `CREATE TYPE` 若已存在會報錯，此時略過 STEP 1 重跑 STEP 2 即可。
- anon（未登入）預設對所有資料表全面封鎖；目前僅 `08`（已發布公告，欄位級）與 `10`
  （`rpc_submit_support_request`，僅此一支 RPC）主動開放給 anon，其餘一律要求登入。
- 完整業務規格見 `files/志工管理平台_功能需求文件_v2.md`（`07`～`10` 為規格書之後新增/調整的異動，
  文件本身未同步更新，以本檔的部署順序註解為準）。
