# 防濫用設定檢查表（Cloudflare Dashboard）

應用層已有的防護見下表。但**應用層防護不該是唯一一層**——目前正式站只要忘記設定
`TURNSTILE_SECRET_KEY` 與 `NEXT_PUBLIC_TURNSTILE_SITE_KEY` 其中之一，人機驗證就會整個
停用（兩者皆未設定時 `verifyTurnstile()` 刻意 fail-open，見 [src/lib/turnstile.ts](../src/lib/turnstile.ts)）。
邊緣層的速率限制不依賴應用程式設定，是這個失效模式的兜底。

## 1. Turnstile 金鑰必須成對

| 金鑰 | 設定位置 | 備註 |
| --- | --- | --- |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | GitHub repository **variable**（build 時內嵌） | 改動需重新 build 才生效 |
| `TURNSTILE_SECRET_KEY` | `wrangler secret put`（runtime） | 部署後設定即生效 |

**檢查方式**：開啟 `/login`，若看不到 Turnstile widget，代表 site key 未設定 → 人機驗證處於停用狀態。

三種設定狀態的行為（已在程式中實作，非需要另外設定的事）：

- 兩者皆設定 → 驗證生效
- 兩者皆未設定 → 功能停用，一律放行（僅適用本機開發）
- **只設了 site key、缺 secret → 一律擋下**（fail-closed）並在 log 記錄。這是刻意的：這種狀態下靜默放行等於防護形同虛設

## 2. Rate Limiting Rules

Dashboard → 該網域 → Security → WAF → Rate limiting rules。免費方案可建 1 條，Pro 以上較多；
若只能建一條，優先做 `/login`。

| 路徑 | 建議門檻 | 對應動作 | 理由 |
| --- | --- | --- | --- |
| `/login` | 同 IP 10 次 / 10 分鐘 | Managed Challenge | 撞庫與暴力破解的主要入口 |
| `/register` | 同 IP 5 次 / 10 分鐘 | Managed Challenge | 灌帳號 |
| `/support` | 同 IP 5 次 / 10 分鐘 | Managed Challenge | 表單灌爆；DB 端已有同 email 1 小時 5 次的限制（25／37） |
| `/profile/verify-email` | 同 IP 10 次 / 10 分鐘 | Managed Challenge | 索取 OTP 會觸發寄信；DB 端已有 60 秒節流（21） |

比對條件以 `http.request.uri.path eq "/login"` 這類精確路徑為準；動作選 Managed Challenge
而非 Block，避免同一機構共用出口 IP 的使用者被硬擋。

> 註：路徑是 Server Action 的所在頁面而非獨立 API endpoint——本專案的登入／註冊／支援表單
> 都以 Server Action 送出，請求會 POST 到頁面自身的路徑。

## 3. 已在應用層實作的防護（不需 Dashboard 設定，列此供對照）

| 端點 | Turnstile | 其他限制 |
| --- | --- | --- |
| `/register` | ✅ | 伺服器端欄位驗證 |
| `/support` | ✅ | 同 email 1 小時 5 次 + 全域上限 + 欄位長度上限（`25`／`37`） |
| `/login` | ✅ | 帳號不存在與密碼錯誤回同一錯誤訊息（防帳號列舉） |
| OTP 索取 | ✅ | 同一使用者 60 秒節流、15 分鐘過期、5 次嘗試上限（`21`） |
| 密碼重設 | — | 無自助流程，一律由管理員代設，故無可濫用的公開端點 |
