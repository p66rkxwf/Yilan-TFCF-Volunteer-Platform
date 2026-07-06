"use client";

// 一次新增多場次：設定共用時段與名額 → 用「重複產生器」或「手動加入日期」
// 累積一份日期清單 → 預覽 → 逐筆建立。批次場次同一時段、不同日期，
// 故批次內不會互相重疊（只需去除重複日期）；與既有場次的重疊由 DB
// EXCLUDE 約束逐筆擋下，失敗場次會列明。

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/toast";
import { getErrorMessage } from "@/lib/ui/toast-actions";
import { Button } from "@/components/ui/button";
import { Field, inputClass, Panel } from "@/components/admin/ui";
import { taipeiLocalToIso } from "@/lib/admin/datetime";

const WEEKDAY_LABELS = ["日", "一", "二", "三", "四", "五", "六"];

const DATE_LABEL = new Intl.DateTimeFormat("zh-TW", {
  month: "numeric",
  day: "numeric",
  weekday: "short",
  timeZone: "Asia/Taipei",
});

function labelForDate(date: string): string {
  // date=yyyy-MM-dd，以中午避開時區換日
  return DATE_LABEL.format(new Date(`${date}T12:00:00+08:00`));
}

export function SessionBatchForm({ activityId }: { activityId: string }) {
  const supabase = createClient();
  const toast = useToast();
  const router = useRouter();

  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("12:00");
  const [capacity, setCapacity] = useState("10");

  // 重複產生器
  const [repeatStart, setRepeatStart] = useState("");
  const [repeatWeeks, setRepeatWeeks] = useState("4");

  // 手動加入
  const [manualDate, setManualDate] = useState("");

  // 累積的日期清單（yyyy-MM-dd，已去重、已排序）
  const [dates, setDates] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  const addDates = (incoming: string[]) => {
    setDates((prev) => Array.from(new Set([...prev, ...incoming])).sort());
  };

  const removeDate = (date: string) => {
    setDates((prev) => prev.filter((d) => d !== date));
  };

  const generateRepeat = () => {
    if (!repeatStart) return void toast.error("請選擇重複的起始日期");
    const weeks = Number(repeatWeeks);
    if (!Number.isInteger(weeks) || weeks < 1 || weeks > 52) {
      return void toast.error("週數需為 1–52");
    }
    const base = new Date(`${repeatStart}T12:00:00+08:00`);
    const generated: string[] = [];
    for (let i = 0; i < weeks; i++) {
      const d = new Date(base.getTime() + i * 7 * 24 * 60 * 60 * 1000);
      generated.push(d.toISOString().slice(0, 10));
    }
    addDates(generated);
    toast.success(`已加入 ${weeks} 個日期`);
  };

  const addManual = () => {
    if (!manualDate) return;
    addDates([manualDate]);
    setManualDate("");
  };

  const repeatWeekdayHint = useMemo(() => {
    if (!repeatStart) return "";
    const wd = new Date(`${repeatStart}T12:00:00+08:00`).getDay();
    return `每週${WEEKDAY_LABELS[wd]}`;
  }, [repeatStart]);

  const handleSubmit = async () => {
    if (!startTime || !endTime) return void toast.error("請填寫場次起訖時間");
    if (endTime <= startTime) return void toast.error("結束時間需晚於開始時間");
    const cap = Number(capacity);
    if (!Number.isInteger(cap) || cap <= 0) return void toast.error("名額需為正整數");
    if (dates.length === 0) return void toast.error("請至少加入一個日期");

    setIsSaving(true);
    const failedDates: string[] = [];
    const failMsgs: string[] = [];
    let ok = 0;

    for (const date of dates) {
      const startIso = taipeiLocalToIso(`${date}T${startTime}`);
      const endIso = taipeiLocalToIso(`${date}T${endTime}`);
      const { error } = await supabase.from("activity_sessions").insert({
        activity_id: activityId,
        start_at: startIso,
        end_at: endIso,
        capacity: cap,
        registration_deadline_at: startIso,
      });
      if (error) {
        failedDates.push(date);
        failMsgs.push(`${labelForDate(date)}（${getErrorMessage(error)}）`);
      } else {
        ok += 1;
      }
    }

    setIsSaving(false);

    if (failedDates.length === 0) {
      toast.success(`已建立 ${ok} 個場次`);
      router.push(`/admin/activities/${activityId}`);
      router.refresh();
    } else {
      toast.error(
        `成功 ${ok} 場，失敗 ${failedDates.length} 場（多為與既有場次時段重疊）：${failMsgs[0]}`
      );
      setDates(failedDates); // 只保留失敗日期供調整重試
    }
  };

  return (
    <div className="max-w-2xl space-y-5">
      <Panel title="共用時段與名額" description="以下時段與名額會套用到所有選定的日期。">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="開始時間" required>
            <input
              type="time"
              className={inputClass}
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
            />
          </Field>
          <Field label="結束時間" required>
            <input
              type="time"
              className={inputClass}
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
            />
          </Field>
          <Field label="名額" required>
            <input
              type="number"
              min={1}
              className={inputClass}
              value={capacity}
              onChange={(e) => setCapacity(e.target.value)}
            />
          </Field>
        </div>
      </Panel>

      <Panel title="重複產生器" description="從起始日起，每週同一天重複，一次加入多個日期。">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="起始日期">
            <input
              type="date"
              className={`${inputClass} date-input`}
              value={repeatStart}
              onChange={(e) => setRepeatStart(e.target.value)}
            />
          </Field>
          <Field label="連續週數">
            <input
              type="number"
              min={1}
              max={52}
              className={`${inputClass} w-28`}
              value={repeatWeeks}
              onChange={(e) => setRepeatWeeks(e.target.value)}
            />
          </Field>
          <Button type="button" size="sm" variant="outline" onClick={generateRepeat}>
            加入日期
          </Button>
          {repeatWeekdayHint && (
            <span className="pb-2 text-xs text-slate-400">{repeatWeekdayHint}</span>
          )}
        </div>
      </Panel>

      <Panel title="手動加入日期" description="也可逐一加入不規則的日期。">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="日期">
            <input
              type="date"
              className={`${inputClass} date-input`}
              value={manualDate}
              onChange={(e) => setManualDate(e.target.value)}
            />
          </Field>
          <Button type="button" size="sm" variant="outline" onClick={addManual}>
            加入
          </Button>
        </div>
      </Panel>

      <Panel
        title={`預覽（${dates.length} 場次）`}
        description="每個日期會建立一個場次；可移除不要的日期。"
      >
        {dates.length === 0 ? (
          <p className="py-4 text-center text-sm text-slate-400">
            尚未加入任何日期，使用上方工具加入。
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {dates.map((date) => (
              <span
                key={date}
                className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 py-1 pl-3 pr-1.5 text-sm text-slate-700"
              >
                {labelForDate(date)} {startTime}–{endTime}
                <button
                  type="button"
                  onClick={() => removeDate(date)}
                  className="flex h-5 w-5 items-center justify-center rounded-full text-slate-400 hover:bg-slate-200 hover:text-slate-600"
                  aria-label="移除"
                >
                  <span className="material-symbols-outlined text-[16px]">close</span>
                </button>
              </span>
            ))}
          </div>
        )}
      </Panel>

      <div className="flex items-center gap-2">
        <Button
          type="button"
          size="sm"
          isLoading={isSaving}
          disabled={dates.length === 0}
          onClick={handleSubmit}
        >
          建立 {dates.length} 個場次
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => router.back()}>
          取消
        </Button>
      </div>
    </div>
  );
}
