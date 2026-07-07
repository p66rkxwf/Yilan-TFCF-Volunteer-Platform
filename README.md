# 宜蘭家扶中心志工平台

宜蘭家扶中心的志工招募、活動報名與後台管理平台。

本專案使用 `Next.js App Router` 搭配 `Supabase` 建置（V2 資料模型：職員／志工分表、活動→場次→報名三層，
交易性寫入一律經由 RLS 保護的 RPC 進行）。前台提供志工報名流程與個人中心，後台提供活動營運、學生管理
與系統設定。首頁保留了獎學金入口，但開放時間尚未公告。

> [!NOTE]
> `supabase/v2/` 內已收錄可從零建置的完整 V2 SQL（01～10，依編號為部署順序）。
> 依 [supabase/README.md](supabase/README.md) 的順序執行即可建立 `staff_profiles`、`volunteer_profiles`、
> `activities`／`activity_sessions`、`registrations`、`favorites`、`support_requests` 等全部資料表與
> RLS／RPC；文件內也說明了部署後需在 Supabase Dashboard 補的手動步驟（種子系統管理員、授權排程函式給
> service_role、設定 Auth Redirect URLs 與 custom SMTP）。排程與寄信由 Cloudflare Cron Worker
> （[workers/orchestrator/](workers/orchestrator/)）負責，不使用 pg_cron。

## 功能總覽

### 志工端

- 帳號註冊（送出後為待審核狀態；審核中／未通過會導向專屬提示頁，不會看到平台資料）
- 登入、忘記密碼（Email 寄送重設連結，經 `/auth/callback` 導回站台完成重設）
- 瀏覽與搜尋志工活動、查看場次剩餘名額，收藏活動
- 針對場次送出報名、查看與取消個人報名紀錄
- 活動當天自行簽到（開放時間為活動開始前特定分鐘數，由後台參數控制）
- 查看個人服務時數紀錄
- 提出／撤回帳號停用申請
- 編輯個人資料
- 首頁與「最新消息」瀏覽公告（已發布公告未登入亦可瀏覽）
- 查閱常見問題、服務條款、隱私政策，並可送出支援需求（實際寫入後台收件匣，非僅前端表單）
- 獎學金入口（首頁 Hero、header 連結、`/scholarship` 頁；目前未開放，開放時間另行公告）

### 管理端

- 工作台儀表板總覽
- 活動管理：建立／編輯／取消活動與場次（支援批次建立場次）、指派主辦人
- 報名審核：核准／拒絕報名（支援批次操作）、審核取消申請、逾期未審人工待辦清單
- 出席簽到：活動當天簽到、代登／補登出席與服務時數
- 學生名冊：搜尋、篩選志工，查看個別資料與報名紀錄
- 帳號審核：核准／拒絕志工註冊申請，並指派負責社工
- 黑名單管理：手動加入、調整解除日，查看自動觸發紀錄
- 年度審查：依畢業參考年齡列出建議審查名單
- 職員管理：建立與管理職員帳號、角色
- 公告管理：草稿／發布／下架
- 支援需求收件匣：查看與標記處理 `/support` 頁送出的需求
- 報表與統計：服務時數、活動成效等報表
- 期間與參數：學期期間、各年級時數門檻、系統參數設定
- 操作紀錄：稽核軌跡（僅系統管理員可見）

## 技術棧

- `Next.js 16`（App Router；`proxy.ts` 取代舊有 `middleware.ts` 慣例）
- `React 19`
- `TypeScript`
- `Tailwind CSS 4`
- `Supabase Auth / Database / SSR`
- 部署目標為 `Cloudflare Workers`（透過 `@opennextjs/cloudflare` 建置、`wrangler` 部署）

## 核心資料概念

目前程式碼中已使用的核心資料表、視圖與型別定義可參考 [src/lib/types/database.ts](src/lib/types/database.ts)，
完整 SQL 定義見 [supabase/v2/](supabase/v2/)。

- `staff_profiles` / `volunteer_profiles`：職員與志工分表（各自獨立的角色／狀態、審核與停用流程）
- `activities` → `activity_sessions` → `registrations`：活動主檔→場次（日期、名額、報名截止皆在此層）
  →報名紀錄（含審核、出席、服務時數、取消流程）
- `activity_organizers`：活動與主辦職員的多對多關聯
- `favorites`：志工收藏的活動清單
- `deactivation_requests`：志工帳號停用申請與審核
- `blacklist_events`：黑名單事件紀錄（唯一事實來源；`volunteer_profiles.is_blacklisted` 僅為鏡像欄位）
- `announcements`：公告（含已發布公告的公開唯讀權限）
- `support_requests`：`/support` 頁送出的支援需求與處理狀態
- `periods` / `grade_hour_thresholds` / `grade_reference_ages` / `system_settings`：報表期間、時數門檻、
  年度審查基準與系統參數
- `audit_logs`：管理操作稽核紀錄
- `notification_outbox`：通知外送佇列（Transactional Outbox；由 Cloudflare Cron Worker 每分鐘消化並經 Resend 寄出）

