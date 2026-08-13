// 全站日期時間格式的規格：日期一律 YYYY-MM-DD（補零、帶年份），時間 24 小時制 HH:mm。
//
// 這裡特別釘住兩件容易回歸的事：
//   1. 時區。worker 與 SSR 都跑在 UTC，台灣時間 08:00 之前的時刻若用本地 getDate()
//      會落在前一天。下面的案例刻意挑在 UTC 16:00 之後（＝台灣隔天凌晨）。
//   2. 顯示與分組的一致。formatDate 與 taipeiDateKey 若各走一套機制，畫面上的日期
//      有可能與分組鍵不同天，這種不一致在畫面上看不出來。

import { describe, expect, it } from "vitest";
import {
  formatDate,
  formatDateTime,
  formatDayHeading,
  formatSessionDate,
  formatSessionRange,
  formatTimeOnly,
  formatTimeRange,
  taipeiDateKey,
} from "@/lib/admin/datetime";

// 2026-07-23T16:30:00Z = 台灣 2026-07-24 00:30（週五）
const LATE_UTC = "2026-07-23T16:30:00.000Z";
// 同一天台灣 09:00 與 12:00
const NINE = "2026-07-24T01:00:00.000Z";
const NOON = "2026-07-24T04:00:00.000Z";
// 台灣 2026-07-25 10:00
const NEXT_DAY = "2026-07-25T02:00:00.000Z";

describe("日期格式", () => {
  it("formatDate 補零並帶年份", () => {
    expect(formatDate(NINE)).toBe("2026-07-24");
  });

  it("UTC 傍晚屬於台灣的隔天", () => {
    expect(formatDate(LATE_UTC)).toBe("2026-07-24");
    expect(formatTimeOnly(LATE_UTC)).toBe("00:30");
  });

  it("formatDate 與分組鍵永遠同一天", () => {
    for (const iso of [LATE_UTC, NINE, NOON, NEXT_DAY]) {
      expect(formatDate(iso)).toBe(taipeiDateKey(iso));
    }
  });

  it("formatDateTime 為「日期 空白 時刻」", () => {
    expect(formatDateTime(NINE)).toBe("2026-07-24 09:00");
  });

  it("空值回破折號而非 Invalid Date", () => {
    expect(formatDate(null)).toBe("—");
    expect(formatDateTime(undefined)).toBe("—");
    expect(formatTimeOnly("")).toBe("—");
  });
});

describe("場次與時段", () => {
  it("場次日期帶單字星期", () => {
    expect(formatSessionDate(NINE)).toBe("2026-07-24（五）");
  });

  it("同日起訖不重複日期", () => {
    expect(formatSessionRange(NINE, NOON)).toBe("2026-07-24（五）09:00–12:00");
  });

  it("跨日起訖兩端都寫完整", () => {
    expect(formatSessionRange(NINE, NEXT_DAY)).toBe(
      "2026-07-24（五）09:00 ～ 2026-07-25（六）10:00"
    );
  });

  it("同日時段只有時刻", () => {
    expect(formatTimeRange(NINE, NOON)).toBe("09:00–12:00");
  });

  it("跨日時段補上結束日期，破折號兩側留空白", () => {
    expect(formatTimeRange(NINE, NEXT_DAY)).toBe("09:00 – 2026-07-25 10:00");
  });
});

describe("分組標題", () => {
  it("非今明兩日用完整日期加星期", () => {
    expect(formatDayHeading("2026-07-24")).toBe("2026-07-24（五）");
  });

  it("今天與明天用相對說法", () => {
    const today = taipeiDateKey(new Date().toISOString());
    const tomorrow = taipeiDateKey(new Date(Date.now() + 86_400_000).toISOString());
    expect(formatDayHeading(today)).toBe("今天");
    expect(formatDayHeading(tomorrow)).toBe("明天");
  });
});
