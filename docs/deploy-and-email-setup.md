# 部署與 Email 串接完整步驟（宜蘭家扶志工平台）

本文件是「從零把網站與 Email 通知接上正式服務」的完整操作手冊。照 Part A → Part B 的順序做即可。

---

## 0. 架構總覽與兩個關鍵前提

| 元件 | 用什麼 | 位置 / 網址 |
|---|---|---|
| 網站（前後台） | Next.js 16 + OpenNext → Cloudflare Workers | `https://volunteer.sekinv.com` |
| 資料庫 / 登入 | Supabase | 專案 `ncygfjndwuyolgfceiuu` |
| 通知信寄送 | Resend | 寄件網域 `send.sekinv.com` |
| 通知信 / 背景排程 worker | Cloudflare Cron Worker | `workers/orchestrator/` |
| Auth 交易信（重設密碼等） | Supabase Auth custom SMTP → Resend | Supabase Dashboard 設定 |

> **兩個坑，務必記住（本專案已針對它們調整過）：**
>
> 1. **不可在 Windows 上 build 網站。** `npm run deploy`（OpenNext build）在 Windows 會把 Windows 絕對路徑烤進 bundle，部署後**所有頁面 500**。所以網站一律用 **GitHub Actions（Linux）** 部署（見 Part A）。本機只用 `npm run dev` 開發即可，不要在本機跑 `npm run deploy`。
> 2. **middleware 用 `src/middleware.ts`（edge），不是 Next 16 的 `proxy.ts`。** OpenNext Cloudflare 不支援 Node runtime 的 proxy.ts。已改好，別改回去。

### 網址與網域關係

`sekinv.com` 是根網域（DNS 在 Cloudflare）。底下兩個**不同用途、各自獨立**的子網域：

- `volunteer.sekinv.com` → **網站**（Cloudflare Worker 的自訂網域）
- `send.sekinv.com` → **寄信**（只加 DNS 記錄給 Resend，不放任何網頁）

---

# Part A — 網站部署（GitHub Actions CI）

目標：讓 `https://volunteer.sekinv.com` 正常運作。部署一律在 GitHub 的 Linux runner 上進行。

## A1. 前置

- 網站程式已在 GitHub `main` 分支（含 `.github/workflows/deploy.yml`、`src/middleware.ts`）。
- Cloudflare 帳號，且 `sekinv.com` 的 DNS 已在 Cloudflare。

## A2. 建立 Cloudflare API Token

1. Cloudflare Dashboard → 右上頭像 → **My Profile → API Tokens → Create Token**。
2. 選「**Edit Cloudflare Workers**」範本。
3. **權限清單維持範本預設，不用改。**（最小其實只需 Account→Workers Scripts→Edit、Account→Account Settings→Read、Zone→Workers Routes→Edit、User→User Details→Read。）
4. **Account Resources** → `Include` → 選**你的帳號**。
5. **Zone Resources** → `Include` → 選 **All zones**（或 `Specific zone` → `sekinv.com`）。
6. Client IP、TTL 留空 → **Continue to summary → Create Token**。
7. **複製 token（只顯示一次）**。

## A3. 設定 GitHub Secrets 與 Variables

到 GitHub repo → **Settings → Secrets and variables → Actions**。全部用 **Repository** 層級（不是 Environment）。

**Secrets 分頁（機密）：**

| 名稱 | 值 |
|---|---|
| `CLOUDFLARE_API_TOKEN` | A2 建立的 token |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare 後台右側欄的 Account ID |

**Variables 分頁（`NEXT_PUBLIC_*` 屬公開、非機密）：**

| 名稱 | 值 |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://ncygfjndwuyolgfceiuu.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 你的 Supabase anon key |
| `NEXT_PUBLIC_SITE_URL` | `https://volunteer.sekinv.com` |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | 先留空（要開 Turnstile 再填，見 Part C） |

## A4. 觸發部署

- **自動**：push 任何 commit 到 `main` 就會觸發。
- **手動**：GitHub → **Actions → Deploy app (Cloudflare Workers) → Run workflow**。
- 到 **Actions** 分頁看該次 run 的狀態；失敗就點進去看 log（多半是 A2/A3 的 token 或 secrets 沒設好，修好後 **Re-run jobs**）。

## A5. 設定 runtime 機密（伺服器端）

`SUPABASE_SERVICE_ROLE_KEY` 是**執行期**才讀的機密（登入、後台管理需要它；首頁不需要）。它不是 build-time 變數，設在 **Worker 上**，設一次即可、之後每次部署都保留。**這步在 Windows 上跑也沒問題**（只是打 API，不是 build）：

```bash
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
#   貼：.env.local 裡（ncygf 專案）那把 service role key
```

