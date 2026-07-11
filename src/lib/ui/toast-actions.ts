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
];

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

