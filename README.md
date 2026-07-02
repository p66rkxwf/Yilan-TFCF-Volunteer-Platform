# 宜蘭家扶中心志工平台

宜蘭家扶中心的志工招募、活動報名與後台管理平台。

本專案使用 `Next.js App Router` 搭配 `Supabase` 建置，提供志工端報名流程、個人中心，以及管理端活動與使用者管理功能。首頁保留了獎學金入口，但目前仍為未開放狀態。

> [!NOTE]
> `supabase/` 內已收錄可從零建置的完整 SQL（核心資料表、enum、RLS 與收藏功能）。
> 依 [supabase/README.md](supabase/README.md) 的順序執行即可建立 `profiles`、`activities`、`registrations`、`favorites` 與相關 enum / trigger / policy。

## 功能總覽

### 志工端

- 帳號註冊、登入、忘記密碼
- 瀏覽與搜尋志工活動
- 查看活動詳情、收藏活動、送出報名
- 查看與取消個人報名紀錄
- 查看服務時數與出席紀錄，產出可列印的服務證明
- 接收站內通知（報名審核結果、活動異動）
- 編輯個人資料與停用帳號
- 查閱 FAQ、服務條款、隱私政策與支援頁

### 管理端

- 後台儀表板與報名概況
- 建立、編輯、取消與恢復活動
- 審核活動報名狀態
- 活動當天簽到、登記出席與服務時數（含批次標記）
- 匯出活動報名 / 簽到名單為 CSV
- 儀表板呈現服務時數、出席率與各區志工分布
- 搜尋、篩選與管理平台使用者
- 查看個別志工資料與近期報名紀錄

## 技術棧

- `Next.js 16`
- `React 19`
- `TypeScript`
- `Tailwind CSS 4`
- `Supabase Auth / Database / SSR`

## 核心資料概念

目前程式碼中已使用的核心資料表與欄位型別定義可參考 [src/lib/types/database.ts](src/lib/types/database.ts)。

- `profiles`: 使用者基本資料、角色、狀態、社工指派資訊、最後登入時間
- `activities`: 志工活動主檔
- `registrations`: 志工活動報名紀錄，含出席狀態與服務時數
- `favorites`: 志工收藏活動清單
- `notifications`: 站內通知紀錄

角色列舉：

- `system_admin`
- `unit_admin`
- `internal_staff`
- `volunteer`
- `guest`

報名狀態列舉：

- `pending`
- `approved`
- `rejected`
- `cancelled`

## 快速開始

### 需求

- Node.js `20+`
- `npm`
- 一個可用的 Supabase 專案

### 安裝

```bash
git clone https://github.com/p66rkxwf/Yilan-TFCF-Volunteer-Platform.git
cd Yilan-TFCF-Volunteer-Platform
npm install
```

### 環境變數

在專案根目錄建立 `.env.local`：

```bash
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
```

變數用途：

- `NEXT_PUBLIC_SUPABASE_URL`: 前後端共用的 Supabase 專案 URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: 前端登入、查詢與一般使用者操作所需
- `SUPABASE_SERVICE_ROLE_KEY`: 後台與特定 server-side 管理操作所需，不能暴露到 Client Component

### Supabase 設定

本 repo 內可直接執行的 SQL 檔位於 [supabase/README.md](supabase/README.md)，皆為 idempotent，可從零建置。

執行順序：

1. 執行 [supabase/core-schema.sql](supabase/core-schema.sql) 建立 enum、`profiles`/`activities`/`registrations` 與 `handle_new_user` trigger。
2. 執行 [supabase/core-rls.sql](supabase/core-rls.sql) 套用核心資料表的 RLS / policy 與 `is_admin_profile` helper。
3. 執行 [supabase/schema.sql](supabase/schema.sql) 建立 `favorites` 表與索引。
4. 執行 [supabase/last-login.sql](supabase/last-login.sql) 建立 `last_login_at` 同步 trigger 並回填 `auth.users.last_sign_in_at`。
5. 執行 [supabase/rls.sql](supabase/rls.sql) 套用 `favorites` 相關 RLS / policy。
6. 執行 [supabase/attendance.sql](supabase/attendance.sql) 為 `registrations` 新增出席與服務時數欄位。
7. 執行 [supabase/notifications.sql](supabase/notifications.sql) 建立站內通知表與 RLS。
8. [supabase/seed.sql](supabase/seed.sql) 目前為空，可視需求自行補資料。

### 啟動開發環境

```bash
npm run dev
```

啟動後開啟 `http://localhost:3000`。

## 可用腳本

- `npm run dev`: 啟動開發伺服器
- `npm run build`: 建立 production build
- `npm run start`: 啟動 production server
- `npm run lint`: 使用 ESLint flat config（`eslint.config.mjs`，沿用 `eslint-config-next`）執行 `eslint .`

## 專案結構

```text
.
├─ public/                # 靜態資源
├─ src/
│  ├─ app/                # App Router 頁面與 layout
│  │  ├─ admin/           # 後台管理頁面
│  │  ├─ profile/         # 志工個人中心
│  │  ├─ volunteer/       # 志工活動瀏覽與報名
│  │  ├─ actions/         # Server Actions
│  │  ├─ login/
│  │  ├─ register/
│  │  ├─ forgot-password/
│  │  ├─ resource/
│  │  ├─ support/
│  │  ├─ terms/
│  │  └─ privacy/
│  ├─ components/         # 介面元件、layout 與功能區塊
│  ├─ lib/                # Supabase client、server actions、共用邏輯
│  ├─ modules/            # 業務模組，目前含 activity
│  ├─ types/              # TypeScript 型別
│  └─ utils/              # 共用工具函式
├─ supabase/              # 手動執行的 SQL 檔案
├─ middleware.ts          # Next.js middleware 入口
└─ package.json
```

## 開發備註

- 這個專案目前不是以 REST API 為主，而是透過 `Supabase` 查詢與 `Server Actions` 實作主要資料流。
- 志工活動頁面使用 client-side Supabase 查詢；管理端與敏感操作則會透過 server-side client 或 service role key。
- 核心資料表（`profiles`、`activities`、`registrations`）的 migration 與 RLS 已收錄於 `supabase/`，可從零建置；`seed.sql` 仍為空，可視需求補資料。
