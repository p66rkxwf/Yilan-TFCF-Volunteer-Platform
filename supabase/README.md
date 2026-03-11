## Supabase SQL（手動執行順序）

本資料夾的 SQL 以「可重複執行（idempotent）」為目標，適合在 Supabase 的 SQL Editor 依序貼上執行。

### 1) 建表與索引

- 執行 `schema.sql`
  - 建立 `public.favorites`
  - 建立必要的 extension / index / constraint

### 2) 權限與 RLS

- 執行 `rls.sql`
  - `favorites` 的 `select/insert/delete` RLS policy（僅限本人）
  - `profiles` 的管理員政策（透過 `public.is_admin_profile(auth.uid())`）

### 常見注意事項

- 以上假設你的專案已有 `public.activities` 與 `public.profiles`（本 repo 的前端已使用這些表）。
- 若你在 Supabase 儀表板有啟用/調整 Table Editor 的欄位，請以 DB 實際 schema 為準，再回來同步調整 SQL。

