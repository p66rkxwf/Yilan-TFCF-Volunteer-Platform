// 全站共用：台灣時區的時間顯示與 <input type="datetime-local"> 轉換
//
// 格式規範：日期一律 YYYY-MM-DD（補零、一律帶年份，無「7/24」這種簡寫），
// 時間一律 24 小時制 HH:mm。窄版面也不例外——同一個日期在不同頁面長得不一樣，
// 比欄位寬一點更難讀。
//
// 顯示與分組共用 splitTaipeiLocal（固定 +8 小時位移；台灣無日光節約），刻意不用
// Intl 的 timeZone：兩套機制並存時，畫面顯示的日期有可能與 taipeiDateKey 算出的
// 分組鍵落在不同天，那種不一致極難察覺。一個來源就沒有這個問題。

// 週標題（日曆/預覽共用）
export const WEEKDAY_LABELS = ["日", "一", "二", "三", "四", "五", "六"] as const;

// 星期一律取「五」而非「週五」。刻意不用 Intl 的 weekday:"short"——zh-TW 會吐
// 「週五」，全站規範是括號內只放一個字。先投影到台灣本地日期再做純日曆運算，
// 索引空間與 WEEKDAY_LABELS 一致。
export function taipeiWeekday(iso: string | null | undefined): string {
  const dateKey = taipeiDateKey(iso);
  if (!dateKey) return "";
  return WEEKDAY_LABELS[new Date(`${dateKey}T00:00:00Z`).getUTCDay()];
}

// 「2026-07-24 09:03」
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const { date, time } = splitTaipeiLocal(iso);
  return `${date} ${time}`;
}

// 「2026-07-24」
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return splitTaipeiLocal(iso).date;
}

// 只有時刻「09:03」。供表格兩行時間格的第二行。
export function formatTimeOnly(iso: string | null | undefined): string {
  if (!iso) return "—";
  return splitTaipeiLocal(iso).time;
}

// 表格兩行時間格用：拆成日期與時刻兩段。null 回 null，讓呼叫端只印一個「—」
// 而不是上下兩行破折號。
export function splitDateTime(
  iso: string | null | undefined
): { date: string; time: string } | null {
  if (!iso) return null;
  return splitTaipeiLocal(iso);
}

// 場次日期含星期：「2026-07-24（五）」。供兩行式時間欄與 formatSessionRange 共用。
export function formatSessionDate(iso: string): string {
  return `${formatDate(iso)}（${taipeiWeekday(iso)}）`;
}

// 場次起訖：同日顯示「2026-07-24（五）09:00–12:00」，跨日顯示完整兩端
export function formatSessionRange(startIso: string, endIso: string): string {
  const start = splitTaipeiLocal(startIso);
  const end = splitTaipeiLocal(endIso);
  const startText = `${formatSessionDate(startIso)}${start.time}`;
  return start.date === end.date
    ? `${startText}–${end.time}`
    : `${startText} ～ ${formatSessionDate(endIso)}${end.time}`;
}

// 場次時段（不含開始日期）：同日「09:00–12:00」，跨日「08:00 – 2026-07-25 10:00」。
// 供「已用開始日期分組、每列不需重複日期」的清單使用。
// 跨日那支在破折號兩側留空白：日期本身含連字號，貼著寫會變成一串難斷的橫線。
export function formatTimeRange(startIso: string, endIso: string): string {
  const start = splitTaipeiLocal(startIso);
  const end = splitTaipeiLocal(endIso);
  return start.date === end.date
    ? `${start.time}–${end.time}`
    : `${start.time} – ${end.date} ${end.time}`;
}

// 分組鍵：一律取台灣本地日期（'YYYY-MM-DD'）。務必用這個而非 Date#getDate()，
// 否則在 UTC 執行環境（Cloudflare Worker）會於台灣時間 08:00 切錯天。
export function taipeiDateKey(iso: string | null | undefined): string {
  return splitTaipeiLocal(iso).date;
}

// 日期分組的小節標題：今天／明天／2026-07-24（四）。
// dateKey 本身就是 YYYY-MM-DD，直接用即符合全站格式。
export function formatDayHeading(dateKey: string): string {
  if (!dateKey) return "";
  if (dateKey === todayTaipeiDate()) return "今天";
  // 台灣無日光節約，固定 +24h 再投影回台灣本地日期即為「明天」
  if (dateKey === taipeiDateKey(new Date(Date.now() + 86_400_000).toISOString())) {
    return "明天";
  }
  // 純日曆運算（不牽涉時區）：以 UTC 午夜取星期，索引空間與 WEEKDAY_LABELS 一致
  const weekday = WEEKDAY_LABELS[new Date(`${dateKey}T00:00:00Z`).getUTCDay()];
  return `${dateKey}（${weekday}）`;
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

// ISO → 台灣本地的 { date: 'YYYY-MM-DD', time: 'HH:mm' }（供日期/時間分欄輸入用）
export function splitTaipeiLocal(iso: string | null | undefined): { date: string; time: string } {
  const local = isoToTaipeiLocal(iso);
  if (!local) return { date: "", time: "" };
  const [date, time] = local.split("T");
  return { date, time };
}

// 今天（台灣）的 YYYY-MM-DD，供日曆預設月份/今日標記與表單預設值。
// offsetDays 供「近 30 天」這類預設區間使用（負數＝往前）。
export function todayTaipeiDate(offsetDays = 0): string {
  const at = new Date(Date.now() + offsetDays * 86_400_000).toISOString();
  return isoToTaipeiLocal(at).slice(0, 10);
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
// 「日期欄＋時間欄」兩個自由輸入 → ISO（兩者皆合法才回傳，否則 null）。
// 自訂服務的前台登錄表單與後台代登錄表單共用。
export function dateTimeInputsToIso(date: string, time: string): string | null {
  const d = normalizeDateInput(date);
  const t = normalizeTimeInput(time);
  return d && t ? taipeiLocalToIso(`${d}T${t}`) : null;
}

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