> 需先完成過一次 A4 部署（Worker 存在）才能設 secret。或改在 Cloudflare Dashboard → Workers & Pages → `volunteer-platform` → Settings → Variables and Secrets 設定。

## A6. 接自訂網域 `volunteer.sekinv.com`

Cloudflare Dashboard → **Workers & Pages → `volunteer-platform` → Settings → Domains & Routes → Add → Custom Domain** → 輸入 `volunteer.sekinv.com` → Add。因為 DNS 已在 Cloudflare，會自動建 DNS + 憑證，幾分鐘後就會通。（此為一次性設定，之後 CI 部署不會動到它。）

## A7. 驗證

- 開 `https://volunteer.sekinv.com` → 看得到首頁（不再全站 500）。
- 試登入（需 A5 的 secret 已設 + Supabase 已種第一位系統管理員，見 `supabase/README.md` 手動步驟 2）。

---

# Part B — 通知信 / Auth 交易信 / 背景排程

目標：`send.sekinv.com` 完成 Resend 驗證，部署 mail worker，讓通知信實際寄出、排程自動跑、忘記密碼信正常。

## B1. Resend 建立寄信網域

1. 註冊 / 登入 [resend.com](https://resend.com)。
2. **Domains → Add Domain**：
   - **Name**：`send.sekinv.com`
   - **Region**：**Tokyo (ap-northeast-1)**（離台灣最近，**建立後不可改**）
   - **Add**
3. 畫面會列出要加的 DNS 記錄，**保持這頁開著**，下一步照抄。

## B2. 在 Cloudflare 加 DNS 記錄

> ⚠️ 最常卡關：**若某筆是 CNAME，Proxy 一定要選「DNS only（灰色雲）」**，不要開橘雲代理；**Name 只填主機前綴**，Cloudflare 會自動補網域（多打會變成 `send.send.sekinv.com`）。

Cloudflare Dashboard → `sekinv.com` → **DNS → Records → Add record**，依 Resend 畫面逐筆新增。`send.` 子網域通常是（**值一律以 Resend 畫面為準**）：

| 類型 | Name | 值（範例） | 備註 |
|---|---|---|---|
| MX | `send` | `feedback-smtp.ap-northeast-1.amazonses.com`（Priority 10） | 退信回報 |
| TXT | `send` | `v=spf1 include:amazonses.com ~all` | SPF |
| TXT | `resend._domainkey.send` | Resend 給的一長串 `p=...` | DKIM |
| TXT（建議） | `_dmarc` | `v=DMARC1; p=none;` | DMARC |

## B3. 驗證網域 + 取得 API Key

1. 回 Resend 網域頁 → **Verify DNS Records**（或等自動偵測）。全部變綠 = **Verified**。
2. **API Keys → Create API Key** → 權限 **Sending access** → 命名如 `volunteer-worker` → 複製 `re_...`（**只顯示一次**）。同一把之後 Supabase SMTP 也會用。

## B4. 部署通知信 / 排程 worker（`workers/orchestrator`）

> 這個 worker 沒有 build（不像網站），可直接在本機部署，**Windows 也可以**。

```bash
cd workers/orchestrator
npm install
npx wrangler login          # 首次授權 Cloudflare 帳號
# 依序設定 5 個 secrets（會逐一提示貼值）：
npx wrangler secret put SUPABASE_URL
#   貼：https://ncygfjndwuyolgfceiuu.supabase.co
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
#   貼：ncygf 專案的 service role key
npx wrangler secret put RESEND_API_KEY
#   貼：re_...（B3）
npx wrangler secret put MAIL_FROM
#   貼：宜蘭家扶志工平台 <noreply@send.sekinv.com>
npx wrangler secret put SITE_URL
#   貼：https://volunteer.sekinv.com
# 部署（wrangler.jsonc 已含 6 個 cron trigger）：
npx wrangler deploy
```

之後每分鐘會自動消化 `notification_outbox` 寄信，並在各排程時間觸發 `job_*`。log 可用 `npx wrangler tail` 看。

## B5. Supabase 授權排程函式

Supabase Dashboard → **SQL Editor** → 貼上 `supabase/v2/12_enable_scheduled_jobs.sql` 全文 → **Run**（把 5 支 `job_*` 授權給 `service_role`，供 worker 以 RPC 觸發；可重複執行）。

> 若你**曾跑過舊版 pg_cron 版**的 12，再執行檔尾那段 `cron.unschedule(...)` 清掉舊排程。沒跑過就不用。

## B6. Supabase Auth 自訂 SMTP（重設密碼／驗證信）

Dashboard → **Authentication → Emails → SMTP Settings → Enable Custom SMTP**：

| 欄位 | 值 |
|---|---|
| Sender email | `noreply@send.sekinv.com` |
| Sender name | `宜蘭家扶志工平台` |
| Host | `smtp.resend.com` |
| Port | `465` |
| Username | `resend` |
| Password | `re_...`（同 B3 的 API Key） |

再到 **Authentication → URL Configuration → Redirect URLs** 加入：

- `https://volunteer.sekinv.com/auth/callback`
- `http://localhost:3000/auth/callback`

（建議）**Authentication → Rate Limits** 把每小時寄信上限調高（內建預設很低）。

## B7. 驗證

1. **測通知信**：SQL Editor 塞一筆（`recipient_user_id` 用你自己一個 auth 使用者 id）：
   ```sql
   insert into public.notification_outbox (recipient_user_id, notification_type, payload)
   values ('<你的 auth 使用者 id>', 'account_review_result', '{}'::jsonb);
   ```
   等 ≤1 分鐘 → 收件匣應收到信，再查：
   ```sql
   select status, count(*) from public.notification_outbox group by status;
   ```
   那筆應變 `sent`。
2. **忘記密碼**：`/forgot-password` 送出 → 收到 Resend 寄的重設信 → 連結導回 `/auth/callback` 能重設。
3. **實際業務**：後台核准一筆志工帳號 → 幾分鐘內收到通知信。
4. **worker log**：`cd workers/orchestrator && npx wrangler tail`。

---

# Part C — Turnstile 防機器人（選用）

保護 `/support`、`/register`、`/forgot-password`（程式已接好，未設金鑰時自動停用、表單照常）。

1. Cloudflare Dashboard → **Turnstile → 新增網站** → 取得 **Site Key** 與 **Secret Key**。
2. 設定變數：
   - `NEXT_PUBLIC_TURNSTILE_SITE_KEY`（build-time）→ 填進 A3 的 GitHub **Variables**，重跑一次部署。
   - `TURNSTILE_SECRET_KEY`（runtime）→ `npx wrangler secret put TURNSTILE_SECRET_KEY`（app worker）。

---

# Part D — 環境變數總表（誰設在哪）

| 變數 | 類型 | 設定位置 | 值 |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | build-time | GitHub Variables | `https://ncygfjndwuyolgfceiuu.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | build-time | GitHub Variables | anon key |
| `NEXT_PUBLIC_SITE_URL` | build-time | GitHub Variables | `https://volunteer.sekinv.com` |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | build-time | GitHub Variables | Turnstile site key（選用） |
| `CLOUDFLARE_API_TOKEN` | CI 用 | GitHub Secrets | A2 的 token |
| `CLOUDFLARE_ACCOUNT_ID` | CI 用 | GitHub Secrets | 帳號 ID |
| `SUPABASE_SERVICE_ROLE_KEY` | runtime | app worker secret（`wrangler secret put`） | service role key |
| `TURNSTILE_SECRET_KEY` | runtime | app worker secret | Turnstile secret（選用） |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` / `RESEND_API_KEY` / `MAIL_FROM` / `SITE_URL` | runtime | **mail worker** secret（`workers/orchestrator/`） | 見 B4 |

> 本機開發：`.env.local` 放 `NEXT_PUBLIC_*`（給 `next dev`）；`.dev.vars` 放本機 preview 用的機密。務必讓兩者指向**同一個** Supabase 專案（正式為 `ncygfjndwuyolgfceiuu`），避免混用舊專案。

---

# Part E — 疑難排解

| 症狀 | 原因 / 解法 |
|---|---|
| 部署後**所有頁面 500** | 在 Windows build 的（路徑被烤進 bundle）。**改用 GitHub Actions（Part A）部署**，別在本機 `npm run deploy`。 |
| build 報 `Node.js middleware is not currently supported` | 有人把 `middleware.ts` 改回 `proxy.ts` 了。維持 `src/middleware.ts`（edge）。 |
| Actions 失敗在 wrangler / 認證 | `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` 沒設或 token 資源沒選（Account/Zone）。 |
| 登入 / 後台 500，首頁正常 | app worker 沒設 `SUPABASE_SERVICE_ROLE_KEY`（A5）。 |
| Resend 網域一直 pending | Cloudflare 記錄開了橘雲代理（改灰雲）、或 Name 多打網域變 `send.send...`。 |
| 通知信不寄、outbox 一直累積 | mail worker 沒部署，或 `RESEND_API_KEY` 沒設；`wrangler tail` 看 log。 |
| 忘記密碼信沒收到 / 連結失效 | Supabase SMTP 沒設（B6），或 Redirect URLs 沒加正式網址。 |

---

## 一句話流程

**Part A（GitHub 設 secrets/vars → push main → CI 部署 → 設 service role secret → 接自訂網域）**，網站就會通；**Part B（Resend 驗證 send. → 部署 mail worker → 跑 12 SQL → Supabase SMTP）**，通知信與排程就會動。
