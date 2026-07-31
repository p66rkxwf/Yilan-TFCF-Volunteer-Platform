"use client";

// 日期＋時間複合欄位：單一 label 對應「自製日曆」＋「免冒號時間」兩個輸入。
// 尺寸由外層 wrapper 控制（避免把 w-24 等寬度類疊到已含 w-full 的 input 上造成衝突）。

import { DatePicker } from "@/components/ui/date-picker";
import { TimeInput } from "@/components/ui/time-input";

export function DateTimeField({
  label,
  required,
  error,
  hint,
  dateValue,
  onDateChange,
  timeValue,
  onTimeChange,
  disabled,
  dateMin,
  dateMax,
}: {
  label: string;
  required?: boolean;
  error?: string;
  hint?: string;
  dateValue: string;
  onDateChange: (v: string) => void;
  timeValue: string;
  onTimeChange: (v: string) => void;
  disabled?: boolean;
  dateMin?: string;
  dateMax?: string;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-semibold text-slate-700">
        {label}
        {required && <span className="ml-0.5 text-slate-400">*</span>}
      </label>
      <div className="flex gap-2">
        <div className="min-w-0 flex-1">
          <DatePicker
            value={dateValue}
            onChange={onDateChange}
            disabled={disabled}
            invalid={!!error}
            min={dateMin}
            max={dateMax}
            aria-label={`${label} - 日期`}
          />
        </div>
        <div className="w-24 shrink-0">
          <TimeInput
            value={timeValue}
            onChange={onTimeChange}
            disabled={disabled}
            invalid={!!error}
            aria-label={`${label} - 時間`}
          />
        </div>
      </div>
      {error ? (
        <p className="mt-1 text-xs font-semibold text-amber-700">{error}</p>
      ) : (
        hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>
      )}
    </div>
  );
}
