import type { ActionResult } from "@/lib/types/action";

type ErrorLike =
  | { message?: string | null }
  | Error
  | string
  | null
  | undefined;

// 已知的資料庫層錯誤（約束名／訊息片段）→ 使用者可理解的中文。
// Postgres/Supabase 直寫失敗時，原始訊息（如 exclusion constraint 名）會直接冒到 UI，
// 這裡集中轉譯常見情形，避免技術字串外洩給操作者。
const DB_ERROR_TRANSLATIONS: { match: RegExp; message: string }[] = [
  { match: /session_no_overlap/i, message: "場次時段與同活動的其他場次重疊，請調整時間。" },
  {
    match: /registrations_activity_session_id_fkey/i,
    message: "此場次已有報名紀錄（含已取消），無法刪除，請改用「取消場次」。",
  },
];

// 網路層失敗的統一文案（沿用 /login 既有措辭，不另造新字串）。
export const NETWORK_ERROR_MESSAGE = "連線發生問題，請檢查網路後再試一次。";

/** Server Action 的通用回傳形狀（定義在 lib/types/action.ts，此處僅取用）。 */
export type ActionResultLike = ActionResult;

/**
 * 呼叫 Server Action，並把「網路層失敗」轉成與業務錯誤同型的結果。
 *
 * Server Action 底層是 fetch：斷線或 Worker 丟例外時 promise 會直接 reject，
 * 而呼叫端常寫成 `setSaving(true); const r = await action(); setSaving(false);`
 * ——那行 setSaving(false) 永遠不會跑到，按鈕就永久卡在 loading 且沒有任何訊息
 * （第一階段 QA 的 BUG-01）。一律用本函式包起來，呼叫端只需處理 result.error
 * 一條路徑，不必每個 handler 各寫一次 try/catch。
 *
 * 註：supabase-js 的 .from()/.rpc() 網路失敗是回在 error 欄位而非 throw，
 * 故那類呼叫不需要本函式。
 *
 * 回傳型別維持 T（而非 T | {error}）：既有的 action 本來就在失敗時只回
 * `{ error }`、其餘欄位為 undefined，呼叫端一律先檢查 error 再讀其他欄位，
 * 網路失敗走的是同一條路徑，故此處的 cast 與既有慣例一致，也讓呼叫端
 * 不必為了這層包裝多寫型別分支。
 */
export async function callAction<T extends ActionResultLike>(
  action: () => Promise<T>
): Promise<T> {
  try {
    return await action();
  } catch {
    return { error: NETWORK_ERROR_MESSAGE } as T;
  }
}

export function getErrorMessage(error: ErrorLike) {
  if (!error) return "未知錯誤";
  const raw =
    typeof error === "string"
      ? error
      : typeof (error as any).message === "string"
        ? (error as any).message
        : "";
  const trimmed = raw.trim();
  if (!trimmed) return "未知錯誤";
  for (const { match, message } of DB_ERROR_TRANSLATIONS) {
    if (match.test(trimmed)) return message;
  }
  return trimmed;
}

