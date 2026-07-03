## Supabase SQL（V2，手動執行順序）

本資料夾對應資料庫的 **V2** 版本（活動→場次→報名三層模型、職員/志工分表、交易性寫入一律走 RPC）。
實際 SQL 原始檔維護於 repo 根目錄的 `files/`，本資料夾僅記錄部署順序。V1（舊版單一 `profiles`
表、無場次層）已封存於 `supabase/legacy-v1/`，僅供歷史對照，不再部署。

### 部署順序（Supabase SQL Editor 依序貼上執行）

0. `files/00_reset_v1.sql` — 清除 V1 遺留的資料表／函式／trigger／ENUM（**破壞性操作，僅測試環境使用**；若資料庫是全新專案、從未跑過 V1，可跳過此步）
1. `files/01_schema.sql` — extensions、ENUM、13 張資料表、約束、索引
2. `files/02_triggers.sql` — 稽核/通知 helper、鏡像同步、時數帶入、欄位白名單、狀態機
3. `files/03_rls_policies.sql` — 角色 helper、全表 RLS policy、6 個安全視圖
4. `files/04_rpc_functions.sql` — 15 支交易性 RPC＋級聯共用函式
5. `files/05_scheduled_jobs.sql` — 5 支排程函式（pg_cron 註冊語句預設註解，見下）
6. `files/06_frontend_support.sql` — 本次前端改寫新增的輕量視圖（`v_session_open_slots`，志工前台剩餘名額用）

### 部署後手動步驟

1. **啟用 pg_cron**：Supabase Dashboard → Database → Extensions → 啟用 `pg_cron`，再回 SQL Editor
   解除 `files/05_scheduled_jobs.sql` 區塊 G 的 `cron.schedule(...)` 註解並執行（至少需啟用
   `advance-activity-status`，否則活動狀態不會自動從 open → closed → completed）
2. **種第一位系統管理員**：先在 Dashboard → Authentication 建立一個 auth 使用者，取得其 `id`，
   再於 SQL Editor 執行：
   ```sql
   insert into public.staff_profiles (id, full_name, email, username, phone, role, job_title)
   values ('<auth-user-id>', '系統管理員', '<email>', '<username>', '<phone>',
           'system_admin', 'social_worker');
   ```
   沒有這一步後台無法登入使用（無人有權限審核其他職員/志工帳號）。
3. `system_settings`、`grade_reference_ages` 已由 `01_schema.sql` 種好預設值，不需額外動作。
4. **寄信 worker 尚未建置**：本次僅接資料庫與前端，通知會正常寫入 `notification_outbox` 佇列，
   但不會真的寄出，屬預期行為（見專案 plan 文件「明確不做」段落）。

### 常見注意事項

- `01`～`06` 使用純 `CREATE TABLE`/`CREATE TYPE`（非 idempotent），設計為在乾淨 schema 上執行一次；
  若需要重跑，請先重新執行 `00_reset_v1.sql`（它是 idempotent，可安全重跑）或整個重建 Supabase 專案。
- anon（未登入）對所有資料表全面封鎖，本系統無未登入功能。
- 完整業務規格見 `files/志工管理平台_功能需求文件_v2.md`。
