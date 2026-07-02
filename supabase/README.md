## Supabase SQL（手動執行順序）

本資料夾的 SQL 以「可重複執行（idempotent）」為目標，適合在 Supabase 的 SQL Editor 依序貼上執行。
依下列順序執行即可從零建立完整 schema。

### 1) 核心資料表與 enum

- 執行 `core-schema.sql`
  - 建立 enum：`user_role`、`account_status`、`registration_status`、`staff_position`、`yilan_region`
  - 建立 `public.profiles`、`public.activities`、`public.registrations` 與索引
  - 建立 `handle_new_user` trigger：使用者透過 `auth.signUp()` 註冊時，自 metadata
    （`account`、`full_name`、`birthday`、`region`、`assigned_worker_id`）自動建立 profile
  - 建立 `profiles.updated_at` 自動更新 trigger

### 2) 核心 RLS

- 執行 `core-rls.sql`
  - 定義 `public.is_admin_profile(uuid)` 管理員判斷 helper
  - `profiles`：本人讀/改、管理員全權
  - `activities`：公開可讀、管理員可寫
  - `registrations`：本人讀/報名/取消、管理員全權

### 3) 收藏功能建表與索引

- 執行 `schema.sql`
  - 建立 `public.favorites`
  - 建立必要的 extension / index / constraint

### 4) 補充欄位與同步

- 執行 `last-login.sql`
  - 在 `public.profiles` 同步 `last_login_at`
  - 將 `auth.users.last_sign_in_at` 回填並同步到 `public.profiles.last_login_at`
  - 註：`last_login_at` 欄位已於 `core-schema.sql` 建立，本檔負責建立同步 trigger 與回填

### 5) 收藏功能 RLS

- 執行 `rls.sql`
  - `favorites` 的 `select/insert/delete` RLS policy（僅限本人）
  - `profiles` 的管理員政策（與 `core-rls.sql` 等價，重複執行為 no-op）

### 6) 志工時數 / 簽到

- 執行 `attendance.sql`
  - 建立 `attendance_status` enum
  - 在 `public.registrations` 新增 `attendance`、`checked_in_at`、`hours` 欄位與索引

### 7) 站內通知

- 執行 `notifications.sql`
  - 建立 `public.notifications` 表與索引
  - 套用 RLS：本人可讀取/標記已讀；寫入由 server action 以 service role 進行

### 常見注意事項

- 以上 SQL 皆為 idempotent，可安全重複執行。
- 若你的 Supabase 專案已有部分資料表，執行時會自動略過已存在的物件。
- 若你在 Supabase 儀表板手動調整過欄位，請以 DB 實際 schema 為準，再回來同步調整 SQL。
