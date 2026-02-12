# Yilan TFCF 志工平台

宜蘭家扶志工管理與報名平台。

## 📋 專案介紹

這是一個為宜蘭佛光山天佛樓文化基金會開發的志工平台，用於管理志工招募、活動報名、時數統計和志工資料。

### 主要功能

**志工端:**
- 📱 個人檔案管理（基本資料、聯絡方式、技能）
- 📋 活動報名與報名管理
- ✅ 確認服務時數
- 📊 查看個人計時數統計
- 🔔 活動通知提醒

**管理端:**
- 👥 志工人員管理
- 📅 活動創建與管理
- 📝 報名管理與審核
- ⏱️ 服務時數統計與報表
- 🔧 系統設定與通知管理

## 🚀 技術棧

- **前端:** Next.js 14 (App Router)、TypeScript、React
- **樣式:** Tailwind CSS、Shadcn UI
- **後端:** Next.js API Routes
- **資料庫:** Supabase (PostgreSQL)
- **認證:** Supabase Auth
- **通知:** LINE Notify、Email 服務
- **部署:** Vercel

## 📦 安裝與設定

### 必要環境
- Node.js 18+ 
- npm 或 yarn
- Supabase 帳號

### 步驟

1. **複製專案**
   ```bash
   git clone https://github.com/p66rkxwf/Yilan-TFCF-Volunteer-Platform.git
   cd yilan-tfcf-volunteer-platform
   ```

2. **安裝依賴**
   ```bash
   npm install
   ```

3. **環境變數設定**
   建立 `.env.local` 檔案：
   ```bash
   NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
   SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
   LINE_NOTIFY_TOKEN=your_line_notify_token
   SMTP_SERVER=your_smtp_server
   SMTP_USER=your_smtp_user
   SMTP_PASSWORD=your_smtp_password
   ```

4. **初始化資料庫**
   ```bash
   # 在 Supabase 執行 supabase/schema.sql
   ```

5. **啟動開發伺服器**
   ```bash
   npm run dev
   ```
   
   訪問 `http://localhost:3000`

## 📁 專案結構

```
src/
├── app/                    # Next.js App Router
│   ├── api/               # API 路由
│   ├── auth/              # 認證相關頁面
│   ├── manage/            # 管理員面板
│   └── volunteer/         # 志工面板
├── components/            # React 元件
│   ├── admin/            # 管理員元件
│   ├── volunteer/        # 志工元件
│   ├── layout/           # 佈局元件
│   └── ui/               # UI 元件庫
├── hooks/                 # 自定義 React Hooks
├── lib/                   # 工具函式
│   ├── supabase/         # Supabase 設定
│   ├── email.ts          # Email 服務
│   └── line.ts           # LINE 通知服務
├── modules/               # 業務邏輯模組
│   ├── activity/         # 活動模組
│   ├── auth/             # 認證模組
│   ├── registration/    # 報名模組
│   └── user/            # 使用者模組
├── types/                 # TypeScript 型別定義
└── utils/                 # 工具函式
```

## 🔐 行列級安全性 (RLS)

專案使用 Supabase RLS 實現安全性：
- `supabase/rls.sql` 定義各表的存取規則
- 志工只能存取自己的資料
- 管理員擁有完整控制權限

## 🔄 API 端點

- `POST /api/auth/register` - 使用者註冊
- `POST /api/auth/login` - 使用者登入
- `GET /api/activities` - 取得活動列表
- `POST /api/registration` - 報名活動
- `POST /api/notification/send` - 發送通知

---

**最後更新:** 2026年2月12日
