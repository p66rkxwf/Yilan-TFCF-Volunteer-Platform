# 宜蘭家扶中心志工平台

宜蘭家扶中心的志工招募、活動報名與後台管理平台。

本專案使用 `Next.js App Router` 搭配 `Supabase` 建置，提供志工端報名流程、個人中心，以及管理端活動與使用者管理功能。首頁保留了獎學金入口，但目前仍為未開放狀態。

> [!IMPORTANT]
> 這個 repo 目前只收錄 `favorites` 相關的 SQL migration 與 RLS 設定。
> 前端程式已依賴 `profiles`、`activities`、`registrations` 等核心資料表，但這些表的完整 migration 並未一併提交。
> 如果要從零建立 Supabase 專案，請先準備既有 schema，或自行補齊相對應資料表與 enum。

## 功能總覽

### 志工端

- 帳號註冊、登入、忘記密碼
- 瀏覽與搜尋志工活動
- 查看活動詳情、收藏活動、送出報名
- 查看與取消個人報名紀錄
- 編輯個人資料與停用帳號
- 查閱 FAQ、服務條款、隱私政策與支援頁

### 管理端

- 後台儀表板與報名概況
- 建立、編輯、取消與恢復活動
- 審核活動報名狀態
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

- `profiles`: 使用者基本資料、角色、狀態、社工指派資訊
- `activities`: 志工活動主檔
- `registrations`: 志工活動報名紀錄
- `favorites`: 志工收藏活動清單

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

本 repo 內可直接執行的 SQL 檔位於 [supabase/README.md](supabase/README.md)。

建議順序：

1. 先確認 Supabase 專案中已存在 `profiles`、`activities`、`registrations` 與對應 enum。
2. 執行 [supabase/schema.sql](supabase/schema.sql) 建立 `favorites` 表與索引。
3. 執行 [supabase/rls.sql](supabase/rls.sql) 套用 `favorites` 與 `profiles` 相關 RLS / policy。
4. [supabase/seed.sql](supabase/seed.sql) 目前為空，可視需求自行補資料。

### 啟動開發環境

```bash
npm run dev
```

啟動後開啟 `http://localhost:3000`。

## 可用腳本

- `npm run dev`: 啟動開發伺服器
- `npm run build`: 建立 production build
- `npm run start`: 啟動 production server
- `npm run lint`: 目前 `package.json` 仍保留此腳本，但在現有 `Next.js 16` 設定下會失敗，若要啟用需改成新的 ESLint 執行方式

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
- 若要補齊從零建置能力，建議下一步先整理 `profiles`、`activities`、`registrations` 的 migration 與 seed。
