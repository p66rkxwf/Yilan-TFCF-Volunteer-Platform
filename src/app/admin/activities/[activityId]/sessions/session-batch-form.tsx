"use client";

// 一次新增多場次：設定共用時段、名額與地點 → 用「重複產生器」或「手動加入日期」
// 累積一份日期清單 → 預覽 → 逐筆建立。批次場次同一時段、不同日期，
// 故批次內不會互相重疊（只需去除重複日期）；與既有場次的重疊由 DB
// EXCLUDE 約束逐筆擋下，失敗場次會列明。
// 時間／日期改為使用者自行輸入文字（HH:mm、YYYY-MM-DD）＋驗證，不依賴瀏覽器日曆。

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/toast";
import { getErrorMessage } from "@/lib/ui/toast-actions";
import { Button } from "@/components/ui/button";
import { Field, inputClass, Panel } from "@/components/admin/ui";
import { normalizeDateInput, normalizeTimeInput, taipeiLocalToIso } from "@/lib/admin/datetime";

const WEEKDAY_LABELS = ["日", "一", "二", "三", "四", "五", "六"];

const DATE_LABEL = new Intl.DateTimeFormat("zh-TW", {
  month: "2-digit",
  day: "2-digit",
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
  const [location, setLocation] = useState("");

  // 重複產生器
  const [repeatStart, setRepeatStart] = useState("");
  const [repeatWeeks, setRepeatWeeks] = useState("4");

  // 手動加入
  const [manualDate, setManualDate] = useState("");

  // 累積的日期清單（yyyy-MM-dd，已去重、已排序）
  const [dates, setDates] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [errors, setErrors] = useState<{
    startTime?: string;
    endTime?: string;
    capacity?: string;
    dates?: string;
  }>({});

  const addDates = (incoming: string[]) => {
    setDates((prev) => Array.from(new Set([...prev, ...incoming])).sort());
  };

  const removeDate = (date: string) => {
    setDates((prev) => prev.filter((d) => d !== date));
  };

  const generateRepeat = () => {
    const norm = normalizeDateInput(repeatStart);
    if (!norm) return void toast.error("請輸入有效的起始日期（YYYY-MM-DD）");
    const weeks = Number(repeatWeeks);
    if (!Number.isInteger(weeks) || weeks < 1 || weeks > 52) {
      return void toast.error("週數需為 1–52");
    }
    const base = new Date(`${norm}T12:00:00+08:00`);
    const generated: string[] = [];
    for (let i = 0; i < weeks; i++) {
      const d = new Date(base.getTime() + i * 7 * 24 * 60 * 60 * 1000);
      generated.push(d.toISOString().slice(0, 10));
    }
    addDates(generated);
    toast.success(`已加入 ${weeks} 個日期`);
  };

  const addManual = () => {
    const norm = normalizeDateInput(manualDate);
    if (!norm) return void toast.error("請輸入有效的日期（YYYY-MM-DD）");
    addDates([norm]);
    setManualDate("");
  };

  const repeatWeekdayHint = useMemo(() => {
    const norm = normalizeDateInput(repeatStart);
    if (!norm) return "";
    const wd = new Date(`${norm}T12:00:00+08:00`).getDay();
    return `每週${WEEKDAY_LABELS[wd]}`;
  }, [repeatStart]);

  const handleSubmit = async () => {
    const nextErrors: typeof errors = {};
    const normStart = normalizeTimeInput(startTime);
    const normEnd = normalizeTimeInput(endTime);
    if (!startTime.trim()) nextErrors.startTime = "請輸入開始時間";
    else if (!normStart) nextErrors.startTime = "時間格式需為 HH:mm";
    if (!endTime.trim()) nextErrors.endTime = "請輸入結束時間";
    else if (!normEnd) nextErrors.endTime = "時間格式需為 HH:mm";
    else if (normStart && normEnd <= normStart) nextErrors.endTime = "結束時間需晚於開始時間";
    const cap = Number(capacity);
    if (!Number.isInteger(cap) || cap <= 0) nextErrors.capacity = "名額需為正整數";
    if (dates.length === 0) nextErrors.dates = "請至少加入一個日期";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    const loc = location.trim() || null;
    setIsSaving(true);
    const failedDates: string[] = [];
    const failMsgs: string[] = [];
    let ok = 0;

    for (const date of dates) {
      const startIso = taipeiLocalToIso(`${date}T${normStart}`);
      const endIso = taipeiLocalToIso(`${date}T${normEnd}`);
      const { error } = await supabase.from("activity_sessions").insert({
        activity_id: activityId,
        start_at: startIso,
        end_at: endIso,
        capacity: cap,
        registration_deadline_at: startIso,
        location: loc,
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
      <Panel title="共用時段、名額與地點" description="以下設定會套用到所有選定的日期。">
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field label="開始時間" required error={errors.startTime} hint="格式 HH:mm，例 09:00">
              <input
                type="text"
                inputMode="numeric"
                className={inputClass}
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                placeholder="09:00"
              />
            </Field>
            <Field label="結束時間" required error={errors.endTime} hint="格式 HH:mm，例 12:00">
              <input
                type="text"
                inputMode="numeric"
                className={inputClass}
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                placeholder="12:00"
              />
            </Field>
            <Field label="名額" required error={errors.capacity}>
              <input
                type="number"
                min={1}
                className={inputClass}
                value={capacity}
                onChange={(e) => setCapacity(e.target.value)}
              />
            </Field>
          </div>
          <Field label="地點" hint="留空＝沿用活動的主要地點；填寫則這批場次改於此地點。">
            <input
              className={inputClass}
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="例：羅東鎮運動公園（留空沿用活動地點）"
              maxLength={120}
            />
          </Field>
        </div>
      </Panel>

      <Panel title="重複產生器" description="從起始日起，每週同一天重複，一次加入多個日期。">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="起始日期" hint="格式 YYYY-MM-DD">
            <input
              type="text"
              inputMode="numeric"
              className={inputClass}
              value={repeatStart}
              onChange={(e) => setRepeatStart(e.target.value)}
              placeholder="2026-07-24"
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
          <Field label="日期" hint="格式 YYYY-MM-DD">
            <input
              type="text"
              inputMode="numeric"
              className={inputClass}
              value={manualDate}
              onChange={(e) => setManualDate(e.target.value)}
              placeholder="2026-07-24"
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
          <p
            className={`py-4 text-center text-sm ${errors.dates ? "font-semibold text-amber-700" : "text-slate-400"}`}
          >
            {errors.dates ?? "尚未加入任何日期，使用上方工具加入。"}
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
                  aria-label={`移除 ${labelForDate(date)}`}
                >
                  <span className="material-symbols-outlined text-[16px]" aria-hidden="true">
                    close
                  </span>
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
