type ErrorLike =
  | { message?: string | null }
  | Error
  | string
  | null
  | undefined;

export function getErrorMessage(error: ErrorLike) {
  if (!error) return "未知錯誤";
  if (typeof error === "string") return error;
  if (typeof (error as any).message === "string" && (error as any).message.trim()) {
    return (error as any).message.trim();
  }
  return "未知錯誤";
}

