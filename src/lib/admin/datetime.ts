// 後台共用：台灣時區的時間顯示與 <input type="datetime-local"> 轉換

const DATE_TIME_FORMATTER = new Intl.DateTimeFormat("zh-TW", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Taipei",
  hourCycle: "h23",
});

const DATE_FORMATTER = new Intl.DateTimeFormat("zh-TW", {
  dateStyle: "medium",
  timeZone: "Asia/Taipei",
});

const TIME_FORMATTER = new Intl.DateTimeFormat("zh-TW", {
  timeStyle: "short",
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

// 場次起訖：同日顯示「2026/7/10（五）09:00–12:00」，跨日顯示完整兩端
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

// 場次時長（小時，1 位小數）
export function sessionHours(startIso: string, endIso: string): number {
  const ms = new Date(endIso).getTime() - new Date(startIso).getTime();
  return Math.round((ms / 3_600_000) * 10) / 10;
}
