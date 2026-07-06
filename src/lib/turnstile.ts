// Cloudflare Turnstile 人機驗證（伺服器端）。
//
// 設計為「未設定金鑰即自動停用」：
//   - 未設定 TURNSTILE_SECRET_KEY 時 verifyTurnstile() 直接回傳 true，
//     方便本機開發與尚未申請金鑰的環境照常運作（fail-open）。
//   - 一旦於環境變數設定 secret（並在前端設 NEXT_PUBLIC_TURNSTILE_SITE_KEY），
//     驗證即自動生效，缺 token 或驗證失敗都會被擋下。
//
// 申請金鑰：Cloudflare Dashboard → Turnstile → 新增網站，取得 Site Key（公開）
// 與 Secret Key（伺服器端）。

const SITEVERIFY_URL =
  "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export async function verifyTurnstile(token: string | null): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY?.trim();
  if (!secret) return true; // 功能未啟用
  if (!token) return false;

  try {
    const res = await fetch(SITEVERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret, response: token }),
    });
    const data = (await res.json()) as { success?: boolean };
    return data.success === true;
  } catch {
    // 驗證服務暫時不可用時採 fail-closed，避免被繞過
    return false;
  }
}
