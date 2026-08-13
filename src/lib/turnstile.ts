// Cloudflare Turnstile 人機驗證（伺服器端）。
//
// 啟用與否由「兩把金鑰是否成對設定」決定：
//   - 兩者皆未設定＝功能刻意停用，verifyTurnstile() 回傳 true（fail-open），
//     方便本機開發與尚未申請金鑰的環境照常運作。
//   - 兩者皆設定＝驗證生效，缺 token 或驗證失敗都會被擋下。
//   - 只設了 site key 而缺 secret＝設定錯誤，一律 fail-closed 擋下並記錄
//     （見下方註解：這種情況靜默放行等於防護形同虛設）。
//   - siteverify 服務異常＝fail-closed。
//
// 申請金鑰：Cloudflare Dashboard → Turnstile → 新增網站，取得 Site Key（公開）
// 與 Secret Key（伺服器端）。

const SITEVERIFY_URL =
  "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export async function verifyTurnstile(token: string | null): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY?.trim();
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim();

  if (!secret) {
    // 只有「site key 與 secret 皆未設定」＝功能刻意停用，才 fail-open 放行。
    // 若前端已掛上 widget（site key 有設）卻獨缺 secret，屬設定錯誤：此時
    // 不可靜默放行（否則機器人防護形同虛設），一律 fail-closed 擋下並記錄。
    if (siteKey) {
      console.error(
        "[turnstile] 已設定 NEXT_PUBLIC_TURNSTILE_SITE_KEY 但缺少 TURNSTILE_SECRET_KEY，人機驗證一律拒絕。"
      );
      return false;
    }
    return true; // 功能未啟用（兩者皆未設定）
  }
  if (!token) return false;

  try {
    const res = await fetch(SITEVERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret, response: token }),
    });
    const data = (await res.json()) as {
      success?: boolean;
      "error-codes"?: string[];
    };
    if (data.success !== true) {
      // siteverify 只在失敗時回 error-codes（invalid-input-secret＝secret 不對、
      // timeout-or-duplicate＝token 已用過或過期…）。沒有這行的話，線上只看得到
      // 前端那句「人機驗證失敗」，無從分辨是金鑰設定錯還是 token 問題。
      console.error(
        "[turnstile] siteverify 未通過：",
        data["error-codes"]?.join(", ") ?? "(未回傳 error-codes)"
      );
    }
    return data.success === true;
  } catch {
    // 驗證服務暫時不可用時採 fail-closed，避免被繞過
    return false;
  }
}
