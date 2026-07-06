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
5. `05_scheduled_jobs.sql` — 5 支排程函式（pg_cron 註冊語句預設註解，見下）
6. `06_frontend_support.sql` — 前端改寫新增的輕量視圖（`v_session_open_slots`，志工前台剩餘名額用）

**B. 增量 patch（07～10，可重複執行，依序疊加在 01～06 之上）**

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

### 部署後手動步驟

1. **啟用 pg_cron**：Supabase Dashboard → Database → Extensions → 啟用 `pg_cron`，再回 SQL Editor
   解除 `05_scheduled_jobs.sql` 區塊 G 的 `cron.schedule(...)` 註解並執行（至少需啟用
   `advance-activity-status`，否則活動狀態不會自動從 open → closed → completed）。
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
5. **寄信 worker 尚未建置**：通知會正常寫入 `notification_outbox` 佇列，但不會真的寄出，屬預期行為，
   待寄信 worker 建立後才會實際發信。

### 常見注意事項

- `01`～`06` 使用純 `CREATE TABLE`/`CREATE TYPE`（非 idempotent），設計為在乾淨 schema 上執行一次；
  若需要重跑，請整個重建 Supabase 專案（V1 的一次性重置腳本已隨 legacy 目錄一併移除）。
- `07`～`10` 皆可重複執行；`07` 例外——其 `CREATE TYPE` 若已存在會報錯，此時略過 STEP 1 重跑 STEP 2 即可。
- anon（未登入）預設對所有資料表全面封鎖；目前僅 `08`（已發布公告，欄位級）與 `10`
  （`rpc_submit_support_request`，僅此一支 RPC）主動開放給 anon，其餘一律要求登入。
- 完整業務規格見 `files/志工管理平台_功能需求文件_v2.md`（`07`～`10` 為規格書之後新增/調整的異動，
  文件本身未同步更新，以本檔的部署順序註解為準）。
