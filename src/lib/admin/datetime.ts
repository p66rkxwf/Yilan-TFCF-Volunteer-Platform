// 全站共用：台灣時區的時間顯示與 <input type="datetime-local"> 轉換
// 格式規範：日期 YYYY/MM/DD（補零）、時間 24 小時制 HH:mm

const DATE_TIME_FORMATTER = new Intl.DateTimeFormat("zh-TW", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Asia/Taipei",
  hourCycle: "h23",
});

const DATE_FORMATTER = new Intl.DateTimeFormat("zh-TW", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  timeZone: "Asia/Taipei",
});

const TIME_FORMATTER = new Intl.DateTimeFormat("zh-TW", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Asia/Taipei",
  hourCycle: "h23",
});

const WEEKDAY_FORMATTER = new Intl.DateTimeFormat("zh-TW", {
  weekday: "short",
  timeZone: "Asia/Taipei",
});

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return DATE_TIME_FORMATTER.format(new Date(iso));
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return DATE_FORMATTER.format(new Date(iso));
}

// 場次起訖：同日顯示「2026/07/10（五）09:00–12:00」，跨日顯示完整兩端
export function formatSessionRange(startIso: string, endIso: string): string {
  const start = new Date(startIso);
  const end = new Date(endIso);
  const sameDay = DATE_FORMATTER.format(start) === DATE_FORMATTER.format(end);
  const startText = `${DATE_FORMATTER.format(start)}（${WEEKDAY_FORMATTER.format(start)}）${TIME_FORMATTER.format(start)}`;
  return sameDay
    ? `${startText}–${TIME_FORMATTER.format(end)}`
    : `${startText} ～ ${DATE_FORMATTER.format(end)}（${WEEKDAY_FORMATTER.format(end)}）${TIME_FORMATTER.format(end)}`;
}

// datetime-local（視為台灣時間）→ ISO（UTC）
export function taipeiLocalToIso(local: string): string {
  return new Date(`${local}:00+08:00`).toISOString();
}

// ISO → datetime-local 值（台灣時間，yyyy-MM-ddTHH:mm）
export function isoToTaipeiLocal(iso: string | null | undefined): string {
  if (!iso) return "";
  const shifted = new Date(new Date(iso).getTime() + 8 * 60 * 60 * 1000);
  return shifted.toISOString().slice(0, 16);
}

// 使用者自行輸入的台灣時間文字 → ISO（UTC）；格式或日期非法時回 null。
// 接受「YYYY-MM-DD HH:mm」（亦允許 / 分隔、以 T 或空白分隔日期時間）。
export function parseTaipeiInput(text: string | null | undefined): string | null {
  if (!text) return null;
  const m = text.trim().match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})[ T](\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const [, ys, mos, ds, hs, mis] = m;
  const y = Number(ys);
  const mo = Number(mos);
  const d = Number(ds);
  const h = Number(hs);
  const mi = Number(mis);
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59) return null;
  const pad = (n: number) => String(n).padStart(2, "0");
  const local = `${y}-${pad(mo)}-${pad(d)}T${pad(h)}:${pad(mi)}`;
  // 以嚴格 ISO 解析：不合法日期（如 2/30、4/31）會得到 Invalid Date
  const date = new Date(`${local}:00+08:00`);
  if (Number.isNaN(date.getTime())) return null;
  // 二次確認未被進位（部分引擎對越界日期會回捲）：比對回轉後的台北本地值
  if (isoToTaipeiLocal(date.toISOString()) !== local) return null;
  return date.toISOString();
}

// ISO → 使用者輸入用文字（台灣時間，YYYY-MM-DD HH:mm）
export function formatTaipeiInput(iso: string | null | undefined): string {
  if (!iso) return "";
  return isoToTaipeiLocal(iso).replace("T", " ");
}

// 使用者輸入的日期文字（YYYY-MM-DD，允許 /）→ 正規化 YYYY-MM-DD；非法（含 2/30 等）回 null
export function normalizeDateInput(text: string | null | undefined): string | null {
  if (!text) return null;
  const m = text.trim().match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const pad = (n: number) => String(n).padStart(2, "0");
  const iso = `${y}-${pad(mo)}-${pad(d)}`;
  // 以中午避開換日；越界日期（如 2/30）在嚴格 ISO 解析下為 Invalid Date
  if (Number.isNaN(new Date(`${iso}T12:00:00+08:00`).getTime())) return null;
  return iso;
}

// 使用者輸入的時間文字（H:mm 或 HH:mm）→ 正規化 HH:mm；非法回 null
export function normalizeTimeInput(text: string | null | undefined): string | null {
  if (!text) return null;
  const m = text.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  if (h > 23 || mi > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(mi).padStart(2, "0")}`;
}

// 場次時長（小時，1 位小數）
export function sessionHours(startIso: string, endIso: string): number {
  const ms = new Date(endIso).getTime() - new Date(startIso).getTime();
  return Math.round((ms / 3_600_000) * 10) / 10;
}
