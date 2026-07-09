// 前後台共用的表單驗證：送出前檢查，錯誤訊息顯示於欄位下方（Field error prop）。

export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

// 台灣電話：行動 09xxxxxxxx（10 碼）或市話 0X…（9～10 碼），允許 - 空格 括號分隔
export function isValidTaiwanPhone(value: string): boolean {
  const digits = value.replace(/[\s()-]/g, "");
  return /^0\d{8,9}$/.test(digits);
}

// 登入帳號：4～30 碼英數與 . _ -
export function isValidUsername(value: string): boolean {
  return /^[A-Za-z0-9._-]{4,30}$/.test(value.trim());
}

// 生日：合法日期、不可為未來、年齡上限 120 歲
export function isValidBirthDate(value: string): boolean {
  if (!value) return false;
  const d = new Date(`${value}T00:00:00`);
  if (Number.isNaN(d.getTime())) return false;
  const now = new Date();
  if (d > now) return false;
  return now.getFullYear() - d.getFullYear() <= 120;
}