角色列舉（`staff_role`）：

- `system_admin`
- `unit_admin`
- `staff`

志工狀態列舉（`volunteer_status`）：

- `pending_review`
- `active`
- `suspended`
- `graduated`
- `rejected`

報名狀態列舉（`registration_status`）：

- `pending`
- `approved`
- `rejected`
- `cancel_pending`（取消申請待審）
- `cancelled`
- `expired`（場次結束後仍未審核，由排程標記）

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

本 repo 內可直接執行的 SQL 檔位於 [supabase/v2/](supabase/v2/)，部署順序與部署後手動步驟（種子系統管理員、
授權排程函式給 service_role、於 Supabase Dashboard 設定 Auth Redirect URLs 與 custom SMTP 以讓忘記密碼
流程生效）請見 [supabase/README.md](supabase/README.md)。排程與寄信部署見
[workers/orchestrator/README.md](workers/orchestrator/README.md)。

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
- `npm run preview`: 透過 `opennextjs-cloudflare` 建置後，於本機預覽 Cloudflare Workers 版本
- `npm run deploy`: 建置並部署到 Cloudflare Workers
- `npm run upload`: 建置並上傳新版本（不直接切換上線）
- `npm run cf-typegen`: 產生 Cloudflare bindings 型別（`cloudflare-env.d.ts`）

## 專案結構

```text
.
├─ public/                # 靜態資源
├─ supabase/
│  ├─ README.md           # V2 部署順序與部署後手動步驟
│  └─ v2/                 # 01~10 SQL（01~06 定案版，07~10 增量 patch）
├─ src/
│  ├─ app/                # App Router 頁面與 layout
│  │  ├─ admin/           # 後台：activities/registrations/attendance/volunteers/
│  │  │                   #      volunteer-review/blacklist/annual-review/staff/
│  │  │                   #      announcements/support/reports/settings/logs
│  │  ├─ profile/         # 志工個人中心：favorites/registrations/certificate/settings
│  │  ├─ volunteer/       # 志工活動瀏覽與報名（[activityId] 詳情頁）
│  │  ├─ announcements/   # 最新消息列表與詳情頁
│  │  ├─ auth/callback/   # Supabase auth 重導向 route handler（忘記密碼等）
│  │  ├─ account-review/  # 志工帳號審核中／未通過提示頁
│  │  ├─ login/、register/、forgot-password/
│  │  ├─ scholarship/、resource/、support/、terms/、privacy/
│  │  └─ layout.tsx、page.tsx（首頁）
│  ├─ components/
│  │  ├─ admin/           # 後台共用 UI（PageHeader/Panel/TableShell/Select/StatusPill…）
│  │  ├─ layout/          # header／footer／root-layout-client
│  │  ├─ shells/          # InfoPageShell（resource/support/privacy/terms 共用外殼）
│  │  ├─ site/、support/、resource/、ui/
│  │  └─ auth-provider.tsx
│  ├─ lib/
│  │  ├─ supabase/        # client／server／admin／middleware／cached-auth
│  │  ├─ actions/         # Server Actions（auth/profiles/registrations/admin-users/
│  │  │                   #                admin-volunteers/deactivation/support）
│  │  ├─ admin/           # labels（ENUM 中文標籤）、datetime 格式化
│  │  ├─ types/database.ts  # 手寫 Supabase 型別定義
│  │  └─ ui/、birthday.ts
│  └─ proxy.ts            # Next.js 16 middleware 入口（呼叫 lib/supabase/middleware 更新 session）
├─ workers/
│  └─ orchestrator/        # Cloudflare Cron Worker：消化 notification_outbox（Resend）＋觸發 job_*
├─ wrangler.jsonc          # Cloudflare Workers 部署設定（OpenNext；app 本體）
└─ package.json
```

## 開發備註

- 前端直連 Supabase 查詢／`Server Actions`／`supabase.rpc(...)` 為主要資料流，非以自建 REST API 為主。
- 志工活動頁面使用 client-side Supabase 查詢；管理端與敏感操作則會透過 server-side client 或 service role key。
- RLS 為主要防線：`registrations`、`deactivation_requests`、`support_requests` 等涉及多步驟邏輯或跨角色
  寫入的資料表刻意不開放直寫 policy，一律強制走 `SECURITY DEFINER` RPC，交易邊界與權限檢查集中在
  資料庫端（詳見 `supabase/v2/03_rls_policies.sql`、`04_rpc_functions.sql`）。
- 通知採 Transactional Outbox 模式：業務交易只寫入 `notification_outbox`，由 Cloudflare Cron Worker
  （`workers/orchestrator/`）每分鐘消化並經 Resend 寄出；同一 worker 也以 service_role RPC 觸發 5 支
  背景排程函式（`job_*`），故本專案不使用 pg_cron。
- 核心資料表與 RLS／RPC 已收錄於 `supabase/v2/`，可從零建置；`07`～`10` 為之後新增的增量 patch，
  執行細節（含 `07` 需分兩步驟）見 `supabase/README.md`。
